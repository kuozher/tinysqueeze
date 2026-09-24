use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, State};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::models::{
    BatchInitAck, CompressionConfig, ConflictResolution, TaskInput,
};
use crate::pipeline::{start_batch, PipelineState};

const VALID_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "avif"];

/// 遞迴掃描使用者拖入的檔案與資料夾
#[tauri::command]
pub async fn scan_paths(paths: Vec<String>) -> Result<Vec<TaskInput>, String> {
    let mut tasks = Vec::new();

    for p in paths {
        let path = PathBuf::from(&p);
        if path.is_file() {
            if is_supported_image(&path) {
                if let Ok(meta) = std::fs::metadata(&path) {
                    tasks.push(TaskInput {
                        id: Uuid::new_v4().to_string(),
                        file_path: path.to_string_lossy().to_string(),
                        file_name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                        file_size: meta.len(),
                    });
                }
            }
        } else if path.is_dir() {
            for entry in WalkDir::new(&path)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let sub_path = entry.path();
                if sub_path.is_file() && is_supported_image(sub_path) {
                    if let Ok(meta) = std::fs::metadata(sub_path) {
                        tasks.push(TaskInput {
                            id: Uuid::new_v4().to_string(),
                            file_path: sub_path.to_string_lossy().to_string(),
                            file_name: sub_path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                            file_size: meta.len(),
                        });
                    }
                }
            }
        }
    }

    Ok(tasks)
}

fn is_supported_image(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
        let lower = ext.to_lowercase();
        VALID_EXTENSIONS.contains(&lower.as_str())
    } else {
        false
    }
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

