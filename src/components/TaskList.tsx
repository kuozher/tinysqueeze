import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useStore } from "../store";
import { TaskRow } from "./TaskRow";

export const TaskList: React.FC = () => {
  const taskIds = useStore((s) => s.taskIds);
  const tasks = useStore((s) => s.tasks);
  const parentRef = useRef<HTMLDivElement>(null);

  const isVirtual = taskIds.length > 100;

  const rowVirtualizer = useVirtualizer({
    count: taskIds.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // 56px per row per PRD
    overscan: 5,
    enabled: isVirtual,
  });

  return (
    <div className="flex flex-col flex-1 w-full h-full overflow-hidden select-none">
      {/* 佇列結構表頭 */}
      <div className="flex items-center justify-between h-8 px-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-muted)] select-none flex-shrink-0 z-10">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="w-10 text-center flex-shrink-0">縮圖</span>
          <span className="truncate pl-0.5">檔案名稱與尺寸</span>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="w-[140px] text-right">體積變化</span>
          <span className="w-[70px] text-right">壓縮率</span>
        </div>
        <div className="w-14 text-right flex-shrink-0 pr-2">
          <span>操作</span>
        </div>
      </div>

      {/* 任務滾動列表 */}
      <div
        ref={parentRef}
        className="flex-1 w-full h-full overflow-y-auto overflow-x-hidden"
      >
        {isVirtual ? (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const id = taskIds[virtualRow.index];
              const task = tasks[id];
              if (!task) return null;
              return (
                <div
                  key={id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <TaskRow task={task} index={virtualRow.index} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col w-full">
            {taskIds.map((id, index) => {
              const task = tasks[id];
              if (!task) return null;
              return <TaskRow key={id} task={task} index={index} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
};
