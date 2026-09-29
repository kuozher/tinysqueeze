use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use image::GenericImageView;
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Notify, RwLock, Semaphore};
use uuid::Uuid;

use crate::codecs::{generate_thumbnail, get_encoder};
use crate::guard::TempFileGuard;
use crate::models::{
    BatchFinishedPayload, BatchInitAck, CompressionConfig, ConflictDetectedPayload,
    ConflictResolution, TaskCompletedPayload, TaskErrorPayload, TaskInput, ThumbnailReadyPayload,
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
                // 限制在 1MB ~ 384MB 之間，絕不超過全域 512MB 總量的 75%，防止 FIFO 隊列永久飢餓死鎖
                return calculated.clamp(1024 * 1024, 384 * 1024 * 1024);
            }
        }
    }
    // 預設 50 MB
    50 * 1024 * 1024
}

/// 啟動批次處理
pub async fn start_batch(
    app: AppHandle,
    state: Arc<PipelineState>,
    tasks: Vec<TaskInput>,
    config: CompressionConfig,
) -> Result<BatchInitAck, String> {
    *state.active_config.write().await = config.clone();

    let task_count = tasks.len();
    let total_tasks = Arc::new(AtomicUsize::new(task_count));
    let completed_count = Arc::new(AtomicUsize::new(0));

    let total_original_bytes = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let total_compressed_bytes = Arc::new(std::sync::atomic::AtomicU64::new(0));

    // 取得主要輸出目錄作為結算參考
    let output_dir_sample = Arc::new(std::sync::Mutex::new(String::new()));

    // 1. Fast Lane: 抽取縮圖 (最高優先權)
    for task in &tasks {
        let app_clone = app.clone();
        let cache = state.thumbnail_cache.clone();
        let task_clone = task.clone();

        tokio::task::spawn_blocking(move || {
            let path = Path::new(&task_clone.file_path);
            if let Ok(img) = image::open(path) {
                let (w, h) = img.dimensions();
                if let Ok(thumb_bytes) = generate_thumbnail(&img) {
                    cache.insert(task_clone.id.clone(), thumb_bytes);
                    let _ = app_clone.emit(
                        "thumbnail_ready",
                        ThumbnailReadyPayload {
                            id: task_clone.id,
                            width: w,
                            height: h,
                        },
                    );
                }
            }
        });
    }

    // 2. Heavy Lane: 記憶體門禁編碼佇列 (使用 PipelineState 全域常駐信號量，杜絕並發批次 CPU/Worker 膨脹)
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
            // 若任務已被取消，直接略過
            if state_clone.cancelled_tasks.remove(&task.id).is_some() {
                let finished = completed_count_ref.fetch_add(1, Ordering::SeqCst) + 1;
                if finished >= total_tasks_ref.load(Ordering::SeqCst) {
                    let total_orig = orig_bytes_ref.load(Ordering::Relaxed);
                    let total_comp = comp_bytes_ref.load(Ordering::Relaxed);
                    let saved_ratio = if total_orig > 0 {
                        (total_orig.saturating_sub(total_comp)) as f32 / total_orig as f32
                    } else {
                        0.0
                    };
                    let dir = out_dir_ref.lock().unwrap().clone();
                    let _ = app_clone.emit(
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
                return;
            }

            // 佇列暫停時等待繼續
            while state_clone.is_paused.load(Ordering::SeqCst) {
                state_clone.pause_notify.notified().await;
            }

            if state_clone.cancelled_tasks.remove(&task.id).is_some() {
                let _finished = completed_count_ref.fetch_add(1, Ordering::SeqCst) + 1;
                return;
            }

            let _worker_permit = heavy_permit.acquire().await.unwrap();

            while state_clone.is_paused.load(Ordering::SeqCst) {
                state_clone.pause_notify.notified().await;
            }

            if state_clone.cancelled_tasks.remove(&task.id).is_some() {
                let _finished = completed_count_ref.fetch_add(1, Ordering::SeqCst) + 1;
                return;
            }

            let orig_path = PathBuf::from(&task.file_path);
            let mem_needed = estimate_memory_needed(&orig_path).clamp(1024 * 1024, 384 * 1024 * 1024);

            // 申請記憶體水線配額 (最多 384MB，永不超過全域 512MB 導致永久阻塞)
            let _mem_permit = state_clone
                .memory_semaphore
                .acquire_many(mem_needed)
                .await
                .ok();

            let result = process_single_task(
                &app_clone,
                &state_clone,
                &task,
                &task_config,
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
                    let _ = app_clone.emit(
                        "task_error",
                        TaskErrorPayload {
                            id: task.id.clone(),
                            error_message: err_msg,
                        },
                    );
                }
            }

            // 檢查是否全體批次完成
            let finished = completed_count_ref.fetch_add(1, Ordering::SeqCst) + 1;
            if finished >= total_tasks_ref.load(Ordering::SeqCst) {
                let total_orig = orig_bytes_ref.load(Ordering::Relaxed);
                let total_comp = comp_bytes_ref.load(Ordering::Relaxed);
                let saved_ratio = if total_orig > 0 {
                    (total_orig.saturating_sub(total_comp)) as f32 / total_orig as f32
                } else {
                    0.0
                };

                let dir = out_dir_ref.lock().unwrap().clone();

                let _ = app_clone.emit(
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
        });
    }

    Ok(BatchInitAck { task_count })
}

/// 處理單一圖檔之解碼、編碼、衝突決策與原子寫入
async fn process_single_task(
    app: &AppHandle,
    state: &Arc<PipelineState>,
    task: &TaskInput,
    config: &CompressionConfig,
) -> Result<(u64, u64, String), String> {
    let orig_path = PathBuf::from(&task.file_path);
    if !orig_path.exists() {
        return Err("檔案不存在".into());
    }

    let orig_size = fs::metadata(&orig_path)
        .map_err(|e| format!("無法讀取檔案大小: {e}"))?
        .len();

    // 檔案鎖定重試 (最多 5 次，間隔 100ms)
    let mut file_open_result = None;
    for _ in 0..5 {
        match File::open(&orig_path) {
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

    // 解碼與編碼：移入 spawn_blocking 避免密集 CPU 運算癱瘓 Tokio 異步調度，並以 catch_unwind 確保 Panic 被妥善轉化為錯誤
    let orig_path_clone = orig_path.clone();
    let config_clone = config.clone();

    let (encoded_bytes, output_format_label, ext, orig_ext) = tokio::task::spawn_blocking(move || {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let img = image::open(&orig_path_clone)
                .map_err(|e| format!("圖片解碼失敗 (可能損壞或不支援): {e}"))?;

            let orig_ext = orig_path_clone
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("png");

            let (encoder, output_format_label, ext) = get_encoder(&config_clone.target_format, orig_ext);

            let encoded_bytes = encoder.encode(&img, &config_clone)?;
            Ok::<_, String>((encoded_bytes, output_format_label.to_string(), ext.to_string(), orig_ext.to_string()))
        }))
    })
    .await
    .map_err(|e| format!("背景執行緒調度失敗: {e}"))?
    .map_err(|_| "影像編碼核心異常崩潰 (Panic)".to_string())??;

    let compressed_size = encoded_bytes.len() as u64;

    // 計算目標路徑
    let parent_dir = orig_path.parent().unwrap_or(Path::new("."));
    let target_dir = match config.output_dir_mode.as_str() {
        "sub" => {
            let sub = parent_dir.join("min");
            let _ = fs::create_dir_all(&sub);
            sub
        }
        "custom" => {
            if let Some(ref custom) = config.custom_dir_path {
                let p = PathBuf::from(custom);
                let _ = fs::create_dir_all(&p);
                p
            } else {
                parent_dir.to_path_buf()
            }
        }
        _ => parent_dir.to_path_buf(),
    };

    let stem = orig_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");

    let final_filename = format!("{stem}.{ext}");
    let mut candidate_output_path = target_dir.join(&final_filename);

    // 衝突處理策略判定
    let mut should_write_encoded = true;
    if candidate_output_path.exists() {
        match config.conflict_strategy.as_str() {
            "overwrite" => {
                // 原地原子覆蓋
            }
            "auto_rename" => {
                candidate_output_path = get_auto_renamed_path(&target_dir, stem, &ext);
            }
            "skip" => {
                return Ok((orig_size, orig_size, target_dir.to_string_lossy().to_string()));
            }
            "ask" => {
                // 發射衝突事件並掛起
                let (tx, rx) = oneshot::channel();
                state.conflict_channels.insert(task.id.clone(), tx);

                let _ = app.emit(
                    "conflict_detected",
                    ConflictDetectedPayload {
                        id: task.id.clone(),
                        original_path: task.file_path.clone(),
                        candidate_output_path: candidate_output_path.to_string_lossy().to_string(),
                    },
                );

                // 逾時 Hook: 等待 10 分鐘 (600s)
                match tokio::time::timeout(Duration::from_secs(600), rx).await {
                    Ok(Ok(resolution)) => match resolution {
                        ConflictResolution::Overwrite => {}
                        ConflictResolution::AutoRename => {
                            candidate_output_path = get_auto_renamed_path(&target_dir, stem, &ext);
                        }
                        ConflictResolution::Skip => {
                            return Ok((orig_size, orig_size, target_dir.to_string_lossy().to_string()));
                        }
                    },
                    _ => {
                        // 逾時或中斷：主動略過
                        return Ok((orig_size, orig_size, target_dir.to_string_lossy().to_string()));
                    }
                }
            }
            _ => {}
        }
    }

    // 負向膨脹防禦 (Negative Compression Guard)
    let is_same_fmt = config.target_format == "original" || is_same_image_format(&ext, &orig_ext);
    let is_kept_original = if compressed_size >= orig_size && is_same_fmt {
        should_write_encoded = false;
        true
    } else {
        false
    };

    let final_size = if is_kept_original {
        // 若目標候選路徑與原檔不同（例如因 auto_rename 產生 foo_1.jpg），直接複製原檔
        if orig_path != candidate_output_path {
            fs::copy(&orig_path, &candidate_output_path)
                .map_err(|e| format!("原檔複製失敗: {e}"))?;
        }
        orig_size
    } else if should_write_encoded {
        // 原子落盤管線
        let temp_filename = format!(".{}.tinysqueeze_tmp_{}", final_filename, Uuid::new_v4());
        let temp_path = target_dir.join(&temp_filename);

        // 綁定 RAII Guard 防止中途 Panic 或取消造成孤兒檔案
        let guard = TempFileGuard::new(temp_path.clone());

        let mut file = File::create(&temp_path)
            .map_err(|e| format!("無法建立暫存檔: {e}"))?;
        file.write_all(&encoded_bytes)
            .map_err(|e| format!("暫存檔寫入失敗: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("磁碟快取同步失敗: {e}"))?;
        drop(file);

        // 原地原子替換 (支援 Windows 短暫檔案鎖定退避重試，消除 OS Error 5 / 32)
        let mut rename_err = None;
        for attempt in 0..5 {
            match fs::rename(&temp_path, &candidate_output_path) {
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

        // 成功替換，解除 Drop 自動清理
        guard.commit();

        compressed_size
    } else {
        orig_size
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
            output_format: output_format_label.into(),
            is_kept_original,
        },
    );

    Ok((orig_size, final_size, target_dir.to_string_lossy().to_string()))
}

fn get_auto_renamed_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
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
