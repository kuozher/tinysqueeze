import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle, FolderOpen } from "@phosphor-icons/react";
import { useStore } from "../store";
import { formatBytes } from "../utils";

export const SummaryModal: React.FC = () => {
  const summaryModalData = useStore((s) => s.summaryModalData);
  const setSummaryModal = useStore((s) => s.setSummaryModal);

  if (!summaryModalData) return null;

  const {
    total_processed,
    total_original_bytes,
    total_compressed_bytes,
    total_saved_ratio,
    output_directory,
  } = summaryModalData;

  const savedBytes = total_original_bytes > total_compressed_bytes
    ? total_original_bytes - total_compressed_bytes
    : 0;

  const handleOpenFolder = () => {
    invoke("open_output_dir", { path: output_directory }).catch(console.error);
    setSummaryModal(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div
        onClick={() => setSummaryModal(null)}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px]"
      />

      {/* 結算卡片 (6px 微圓角、俐落外框) */}
      <div className="relative w-full max-w-[440px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[6px] shadow-2xl p-6 text-[var(--text-main)] z-10 space-y-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-[6px] bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/30">
            <CheckCircle size={24} weight="bold" />
          </div>
          <div>
            <h3 className="text-[17px] font-semibold tracking-tight">
              批次處理完成
            </h3>
            <p className="text-[13px] text-[var(--text-muted)]">
              成功處理 {total_processed} 張圖片，共減少{" "}
              <span className="text-[var(--accent-green)] font-bold">
                {Math.round(total_saved_ratio * 100)}%
              </span>{" "}
              儲存空間
            </p>
          </div>
        </div>

        {/* 體積消長矩陣卡 */}
        <div className="bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-[4px] p-3.5 space-y-2 text-[13px]">
          <div className="flex items-center justify-between font-mono tabular-nums">
            <span className="text-[var(--text-muted)]">原始大小:</span>
            <span className="font-medium text-[var(--text-main)]">
              {formatBytes(total_original_bytes)}
            </span>
          </div>

          <div className="flex items-center justify-between font-mono tabular-nums">
            <span className="text-[var(--text-muted)]">壓縮後:</span>
            <span className="font-semibold text-[var(--text-main)]">
              {formatBytes(total_compressed_bytes)}
            </span>
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between font-mono tabular-nums">
            <span className="text-[var(--accent-green)] font-medium">節省空間:</span>
            <span className="font-bold text-[var(--accent-green)]">
              {formatBytes(savedBytes)}
            </span>
          </div>
        </div>

        {/* 按鈕組 */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setSummaryModal(null)}
            className="px-3.5 py-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-main)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-[4px] hover:bg-[var(--border-hover)]/30 cursor-pointer transition-colors"
          >
            關閉 (Esc)
          </button>
          <button
            type="button"
            onClick={handleOpenFolder}
            className="flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-semibold text-black bg-[var(--accent-green)] rounded-[4px] hover:bg-[var(--accent-green)]/90 cursor-pointer transition-colors shadow-sm"
          >
            <FolderOpen size={15} weight="bold" />
            <span>開啟輸出檔案夾 ↵</span>
          </button>
        </div>
      </div>
    </div>
  );
};
