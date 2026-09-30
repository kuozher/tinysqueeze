import React, { useState } from "react";
import { X } from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import { ConflictStrategy } from "../types";

export const SettingsDrawer: React.FC = () => {
  const isSettingsOpen = useStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const config = useStore((s) => s.config);
  const updateConfig = useStore((s) => s.updateConfig);
  const locale = useStore((s) => s.locale);
  const setLocale = useStore((s) => s.setLocale);
  const t = useStore((s) => s.t);

  const [currentTheme, setCurrentTheme] = useState<"dark" | "light">(() => {
    return (
      (localStorage.getItem("tinysqueeze_theme") as "dark" | "light") ||
      (localStorage.getItem("tinypress_theme") as "dark" | "light") ||
      "dark"
    );
  });

  const handleSetTheme = (theme: "dark" | "light") => {
    setCurrentTheme(theme);
    localStorage.setItem("tinysqueeze_theme", theme);
    if (theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("prefTitle")}
      className={`fixed inset-0 z-50 flex justify-end transition-all duration-200 ${
        isSettingsOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* 遮罩 */}
      <div
        onClick={() => setSettingsOpen(false)}
        className={`fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ${
          isSettingsOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* 360px 抽屜主體 */}
      <aside
        className={`relative w-[360px] h-full bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col z-10 text-[13px] text-[var(--text-main)] transition-transform duration-200 ease-out transform ${
          isSettingsOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* 頂部標題 */}
        <div className="flex items-center justify-between h-[48px] px-4 border-b border-[var(--border-subtle)] select-none">
          <span className="font-semibold text-[15px]">{t("prefTitle")}</span>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        {/* 設定模組清單 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* 模組 1: 儲存路徑 */}
          <div className="space-y-2.5">
            <label className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[11.5px]">
              {t("sectionDestination")}
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="output_dir_mode"
                  checked={config.output_dir_mode === "same"}
                  onChange={() => updateConfig({ output_dir_mode: "same" })}
                  className="accent-[var(--accent-green)]"
                />
                <span>{t("destSame")}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="output_dir_mode"
                  checked={config.output_dir_mode === "sub"}
                  onChange={() => updateConfig({ output_dir_mode: "sub" })}
                  className="accent-[var(--accent-green)]"
                />
                <span>{t("destSub")}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="output_dir_mode"
                  checked={config.output_dir_mode === "custom"}
                  onChange={() => updateConfig({ output_dir_mode: "custom" })}
                  className="accent-[var(--accent-green)]"
                />
                <span>{t("destCustom")}</span>
              </label>

              {config.output_dir_mode === "custom" && (
                <div className="pt-1 pl-5 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={t("destCustomPlaceholder")}
                    value={config.custom_dir_path || ""}
                    onChange={(e) =>
                      updateConfig({ custom_dir_path: e.target.value })
                    }
                    className="flex-1 px-2.5 py-1.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-[4px] text-[13px] focus:border-[var(--accent-green)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const dir = await open({ directory: true, multiple: false });
                        if (dir) {
                          updateConfig({ custom_dir_path: dir });
                        }
                      } catch (err) {
                        console.error("Select directory failed:", err);
                      }
                    }}
                    className="px-2.5 py-1.5 text-[12.5px] font-medium bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded hover:bg-[var(--border-hover)] text-[var(--text-main)] cursor-pointer"
                  >
                    {t("browse")}
                  </button>
                </div>
              )}

              {/* 後綴自訂與即時預覽 (U-01) */}
              <div className="pt-2 pl-1 border-t border-[var(--border-subtle)]/50">
                <label className="text-[12px] text-[var(--text-muted)] block mb-1.5">
                  {t("customSuffixLabel")}
                </label>
                <div className="flex items-center gap-2.5">
                  <input
                    type="text"
                    value={config.suffix ?? "_min"}
                    onChange={(e) => updateConfig({ suffix: e.target.value })}
                    className="w-24 px-2 py-1 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded text-[13px] font-mono focus:border-[var(--accent-green)] focus:outline-none"
                  />
                  <span className="text-[12px] font-mono text-[var(--text-muted)]">
                    photo.jpg → photo<span className="text-[var(--accent-green)] font-bold">{config.suffix ?? "_min"}</span>.jpg
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 模組 2: 衝突策略 */}
          <div className="space-y-2.5">
            <label className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[11.5px]">
              {t("sectionConflict")}
            </label>
            <select
              value={config.conflict_strategy}
              onChange={(e) =>
                updateConfig({
                  conflict_strategy: e.target.value as ConflictStrategy,
                })
              }
              className="w-full px-2.5 py-1.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-[4px] text-[13px] focus:border-[var(--accent-green)] focus:outline-none cursor-pointer"
            >
              <option value="auto_rename">{t("conflictAutoRename")}</option>
              <option value="overwrite">{t("conflictOverwriteOpt")}</option>
              <option value="skip">{t("conflictSkipOpt")}</option>
              <option value="ask">{t("conflictAskOpt")}</option>
            </select>
          </div>

          {/* 模組 3: 中繼資料設定 */}
          <div className="space-y-2.5">
            <label className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[11.5px]">
              {t("sectionMetadata")}
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.strip_metadata}
                  onChange={(e) =>
                    updateConfig({ strip_metadata: e.target.checked })
                  }
                  className="mt-0.5 accent-[var(--accent-green)]"
                />
                <div>
                  <span className="font-medium">{t("stripMetadata")}</span>
                  <p className="text-[11.5px] text-[var(--text-muted)]">
                    {t("stripMetadataDesc")}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* 模組 4: 介面語系 */}
          <div className="space-y-2.5">
            <label className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">
              {t("sectionLanguage")}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLocale("zh-TW")}
                className={`flex-1 py-1.5 text-center border rounded-[4px] transition-colors cursor-pointer text-[12.5px] font-medium ${
                  locale === "zh-TW"
                    ? "border-[var(--accent-green)] text-[var(--accent-green)] bg-[var(--accent-green)]/10"
                    : "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-subtle)]"
                }`}
              >
                繁體中文
              </button>
              <button
                type="button"
                onClick={() => setLocale("en-US")}
                className={`flex-1 py-1.5 text-center border rounded-[4px] transition-colors cursor-pointer text-[12.5px] font-medium ${
                  locale === "en-US"
                    ? "border-[var(--accent-green)] text-[var(--accent-green)] bg-[var(--accent-green)]/10"
                    : "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-subtle)]"
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* 模組 5: 外觀與主題 */}
          <div className="space-y-2.5">
            <label className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">
              {t("sectionAppearance")}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSetTheme("dark")}
                className={`flex-1 py-1.5 text-center border rounded-[4px] transition-colors cursor-pointer text-[12.5px] font-medium ${
                  currentTheme === "dark"
                    ? "border-[var(--accent-green)] text-[var(--accent-green)] bg-[var(--accent-green)]/10"
                    : "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-subtle)]"
                }`}
              >
                {t("themeDark")}
              </button>
              <button
                type="button"
                onClick={() => handleSetTheme("light")}
                className={`flex-1 py-1.5 text-center border rounded-[4px] transition-colors cursor-pointer text-[12.5px] font-medium ${
                  currentTheme === "light"
                    ? "border-[var(--accent-green)] text-[var(--accent-green)] bg-[var(--accent-green)]/10"
                    : "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-subtle)]"
                }`}
              >
                {t("themeLight")}
              </button>
            </div>
          </div>
        </div>

        {/* 底部關閉提示 */}
        <div className="p-3 border-t border-[var(--border-subtle)] text-center text-[11px] text-[var(--text-dim)]">
          {t("escCloseSettings")}
        </div>
      </aside>
    </div>
  );
};
