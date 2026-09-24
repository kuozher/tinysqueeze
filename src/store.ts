import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  BatchFinishedPayload,
  CompressionConfig,
  TaskCompletedPayload,
  TaskItem,
} from "./types";

interface TinyPressState {
  taskIds: string[];
  tasks: Record<string, TaskItem>;
  config: CompressionConfig;
  configChangedSinceCompleted: boolean;
  isSettingsOpen: boolean;
  summaryModalData: BatchFinishedPayload | null;
  isDraggingOver: boolean;
  cumulativeSavedBytes: number;

  // Actions
  addTasks: (newTasks: TaskItem[]) => void;
  setThumbnailReady: (id: string, width: number, height: number) => void;
  setTaskCompleted: (payload: TaskCompletedPayload) => void;
  setTaskError: (id: string, error: string) => void;
  setConflict: (id: string, candidatePath: string) => void;
  resolveConflict: (id: string, resolution: "overwrite" | "auto_rename" | "skip") => Promise<void>;
  updateConfig: (partial: Partial<CompressionConfig>) => void;
  clearList: () => Promise<void>;
  removeTask: (id: string) => void;
  setSummaryModal: (data: BatchFinishedPayload | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setDraggingOver: (over: boolean) => void;
  reprocessAll: () => Promise<void>;
}

const DEFAULT_CONFIG: CompressionConfig = {
  quality: 75,
  target_format: "original",
  output_dir_mode: "same",
  conflict_strategy: "auto_rename",
  strip_metadata: true,
  convert_to_srgb: true,
};

const SAVED_BYTES_KEY = "tinypress_cumulative_saved_bytes";

export const useStore = create<TinyPressState>((set, get) => ({
  taskIds: [],
  tasks: {},
  config: DEFAULT_CONFIG,
  configChangedSinceCompleted: false,
  isSettingsOpen: false,
  summaryModalData: null,
  isDraggingOver: false,
  cumulativeSavedBytes: Number(localStorage.getItem(SAVED_BYTES_KEY) || "1488977920"), // 預設約 1.38 GB

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
      };
    });
  },

  setThumbnailReady: (id, width, height) => {
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

      const newCumulative = state.cumulativeSavedBytes + savedThisTask;
      localStorage.setItem(SAVED_BYTES_KEY, newCumulative.toString());

      return {
        cumulativeSavedBytes: newCumulative,
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
    try {
      await invoke("resolve_file_conflict", {
        taskId: id,
        resolution,
      });
      set((state) => {
        const task = state.tasks[id];
        if (!task) return state;
        return {
          tasks: {
            ...state.tasks,
            [id]: {
              ...task,
              status: resolution === "skip" ? "completed" : "processing",
            },
          },
        };
      });
    } catch (err) {
      console.error("Resolve conflict failed:", err);
    }
  },

  updateConfig: (partial) => {
    set((state) => {
      const newConfig = { ...state.config, ...partial };
      // 50ms 輕度防抖同步至後端
      invoke("update_active_config", { config: newConfig }).catch(console.error);

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

  clearList: async () => {
    try {
      await invoke("clear_thumbnails");
    } catch (e) {
      console.error(e);
    }
    set({
      taskIds: [],
      tasks: {},
      configChangedSinceCompleted: false,
      summaryModalData: null,
    });
  },

  removeTask: (id) => {
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

  setSettingsOpen: (open) => {
    set({ isSettingsOpen: open });
  },

  setDraggingOver: (over) => {
    set({ isDraggingOver: over });
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
      };
    });

    try {
      await invoke("start_batch_compression", {
        tasks: tasksToRun,
        config: state.config,
      });
    } catch (e) {
      console.error("Reprocess all failed:", e);
    }
  },
}));
