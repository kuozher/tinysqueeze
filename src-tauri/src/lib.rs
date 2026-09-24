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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(pipeline_state)
        .register_uri_scheme_protocol("tinypress-thumb", move |_ctx, request| {
            let path = request.uri().path();
            let id = path.trim_start_matches('/');
            if let Some(bytes) = thumb_cache.get(id) {
                tauri::http::Response::builder()
                    .header("Content-Type", "image/webp")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(bytes.clone())
                    .unwrap()
            } else {
                tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::NOT_FOUND)
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tinypress application");
}
