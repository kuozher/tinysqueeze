pub mod codecs;
pub mod commands;
pub mod guard;
pub mod models;
pub mod pipeline;

use std::sync::Arc;
use guard::InFlightJournal;
use pipeline::PipelineState;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pipeline_state = Arc::new(PipelineState::new());
    let thumb_cache = pipeline_state.thumbnail_cache.clone();
    let thumb_cache_legacy = pipeline_state.thumbnail_cache.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(pipeline_state)
        .register_uri_scheme_protocol("tinysqueeze-thumb", move |_ctx, request| {
            let uri = request.uri();
            let raw_path = uri.path().trim_start_matches('/');
            let raw_host = uri.host().unwrap_or("");

            // 支援 tinysqueeze-thumb://localhost/{id} 與 tinysqueeze-thumb://{id}
            let id = if !raw_path.is_empty() && raw_path != "localhost" {
                raw_path
            } else if !raw_host.is_empty() && raw_host != "localhost" {
                raw_host
            } else {
                raw_path
            };

            if let Some(bytes) = thumb_cache.get(id) {
                tauri::http::Response::builder()
                    .header("Content-Type", "image/webp")
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Cache-Control", "no-cache")
                    .body(bytes.clone())
                    .unwrap()
            } else {
                tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::NOT_FOUND)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Vec::new())
                    .unwrap()
            }
        })
        .register_uri_scheme_protocol("tinypress-thumb", move |_ctx, request| {
            let uri = request.uri();
            let raw_path = uri.path().trim_start_matches('/');
            let raw_host = uri.host().unwrap_or("");

            // 相容舊版協定
            let id = if !raw_path.is_empty() && raw_path != "localhost" {
                raw_path
            } else if !raw_host.is_empty() && raw_host != "localhost" {
                raw_host
            } else {
                raw_path
            };

            if let Some(bytes) = thumb_cache_legacy.get(id) {
                tauri::http::Response::builder()
                    .header("Content-Type", "image/webp")
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Cache-Control", "no-cache")
                    .body(bytes.clone())
                    .unwrap()
            } else {
                tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::NOT_FOUND)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Vec::new())
                    .unwrap()
            }
        })
        .setup(|_app| {
            // 被動防禦：冷啟動清掃遺留孤兒暫存檔
            InFlightJournal::sweep_orphans_on_startup();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_paths,
            commands::start_batch_compression,
            commands::update_active_config,
            commands::resolve_file_conflict,
            commands::clear_thumbnails,
            commands::open_output_dir,
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::window_close,
            commands::window_start_dragging,
            commands::pause_batch,
            commands::resume_batch,
            commands::cancel_task,
            commands::window_set_size,
            commands::window_is_maximized,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tinysqueeze application");
}
