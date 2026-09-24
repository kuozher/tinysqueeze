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

        const newItems: TaskItem[] = scanned.map((t) => ({
          id: t.id,
          filePath: t.file_path,
          fileName: t.file_name,
          fileSize: t.file_size,
          status: "processing",
        }));

        addTasks(newItems);

        // 立即啟動批次壓縮 (Auto-run with dynamic pull)
        await invoke("start_batch_compression", {
          tasks: scanned,
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

  // 點擊手動選取檔案後的處理
  const handleFilesSelected = (files: FileList | File[]) => {
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
