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

  useTauriEvents();
  useKeyboardStack();

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

        // 僅跳過當前正在背景處理中（processing）的相同檔案，避免並發衝突；允許重複加入已完成檔案重新轉檔
        const currentTasks = useStore.getState().tasks;
        const activeProcessingPaths = new Set(
          Object.values(currentTasks)
            .filter((t) => t.status === "processing")
            .map((t) => t.filePath)
        );

        const actionableScanned = scanned.filter(
          (t) => !activeProcessingPaths.has(t.file_path)
        );
        if (actionableScanned.length === 0) return;

        const newItems: TaskItem[] = actionableScanned.map((t) => ({
          id: t.id,
          filePath: t.file_path,
          fileName: t.file_name,
          fileSize: t.file_size,
          status: "processing",
        }));

        addTasks(newItems);

        // 立即啟動批次壓縮 (Auto-run with dynamic pull)
        await invoke("start_batch_compression", {
          tasks: actionableScanned,
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
                釋放滑鼠以加入圖片佇列
              </span>
              <span className="text-[13px] text-[var(--text-muted)]">
                支援 JPG、PNG、WebP、AVIF，將自動啟動壓縮
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
