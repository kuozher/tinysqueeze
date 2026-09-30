use std::path::PathBuf;
use serde::{Deserialize, Serialize};

fn default_suffix() -> String {
    "_min".into()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompressionConfig {
    pub quality: u8,               // 1 - 100
    pub target_format: String,     // "original" | "webp" | "avif" | "jpeg" | "png"
    pub output_dir_mode: String,   // "same" | "sub" | "custom"
    pub custom_dir_path: Option<String>,
    pub conflict_strategy: String, // "auto_rename" | "overwrite" | "skip" | "ask"
    pub strip_metadata: bool,
    pub convert_to_srgb: bool,
    #[serde(default = "default_suffix")]
    pub suffix: String,            // 檔名後綴，預設 "_min"
}

impl Default for CompressionConfig {
    fn default() -> Self {
        Self {
            quality: 75,
            target_format: "original".into(),
            output_dir_mode: "same".into(),
            custom_dir_path: None,
            conflict_strategy: "auto_rename".into(),
            strip_metadata: true,
            convert_to_srgb: true,
            suffix: "_min".into(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskInput {
    pub id: String,        // 唯一任務識別碼 (UUIDv4)
    pub file_path: String, // 本機檔案絕對路徑
    pub file_name: String, // 檔名
    pub file_size: u64,    // 原始檔案大小
    #[serde(default)]
    pub prior_output_path: Option<String>, // 上一輪輸出路徑 (供 R 重跑覆寫判斷)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutputPlan {
    pub target_dir: PathBuf,
    pub candidate_output_path: PathBuf,
    pub final_filename: String,
    pub is_conflict: bool,
    pub is_skipped: bool,
    pub skip_reason: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct BatchInitAck {
    pub task_count: usize,
}

// 縮圖就緒極簡通知 (Slim Payload，約 40 Bytes，含極輕量 80x80 DataURL)
#[derive(Debug, Serialize, Clone)]
pub struct ThumbnailReadyPayload {
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub thumbnail_base64: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct TaskStagePayload {
    pub id: String,
    pub stage: String, // "decoding" | "encoding" | "writing"
}

#[derive(Debug, Serialize, Clone)]
pub struct TaskCompletedPayload {
    pub id: String,
    pub original_size: u64,
    pub compressed_size: u64,
    pub savings_ratio: f32,     // 例：0.68 代表省下 68%
    pub output_path: String,
    pub output_format: String,  // "WEBP", "JPG", "PNG", "AVIF"
    pub is_kept_original: bool, // 是否發生反向膨脹而保留原檔
}

#[derive(Debug, Serialize, Clone)]
pub struct TaskSkippedPayload {
    pub id: String,
    pub reason: String, // "strategy_skip" | "conflict_timeout" | "user_skip" | "no_gain"
    pub output_path: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct TaskErrorPayload {
    pub id: String,
    pub error_message: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ConflictDetectedPayload {
    pub id: String,
    pub original_path: String,
    pub candidate_output_path: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct BatchFinishedPayload {
    pub total_processed: usize,
    pub total_original_bytes: u64,
    pub total_compressed_bytes: u64,
    pub total_saved_ratio: f32,
    pub output_directory: String,
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictResolution {
    Overwrite,
    AutoRename,
    Skip,
}

