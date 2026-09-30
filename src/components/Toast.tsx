import React, { useEffect } from "react";
import { WarningCircle, Info, X } from "@phosphor-icons/react";
import { useStore } from "../store";

export const Toast: React.FC = () => {
  const toast = useStore((s) => s.toast);
  const dismissToast = useStore((s) => s.dismissToast);
  const t = useStore((s) => s.t);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      dismissToast();
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast?.id, dismissToast]);

  if (!toast) return null;

  const isWarning = toast.type === "warning";
  const isError = toast.type === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-14 left-1/2 -translate-x-1/2 z-50 max-w-md w-auto px-4 py-2.5 rounded-[6px] shadow-2xl border flex items-center gap-2.5 bg-[var(--bg-surface)] text-[var(--text-main)] transition-all duration-200 animate-in fade-in slide-in-from-top-3 select-none"
      style={{
        borderColor: isWarning
          ? "rgba(251, 191, 36, 0.45)"
          : isError
          ? "rgba(248, 113, 113, 0.45)"
          : "rgba(52, 211, 153, 0.45)",
      }}
    >
      {isWarning ? (
        <WarningCircle size={18} weight="bold" className="text-[var(--accent-amber)] flex-shrink-0" />
      ) : isError ? (
        <WarningCircle size={18} weight="bold" className="text-[var(--accent-red)] flex-shrink-0" />
      ) : (
        <Info size={18} weight="bold" className="text-[var(--accent-green)] flex-shrink-0" />
      )}

      <span className="text-[12.5px] font-medium leading-snug flex-1">
        {toast.message}
      </span>

      <button
        type="button"
        onClick={dismissToast}
        aria-label={t("closeAlert")}
        className="p-1 -mr-1 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
      >
        <X size={13} weight="bold" />
      </button>
    </div>
  );
};
