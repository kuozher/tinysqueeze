use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, State};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::models::{
    BatchInitAck, CompressionConfig, ConflictResolution, TaskInput,
};
use crate::pipeline::{start_batch, PipelineState};

const VALID_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp"];

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct ScanResult {
    pub tasks: Vec<TaskInput>,
    pub avif_count: usize,
    pub unsupported_count: usize,
}

/// 遞迴掃描使用者拖入的檔案與資料夾
#[tauri::command]
pub async fn scan_paths(paths: Vec<String>) -> Result<ScanResult, String> {
    let mut tasks = Vec::new();
    let mut avif_count = 0usize;
    let mut unsupported_count = 0usize;

    for p in paths {
        let cleaned = p.trim().trim_matches('"');
        let path = PathBuf::from(cleaned);

        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                let lower = ext.to_lowercase();
                if lower == "avif" {
                    avif_count += 1;
                } else if VALID_EXTENSIONS.contains(&lower.as_str()) {
                    if let Ok(meta) = std::fs::metadata(&path) {
                        tasks.push(TaskInput {
                            id: Uuid::new_v4().to_string(),
                            file_path: path.to_string_lossy().to_string(),
                            file_name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                            file_size: meta.len(),
                            prior_output_path: None,
                        });
                    }
                } else {
                    unsupported_count += 1;
                }
            }
        } else if path.is_dir() {
            for entry in WalkDir::new(&path)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let sub_path = entry.path();
                if sub_path.is_file() {
                    if let Some(ext) = sub_path.extension().and_then(|s| s.to_str()) {
                        let lower = ext.to_lowercase();
                        if lower == "avif" {
                            avif_count += 1;
                        } else if VALID_EXTENSIONS.contains(&lower.as_str()) {
                            if let Ok(meta) = std::fs::metadata(sub_path) {
                                tasks.push(TaskInput {
                                    id: Uuid::new_v4().to_string(),
                                    file_path: sub_path.to_string_lossy().to_string(),
                                    file_name: sub_path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                                    file_size: meta.len(),
                                    prior_output_path: None,
                                });
                            }
                        } else {
                            unsupported_count += 1;
                        }
                    }
                }
            }
        }
    }

    Ok(ScanResult {
        tasks,
        avif_count,
        unsupported_count,
    })
}

/// 啟動批次壓縮
#[tauri::command]
pub async fn start_batch_compression(
    app: AppHandle,
    state: State<'_, Arc<PipelineState>>,
    tasks: Vec<TaskInput>,
    config: CompressionConfig,
) -> Result<BatchInitAck, String> {
    start_batch(app, state.inner().clone(), tasks, config).await
}

/// 動態更新全域活躍參數 (滑桿移動時呼叫，不追溯已完成者，但未開始者即時套用)
#[tauri::command]
pub async fn update_active_config(
    state: State<'_, Arc<PipelineState>>,
    config: CompressionConfig,
) -> Result<(), String> {
    *state.active_config.write().await = config;
    Ok(())
}

/// 衝突決策非阻塞回傳
#[tauri::command]
pub async fn resolve_file_conflict(
    state: State<'_, Arc<PipelineState>>,
    task_id: String,
    resolution: ConflictResolution,
) -> Result<(), String> {
    if let Some((_, sender)) = state.conflict_channels.remove(&task_id) {
        let _ = sender.send(resolution);
    }
    Ok(())
}

/// 清空縮圖記憶體快取
#[tauri::command]
pub async fn clear_thumbnails(
    state: State<'_, Arc<PipelineState>>,
) -> Result<(), String> {
    state.thumbnail_cache.clear();
    Ok(())
}

/// 開啟輸出檔案夾 (Windows 檔案總管)
#[tauri::command]
pub async fn open_output_dir(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let p = PathBuf::from(&path);
        if p.is_file() {
            Command::new("explorer")
                .args(["/select,", &path])
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// 視窗控制：最小化
#[tauri::command]
pub async fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

/// 視窗控制：最大化 / 還原切換
#[tauri::command]
pub async fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

/// 視窗控制：關閉
#[tauri::command]
pub async fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

/// 視窗控制：原生無邊框拖曳
#[tauri::command]
pub async fn window_start_dragging(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

/// 佇列暫停：凍結後續 Worker 派發
#[tauri::command]
pub async fn pause_batch(state: State<'_, Arc<PipelineState>>) -> Result<(), String> {
    state.is_paused.store(true, Ordering::SeqCst);
    Ok(())
}

/// 佇列繼續：喚醒等待中的 Worker 繼續派發
#[tauri::command]
pub async fn resume_batch(state: State<'_, Arc<PipelineState>>) -> Result<(), String> {
    state.is_paused.store(false, Ordering::SeqCst);
    state.pause_notify.notify_waiters();
    Ok(())
}

/// 取消特定任務排程（從佇列移除）
#[tauri::command]
pub async fn cancel_task(
    state: State<'_, Arc<PipelineState>>,
    task_id: String,
) -> Result<(), String> {
    state.cancelled_tasks.insert(task_id, true);
    state.pause_notify.notify_waiters();
    Ok(())
}

/// 取消當前整個批次所有未完成任務
#[tauri::command]
pub async fn cancel_batch(state: State<'_, Arc<PipelineState>>) -> Result<(), String> {
    state.is_cancelled.store(true, Ordering::SeqCst);
    state.is_paused.store(false, Ordering::SeqCst);
    state.pause_notify.notify_waiters();

    let conflict_keys: Vec<String> = state
        .conflict_channels
        .iter()
        .map(|entry| entry.key().clone())
        .collect();
    for k in conflict_keys {
        if let Some((_, sender)) = state.conflict_channels.remove(&k) {
            let _ = sender.send(ConflictResolution::Skip);
        }
    }

    Ok(())
}

/// 視窗控制：設定視窗尺寸
#[tauri::command]
pub async fn window_set_size(window: tauri::Window, width: f64, height: f64) -> Result<(), String> {
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| e.to_string())
}

/// 視窗控制：查詢是否為最大化
#[tauri::command]
pub async fn window_is_maximized(window: tauri::Window) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[tokio::test]
    async fn test_scan_paths_dir() {
        let temp_dir = std::env::temp_dir().join("tinysqueeze_test_scan_dir");
        let _ = std::fs::create_dir_all(&temp_dir);
        let file_path = temp_dir.join("sample.png");
        let mut f = File::create(&file_path).unwrap();
        f.write_all(b"fake png data").unwrap();

        let avif_path = temp_dir.join("sample.avif");
        let mut f_avif = File::create(&avif_path).unwrap();
        f_avif.write_all(b"fake avif data").unwrap();

        let scanned = scan_paths(vec![temp_dir.to_str().unwrap().to_string()]).await.unwrap();
        assert_eq!(scanned.tasks.len(), 1);
        assert_eq!(scanned.avif_count, 1);
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_cancel_batch_state() {
        let state = Arc::new(PipelineState::new());
        state.is_paused.store(true, Ordering::SeqCst);
        assert!(!state.is_cancelled.load(Ordering::SeqCst));
        assert!(state.is_paused.load(Ordering::SeqCst));

        state.is_cancelled.store(true, Ordering::SeqCst);
        state.is_paused.store(false, Ordering::SeqCst);
        state.pause_notify.notify_waiters();

        assert!(state.is_cancelled.load(Ordering::SeqCst));
        assert!(!state.is_paused.load(Ordering::SeqCst));
    }
}



