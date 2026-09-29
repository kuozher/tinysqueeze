import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {
  GearSix,
  ArrowClockwise,
  Trash,
  Minus,
  Square,
  X,
  Pause,
  Play,
} from "@phosphor-icons/react";
import { useStore } from "../store";
import iconLight from "../assets/icon_light.png";
import iconDark from "../assets/icon_dark.png";

export const Header: React.FC = () => {
  const taskIds = useStore((s) => s.taskIds);
  const tasks = useStore((s) => s.tasks);
  const clearList = useStore((s) => s.clearList);
  const isPaused = useStore((s) => s.isPaused);
  const setIsPaused = useStore((s) => s.setIsPaused);
  const configChangedSinceCompleted = useStore(
    (s) => s.configChangedSinceCompleted
  );
  const reprocessAll = useStore((s) => s.reprocessAll);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const t = useStore((s) => s.t);

  const total = taskIds.length;
  const completed = taskIds.filter(
    (id) => tasks[id]?.status === "completed"
  ).length;
  const isProcessing = taskIds.some(
    (id) => tasks[id]?.status === "processing"
  );

  const progressPercent = total > 0 ? (completed / total) * 100 : 0;

  const handleDragMouseDown = async (e: React.MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest("button, input, select, a")) {
      try {
        await invoke("window_start_dragging");
      } catch {
        try {
          await getCurrentWindow().startDragging();
        } catch (err) {
          console.error("Failed to start dragging:", err);
        }
      }
    }
  };

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke("window_minimize");
    } catch {
      try {
        await getCurrentWindow().minimize();
      } catch (err) {
        console.error("Failed to minimize window:", err);
      }
    }
  };

  const handleToggleMaximize = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await invoke("window_toggle_maximize");
    } catch {
      try {
        await getCurrentWindow().toggleMaximize();
      } catch (err) {
        console.error("Failed to toggle maximize window:", err);
      }
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke("window_close");
    } catch {
      try {
        await getCurrentWindow().close();
      } catch (err) {
        console.error("Failed to close window:", err);
      }
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleDragMouseDown}
      onDoubleClick={() => handleToggleMaximize()}
      className="relative flex items-center justify-between h-[48px] px-3 select-none bg-[var(--bg-app)] border-b border-[var(--border-subtle)] text-[var(--text-main)] z-20"
    >
      {/* 2px Micro Progress Bar at the top edge */}
      {isProcessing && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-transparent overflow-hidden pointer-events-none">
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
        <div className="flex items-center justify-center w-6 h-6 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-0.5 overflow-hidden">
          <img
            src={iconLight}
            alt="Logo"
            className="w-full h-full object-contain hidden [html[data-theme='dark']_&]:block"
          />
          <img
            src={iconDark}
            alt="Logo"
            className="w-full h-full object-contain block [html[data-theme='dark']_&]:hidden"
          />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">{t("appName")}</span>
      </div>

      {/* Center: Dynamic Batch Status */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-center flex-1 text-[13px] text-[var(--text-muted)] cursor-default gap-3"
      >
        {isProcessing ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-medium text-[var(--text-main)]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isPaused
                    ? "bg-[var(--accent-amber)]"
                    : "bg-[var(--accent-green)] animate-pulse"
                }`}
              />
              {isPaused
                ? `${t("queuePaused")} (${completed}/${total})`
                : `${t("processing")} ${completed}/${total} ${t("imagesUnit")}`}
            </span>
            <button
              type="button"
              onClick={() => setIsPaused(!isPaused)}
              className={`flex items-center gap-1 px-2 py-0.5 text-[11.5px] font-medium rounded-[3px] border cursor-pointer transition-colors ${
                isPaused
                  ? "bg-[var(--accent-green)]/15 border-[var(--accent-green)]/40 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/25"
                  : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--border-hover)]"
              }`}
              title={isPaused ? t("resume") : t("pause")}
            >
              {isPaused ? (
                <>
                  <Play size={11} weight="fill" />
                  <span>{t("resume")}</span>
                </>
              ) : (
                <>
                  <Pause size={11} weight="fill" />
                  <span>{t("pause")}</span>
                </>
              )}
            </button>
          </div>
        ) : null}
      </div>

      {/* Right: Functional Actions + Divider + System Window Controls */}
      <div className="flex items-center gap-1.5">
        {/* Re-process All (R) Button */}
        {configChangedSinceCompleted && !isProcessing && (
          <button
            type="button"
            onClick={() => reprocessAll()}
            title={t("restartTooltip")}
            className="flex items-center gap-1 px-2.5 py-1 text-[13px] font-medium text-[var(--accent-amber)] bg-[var(--bg-surface)] border border-[var(--accent-amber)]/40 rounded-[4px] hover:bg-[var(--accent-amber)]/10 cursor-pointer transition-colors duration-150"
          >
            <ArrowClockwise size={14} weight="bold" />
            <span>{t("restart")}{t("restartKey")}</span>
          </button>
        )}

        {/* Clear List Button */}
        <button
          type="button"
          onClick={() => clearList()}
          disabled={total === 0 || isProcessing}
          title={t("clear")}
          className="flex items-center gap-1 px-2.5 py-1 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-30 disabled:pointer-events-none rounded-[4px] hover:bg-[var(--bg-surface)] cursor-pointer transition-colors duration-150"
        >
          <Trash size={14} />
          <span>{t("clear")}</span>
        </button>

        {/* Settings Gear Button */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={t("settings")}
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-[4px] cursor-pointer transition-colors duration-150"
        >
          <GearSix size={17} />
        </button>

        {/* 1px Vertical Divider */}
        <div className="w-[1px] h-4 mx-1 bg-[var(--border-subtle)]" />

        {/* Windows OS Controls ([-] [□] [×]) */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={handleMinimize}
            title={t("minimize")}
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-[2px] cursor-pointer transition-colors"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            title={t("maximize")}
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-[2px] cursor-pointer transition-colors"
          >
            <Square size={12} />
          </button>
          <button
            type="button"
            onClick={handleClose}
            title={t("close")}
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-white hover:bg-[var(--accent-red)] rounded-[2px] cursor-pointer transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};
