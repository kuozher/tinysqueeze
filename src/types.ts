export type TargetFormat = "original" | "webp" | "avif" | "jpeg" | "png";
export type OutputDirMode = "same" | "sub" | "custom";
export type ConflictStrategy = "auto_rename" | "overwrite" | "skip" | "ask";

export interface CompressionConfig {
  quality: number;
  target_format: TargetFormat;
  output_dir_mode: OutputDirMode;
  custom_dir_path?: string;
  conflict_strategy: ConflictStrategy;
  strip_metadata: boolean;
  convert_to_srgb: boolean;
  suffix?: string;
}

export type TaskStatus = "pending" | "processing" | "completed" | "error" | "conflict" | "skipped";

export interface TaskItem {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  status: TaskStatus;
  width?: number;
  height?: number;
  hasThumbnail?: boolean;
  thumbnailUrl?: string;
  compressedSize?: number;
  displayCompressedSize?: number; // for 180ms rolling animation
  savingsRatio?: number;
  outputPath?: string;
  outputFormat?: string;
  isKeptOriginal?: boolean;
  errorMessage?: string;
  conflictCandidatePath?: string;
  skipReason?: string;
  stage?: "decoding" | "encoding" | "writing";
  priorSavedBytes?: number;
}

export interface ThumbnailReadyPayload {
  id: string;
  width: number;
  height: number;
  thumbnail_base64?: string;
}

export interface TaskStagePayload {
  id: string;
  stage: "decoding" | "encoding" | "writing";
}

export interface TaskCompletedPayload {
  id: string;
  original_size: number;
  compressed_size: number;
  savings_ratio: number;
  output_path: string;
  output_format: string;
  is_kept_original: boolean;
}

export interface TaskSkippedPayload {
  id: string;
  reason: string;
  output_path?: string;
}

export interface ConflictDetectedPayload {
  id: string;
  original_path: string;
  candidate_output_path: string;
}

export interface BatchFinishedPayload {
  total_processed: number;
  total_original_bytes: number;
  total_compressed_bytes: number;
  total_saved_ratio: number;
  output_directory: string;
}

export type u32 = number;

export interface ScannedTaskInput {
  id: string;
  file_path: string;
  file_name: string;
  file_size: number;
}

export interface ScanResult {
  tasks: ScannedTaskInput[];
  avif_count: number;
  unsupported_count: number;
}
