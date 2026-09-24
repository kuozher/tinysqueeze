import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";

export function useKeyboardStack() {
  const isSettingsOpen = useStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const summaryModalData = useStore((s) => s.summaryModalData);
  const setSummaryModal = useStore((s) => s.setSummaryModal);
  const configChangedSinceCompleted = useStore(
    (s) => s.configChangedSinceCompleted
  );
  const reprocessAll = useStore((s) => s.reprocessAll);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Layer 3: 模態層 (Modal / Drawer)
      if (summaryModalData) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setSummaryModal(null);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          invoke("open_output_dir", { path: summaryModalData.output_directory });
          setSummaryModal(null);
          return;
        }
        return;
      }

      if (isSettingsOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setSettingsOpen(false);
          return;
        }
        return;
      }

      // Layer 2: 表單輸入焦點判定
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          (activeEl as HTMLElement).isContentEditable);

      if (isInputFocused) {
        return; // 停用所有單字母全域快捷鍵
      }

      // Layer 1: 全域工作區快捷鍵
      if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (configChangedSinceCompleted) {
          e.preventDefault();
          reprocessAll();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isSettingsOpen,
    setSettingsOpen,
    summaryModalData,
    setSummaryModal,
    configChangedSinceCompleted,
    reprocessAll,
  ]);
}
