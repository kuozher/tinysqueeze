import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "../store";
import {
  BatchFinishedPayload,
  ConflictDetectedPayload,
  TaskCompletedPayload,
  ThumbnailReadyPayload,
} from "../types";

export function useTauriEvents() {
  const setThumbnailReady = useStore((s) => s.setThumbnailReady);
  const setTaskCompleted = useStore((s) => s.setTaskCompleted);
  const setTaskSkipped = useStore((s) => s.setTaskSkipped);
  const setTaskStage = useStore((s) => s.setTaskStage);
  const setTaskError = useStore((s) => s.setTaskError);
  const setConflict = useStore((s) => s.setConflict);
  const checkAndTriggerSummaryModal = useStore((s) => s.checkAndTriggerSummaryModal);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }
    let unlistenAll: Array<() => void> = [];

    const setup = async () => {
      const u1 = await listen<ThumbnailReadyPayload>("thumbnail_ready", (e) => {
        setThumbnailReady(
          e.payload.id,
          e.payload.width,
          e.payload.height,
          e.payload.thumbnail_base64
        );
      });

      const u2 = await listen<TaskCompletedPayload>("task_completed", (e) => {
        setTaskCompleted(e.payload);
      });

      const u3 = await listen<{ id: string; error_message: string }>(
        "task_error",
        (e) => {
          setTaskError(e.payload.id, e.payload.error_message);
        }
      );

      const u4 = await listen<ConflictDetectedPayload>("conflict_detected", (e) => {
        setConflict(e.payload.id, e.payload.candidate_output_path);
      });

      const u5 = await listen<{ id: string; reason: string; output_path?: string }>(
        "task_skipped",
        (e) => {
          setTaskSkipped(e.payload);
        }
      );

      const u6 = await listen<{ id: string; stage: "decoding" | "encoding" | "writing" }>(
        "task_stage",
        (e) => {
          setTaskStage(e.payload);
        }
      );

      const u7 = await listen<BatchFinishedPayload>("batch_finished", () => {
        setTimeout(() => {
          checkAndTriggerSummaryModal();
        }, 200);
      });

      unlistenAll = [u1, u2, u3, u4, u5, u6, u7];
    };

    setup().catch(console.error);

    return () => {
      unlistenAll.forEach((fn) => fn());
    };
  }, [setThumbnailReady, setTaskCompleted, setTaskSkipped, setTaskStage, setTaskError, setConflict, checkAndTriggerSummaryModal]);
}
