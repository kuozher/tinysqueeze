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
} from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import { ScanResult } from "../types";
import iconLight from "../assets/icon_light.png";
import iconDark from "../assets/icon_dark.png";

export const Header: React.FC = () => {
  const taskIds = useStore((s) => s.taskIds);
  const tasks = useStore((s) => s.tasks);
  const clearList = useStore((s) => s.clearList);
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

  const handleCancelAll = async () => {
    await useStore.getState().cancelAll();
  };

  const handleAddFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp"],
          },
        ],
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        if (paths.length > 0) {
          const scanRes = await invoke<ScanResult>("scan_paths", { paths });
          if (scanRes.tasks.length === 0) {
            if (scanRes.avif_count > 0) {
              useStore.getState().showToast(t("warnAvifInput"), "warning");
            } else {
              useStore.getState().showToast(t("warnUnsupportedFiles"), "warning");
            }
            return;
          }

          const scanned = scanRes.tasks;
          const currentTasks = useStore.getState().tasks;
          const newScanned = scanned.filter((t) => !currentTasks[t.id]);
          if (newScanned.length > 0) {
            const newItems = newScanned.map((t) => ({
              id: t.id,
              filePath: t.file_path,
              fileName: t.file_name,
              fileSize: t.file_size,
              status: "processing" as const,
            }));
            useStore.getState().addTasks(newItems);
            await invoke("start_batch_compression", {
              tasks: newScanned,
              config: useStore.getState().config,
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to add files:", err);
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isProcessing) {
      const confirmLeave = window.confirm(t("confirmCloseProcessing"));
      if (!confirmLeave) return;
    }
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
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 font-medium text-[var(--text-main)] text-[12px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)] animate-pulse" />
              {`${t("processing")} ${completed}/${total} ${t("imagesUnit")}`}
            </span>

            {/* 取消全部按鈕 */}
            <button
              type="button"
              onClick={handleCancelAll}
              aria-label={t("cancelAll")}
              title={`${t("cancelAll")} (Esc)`}
              className="flex items-center gap-1 px-2 py-0.5 text-[11.5px] font-medium rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--accent-amber)] hover:border-[var(--accent-amber)]/40 hover:bg-[var(--accent-amber)]/10 cursor-pointer transition-colors"
            >
              <X size={11} weight="bold" />
              <span>{t("cancelAll")}</span>
            </button>
          </div>
        ) : null}
      </div>

      {/* Right: Functional Actions + Divider + System Window Controls */}
      <div className="flex items-center gap-1.5">
        {/* 加入檔案按鈕 (清單有項目時隨時可追加) */}
        {total > 0 && (
          <button
            type="button"
            onClick={handleAddFiles}
            aria-label={t("addFiles")}
            title={t("addFiles")}
            className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[4px] hover:border-[var(--border-hover)] cursor-pointer transition-colors"
          >
            <span>+ {t("addFiles")}</span>
          </button>
        )}

        {/* Re-process All (R) Button */}
        {configChangedSinceCompleted && !isProcessing && (
          <button
            type="button"
            onClick={() => reprocessAll()}
            aria-label={t("restart")}
            title={t("restartTooltip")}
            className="flex items-center gap-1 px-2.5 py-1 text-[13px] font-medium text-[var(--accent-amber)] bg-[var(--bg-surface)] border border-[var(--accent-amber)]/40 rounded-[4px] hover:bg-[var(--accent-amber)]/10 cursor-pointer transition-colors duration-150"
          >
            <ArrowClockwise size={14} weight="bold" />
            <span>{t("restart")}{t("restartKey")}</span>
          </button>
        )}

        {/* Clear List Button (處理中時隱藏，由中央取消全部按鈕替代) */}
        {!isProcessing && (
          <button
            type="button"
            onClick={() => clearList()}
            disabled={total === 0}
            aria-label={t("clearList")}
            title={t("clearList")}
            className="flex items-center gap-1 px-2.5 py-1 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-30 disabled:pointer-events-none rounded-[4px] hover:bg-[var(--bg-surface)] cursor-pointer transition-colors duration-150"
          >
            <Trash size={14} />
            <span>{t("clearList")}</span>
          </button>
        )}

        {/* Settings Gear Button */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label={t("settings")}
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
            aria-label={t("minimize")}
            title={t("minimize")}
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-[2px] cursor-pointer transition-colors"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            aria-label={t("maximize")}
            title={t("maximize")}
            className="flex items-center justify-center w-8 h-8 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-[2px] cursor-pointer transition-colors"
          >
            <Square size={12} />
          </button>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("close")}
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
