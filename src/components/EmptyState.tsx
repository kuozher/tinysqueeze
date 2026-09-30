import React, { useRef } from "react";
import { CloudArrowUp, Image as ImageIcon, Folder } from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import { isTauri } from "../utils";

interface EmptyStateProps {
  onFilesSelected?: (files: FileList | File[]) => void;
  onPathsSelected?: (paths: string[]) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onFilesSelected, onPathsSelected }) => {
  const isDraggingOver = useStore((s) => s.isDraggingOver);
  const t = useStore((s) => s.t);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePickFiles = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isTauri()) {
      try {
        const selected = await open({
          multiple: true,
          directory: false,
          filters: [
            {
              name: "Images",
              extensions: ["png", "jpg", "jpeg", "webp"],
            },
          ],
        });
        if (selected) {
          const paths = Array.isArray(selected) ? selected : [selected];
          if (paths.length > 0 && onPathsSelected) {
            onPathsSelected(paths);
          }
        }
      } catch (err) {
        console.error("Open file dialog failed:", err);
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const handlePickFolder = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isTauri()) {
      try {
        const selected = await open({
          directory: true,
          multiple: false,
        });
        if (selected && onPathsSelected) {
          onPathsSelected([selected]);
        }
      } catch (err) {
        console.error("Open folder dialog failed:", err);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onFilesSelected) {
      onFilesSelected(e.target.files);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center p-6 h-full select-none">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        role="button"
        tabIndex={0}
        aria-label={t("dropPromptTitle")}
        onClick={handlePickFiles}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handlePickFiles();
          }
        }}
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
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onFilesSelected) {
            onFilesSelected(e.dataTransfer.files);
          }
        }}
        className={`w-full h-full flex flex-col items-center justify-center rounded-[6px] border-2 border-dashed transition-all duration-100 cursor-pointer focus:outline-none focus:border-[var(--accent-green)] ${
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

          <div className="space-y-1.5">
            <h3 className="text-[16px] font-semibold text-[var(--text-main)] tracking-tight">
              {t("dropPromptTitle")}
            </h3>
            <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed">
              {t("dropPromptFormats")}
            </p>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={handlePickFiles}
              className="px-3 py-1.5 text-[12.5px] font-medium bg-[var(--accent-green-btn-bg)] text-[var(--accent-green-btn-text)] rounded hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              aria-label={t("addFiles")}
            >
              {t("addFiles")}
            </button>
            {isTauri() && (
              <button
                type="button"
                onClick={handlePickFolder}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded hover:bg-[var(--border-hover)] transition-colors cursor-pointer shadow-sm"
              >
                <Folder size={14} />
                <span>{t("addFolder")}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

