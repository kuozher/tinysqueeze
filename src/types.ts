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
}

export type TaskStatus = "pending" | "processing" | "completed" | "error" | "conflict";

export interface TaskItem {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  status: TaskStatus;
  width?: number;
  height?: number;
  hasThumbnail?: boolean;
  compressedSize?: number;
  displayCompressedSize?: number; // for 180ms rolling animation
  savingsRatio?: number;
  outputPath?: string;
  outputFormat?: string;
  isKeptOriginal?: boolean;
  errorMessage?: string;
  conflictCandidatePath?: string;
}

export interface ThumbnailReadyPayload {
  id: string;
  width: u32;
  height: u32;
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
