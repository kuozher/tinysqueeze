import React, { useState, useEffect } from "react";
import { Folder, X, WarningCircle, MinusCircle } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { TaskItem } from "../types";
import { truncateFilename } from "../utils";
import { AnimatedSize } from "./AnimatedSize";

interface TaskRowProps {
  task: TaskItem;
  index: number;
}

const TaskProgressBar: React.FC = () => {
  const [progress, setProgress] = useState(25);

  useEffect(() => {
    const t1 = setTimeout(() => setProgress(65), 70);
    const t2 = setTimeout(() => setProgress(90), 180);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="flex items-center justify-end w-full">
      <div className="w-[88px] h-2 bg-[var(--bg-subtle)] rounded-[3px] overflow-hidden border border-[var(--border-subtle)] relative">
        <div
          className="h-full bg-[var(--accent-green)] rounded-[2px] transition-all duration-200 ease-out shadow-[0_0_6px_rgba(52,211,153,0.5)]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export const TaskRow: React.FC<TaskRowProps> = ({ task, index }) => {
  const removeTask = useStore((s) => s.removeTask);
  const resolveConflict = useStore((s) => s.resolveConflict);
  const t = useStore((s) => s.t);

  const [isFlashing, setIsFlashing] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  // Stagger vs Flash 衝突防線：若完成事件在進場期到達，延遲到 120ms 後才閃光
  useEffect(() => {
    if (task.status === "completed") {
      const staggerDelay = index < 8 ? (index + 1) * 15 : 0;
      const timer = setTimeout(() => {
        setIsFlashing(true);
        const flashTimer = setTimeout(() => setIsFlashing(false), 200);
        return () => clearTimeout(flashTimer);
      }, Math.max(staggerDelay, 50));

      return () => clearTimeout(timer);
    }
  }, [task.status, index]);

  const ext = task.fileName.split(".").pop()?.toUpperCase() || "IMG";

  const handleOpenFolder = () => {
    const targetPath = task.outputPath || task.filePath;
    invoke("open_output_dir", { path: targetPath }).catch(console.error);
  };

  const staggerStyle =
    index < 8
      ? {
          animation: `fadeInUp 120ms cubic-bezier(0.16, 1, 0.3, 1) ${
            index * 15
          }ms both`,
        }
      : undefined;

  return (
    <div
      style={staggerStyle}
      className={`group relative flex items-center justify-between h-[56px] px-3 border-b border-[var(--border-subtle)] transition-colors duration-150 ${
        isFlashing
          ? "bg-[var(--flash-success)]"
          : "hover:bg-[var(--bg-subtle)]/40 bg-[var(--bg-app)]"
      }`}
    >
      {/* 左側：縮圖與檔名資訊 */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* 40x40 縮圖 */}
        <div className="relative flex-shrink-0 w-10 h-10 rounded-[4px] overflow-hidden bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-center">
          {task.hasThumbnail && !thumbError ? (
            <img
              src={`tinysqueeze-thumb://localhost/${task.id}`}
              alt={task.fileName}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setThumbError(true)}
            />
          ) : (
            <span className="text-[11px] font-mono font-bold tracking-wider text-[var(--text-muted)]">
              {ext}
            </span>
          )}
        </div>

        {/* 檔名與解析度/格式 */}
        <div className="flex flex-col min-w-0 flex-1 pr-1">
          <span
            title={task.fileName}
            className="text-[13.5px] font-semibold text-[var(--text-main)] selectable-filename truncate max-w-[260px]"
          >
            {truncateFilename(task.fileName, 34)}
          </span>
          <span className="text-[12px] text-[var(--text-muted)] font-mono flex items-center gap-1.5">
            {task.width && task.height && (
              <span>{task.width} × {task.height}</span>
            )}
            {task.outputFormat && task.outputFormat !== ext ? (
              <span className="px-1 py-0.2 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--accent-green)] text-[10.5px] font-semibold">
                {ext} → {task.outputFormat}
              </span>
            ) : (
              <span className="text-[var(--text-dim)]">{ext}</span>
            )}
          </span>
        </div>
      </div>

      {/* 中央：體積變化與狀態 */}
      <div className="flex items-center gap-4 flex-shrink-0">
        {task.status === "conflict" ? (
          <div className="flex items-center gap-2 bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30 px-2 py-1 rounded-[4px]">
            <WarningCircle size={15} className="text-[var(--accent-amber)]" />
            <span className="text-[12px] text-[var(--accent-amber)] font-medium">
              {t("conflictExists")}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => resolveConflict(task.id, "overwrite")}
                className="px-1.5 py-0.5 text-[12px] font-medium bg-[var(--accent-amber)] text-black rounded hover:opacity-90 transition-opacity cursor-pointer"
              >
                {t("conflictOverwrite")}
              </button>
              <button
                type="button"
                onClick={() => resolveConflict(task.id, "auto_rename")}
                className="px-1.5 py-0.5 text-[12px] font-medium bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                {t("conflictRename")}
              </button>
              <button
                type="button"
                onClick={() => resolveConflict(task.id, "skip")}
                className="px-1.5 py-0.5 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
              >
                {t("conflictSkip")}
              </button>
            </div>
          </div>
        ) : task.status === "error" ? (
          <span className="text-[13px] text-[var(--accent-red)] font-medium">
            {task.errorMessage || t("taskFailed")}
          </span>
        ) : (
          <>
            <div className="w-[160px] text-right flex items-center justify-end">
              <AnimatedSize
                originalSize={task.fileSize}
                targetSize={task.compressedSize}
                isCompleted={task.status === "completed"}
              />
            </div>

            {/* 壓縮率標記或進度條 */}
            <div className="w-[100px] text-center flex items-center justify-center">
              {task.status === "completed" && (
                task.isKeptOriginal ? (
                  <span className="text-[12px] text-[var(--text-muted)] font-mono">
                    {t("keptOriginal")}
                  </span>
                ) : (
                  <span className="text-[13px] font-mono font-bold text-[var(--accent-green)]">
                    -{Math.round((task.savingsRatio || 0) * 100)}%
                  </span>
                )
              )}

              {task.status === "processing" && <TaskProgressBar />}
            </div>
          </>
        )}
      </div>

      {/* 右側：動作按鈕（懸停浮現） */}
      <div className="flex items-center justify-center w-[100px] flex-shrink-0">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center gap-1">
          {task.status === "processing" ? (
            <button
              type="button"
              onClick={() => removeTask(task.id)}
              title={t("actionRemoveProcessing")}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-amber)] hover:bg-[var(--bg-surface)] rounded-[3px] transition-colors cursor-pointer"
            >
              <MinusCircle size={15} />
            </button>
          ) : (
            <>
              {task.status === "completed" && (
                <button
                  type="button"
                  onClick={handleOpenFolder}
                  title={t("actionOpenFolder")}
                  className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-[3px] transition-colors cursor-pointer"
                >
                  <Folder size={15} />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeTask(task.id)}
                title={t("actionRemove")}
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--bg-surface)] rounded-[3px] transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
