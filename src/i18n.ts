export type Locale = "zh-TW" | "en-US";

export const translations = {
  "zh-TW": {
    // App
    appName: "TinySqueeze",
    dragOverlayTitle: "釋放滑鼠以加入圖片佇列",
    dragOverlaySubtitle: "支援 JPG、PNG、WebP、AVIF，將自動啟動壓縮",

    // Header
    queuePaused: "佇列已暫停",
    processing: "正在處理",
    imagesUnit: "張...",
    pause: "暫停",
    resume: "繼續",
    restart: "重新開始",
    restartKey: " (R)",
    restartTooltip: "快捷列參數已變更，按 R 鍵以新設定重新開始全部",
    clear: "清除",
    clearKey: " (C)",
    settings: "偏好設定",
    settingsKey: " (,)",
    minimize: "最小化",
    maximize: "最大化",
    close: "關閉",

    // QuickBar
    quality: "品質",
    format: "格式",
    originalFormat: "原格式",
    q30: "（極限壓縮）",
    q50: "（低失真）",
    q75: "（推薦平衡）",
    q85: "（高保真）",
    q100: "（極致無損）",

    // TaskList
    thFileName: "檔案名稱與尺寸",
    thSizeChange: "體積變化",
    thStatus: "狀態",
    thRatio: "壓縮率",
    thActions: "操作",

    // TaskRow
    keptOriginal: "維持原檔",
    conflictExists: "檔案已存在:",
    conflictOverwrite: "覆蓋",
    conflictRename: "更名",
    conflictSkip: "跳過",
    actionRemoveProcessing: "從佇列移除（不影響磁碟原檔）",
    actionOpenFolder: "開啟所在資料夾",
    actionRemove: "從清單移除",
    taskFailed: "處理失敗",
    processingEllipsis: "處理中...",

    // EmptyState
    dropPromptTitle: "拖放圖片或資料夾至此",
    dropPromptFormats: "支援 PNG、JPG、JPEG、WebP、AVIF",

    // SettingsDrawer
    prefTitle: "偏好設定",
    sectionDestination: "輸出目的地規則",
    destSame: "與原檔相同路徑",
    destSub: "原檔目錄下相對子資料夾 (min/)",
    destCustom: "全域固定目錄",
    destCustomPlaceholder: "例如: C:\\Users\\Photos\\Compressed",
    sectionConflict: "同名檔案存在時策略",
    conflictAutoRename: "自動添加後綴 (如 photo_1.jpg)",
    conflictOverwriteOpt: "直接覆蓋 (不可逆)",
    conflictSkipOpt: "跳過不處理",
    conflictAskOpt: "遇衝突時單獨詢問 (非阻塞)",
    sectionMetadata: "中繼資料與轉換",
    stripMetadata: "抹除 EXIF 與 GPS 資訊",
    stripMetadataDesc: "極小化檔案大小並保護個人隱私",
    convertSrgb: "色彩空間自動轉換為 sRGB",
    convertSrgbDesc: "確保跨平台與瀏覽器一致色彩表現",
    sectionLanguage: "介面語系",
    sectionAppearance: "介面外觀",
    themeDark: "強制深色",
    themeLight: "淺色模式",
    escCloseSettings: "按 Esc 關閉設定",

    // SummaryModal
    summaryTitle: "批次壓縮完成",
    summaryDesc: "已成功處理所有佇列檔案",
    summaryOrigSize: "原始體積",
    summaryCompSize: "壓縮後體積",
    summarySavingsRatio: "平均節省",
    summarySavedBytes: "節省容量",
    openOutputFolder: "開啟輸出資料夾",
    closeBtn: "關閉",
  },
  "en-US": {
    // App
    appName: "TinySqueeze",
    dragOverlayTitle: "Release to add images to queue",
    dragOverlaySubtitle: "Supports JPG, PNG, WebP, AVIF. Compression starts automatically",

    // Header
    queuePaused: "Queue Paused",
    processing: "Processing",
    imagesUnit: "...",
    pause: "Pause",
    resume: "Resume",
    restart: "Restart",
    restartKey: " (R)",
    restartTooltip: "Settings changed. Press R to restart with new settings",
    clear: "Clear",
    clearKey: " (C)",
    settings: "Settings",
    settingsKey: " (,)",
    minimize: "Minimize",
    maximize: "Maximize",
    close: "Close",

    // QuickBar
    quality: "Quality",
    format: "Format",
    originalFormat: "Original",
    q30: " (Max Compress)",
    q50: " (Low Loss)",
    q75: " (Balanced)",
    q85: " (High Fidelity)",
    q100: " (Lossless)",

    // TaskList
    thFileName: "Name & Dimensions",
    thSizeChange: "Size Change",
    thStatus: "Status",
    thRatio: "Ratio",
    thActions: "Actions",

    // TaskRow
    keptOriginal: "Kept original",
    conflictExists: "File exists:",
    conflictOverwrite: "Overwrite",
    conflictRename: "Rename",
    conflictSkip: "Skip",
    actionRemoveProcessing: "Remove from queue",
    actionOpenFolder: "Open in folder",
    actionRemove: "Remove from list",
    taskFailed: "Failed",
    processingEllipsis: "Processing...",

    // EmptyState
    dropPromptTitle: "Drop images or folders here",
    dropPromptFormats: "Supports PNG, JPG, JPEG, WebP, AVIF",

    // SettingsDrawer
    prefTitle: "Preferences",
    sectionDestination: "Output Destination",
    destSame: "Same directory as original",
    destSub: "Relative subfolder (min/)",
    destCustom: "Custom fixed directory",
    destCustomPlaceholder: "e.g. C:\\Users\\Photos\\Compressed",
    sectionConflict: "File Conflict Strategy",
    conflictAutoRename: "Auto rename (e.g. photo_1.jpg)",
    conflictOverwriteOpt: "Overwrite (irreversible)",
    conflictSkipOpt: "Skip existing",
    conflictAskOpt: "Ask individually (non-blocking)",
    sectionMetadata: "Metadata & Color Space",
    stripMetadata: "Strip EXIF & GPS metadata",
    stripMetadataDesc: "Minimize file size and protect privacy",
    convertSrgb: "Auto convert to sRGB",
    convertSrgbDesc: "Ensure consistent color across screens",
    sectionLanguage: "Language",
    sectionAppearance: "Appearance",
    themeDark: "Dark Mode",
    themeLight: "Light Mode",
    escCloseSettings: "Press Esc to close settings",

    // SummaryModal
    summaryTitle: "Batch Compression Completed",
    summaryDesc: "All files in queue have been processed",
    summaryOrigSize: "Original Size",
    summaryCompSize: "Compressed",
    summarySavingsRatio: "Avg Savings",
    summarySavedBytes: "Space Saved",
    openOutputFolder: "Open Output Folder",
    closeBtn: "Close",
  },
} as const;

export type TranslationKey = keyof typeof translations["zh-TW"];

export function getTranslation(locale: Locale, key: TranslationKey): string {
  const dict = translations[locale] || translations["zh-TW"];
  return dict[key] || translations["zh-TW"][key] || key;
}
