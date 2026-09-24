import React from "react";
import { X } from "@phosphor-icons/react";
import { useStore } from "../store";
import { ConflictStrategy } from "../types";

export const SettingsDrawer: React.FC = () => {
  const isSettingsOpen = useStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const config = useStore((s) => s.config);
  const updateConfig = useStore((s) => s.updateConfig);

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* 10% 微黑遮罩 */}
      <div
        onClick={() => setSettingsOpen(false)}
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
      />

      {/* 360px 抽屜主體 */}
      <aside className="relative w-[360px] h-full bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col z-10 text-[13px] text-[var(--text-main)] animate-in slide-in-from-right duration-200">
        {/* 頂部標題 */}
        <div className="flex items-center justify-between h-[48px] px-4 border-b border-[var(--border-subtle)] select-none">
          <span className="font-semibold text-[15px]">偏好設定</span>
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
              輸出目的地規則
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
                <span>與原檔相同路徑</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="output_dir_mode"
                  checked={config.output_dir_mode === "sub"}
                  onChange={() => updateConfig({ output_dir_mode: "sub" })}
                  className="accent-[var(--accent-green)]"
                />
                <span>原檔目錄下相對子資料夾 (min/)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="output_dir_mode"
                  checked={config.output_dir_mode === "custom"}
                  onChange={() => updateConfig({ output_dir_mode: "custom" })}
                  className="accent-[var(--accent-green)]"
                />
                <span>全域固定目錄</span>
              </label>

              {config.output_dir_mode === "custom" && (
                <div className="pt-1 pl-5">
                  <input
                    type="text"
                    placeholder="例如: C:\Users\Photos\Compressed"
                    value={config.custom_dir_path || ""}
                    onChange={(e) =>
                      updateConfig({ custom_dir_path: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-[4px] text-[13px] focus:border-[var(--accent-green)] focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 模組 2: 衝突策略 */}
          <div className="space-y-2.5">
            <label className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[11.5px]">
              同名檔案存在時策略
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
              <option value="auto_rename">自動添加後綴 (如 photo_1.jpg)</option>
              <option value="overwrite">直接覆蓋 (不可逆)</option>
              <option value="skip">跳過不處理</option>
              <option value="ask">遇衝突時單獨詢問 (非阻塞)</option>
            </select>
          </div>

          {/* 模組 3: 中繼資料與色彩空間 */}
          <div className="space-y-2.5">
            <label className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">
              中繼資料與轉換
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
                  <span className="font-medium">抹除 EXIF 與 GPS 資訊</span>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    極小化檔案大小並保護個人隱私
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.convert_to_srgb}
                  onChange={(e) =>
                    updateConfig({ convert_to_srgb: e.target.checked })
                  }
                  className="mt-0.5 accent-[var(--accent-green)]"
                />
                <div>
                  <span className="font-medium">自動轉換色彩空間至 sRGB</span>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    防止 Display P3 等廣色域圖片在舊螢幕產生色偏
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* 模組 4: 外觀與主題 */}
          <div className="space-y-2.5">
            <label className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">
              介面主題
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  document.documentElement.removeAttribute("data-theme");
                }}
                className="flex-1 py-1.5 text-center border border-[var(--border-subtle)] rounded-[4px] bg-[var(--bg-subtle)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                強制深色
              </button>
              <button
                type="button"
                onClick={() => {
                  document.documentElement.setAttribute("data-theme", "light");
                }}
                className="flex-1 py-1.5 text-center border border-[var(--border-subtle)] rounded-[4px] bg-[var(--bg-subtle)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                淺色模式
              </button>
            </div>
          </div>
        </div>

        {/* 底部關閉提示 */}
        <div className="p-3 border-t border-[var(--border-subtle)] text-center text-[11px] text-[var(--text-dim)]">
          按 <kbd className="px-1 py-0.5 font-mono bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded">Esc</kbd> 關閉設定抽屜
        </div>
      </aside>
    </div>
  );
};
