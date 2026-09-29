import React, { useEffect, useState } from "react";
import { formatBytes } from "../utils";
import { useStore } from "../store";

interface AnimatedSizeProps {
  originalSize: number;
  targetSize?: number;
  isCompleted: boolean;
}

export const AnimatedSize: React.FC<AnimatedSizeProps> = ({
  originalSize,
  targetSize,
  isCompleted,
}) => {
  const t = useStore((s) => s.t);
  const [currentSize, setCurrentSize] = useState<number>(originalSize);

  useEffect(() => {
    if (!isCompleted || targetSize === undefined || targetSize >= originalSize) {
      setCurrentSize(targetSize ?? originalSize);
      return;
    }

    const duration = 180; // 180ms per PRD
    const startTime = performance.now();
    const startVal = originalSize;
    const diff = startVal - targetSize;

    let frameId: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Linear interpolation per PRD
      const val = Math.round(startVal - diff * progress);
      setCurrentSize(val);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isCompleted, targetSize, originalSize]);

  if (!isCompleted || targetSize === undefined) {
    return (
      <div className="flex flex-col items-end leading-tight font-mono tabular-nums select-none">
        <span className="text-[11px] text-[var(--text-muted)]">
          {formatBytes(originalSize)}
        </span>
        <span className="text-[11.5px] text-[var(--text-dim)]">
          {t("processingEllipsis")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end leading-tight font-mono tabular-nums select-none">
      <span className="text-[11px] text-[var(--text-muted)]">
        {formatBytes(originalSize)}
      </span>
      <span className="flex items-center justify-end gap-1 font-semibold text-[13px] text-[var(--text-main)]">
        <span className="text-[var(--text-dim)] font-normal text-[11px]">→</span>
        <span>{formatBytes(currentSize)}</span>
      </span>
    </div>
  );
};
