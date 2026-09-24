import React, { useEffect, useState } from "react";
import { formatBytes } from "../utils";

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
      <span className="font-mono tabular-nums text-xs text-[var(--text-muted)]">
        {formatBytes(originalSize)}
      </span>
    );
  }

  return (
    <span className="font-mono tabular-nums text-xs text-[var(--text-muted)]">
      <span>{formatBytes(originalSize)}</span>
      <span className="mx-1.5 text-[var(--text-dim)]">→</span>
      <span className="font-semibold text-[var(--text-main)]">
        {formatBytes(currentSize)}
      </span>
    </span>
  );
};
