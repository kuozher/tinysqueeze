import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./utils";
import {
  BatchFinishedPayload,
  CompressionConfig,
  TaskCompletedPayload,
  TaskItem,
} from "./types";
import { Locale, getTranslation, TranslationKey } from "./i18n";

export interface ToastMessage {
  id: string;
  message: string;
  type: "info" | "warning" | "error";
}

export interface TinySqueezeState {
  taskIds: string[];
  tasks: Record<string, TaskItem>;
  config: CompressionConfig;
  configChangedSinceCompleted: boolean;
  isSettingsOpen: boolean;
  summaryModalData: BatchFinishedPayload | null;
  isDraggingOver: boolean;
  hasShownSummaryModal: boolean;
  locale: Locale;
  toast: ToastMessage | null;

  // Actions
  addTasks: (newTasks: TaskItem[]) => void;
  setThumbnailReady: (id: string, width: number, height: number, thumbnailBase64?: string) => void;
  setTaskCompleted: (payload: TaskCompletedPayload) => void;
  setTaskSkipped: (payload: { id: string; reason: string; output_path?: string }) => void;
  setTaskStage: (payload: { id: string; stage: "decoding" | "encoding" | "writing" }) => void;
  setTaskError: (id: string, error: string) => void;
  setConflict: (id: string, candidatePath: string) => void;
  resolveConflict: (id: string, resolution: "overwrite" | "auto_rename" | "skip") => Promise<void>;
  updateConfig: (partial: Partial<CompressionConfig>) => void;
  isPaused: boolean;
  setIsPaused: (paused: boolean) => Promise<void>;
  cancelAll: () => Promise<void>;
  clearList: () => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  setSummaryModal: (data: BatchFinishedPayload | null) => void;
  checkAndTriggerSummaryModal: () => void;
  setSettingsOpen: (open: boolean) => void;
  setDraggingOver: (over: boolean) => void;
  showToast: (message: string, type?: "info" | "warning" | "error") => void;
  dismissToast: () => void;
  reprocessAll: () => Promise<void>;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

export type TinyPressState = TinySqueezeState;

const DEFAULT_CONFIG: CompressionConfig = {
  quality: 75,
  target_format: "original",
  output_dir_mode: "same",
  conflict_strategy: "auto_rename",
  strip_metadata: true,
  convert_to_srgb: true,
  suffix: "_min",
};

const LOCALE_KEY = "tinysqueeze_locale";

export const useStore = create<TinySqueezeState>((set, get) => ({
  taskIds: [],
  tasks: {},
  config: DEFAULT_CONFIG,
  configChangedSinceCompleted: false,
  isSettingsOpen: false,
  summaryModalData: null,
  isDraggingOver: false,
  hasShownSummaryModal: false,
  isPaused: false,
  locale: (localStorage.getItem(LOCALE_KEY) as Locale) || "zh-TW",
  toast: null,

  setLocale: (locale: Locale) => {
    localStorage.setItem(LOCALE_KEY, locale);
    set({ locale });
  },

  t: (key: TranslationKey) => {
    return getTranslation(get().locale, key);
  },

  addTasks: (newTasks) => {
    set((state) => {
      const nextTasks = { ...state.tasks };
      const nextIds = [...state.taskIds];

      for (const t of newTasks) {
        if (!nextTasks[t.id]) {
          nextTasks[t.id] = t;
          nextIds.push(t.id);
        }
      }

      return {
        tasks: nextTasks,
        taskIds: nextIds,
        configChangedSinceCompleted: false,
        hasShownSummaryModal: false,
        isPaused: false,
      };
    });
  },

  setThumbnailReady: (id, width, height, thumbnailBase64) => {
    set((state) => {
      const task = state.tasks[id];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            width,
            height,
            hasThumbnail: true,
            thumbnailUrl: thumbnailBase64 || task.thumbnailUrl || `tinysqueeze-thumb://localhost/${id}`,
          },
        },
      };
    });
  },

  setTaskCompleted: (payload) => {
    set((state) => {
      const task = state.tasks[payload.id];
      if (!task) return state;

      const savedThisTask = payload.original_size > payload.compressed_size
        ? payload.original_size - payload.compressed_size
        : 0;

      return {
        tasks: {
          ...state.tasks,
          [payload.id]: {
            ...task,
            status: "completed",
            compressedSize: payload.compressed_size,
            savingsRatio: payload.savings_ratio,
            outputPath: payload.output_path,
            outputFormat: payload.output_format,
            isKeptOriginal: payload.is_kept_original,
            priorSavedBytes: savedThisTask,
          },
        },
      };
    });

    // 檢查佇列是否「全數項目皆已脫離 processing 與 conflict」，若是則優雅結算
    setTimeout(() => {
      get().checkAndTriggerSummaryModal();
    }, 250);
  },

  setTaskSkipped: (payload) => {
    set((state) => {
      const task = state.tasks[payload.id];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [payload.id]: {
            ...task,
            status: "skipped",
            skipReason: payload.reason,
            outputPath: payload.output_path || task.outputPath,
          },
        },
      };
    });

    setTimeout(() => {
      get().checkAndTriggerSummaryModal();
    }, 250);
  },

  setTaskStage: (payload) => {
    set((state) => {
      const task = state.tasks[payload.id];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [payload.id]: {
            ...task,
            stage: payload.stage,
          },
        },
      };
    });
  },

  setTaskError: (id, error) => {
    set((state) => {
      const task = state.tasks[id];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            status: "error",
            errorMessage: error,
          },
        },
      };
    });

    setTimeout(() => {
      get().checkAndTriggerSummaryModal();
    }, 250);
  },

  setConflict: (id, candidatePath) => {
    set((state) => {
      const task = state.tasks[id];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            status: "conflict",
            conflictCandidatePath: candidatePath,
          },
        },
      };
    });
  },

  resolveConflict: async (id, resolution) => {
    if (isTauri()) {
      try {
        await invoke("resolve_file_conflict", {
          taskId: id,
          resolution,
        });
      } catch (err) {
        console.error("Resolve conflict failed:", err);
      }
    }
    set((state) => {
      const task = state.tasks[id];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            status: resolution === "skip" ? "skipped" : "processing",
            skipReason: resolution === "skip" ? "user_skip" : undefined,
          },
        },
      };
    });
  },

  updateConfig: (partial) => {
    set((state) => {
      const newConfig = { ...state.config, ...partial };
      if (isTauri()) {
        invoke("update_active_config", { config: newConfig }).catch(console.error);
      }

      // 若已有完成項目，標記參數已變更 (浮現 R 鍵)
      const hasCompleted = Object.values(state.tasks).some(
        (t) => t.status === "completed"
      );

      return {
        config: newConfig,
        configChangedSinceCompleted: hasCompleted,
      };
    });
  },

  setIsPaused: async (paused: boolean) => {
    set({ isPaused: paused });
    if (isTauri()) {
      try {
        if (paused) {
          await invoke("pause_batch");
        } else {
          await invoke("resume_batch");
        }
      } catch (e) {
        console.error("Pause/resume batch failed:", e);
      }
    }
  },

  cancelAll: async () => {
    const state = get();
    const nextTasks = { ...state.tasks };
    let cancelledCount = 0;

    for (const id of state.taskIds) {
      const t = nextTasks[id];
      if (t && (t.status === "processing" || t.status === "pending" || t.status === "conflict")) {
        nextTasks[id] = {
          ...t,
          status: "skipped",
          skipReason: "user_cancel",
        };
        cancelledCount++;
      }
    }

    set({
      tasks: nextTasks,
      isPaused: false,
      hasShownSummaryModal: false,
    });

    if (isTauri()) {
      try {
        await invoke("cancel_batch");
      } catch (err) {
        console.error("Failed to cancel batch:", err);
      }
    }
  },

  clearList: async () => {
    if (isTauri()) {
      try {
        await invoke("clear_thumbnails");
      } catch (e) {
        console.error(e);
      }
    }
    set({
      taskIds: [],
      tasks: {},
      configChangedSinceCompleted: false,
      summaryModalData: null,
      isPaused: false,
    });
  },

  removeTask: async (id: string) => {
    if (isTauri()) {
      try {
        await invoke("cancel_task", { taskId: id });
      } catch (e) {
        console.error("Cancel task failed:", e);
      }
    }
    set((state) => {
      const nextTasks = { ...state.tasks };
      delete nextTasks[id];
      return {
        tasks: nextTasks,
        taskIds: state.taskIds.filter((tid) => tid !== id),
      };
    });
  },

  setSummaryModal: (data) => {
    set({ summaryModalData: data });
  },

  checkAndTriggerSummaryModal: () => {
    const state = get();
    if (state.hasShownSummaryModal) return;
    if (state.taskIds.length === 0) return;

    // 嚴格判定：佇列中只要還有任何一張處於 processing 或 conflict，絕不彈窗
    const hasUnfinished = state.taskIds.some(
      (id) => state.tasks[id]?.status === "processing" || state.tasks[id]?.status === "conflict"
    );
    if (hasUnfinished) return;

    const completedTasks = state.taskIds
      .map((id) => state.tasks[id])
      .filter((t) => t && t.status === "completed");

    if (completedTasks.length === 0) return;

    const totalOrig = completedTasks.reduce((acc, t) => acc + t.fileSize, 0);
    const totalComp = completedTasks.reduce(
      (acc, t) => acc + (t.compressedSize ?? t.fileSize),
      0
    );
    const savedRatio = totalOrig > 0 ? (totalOrig - totalComp) / totalOrig : 0;
    const lastTask = completedTasks[completedTasks.length - 1];

    let outDir = "";
    if (lastTask?.outputPath) {
      const slashIdx = Math.max(
        lastTask.outputPath.lastIndexOf("/"),
        lastTask.outputPath.lastIndexOf("\\")
      );
      outDir = slashIdx !== -1 ? lastTask.outputPath.substring(0, slashIdx) : lastTask.outputPath;
    }

    set({
      hasShownSummaryModal: true,
      summaryModalData: {
        total_processed: completedTasks.length,
        total_original_bytes: totalOrig,
        total_compressed_bytes: totalComp,
        total_saved_ratio: Math.max(0, savedRatio),
        output_directory: outDir,
      },
    });
  },

  setSettingsOpen: (open) => {
    set({ isSettingsOpen: open });
  },

  setDraggingOver: (over) => {
    set({ isDraggingOver: over });
  },

  showToast: (message, type = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    set({ toast: { id, message, type } });
  },

  dismissToast: () => {
    set({ toast: null });
  },

  reprocessAll: async () => {
    const state = get();
    const tasksToRun = state.taskIds.map((id) => {
      const t = state.tasks[id];
      return {
        id: t.id,
        file_path: t.filePath,
        file_name: t.fileName,
        file_size: t.fileSize,
        prior_output_path: t.outputPath,
      };
    });

    if (tasksToRun.length === 0) return;

    // 重設狀態為 processing
    set((prev) => {
      const nextTasks = { ...prev.tasks };
      for (const id of prev.taskIds) {
        if (nextTasks[id]) {
          nextTasks[id] = {
            ...nextTasks[id],
            status: "processing",
            compressedSize: undefined,
            savingsRatio: undefined,
          };
        }
      }
      return {
        tasks: nextTasks,
        configChangedSinceCompleted: false,
        hasShownSummaryModal: false,
      };
    });

    if (isTauri()) {
      try {
        await invoke("start_batch_compression", {
          tasks: tasksToRun,
          config: state.config,
        });
      } catch (e) {
        console.error("Reprocess all failed:", e);
      }
    } else {
      setTimeout(() => {
        state.taskIds.forEach((id) => {
          const t = state.tasks[id];
          if (!t) return;
          useStore.getState().setTaskCompleted({
            id: t.id,
            original_size: t.fileSize,
            compressed_size: Math.round(t.fileSize * 0.28),
            savings_ratio: 0.72,
            output_path: t.filePath,
            output_format: state.config.target_format.toUpperCase(),
            is_kept_original: false,
          });
        });
      }, 500);
    }
  },
}));
