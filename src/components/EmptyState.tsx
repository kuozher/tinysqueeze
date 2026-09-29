import React, { useRef } from "react";
import { CloudArrowUp, Image as ImageIcon } from "@phosphor-icons/react";
import { useStore } from "../store";
import { isTauri } from "../utils";

interface EmptyStateProps {
  onFilesSelected: (files: FileList | File[]) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onFilesSelected }) => {
  const isDraggingOver = useStore((s) => s.isDraggingOver);
  const t = useStore((s) => s.t);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center p-6 h-full select-none">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.webp,.avif"
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        onClick={handleClick}
        onDragOver={(e) => {
          if (isTauri()) return;
          e.preventDefault();
          useStore.getState().setDraggingOver(true);
        }}
        onDragLeave={(e) => {
          if (isTauri()) return;
          e.preventDefault();
          useStore.getState().setDraggingOver(false);
        }}
        onDrop={(e) => {
          if (isTauri()) return;
          e.preventDefault();
          useStore.getState().setDraggingOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFilesSelected(e.dataTransfer.files);
          }
        }}
        className={`w-full h-full flex flex-col items-center justify-center rounded-[6px] border-2 border-dashed transition-all duration-100 cursor-pointer ${
          isDraggingOver
            ? "border-[var(--accent-green)] bg-[var(--accent-green)]/5 scale-[0.99]"
            : "border-[var(--border-subtle)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-subtle)]/50"
        }`}
      >
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--accent-green)] shadow-sm">
            {isDraggingOver ? (
              <CloudArrowUp size={28} weight="bold" />
            ) : (
              <ImageIcon size={26} weight="regular" />
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-[16px] font-semibold text-[var(--text-main)] tracking-tight">
              {t("dropPromptTitle")}
            </h3>
            <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed">
              {t("dropPromptFormats")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
