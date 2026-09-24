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
  );
};
