import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  GearSix,
  ArrowClockwise,
  Trash,
  Minus,
  Square,
  X,
  FileImage,
} from "@phosphor-icons/react";
import { useStore } from "../store";

export const Header: React.FC = () => {
  const taskIds = useStore((s) => s.taskIds);
  const tasks = useStore((s) => s.tasks);
  const clearList = useStore((s) => s.clearList);
  const configChangedSinceCompleted = useStore(
    (s) => s.configChangedSinceCompleted
  );
  const reprocessAll = useStore((s) => s.reprocessAll);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  const total = taskIds.length;
  const completed = taskIds.filter(
    (id) => tasks[id]?.status === "completed"
  ).length;
  const isProcessing = taskIds.some(
    (id) => tasks[id]?.status === "processing"
  );

  const progressPercent = total > 0 ? (completed / total) * 100 : 0;

  const handleMinimize = () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      getCurrentWindow().minimize();
    }
  };
  const handleToggleMaximize = () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      getCurrentWindow().toggleMaximize();
    }
  };
  const handleClose = () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      getCurrentWindow().close();
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="relative flex items-center justify-between h-[48px] px-3 select-none bg-[var(--bg-app)] border-b border-[var(--border-subtle)] text-[var(--text-main)] z-20"
    >
      {/* 2px Micro Progress Bar at the top edge */}
      {isProcessing && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-transparent overflow-hidden">
          <div
            className="h-full bg-[var(--accent-green)] transition-all duration-150 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Left: App Logo & Title */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 cursor-default"
      >
        <div className="flex items-center justify-center w-6 h-6 rounded bg-[var(--bg-subtle)] text-[var(--accent-green)] border border-[var(--border-subtle)]">
          <FileImage size={15} weight="bold" />
        </div>
        <span className="text-sm font-semibold tracking-tight">TinyPress</span>
      </div>

      {/* Center: Dynamic Batch Status */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-center flex-1 text-xs text-[var(--text-muted)] cursor-default"
      >
        {isProcessing ? (
          <span className="flex items-center gap-1.5 font-medium animate-pulse text-[var(--text-main)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)]" />
            正在處理 {completed}/{total} 張...
          </span>
        ) : total > 0 && completed === total ? (
          <span className="text-[var(--accent-green)] font-medium">
            全數處理完畢 ({total} 張)
          </span>
        ) : null}
      </div>

      {/* Right: Functional Actions + Divider + System Window Controls */}
      <div className="flex items-center gap-1.5">
        {/* Re-process All (R) Button */}
        {configChangedSinceCompleted && !isProcessing && (
          <button
            onClick={() => reprocessAll()}
            title="快捷列參數已變更，按 R 鍵重新處理全部"
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--accent-amber)] bg-[var(--bg-surface)] border border-[var(--accent-amber)]/40 rounded-[4px] hover:bg-[var(--accent-amber)]/10 cursor-pointer transition-colors duration-150"
          >
            <ArrowClockwise size={13} weight="bold" />
            <span>重新處理 (R)</span>
          </button>
        )}

        {/* Clear List Button */}
        <button
          onClick={() => clearList()}
          disabled={total === 0 || isProcessing}
          title="清空目前清單"
          className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-30 disabled:pointer-events-none rounded-[4px] hover:bg-[var(--bg-surface)] cursor-pointer transition-colors duration-150"
        >
          <Trash size={13} />
          <span>清空</span>
        </button>

        {/* Settings Gear Button */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="偏好設定"
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-[4px] cursor-pointer transition-colors duration-150"
        >
          <GearSix size={16} />
        </button>

        {/* 1px Vertical Divider */}
        <div className="w-[1px] h-4 mx-1 bg-[var(--border-subtle)]" />

        {/* Windows OS Controls ([-] [□] [×]) */}
        <div className="flex items-center">
          <button
            onClick={handleMinimize}
            title="最小化"
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-[2px] transition-colors"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={handleToggleMaximize}
            title="最大化 / 還原"
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-[2px] transition-colors"
          >
            <Square size={11} />
          </button>
          <button
            onClick={handleClose}
            title="關閉"
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-white hover:bg-[var(--accent-red)] rounded-[2px] transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </header>
  );
};
