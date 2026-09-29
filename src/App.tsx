import React, { useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { CloudArrowUp } from "@phosphor-icons/react";

import { useStore } from "./store";
import { useTauriEvents } from "./hooks/useTauriEvents";
import { useKeyboardStack } from "./hooks/useKeyboardStack";
import { Header } from "./components/Header";
import { QuickBar } from "./components/QuickBar";
import { EmptyState } from "./components/EmptyState";
import { TaskList } from "./components/TaskList";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { SummaryModal } from "./components/SummaryModal";
import { TaskItem } from "./types";

export const App: React.FC = () => {
  const taskIds = useStore((s) => s.taskIds);
  const addTasks = useStore((s) => s.addTasks);
  const isDraggingOver = useStore((s) => s.isDraggingOver);
  const setDraggingOver = useStore((s) => s.setDraggingOver);
  const t = useStore((s) => s.t);

  useTauriEvents();
  useKeyboardStack();

  // 同步初始化介面主題
  useEffect(() => {
    const savedTheme =
      localStorage.getItem("tinysqueeze_theme") ??
      localStorage.getItem("tinypress_theme");
    if (savedTheme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  // 視窗尺寸記憶與還原：全新開啟為最小寬度 (720px)，重複開啟為上次關閉前的自訂尺寸
  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    const savedWidth =
      localStorage.getItem("tinysqueeze_window_width") ??
      localStorage.getItem("tinypress_window_width");
    const savedHeight =
      localStorage.getItem("tinysqueeze_window_height") ??
      localStorage.getItem("tinypress_window_height");

    if (savedWidth && savedHeight) {
      const w = Math.max(720, parseFloat(savedWidth));
      const h = Math.max(500, parseFloat(savedHeight));
      invoke("window_set_size", { width: w, height: h }).catch(console.error);
    }

    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(async () => {
        try {
          const isMax = await invoke<boolean>("window_is_maximized");
          if (!isMax && window.innerWidth >= 720 && window.innerHeight >= 500) {
            localStorage.setItem("tinysqueeze_window_width", window.innerWidth.toString());
            localStorage.setItem("tinysqueeze_window_height", window.innerHeight.toString());
          }
        } catch {
          if (window.innerWidth >= 720 && window.innerHeight >= 500) {
            localStorage.setItem("tinysqueeze_window_width", window.innerWidth.toString());
            localStorage.setItem("tinysqueeze_window_height", window.innerHeight.toString());
          }
        }
      }, 300);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // 防止瀏覽器預設將拖入的檔案直接開啟/導航，確保 WebView2 拖放事件持續有效
  useEffect(() => {
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, []);

  const handleIngestPaths = useCallback(
    async (paths: string[]) => {
      if (!paths || paths.length === 0) return;

      try {
        const scanned = await invoke<
          Array<{
            id: string;
            file_path: string;
            file_name: string;
            file_size: number;
          }>
        >("scan_paths", { paths });

        if (scanned.length === 0) return;

        // 已完成的項目僅為歷史回報結果；拖入的新檔案皆作為新任務推入佇列
        // 僅排除當下「正處於處理中」的相同路徑檔案，避免同檔並發寫入衝突
        const currentTasks = useStore.getState().tasks;
        const activelyProcessingPaths = new Set(
          Object.values(currentTasks)
            .filter((t) => t.status === "processing")
            .map((t) => t.filePath)
        );

        const newScanned = scanned.filter(
          (t) => !activelyProcessingPaths.has(t.file_path)
        );
        if (newScanned.length === 0) return;

        const newItems: TaskItem[] = newScanned.map((t) => ({
          id: t.id,
          filePath: t.file_path,
          fileName: t.file_name,
          fileSize: t.file_size,
          status: "processing",
        }));

        addTasks(newItems);

        // 僅對全新加入的檔案啟動壓縮處理
        await invoke("start_batch_compression", {
          tasks: newScanned,
          config: useStore.getState().config,
        });
      } catch (err) {
        console.error("Path ingestion failed:", err);
      }
    },
    [addTasks]
  );

  // 監聽 Tauri 原生視窗拖放事件
  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }
    let unlisten: (() => void) | undefined;

    const setupDragDrop = async () => {
      const appWindow = getCurrentWindow();
      unlisten = await appWindow.onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setDraggingOver(true);
        } else if (event.payload.type === "drop") {
          setDraggingOver(false);
          handleIngestPaths(event.payload.paths);
        } else {
          setDraggingOver(false);
        }
      });
    };

    setupDragDrop().catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
  }, [handleIngestPaths, setDraggingOver]);

  // 點擊或拖放選取檔案後的處理
  const handleFilesSelected = (files: FileList | File[]) => {
    const isTauriEnv =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    if (isTauriEnv) {
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i] as any;
        if (f.path) {
          paths.push(f.path);
        }
      }
      if (paths.length > 0) {
        handleIngestPaths(paths);
      }
      return; // 在 Tauri 環境下嚴禁回退至瀏覽器模擬
    }

    // 瀏覽器預覽模擬模式 (Browser Preview Mode)
    const newItems: TaskItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const id = "mock-" + Math.random().toString(36).substring(2, 9);
      newItems.push({
        id,
        filePath: f.name,
        fileName: f.name,
        fileSize: f.size || 3420000,
        status: "processing",
        width: 1920,
        height: 1080,
      });
    }

    addTasks(newItems);

    // 依序模擬 180ms 數值滾動與完成事件
    newItems.forEach((item, idx) => {
      setTimeout(() => {
        const compSize = Math.round(item.fileSize * 0.32);
        useStore.getState().setTaskCompleted({
          id: item.id,
          original_size: item.fileSize,
          compressed_size: compSize,
          savings_ratio: 0.68,
          output_path: item.filePath,
          output_format: "WEBP",
          is_kept_original: false,
        });

        if (idx === newItems.length - 1) {
          setTimeout(() => {
            useStore.getState().setSummaryModal({
              total_processed: newItems.length,
              total_original_bytes: newItems.reduce(
                (acc, t) => acc + t.fileSize,
                0
              ),
              total_compressed_bytes: newItems.reduce(
                (acc, t) => acc + Math.round(t.fileSize * 0.32),
                0
              ),
              total_saved_ratio: 0.68,
              output_directory: "C:/Users/Pictures/Compressed",
            });
          }, 300);
        }
      }, (idx + 1) * 350);
    });
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-main)] select-none">
      {/* 頂部全域列 (48px) */}
      <Header />

      {/* 主工作區 (待機空狀態 vs 清單佇列) */}
      <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
        {taskIds.length === 0 ? (
          <EmptyState onFilesSelected={handleFilesSelected} />
        ) : (
          <TaskList />
        )}

        {/* 全域懸浮拖曳進場提示層 */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg-app)]/85 backdrop-blur-[2px] border-2 border-dashed border-[var(--accent-green)] pointer-events-none transition-all duration-150">
            <div className="flex flex-col items-center gap-2.5 p-6 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl">
              <CloudArrowUp size={38} weight="bold" className="text-[var(--accent-green)] animate-pulse" />
              <span className="text-[15px] font-semibold text-[var(--text-main)]">
                {t("dragOverlayTitle")}
              </span>
              <span className="text-[13px] text-[var(--text-muted)]">
                {t("dragOverlaySubtitle")}
              </span>
            </div>
          </div>
        )}
      </main>

      {/* 底部常駐快捷列 (56px) */}
      <QuickBar />

      {/* 偏好設定抽屜 (360px) */}
      <SettingsDrawer />

      {/* 結算摘要彈窗 */}
      <SummaryModal />
    </div>
  );
};

export default App;
