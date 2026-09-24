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
  const setTaskError = useStore((s) => s.setTaskError);
  const setConflict = useStore((s) => s.setConflict);
  const setSummaryModal = useStore((s) => s.setSummaryModal);

  useEffect(() => {
    let unlistenAll: Array<() => void> = [];

    const setup = async () => {
      const u1 = await listen<ThumbnailReadyPayload>("thumbnail_ready", (e) => {
        setThumbnailReady(e.payload.id, e.payload.width, e.payload.height);
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

      const u5 = await listen<BatchFinishedPayload>("batch_finished", (e) => {
        setSummaryModal(e.payload);
      });

      unlistenAll = [u1, u2, u3, u4, u5];
    };

    setup().catch(console.error);

    return () => {
      unlistenAll.forEach((fn) => fn());
    };
  }, [setThumbnailReady, setTaskCompleted, setTaskError, setConflict, setSummaryModal]);
}
