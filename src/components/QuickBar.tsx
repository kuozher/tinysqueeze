import React from "react";
import { useStore } from "../store";
import { OutputDirMode, TargetFormat } from "../types";

export const QuickBar: React.FC = () => {
  const config = useStore((s) => s.config);
  const updateConfig = useStore((s) => s.updateConfig);

  const getQualityHint = (q: number) => {
    if (q <= 60) return "高壓縮";
    if (q <= 79) return "平衡推薦";
    if (q <= 89) return "高品質";
    return "極致畫質";
  };

  return (
    <footer className="flex items-center justify-between h-[56px] px-4 select-none bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] text-[var(--text-main)] z-10 text-xs">
      {/* 1. 輸出格式選擇器 */}
      <div className="flex items-center gap-2">
        <span className="text-[var(--text-muted)] font-medium">格式</span>
        <select
          value={config.target_format}
          onChange={(e) =>
            updateConfig({ target_format: e.target.value as TargetFormat })
          }
          className="h-8 px-2.5 bg-[var(--bg-subtle)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded-[4px] hover:border-[var(--border-hover)] focus:outline-none focus:border-[var(--accent-green)] cursor-pointer transition-colors"
        >
          <option value="original">維持原格式</option>
          <option value="webp">WebP</option>
          <option value="avif">AVIF</option>
          <option value="jpeg">JPEG</option>
          <option value="png">PNG</option>
        </select>
      </div>

      {/* 2. 品質滑桿一體化 */}
      <div className="flex items-center gap-3">
        <span className="text-[var(--text-muted)] font-medium">品質</span>
        <div className="flex items-center gap-2.5">
          <input
            type="range"
            min={1}
            max={100}
            value={config.quality}
            onChange={(e) => updateConfig({ quality: Number(e.target.value) })}
            className="w-32 h-1.5 bg-[var(--border-subtle)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-green)]"
          />
          <div className="flex items-center gap-1.5 min-w-[90px]">
            <span className="font-mono tabular-nums font-semibold text-[var(--text-main)]">
              {config.quality}%
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              ({getQualityHint(config.quality)})
            </span>
          </div>
        </div>
      </div>

      {/* 3. 儲存位置捷徑 */}
      <div className="flex items-center gap-2">
        <span className="text-[var(--text-muted)] font-medium">輸出</span>
        <select
          value={config.output_dir_mode}
          onChange={(e) =>
            updateConfig({ output_dir_mode: e.target.value as OutputDirMode })
          }
          className="h-8 px-2.5 bg-[var(--bg-subtle)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded-[4px] hover:border-[var(--border-hover)] focus:outline-none focus:border-[var(--accent-green)] cursor-pointer transition-colors"
        >
          <option value="same">存至原目錄</option>
          <option value="sub">存至 min/ 子目錄</option>
          <option value="custom">存至自訂資料夾</option>
        </select>
      </div>
    </footer>
  );
};
