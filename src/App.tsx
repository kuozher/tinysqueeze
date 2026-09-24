import React, { useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

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
  const config = useStore((s) => s.config);
  const addTasks = useStore((s) => s.addTasks);
  const setDraggingOver = useStore((s) => s.setDraggingOver);

  useTauriEvents();
  useKeyboardStack();

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

        // 避免重複加入已在清單中的任務
        const currentTasks = useStore.getState().tasks;
        const currentPaths = new Set(
          Object.values(currentTasks).map((t) => t.filePath)
        );
        const uniqueScanned = scanned.filter(
          (t) => !currentPaths.has(t.file_path)
        );
        if (uniqueScanned.length === 0) return;

        const newItems: TaskItem[] = uniqueScanned.map((t) => ({
          id: t.id,
          filePath: t.file_path,
          fileName: t.file_name,
          fileSize: t.file_size,
          status: "processing",
        }));

        addTasks(newItems);

        // 立即啟動批次壓縮 (Auto-run with dynamic pull)
        await invoke("start_batch_compression", {
          tasks: uniqueScanned,
          config,
        });
      } catch (err) {
        console.error("Path ingestion failed:", err);
      }
    },
    [addTasks, config]
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
