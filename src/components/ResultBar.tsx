import React, { useState, useEffect, useRef } from "react";
import { CheckCircle, WarningCircle, Folder, X } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { formatBytes } from "../utils";

interface ResultBarProps {
  failedOnly: boolean;
  onToggleFailedOnly: () => void;
}

export const ResultBar: React.FC<ResultBarProps> = ({ failedOnly, onToggleFailedOnly }) => {
  const taskIds = useStore((s) => s.taskIds);
  const tasks = useStore((s) => s.tasks);
  const t = useStore((s) => s.t);
  const [dismissed, setDismissed] = useState(false);
  const prevCountRef = useRef(taskIds.length);

  // 當佇列任務總數變更或清空時，重設關閉狀態以利新批次顯示
  useEffect(() => {
    if (taskIds.length !== prevCountRef.current) {
      prevCountRef.current = taskIds.length;
      setDismissed(false);
    }
  }, [taskIds.length]);

  // 判斷是否全體任務均已脫離 processing 與 conflict
  const isAllSettled =
    taskIds.length > 0 &&
    taskIds.every((id) => {
      const st = tasks[id]?.status;
      return st === "completed" || st === "skipped" || st === "error";
    });

  const isProcessing = taskIds.some((id) => tasks[id]?.status === "processing");
  const isVisible = !dismissed && isAllSettled && !isProcessing;

  const completedTasks = taskIds
    .map((id) => tasks[id])
    .filter((t) => t && t.status === "completed");

  const skippedCount = taskIds.filter((id) => tasks[id]?.status === "skipped").length;
  const errorCount = taskIds.filter((id) => tasks[id]?.status === "error").length;

  const totalOrig = completedTasks.reduce((acc, t) => acc + t.fileSize, 0);
  const totalComp = completedTasks.reduce(
    (acc, t) => acc + (t.compressedSize ?? t.fileSize),
    0
  );
  const savedBytes = Math.max(0, totalOrig - totalComp);
  const savedPercent = totalOrig > 0 ? Math.round((savedBytes / totalOrig) * 100) : 0;

  // 統計所有輸出目錄
  const outputDirs = new Set<string>();
  for (const t of completedTasks) {
    if (t.outputPath) {
      const slash = Math.max(t.outputPath.lastIndexOf("/"), t.outputPath.lastIndexOf("\\"));
      if (slash !== -1) {
        outputDirs.add(t.outputPath.substring(0, slash));
      }
    }
  }

  const singleDir = outputDirs.size === 1 ? Array.from(outputDirs)[0] : null;

  const handleOpenFolder = () => {
    if (singleDir) {
      invoke("open_output_dir", { path: singleDir }).catch(console.error);
    }
  };

  const hasIssues = errorCount > 0 || skippedCount > 0;

  return (
    <div
      role="status"
      className={`overflow-hidden transition-all duration-200 ease-out ${
        isVisible
          ? "max-h-16 opacity-100 translate-y-0"
          : "max-h-0 opacity-0 -translate-y-2 pointer-events-none"
      }`}
    >
      <div
        className={`flex items-center justify-between px-3.5 py-2 border-b text-[12.5px] transition-colors select-none ${
          hasIssues
            ? "bg-[var(--accent-amber)]/10 border-[var(--accent-amber)]/30 text-[var(--text-main)]"
            : "bg-[var(--accent-green)]/10 border-[var(--accent-green)]/30 text-[var(--text-main)]"
        }`}
      >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {hasIssues ? (
          <WarningCircle size={17} weight="bold" className="text-[var(--accent-amber)] flex-shrink-0" />
        ) : (
          <CheckCircle size={17} weight="bold" className="text-[var(--accent-green)] flex-shrink-0" />
        )}

        <div className="flex items-center gap-1.5 font-medium flex-wrap">
          <span>
            {t("resultCompleted")} <span className="font-mono font-bold">{completedTasks.length}</span> {t("resultImagesUnit")}
          </span>
          {savedBytes > 0 && (
            <>
              <span className="text-[var(--text-dim)]">·</span>
              <span>
                {t("resultSaved")} <span className="font-mono font-bold">{formatBytes(savedBytes)}</span> ({savedPercent}%)
              </span>
            </>
          )}
          {skippedCount > 0 && (
            <>
              <span className="text-[var(--text-dim)]">·</span>
              <span className="text-[var(--text-muted)]">
                <span className="font-mono font-semibold">{skippedCount}</span> {t("resultSkipped")}
              </span>
            </>
          )}
          {errorCount > 0 && (
            <>
              <span className="text-[var(--text-dim)]">·</span>
              <span className="text-[var(--accent-red)] font-semibold">
                <span className="font-mono">{errorCount}</span> {t("resultFailed")}
              </span>
            </>
          )}
          {outputDirs.size > 1 && (
            <>
              <span className="text-[var(--text-dim)]">·</span>
              <span className="text-[var(--text-muted)]">
                {t("resultFoldersCount")} <span className="font-mono font-bold">{outputDirs.size}</span> {t("resultFoldersUnit")}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        {errorCount > 0 && (
          <button
            type="button"
            onClick={onToggleFailedOnly}
            className={`px-2 py-0.5 text-[11.5px] font-medium rounded border transition-colors cursor-pointer ${
              failedOnly
                ? "bg-[var(--accent-red)] text-white border-[var(--accent-red)]"
                : "bg-[var(--bg-surface)] text-[var(--accent-red)] border-[var(--accent-red)]/40 hover:bg-[var(--accent-red)]/10"
            }`}
          >
            {failedOnly ? t("resultShowAll") : t("resultShowFailedOnly")}
          </button>
        )}

        {singleDir && (
          <button
            type="button"
            onClick={handleOpenFolder}
            className="flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-medium bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded hover:border-[var(--border-hover)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
          >
            <Folder size={13} />
            <span>{t("resultOpenFolder")}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t("resultDismiss")}
          className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  </div>
  );
};
