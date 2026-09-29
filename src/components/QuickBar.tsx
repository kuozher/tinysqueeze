import React from "react";
import { useStore } from "../store";
import { OutputDirMode, TargetFormat } from "../types";

const QUALITY_STEPS = [30, 50, 75, 85, 100];

export const QuickBar: React.FC = () => {
  const config = useStore((s) => s.config);
  const updateConfig = useStore((s) => s.updateConfig);
  const taskIds = useStore((s) => s.taskIds);
  const tasks = useStore((s) => s.tasks);
  const t = useStore((s) => s.t);

  const isProcessing = taskIds.some((id) => tasks[id]?.status === "processing");

  const getStepIndex = (q: number) => {
    let closestIdx = 2;
    let minDiff = 999;
    QUALITY_STEPS.forEach((step, idx) => {
      const diff = Math.abs(step - q);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    return closestIdx;
  };

  const currentStepIndex = getStepIndex(config.quality);

  const getQualityHint = (q: number) => {
    if (q >= 100) return t("q100");
    if (q === 85) return t("q85");
    if (q === 75) return t("q75");
    if (q === 50) return t("q50");
    if (q === 30) return t("q30");
    if (q > 85) return t("q85");
    if (q > 50) return t("q75");
    return t("q30");
  };

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFormat = e.target.value as TargetFormat;
    updateConfig({ target_format: newFormat });
  };

  const disabledGroupClass = isProcessing
    ? "opacity-40 pointer-events-none select-none"
    : "";

  return (
    <footer className="flex items-center justify-between h-[56px] px-4 select-none bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] text-[var(--text-main)] z-10 text-[13px]">
      {/* 1. 輸出格式選擇器 */}
      <div className={`flex items-center gap-2 transition-opacity duration-150 ${disabledGroupClass}`}>
        <span className="text-[var(--text-muted)] font-medium text-[13px]">{t("format")}</span>
        <select
          value={config.target_format}
          onChange={handleFormatChange}
          disabled={isProcessing}
          className="h-8 px-2.5 bg-[var(--bg-subtle)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded-[4px] hover:border-[var(--border-hover)] focus:outline-none focus:border-[var(--accent-green)] cursor-pointer disabled:cursor-not-allowed transition-colors text-[13px]"
        >
          <option value="original">{t("originalFormat")}</option>
          <option value="webp">WebP</option>
          <option value="avif">AVIF</option>
          <option value="jpeg">JPEG</option>
          <option value="png">PNG</option>
        </select>
      </div>

      {/* 2. 品質滑桿一體化 */}
      <div className={`flex items-center gap-2.5 w-[290px] justify-start flex-shrink-0 transition-opacity duration-150 ${disabledGroupClass}`}>
        <span className="text-[var(--text-muted)] font-medium text-[13px] flex-shrink-0">{t("quality")}</span>
        <input
          type="range"
          min={0}
          max={4}
          step={1}
          disabled={isProcessing}
          value={currentStepIndex}
          onChange={(e) => updateConfig({ quality: QUALITY_STEPS[Number(e.target.value)] })}
          className="w-28 h-1.5 bg-[var(--border-subtle)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-green)] disabled:cursor-not-allowed flex-shrink-0"
        />
        <div className="flex items-center gap-1 text-left truncate flex-1 min-w-0">
          <span className="font-mono tabular-nums font-semibold text-[var(--text-main)] text-[13px] flex-shrink-0">
            {config.quality}%
          </span>
          <span className="text-[12px] text-[var(--text-muted)] truncate whitespace-nowrap">
            {getQualityHint(config.quality)}
          </span>
        </div>
      </div>

      {/* 3. 儲存位置捷徑 */}
      <div className={`flex items-center gap-2 transition-opacity duration-150 ${disabledGroupClass}`}>
        <select
          value={config.output_dir_mode}
          onChange={(e) =>
            updateConfig({ output_dir_mode: e.target.value as OutputDirMode })
          }
          disabled={isProcessing}
          className="h-8 px-2.5 bg-[var(--bg-subtle)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded-[4px] hover:border-[var(--border-hover)] focus:outline-none focus:border-[var(--accent-green)] cursor-pointer disabled:cursor-not-allowed transition-colors text-[13px]"
        >
          <option value="same">{t("destSame")}</option>
          <option value="sub">{t("destSub")}</option>
          <option value="custom">{t("destCustom")}</option>
        </select>
      </div>
    </footer>
  );
};
