use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use image::GenericImageView;
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Notify, RwLock, Semaphore};
use uuid::Uuid;

use crate::codecs::{generate_thumbnail, get_encoder, to_base64};
use crate::guard::TempFileGuard;
use crate::models::{
    BatchFinishedPayload, BatchInitAck, CompressionConfig, ConflictDetectedPayload,
    ConflictResolution, OutputPlan, TaskCompletedPayload, TaskErrorPayload, TaskInput,
    TaskSkippedPayload, TaskStagePayload, ThumbnailReadyPayload,
};

pub struct PipelineState {
    pub active_config: Arc<RwLock<CompressionConfig>>,
    pub thumbnail_cache: Arc<DashMap<String, Vec<u8>>>,
    pub heavy_semaphore: Arc<Semaphore>,
    pub memory_semaphore: Arc<Semaphore>,
    pub conflict_channels: Arc<DashMap<String, oneshot::Sender<ConflictResolution>>>,
    pub max_workers: usize,
    pub fast_workers: usize,
    pub is_paused: Arc<AtomicBool>,
    pub pause_notify: Arc<Notify>,
    pub cancelled_tasks: Arc<DashMap<String, bool>>,
    pub is_cancelled: Arc<AtomicBool>,
}

impl PipelineState {
    pub fn new() -> Self {
        let cpus = num_cpus::get();
        let max_workers = (cpus.saturating_sub(1)).clamp(1, 8);
        let fast_workers = 2.min(max_workers);

        // 全域常駐工作並發配額，保證無論多少批次同時注入，Heavy Worker 絕不倍增打爆 CPU
        let heavy_semaphore = Arc::new(Semaphore::new(max_workers));

        // 512 MB 記憶體水線配額
        let memory_semaphore = Arc::new(Semaphore::new(512 * 1024 * 1024));

        Self {
            active_config: Arc::new(RwLock::new(CompressionConfig::default())),
            thumbnail_cache: Arc::new(DashMap::new()),
            heavy_semaphore,
            memory_semaphore,
            conflict_channels: Arc::new(DashMap::new()),
            max_workers,
            fast_workers,
            is_paused: Arc::new(AtomicBool::new(false)),
            pause_notify: Arc::new(Notify::new()),
            cancelled_tasks: Arc::new(DashMap::new()),
            is_cancelled: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// 快速探測圖片尺寸，計算帶有 1.8x 安全係數之記憶體預算 (Bytes)
fn estimate_memory_needed(path: &Path) -> u32 {
    if let Ok(reader) = image::ImageReader::open(path) {
        if let Ok(reader) = reader.with_guessed_format() {
            if let Ok(dim) = reader.into_dimensions() {
                let (w, h) = dim;
                let calculated = ((w as f64 * h as f64 * 4.0) * 1.8) as u32;
                return calculated.clamp(1024 * 1024, 384 * 1024 * 1024);
            }
        }
    }
    50 * 1024 * 1024
}

/// 純函式：路徑規劃與衝突判定 (在申請任何信號量與解碼前執行)
pub fn plan_output(
    config: &CompressionConfig,
    orig_path: &Path,
    target_ext: &str,
    prior_output: Option<&Path>,
) -> Result<OutputPlan, String> {
    let parent_dir = orig_path.parent().unwrap_or(Path::new("."));
    let target_dir = match config.output_dir_mode.as_str() {
        "sub" => {
            let sub = parent_dir.join("min");
            fs::create_dir_all(&sub).map_err(|e| format!("無法建立子資料夾: {e}"))?;
            sub
        }
        "custom" => {
            if let Some(ref custom) = config.custom_dir_path {
                let trimmed = custom.trim();
                if trimmed.is_empty() {
                    return Err("自訂輸出資料夾路徑不得為空".into());
                }
                let p = PathBuf::from(trimmed);
                fs::create_dir_all(&p).map_err(|e| format!("無法建立自訂輸出資料夾: {e}"))?;
                p
            } else {
                return Err("尚未指定自訂輸出資料夾".into());
            }
        }
        _ => parent_dir.to_path_buf(),
    };

    let stem = orig_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");

    let suffix = &config.suffix;
    let final_filename = format!("{stem}{suffix}.{target_ext}");
    let candidate_path = target_dir.join(&final_filename);

    if candidate_path.exists() {
        // 若該候選路徑是本任務上一輪的輸出，視為自體覆寫，不產生衝突！
        if let Some(prior) = prior_output {
            if prior == candidate_path {
                return Ok(OutputPlan {
                    target_dir,
                    candidate_output_path: candidate_path,
                    final_filename,
                    is_conflict: false,
                    is_skipped: false,
                    skip_reason: None,
                });
            }
        }

        match config.conflict_strategy.as_str() {
            "overwrite" => Ok(OutputPlan {
                target_dir,
                candidate_output_path: candidate_path,
                final_filename,
                is_conflict: false,
                is_skipped: false,
                skip_reason: None,
            }),
            "auto_rename" => {
                let base_stem = format!("{stem}{suffix}");
                let renamed = get_auto_renamed_path(&target_dir, &base_stem, target_ext);
                let final_filename = renamed
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or(&final_filename)
                    .to_string();
                Ok(OutputPlan {
                    target_dir,
                    candidate_output_path: renamed,
                    final_filename,
                    is_conflict: false,
                    is_skipped: false,
                    skip_reason: None,
                })
            }
            "skip" => Ok(OutputPlan {
                target_dir,
                candidate_output_path: candidate_path,
                final_filename,
                is_conflict: false,
                is_skipped: true,
                skip_reason: Some("strategy_skip".into()),
            }),
            "ask" => Ok(OutputPlan {
                target_dir,
                candidate_output_path: candidate_path,
                final_filename,
                is_conflict: true,
                is_skipped: false,
                skip_reason: None,
            }),
            _ => Ok(OutputPlan {
                target_dir,
                candidate_output_path: candidate_path,
                final_filename,
                is_conflict: false,
                is_skipped: false,
                skip_reason: None,
            }),
        }
    } else {
        Ok(OutputPlan {
            target_dir,
            candidate_output_path: candidate_path,
            final_filename,
            is_conflict: false,
            is_skipped: false,
            skip_reason: None,
        })
    }
}

pub fn get_auto_renamed_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let mut counter = 1;
    loop {
        let name = format!("{stem}_{counter}.{ext}");
        let candidate = dir.join(name);
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

fn is_same_image_format(ext1: &str, ext2: &str) -> bool {
    let e1 = ext1.to_ascii_lowercase();
    let e2 = ext2.to_ascii_lowercase();
    if e1 == e2 {
        return true;
    }
    let is_jpeg1 = e1 == "jpg" || e1 == "jpeg";
    let is_jpeg2 = e2 == "jpg" || e2 == "jpeg";
    is_jpeg1 && is_jpeg2
}

pub fn read_exif_orientation_from_bytes(data: &[u8]) -> Option<u16> {
    if data.len() < 14 || data[0] != 0xFF || data[1] != 0xD8 {
        return None;
    }
    let mut idx = 2;
    while idx + 4 < data.len() {
        if data[idx] != 0xFF {
            break;
        }
        let marker = data[idx + 1];
        if marker == 0xDA || marker == 0xD9 {
            break;
        }
        let length = u16::from_be_bytes([data[idx + 2], data[idx + 3]]) as usize;
        if marker == 0xE1 && length >= 8 {
            let end = (idx + 2 + length).min(data.len());
            let app1_data = &data[idx + 4..end];
            if app1_data.starts_with(b"Exif\0\0") {
                let tiff = &app1_data[6..];
                return parse_tiff_orientation(tiff);
            }
        }
        idx += 2 + length;
    }
    None
}

fn parse_tiff_orientation(tiff: &[u8]) -> Option<u16> {
    if tiff.len() < 8 {
        return None;
    }
    let is_le = match &tiff[0..2] {
        b"II" => true,
        b"MM" => false,
        _ => return None,
    };
    let read_u16 = |buf: &[u8], offset: usize| -> Option<u16> {
        if offset + 2 > buf.len() {
            return None;
        }
        Some(if is_le {
            u16::from_le_bytes([buf[offset], buf[offset + 1]])
        } else {
            u16::from_be_bytes([buf[offset], buf[offset + 1]])
        })
    };
    let read_u32 = |buf: &[u8], offset: usize| -> Option<u32> {
        if offset + 4 > buf.len() {
            return None;
        }
        Some(if is_le {
            u32::from_le_bytes([buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]])
        } else {
            u32::from_be_bytes([buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]])
        })
    };

    let magic = read_u16(tiff, 2)?;
    if magic != 42 {
        return None;
    }
    let ifd0_offset = read_u32(tiff, 4)? as usize;
    let entry_count = read_u16(tiff, ifd0_offset)? as usize;
    let mut entry_offset = ifd0_offset + 2;

    for _ in 0..entry_count {
        if entry_offset + 12 > tiff.len() {
            break;
        }
        let tag = read_u16(tiff, entry_offset)?;
        if tag == 0x0112 {
            return read_u16(tiff, entry_offset + 8);
        }
        entry_offset += 12;
    }
    None
}

pub fn apply_orientation(img: image::DynamicImage, orientation: u16) -> image::DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}

fn check_and_emit_batch_finished(
    app: &AppHandle,
    total_tasks: &Arc<AtomicUsize>,
    completed_count: &Arc<AtomicUsize>,
    orig_bytes: &Arc<std::sync::atomic::AtomicU64>,
    comp_bytes: &Arc<std::sync::atomic::AtomicU64>,
    out_dir: &Arc<std::sync::Mutex<String>>,
) {
    let finished = completed_count.fetch_add(1, Ordering::SeqCst) + 1;
    if finished >= total_tasks.load(Ordering::SeqCst) {
        let total_orig = orig_bytes.load(Ordering::Relaxed);
        let total_comp = comp_bytes.load(Ordering::Relaxed);
        let saved_ratio = if total_orig > 0 {
            (total_orig.saturating_sub(total_comp)) as f32 / total_orig as f32
        } else {
            0.0
        };
        let dir = out_dir.lock().unwrap().clone();
        let _ = app.emit(
            "batch_finished",
            BatchFinishedPayload {
                total_processed: finished,
                total_original_bytes: total_orig,
                total_compressed_bytes: total_comp,
                total_saved_ratio: saved_ratio,
                output_directory: dir,
            },
        );
    }
}

/// 啟動批次處理
pub async fn start_batch(
    app: AppHandle,
    state: Arc<PipelineState>,
    tasks: Vec<TaskInput>,
    config: CompressionConfig,
) -> Result<BatchInitAck, String> {
    *state.active_config.write().await = config.clone();
    state.is_cancelled.store(false, Ordering::SeqCst);

    let task_count = tasks.len();
    let total_tasks = Arc::new(AtomicUsize::new(task_count));
    let completed_count = Arc::new(AtomicUsize::new(0));

    let total_original_bytes = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let total_compressed_bytes = Arc::new(std::sync::atomic::AtomicU64::new(0));

    let output_dir_sample = Arc::new(std::sync::Mutex::new(String::new()));

    // 1. Fast Lane: 抽取縮圖
    for task in &tasks {
        let app_clone = app.clone();
        let cache = state.thumbnail_cache.clone();
        let task_clone = task.clone();

        tokio::task::spawn_blocking(move || {
            let path = Path::new(&task_clone.file_path);
            if let Ok(img) = image::open(path) {
                let (w, h) = img.dimensions();
                if let Ok(thumb_bytes) = generate_thumbnail(&img) {
                    let b64 = format!("data:image/webp;base64,{}", to_base64(&thumb_bytes));
                    cache.insert(task_clone.id.clone(), thumb_bytes);
                    let _ = app_clone.emit(
                        "thumbnail_ready",
                        ThumbnailReadyPayload {
                            id: task_clone.id,
                            width: w,
                            height: h,
                            thumbnail_base64: Some(b64),
                        },
                    );
                }
            }
        });
    }

    // 2. Heavy Lane: 記憶體門禁編碼佇列
    let batch_config = config.clone();

    for task in tasks {
        let app_clone = app.clone();
        let state_clone = state.clone();
        let heavy_permit = state.heavy_semaphore.clone();
        let total_tasks_ref = total_tasks.clone();
        let completed_count_ref = completed_count.clone();
        let orig_bytes_ref = total_original_bytes.clone();
        let comp_bytes_ref = total_compressed_bytes.clone();
        let out_dir_ref = output_dir_sample.clone();
        let task_config = batch_config.clone();

        tokio::spawn(async move {
            // 檢查取消 (批次全域取消或單一任務取消)
            if state_clone.is_cancelled.load(Ordering::SeqCst)
                || state_clone.cancelled_tasks.remove(&task.id).is_some()
            {
                let _ = app_clone.emit(
                    "task_skipped",
                    TaskSkippedPayload {
                        id: task.id.clone(),
                        reason: "user_cancel".into(),
                        output_path: None,
                    },
                );
                check_and_emit_batch_finished(
                    &app_clone,
                    &total_tasks_ref,
                    &completed_count_ref,
                    &orig_bytes_ref,
                    &comp_bytes_ref,
                    &out_dir_ref,
                );
                return;
            }

            // 佇列暫停時等待繼續 (若被取消則立即中斷等待退出)
            while state_clone.is_paused.load(Ordering::SeqCst)
                && !state_clone.is_cancelled.load(Ordering::SeqCst)
            {
                state_clone.pause_notify.notified().await;
            }

            if state_clone.is_cancelled.load(Ordering::SeqCst)
                || state_clone.cancelled_tasks.remove(&task.id).is_some()
            {
                let _ = app_clone.emit(
                    "task_skipped",
                    TaskSkippedPayload {
                        id: task.id.clone(),
                        reason: "user_cancel".into(),
                        output_path: None,
                    },
                );
                check_and_emit_batch_finished(
                    &app_clone,
                    &total_tasks_ref,
                    &completed_count_ref,
                    &orig_bytes_ref,
                    &comp_bytes_ref,
                    &out_dir_ref,
                );
                return;
            }

            let orig_path = PathBuf::from(&task.file_path);
            let orig_ext = orig_path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("png");
            let (_, _, target_ext) = get_encoder(&task_config.target_format, orig_ext);

            // 3. 解碼前路徑規劃與衝突初判 (零許可證持有，零死鎖)
            let mut plan = match plan_output(
                &task_config,
                &orig_path,
                target_ext,
                task.prior_output_path.as_deref().map(Path::new),
            ) {
                Ok(p) => p,
                Err(err) => {
                    let _ = app_clone.emit(
                        "task_error",
                        TaskErrorPayload {
                            id: task.id.clone(),
                            error_message: err,
                        },
                    );
                    check_and_emit_batch_finished(
                        &app_clone,
                        &total_tasks_ref,
                        &completed_count_ref,
                        &orig_bytes_ref,
                        &comp_bytes_ref,
                        &out_dir_ref,
                    );
                    return;
                }
            };

            // 若策略為略過已存在檔案
            if plan.is_skipped {
                let orig_size = fs::metadata(&orig_path).map(|m| m.len()).unwrap_or(0);
                orig_bytes_ref.fetch_add(orig_size, Ordering::Relaxed);
                comp_bytes_ref.fetch_add(orig_size, Ordering::Relaxed);
                let _ = app_clone.emit(
                    "task_skipped",
                    TaskSkippedPayload {
                        id: task.id.clone(),
                        reason: plan.skip_reason.unwrap_or_else(|| "strategy_skip".into()),
                        output_path: Some(plan.candidate_output_path.to_string_lossy().to_string()),
                    },
                );
                check_and_emit_batch_finished(
                    &app_clone,
                    &total_tasks_ref,
                    &completed_count_ref,
                    &orig_bytes_ref,
                    &comp_bytes_ref,
                    &out_dir_ref,
                );
                return;
            }

            // 若需要使用者決策衝突 (ask)
            if plan.is_conflict {
                let (tx, rx) = oneshot::channel();
                state_clone.conflict_channels.insert(task.id.clone(), tx);

                let _ = app_clone.emit(
                    "conflict_detected",
                    ConflictDetectedPayload {
                        id: task.id.clone(),
                        original_path: task.file_path.clone(),
                        candidate_output_path: plan.candidate_output_path.to_string_lossy().to_string(),
                    },
                );

                // 詢問等待期間不持有任何 worker permit 與 memory permit！
                let resolution = match tokio::time::timeout(Duration::from_secs(600), rx).await {
                    Ok(Ok(res)) => res,
                    _ => ConflictResolution::Skip,
                };

                match resolution {
                    ConflictResolution::Skip => {
                        let orig_size = fs::metadata(&orig_path).map(|m| m.len()).unwrap_or(0);
                        orig_bytes_ref.fetch_add(orig_size, Ordering::Relaxed);
                        comp_bytes_ref.fetch_add(orig_size, Ordering::Relaxed);
                        let _ = app_clone.emit(
                            "task_skipped",
                            TaskSkippedPayload {
                                id: task.id.clone(),
                                reason: "user_skip".into(),
                                output_path: None,
                            },
                        );
                        check_and_emit_batch_finished(
                            &app_clone,
                            &total_tasks_ref,
                            &completed_count_ref,
                            &orig_bytes_ref,
                            &comp_bytes_ref,
                            &out_dir_ref,
                        );
                        return;
                    }
                    ConflictResolution::AutoRename => {
                        let stem = orig_path.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
                        let base_stem = format!("{stem}{}", task_config.suffix);
                        plan.candidate_output_path = get_auto_renamed_path(&plan.target_dir, &base_stem, target_ext);
                        plan.final_filename = plan.candidate_output_path
                            .file_name()
                            .and_then(|s| s.to_str())
                            .unwrap_or(&plan.final_filename)
                            .to_string();
                    }
                    ConflictResolution::Overwrite => {
                        // 原地覆蓋
                    }
                }
            }

            // 4. 排隊申請 Worker 與記憶體門禁
            while state_clone.is_paused.load(Ordering::SeqCst)
                && !state_clone.is_cancelled.load(Ordering::SeqCst)
            {
                state_clone.pause_notify.notified().await;
            }
            if state_clone.is_cancelled.load(Ordering::SeqCst)
                || state_clone.cancelled_tasks.remove(&task.id).is_some()
            {
                let _ = app_clone.emit(
                    "task_skipped",
                    TaskSkippedPayload {
                        id: task.id.clone(),
                        reason: "user_cancel".into(),
                        output_path: None,
                    },
                );
                check_and_emit_batch_finished(
                    &app_clone,
                    &total_tasks_ref,
                    &completed_count_ref,
                    &orig_bytes_ref,
                    &comp_bytes_ref,
                    &out_dir_ref,
                );
                return;
            }

            let _worker_permit = heavy_permit.acquire().await.unwrap();

            while state_clone.is_paused.load(Ordering::SeqCst)
                && !state_clone.is_cancelled.load(Ordering::SeqCst)
            {
                state_clone.pause_notify.notified().await;
            }
            if state_clone.is_cancelled.load(Ordering::SeqCst)
                || state_clone.cancelled_tasks.remove(&task.id).is_some()
            {
                let _ = app_clone.emit(
                    "task_skipped",
                    TaskSkippedPayload {
                        id: task.id.clone(),
                        reason: "user_cancel".into(),
                        output_path: None,
                    },
                );
                check_and_emit_batch_finished(
                    &app_clone,
                    &total_tasks_ref,
                    &completed_count_ref,
                    &orig_bytes_ref,
                    &comp_bytes_ref,
                    &out_dir_ref,
                );
                return;
            }

            let mem_needed = estimate_memory_needed(&orig_path).clamp(1024 * 1024, 384 * 1024 * 1024);
            let _mem_permit = state_clone
                .memory_semaphore
                .acquire_many(mem_needed)
                .await
                .ok();

            // 5. 執行真實解碼、編碼、負向膨脹判定與原子寫入
            let result = process_single_task_execution(
                &app_clone,
                &task,
                &task_config,
                &orig_path,
                &plan,
                target_ext,
                orig_ext,
                state_clone.is_cancelled.clone(),
            ).await;

            match result {
                Ok((orig_size, comp_size, target_dir)) => {
                    orig_bytes_ref.fetch_add(orig_size, Ordering::Relaxed);
                    comp_bytes_ref.fetch_add(comp_size, Ordering::Relaxed);
                    if let Ok(mut dir_guard) = out_dir_ref.lock() {
                        if dir_guard.is_empty() {
                            *dir_guard = target_dir;
                        }
                    }
                }
                Err(err_msg) => {
                    if err_msg == "TASK_CANCELLED" {
                        let _ = app_clone.emit(
                            "task_skipped",
                            TaskSkippedPayload {
                                id: task.id.clone(),
                                reason: "user_cancel".into(),
                                output_path: None,
                            },
                        );
                    } else {
                        let _ = app_clone.emit(
                            "task_error",
                            TaskErrorPayload {
                                id: task.id.clone(),
                                error_message: err_msg,
                            },
                        );
                    }
                }
            }

            check_and_emit_batch_finished(
                &app_clone,
                &total_tasks_ref,
                &completed_count_ref,
                &orig_bytes_ref,
                &comp_bytes_ref,
                &out_dir_ref,
            );
        });
    }

    Ok(BatchInitAck { task_count })
}

/// 處理單一圖檔之解碼、編碼、負向膨脹防禦與原子寫入
async fn process_single_task_execution(
    app: &AppHandle,
    task: &TaskInput,
    config: &CompressionConfig,
    orig_path: &Path,
    plan: &OutputPlan,
    _target_ext: &str,
    orig_ext: &str,
    is_cancelled: Arc<AtomicBool>,
) -> Result<(u64, u64, String), String> {
    if !orig_path.exists() {
        return Err("檔案不存在".into());
    }

    let orig_size = fs::metadata(orig_path)
        .map_err(|e| format!("無法讀取檔案大小: {e}"))?
        .len();

    // 檔案鎖定重試 (最多 5 次，間隔 100ms)
    let mut file_open_result = None;
    for _ in 0..5 {
        match File::open(orig_path) {
            Ok(f) => {
                file_open_result = Some(f);
                break;
            }
            Err(_) => tokio::time::sleep(Duration::from_millis(100)).await,
        }
    }
    if file_open_result.is_none() {
        return Err("檔案被其他程式佔用或鎖定".into());
    }
    drop(file_open_result);

    // 發射階段事件：decoding
    let _ = app.emit(
        "task_stage",
        TaskStagePayload {
            id: task.id.clone(),
            stage: "decoding".into(),
        },
    );

    let orig_path_buf = orig_path.to_path_buf();
    let config_clone = config.clone();
    let orig_ext_string = orig_ext.to_string();

    let (encoded_bytes, output_format_label, ext) = tokio::task::spawn_blocking(move || {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut file_bytes = Vec::new();
            if let Ok(mut f) = File::open(&orig_path_buf) {
                let _ = f.read_to_end(&mut file_bytes);
            }

            let mut img = image::open(&orig_path_buf)
                .map_err(|e| format!("圖片解碼失敗 (可能損壞或不支援): {e}"))?;

            // R-03: EXIF Orientation 方向歸一化 (將正確旋轉烘焙入像素中)
            if let Some(orientation) = read_exif_orientation_from_bytes(&file_bytes) {
                if orientation > 1 {
                    img = apply_orientation(img, orientation);
                }
            }

            let (encoder, output_format_label, ext) =
                get_encoder(&config_clone.target_format, &orig_ext_string);

            let encoded_bytes = encoder.encode(&img, &config_clone)?;
            Ok::<_, String>((encoded_bytes, output_format_label.to_string(), ext.to_string()))
        }))
    })
    .await
    .map_err(|e| format!("背景執行緒調度失敗: {e}"))?
    .map_err(|_| "影像編碼核心異常崩潰 (Panic)".to_string())??;

    // 若已被全域取消，直接中止，不進入寫檔與複製階段
    if is_cancelled.load(Ordering::SeqCst) {
        return Err("TASK_CANCELLED".into());
    }

    // 發射階段事件：encoding 完成，進入 writing
    let _ = app.emit(
        "task_stage",
        TaskStagePayload {
            id: task.id.clone(),
            stage: "writing".into(),
        },
    );

    let compressed_size = encoded_bytes.len() as u64;
    let candidate_output_path = &plan.candidate_output_path;
    let target_dir = &plan.target_dir;
    let final_filename = &plan.final_filename;

    // 負向膨脹防禦 (Negative Compression Guard)
    let is_same_fmt = config.target_format == "original" || is_same_image_format(&ext, orig_ext);
    let is_kept_original = compressed_size >= orig_size && is_same_fmt;

    let final_size = if is_kept_original {
        if config.output_dir_mode == "same" {
            // 同資料夾模式下，若反向膨脹則不寫檔，直接標記為略過 (no_gain)
            let _ = app.emit(
                "task_skipped",
                TaskSkippedPayload {
                    id: task.id.clone(),
                    reason: "no_gain".into(),
                    output_path: None,
                },
            );
            return Ok((orig_size, orig_size, target_dir.to_string_lossy().to_string()));
        } else {
            // 子資料夾或自訂資料夾：複製原檔以確保交付資料夾完整
            if is_cancelled.load(Ordering::SeqCst) {
                return Err("TASK_CANCELLED".into());
            }
            if orig_path != candidate_output_path {
                fs::copy(orig_path, candidate_output_path)
                    .map_err(|e| format!("原檔複製失敗: {e}"))?;
            }
            orig_size
        }
    } else {
        if is_cancelled.load(Ordering::SeqCst) {
            return Err("TASK_CANCELLED".into());
        }

        // 原子落盤管線
        let temp_filename = format!(".{}.tinysqueeze_tmp_{}", final_filename, Uuid::new_v4());
        let temp_path = target_dir.join(&temp_filename);

        let guard = TempFileGuard::new(temp_path.clone());

        let mut file = File::create(&temp_path)
            .map_err(|e| format!("無法建立暫存檔: {e}"))?;
        file.write_all(&encoded_bytes)
            .map_err(|e| format!("暫存檔寫入失敗: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("磁碟快取同步失敗: {e}"))?;
        drop(file);

        if is_cancelled.load(Ordering::SeqCst) {
            return Err("TASK_CANCELLED".into());
        }

        let mut rename_err = None;
        for attempt in 0..5 {
            match fs::rename(&temp_path, candidate_output_path) {
                Ok(_) => {
                    rename_err = None;
                    break;
                }
                Err(e) => {
                    rename_err = Some(e);
                    tokio::time::sleep(Duration::from_millis(50 * (attempt + 1))).await;
                }
            }
        }
        if let Some(err) = rename_err {
            return Err(format!("原子替換目標檔失敗: {err}"));
        }

        guard.commit();
        compressed_size
    };

    let savings_ratio = if orig_size > 0 && orig_size > final_size {
        (orig_size - final_size) as f32 / orig_size as f32
    } else {
        0.0
    };

    let _ = app.emit(
        "task_completed",
        TaskCompletedPayload {
            id: task.id.clone(),
            original_size: orig_size,
            compressed_size: final_size,
            savings_ratio,
            output_path: candidate_output_path.to_string_lossy().to_string(),
            output_format: output_format_label,
            is_kept_original,
        },
    );

    Ok((orig_size, final_size, target_dir.to_string_lossy().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_plan_output_same_dir() {
        let temp_dir = std::env::temp_dir().join(format!("tinysqueeze_test_{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let src = temp_dir.join("photo.jpg");
        fs::write(&src, b"fake").unwrap();

        let config = CompressionConfig {
            output_dir_mode: "same".into(),
            suffix: "_min".into(),
            conflict_strategy: "auto_rename".into(),
            ..Default::default()
        };

        let plan = plan_output(&config, &src, "jpg", None).unwrap();
        assert_eq!(plan.candidate_output_path, temp_dir.join("photo_min.jpg"));
        assert!(!plan.is_conflict);
        assert!(!plan.is_skipped);

        // 如果 photo_min.jpg 已存在，且是自體上一輪輸出
        fs::write(&plan.candidate_output_path, b"min").unwrap();
        let rerun_plan = plan_output(&config, &src, "jpg", Some(&plan.candidate_output_path)).unwrap();
        assert_eq!(rerun_plan.candidate_output_path, temp_dir.join("photo_min.jpg"));
        assert!(!rerun_plan.is_conflict);

        // 如果不是上一輪輸出，auto_rename 應產生 photo_min_1.jpg
        let rename_plan = plan_output(&config, &src, "jpg", None).unwrap();
        assert_eq!(rename_plan.candidate_output_path, temp_dir.join("photo_min_1.jpg"));

        // 如果策略是 skip，應標記 is_skipped = true
        let config_skip = CompressionConfig {
            output_dir_mode: "same".into(),
            suffix: "_min".into(),
            conflict_strategy: "skip".into(),
            ..Default::default()
        };
        let skip_plan = plan_output(&config_skip, &src, "jpg", None).unwrap();
        assert!(skip_plan.is_skipped);
        assert_eq!(skip_plan.skip_reason.as_deref(), Some("strategy_skip"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_exif_orientation_parser() {
        // 構造合法的 mini JPEG APP1 EXIF orientation=6
        let mut jpeg = vec![0xFF, 0xD8];
        let mut app1_content = vec![];
        app1_content.extend_from_slice(b"Exif\0\0");
        app1_content.extend_from_slice(b"II");
        app1_content.extend_from_slice(&42u16.to_le_bytes());
        app1_content.extend_from_slice(&8u32.to_le_bytes());
        app1_content.extend_from_slice(&1u16.to_le_bytes());
        app1_content.extend_from_slice(&0x0112u16.to_le_bytes());
        app1_content.extend_from_slice(&3u16.to_le_bytes());
        app1_content.extend_from_slice(&1u32.to_le_bytes());
        app1_content.extend_from_slice(&6u16.to_le_bytes());
        app1_content.extend_from_slice(&[0u8, 0u8]);

        let app1_len = (app1_content.len() + 2) as u16;
        jpeg.push(0xFF);
        jpeg.push(0xE1);
        jpeg.extend_from_slice(&app1_len.to_be_bytes());
        jpeg.extend_from_slice(&app1_content);
        jpeg.extend_from_slice(&[0xFF, 0xD9]);

        let orientation = read_exif_orientation_from_bytes(&jpeg);
        assert_eq!(orientation, Some(6));
    }
}
