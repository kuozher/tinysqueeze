# TinyPress 開發交接文件 (Handoff Documentation)

**記錄時間**：2026-09-24  
**技術架構**：Tauri 2.0 (Rust) + React 19 + TypeScript + Vite + Tailwind CSS v4 + Phosphor Icons  
**原始碼目錄**：`C:\Users\PC021\Desktop\tinypress`

---

## 1. 專案核心定位與架構全覽

TinyPress 是一款極致輕量、專為高效能批次圖片壓縮與轉檔打造的本機桌面工具（無上雲隱私風險、零依賴外部 runtime）：
- **後端管線 (Rust)**：
  - **Fast Lane (輕量通道)**：以非同步背景執行緒抽取圖片至 80×80，編碼為極輕量 WebP 並寫入記憶體 DashMap 快取，供前端自訂協定 `tinypress-thumb://` 即時預覽。
  - **Heavy Lane (記憶體門禁通道)**：依 CPU 核心數（1~8）建立編碼佇列，配合 `512MB` 記憶體水線 Semaphore 與 1.8x 安全係數預估；整合 MozJPEG、libwebp、imagequant、oxipng、ravif。
  - **原子寫入與孤兒暫存檔防禦**：採暫存檔 `.image.tinypress_tmp_{uuid}` 寫入後原子替換（rename），搭配 RAII Guard 與冷啟動清掃器，杜絕斷電或異常崩潰留下孤兒暫存檔。
- **前端介面 (React 19)**：
  - 深色工具風格（Dark-first `#121314`），微圓角（2~6px），禁用高飽和膠囊按鈕。
  - 數值排版均採用 `JetBrains Mono` 與 `tabular-nums`，支援 100 筆以上之虛擬滾動清單（`@tanstack/react-virtual`）。

---

## 2. 今日重大問題修復歷程與根因分析 (Key Bugs & Solutions)

### ① 視窗拖曳與視窗控制（最小化、最大化、關閉）完全失效
- **根因分析**：
  1. Tauri 2.0 引進了精細化的外掛權限系統（Capabilities）。原本在 `src-tauri/capabilities/default.json` 僅配置 `"core:window:default"`，但 Tauri 2 的 `default` 權限集合**僅包含查詢類指令（如 `is_maximized`），不包含任何改變視窗狀態的指令**！導致 `plugin:window|start_dragging`、`minimize`、`close` 被安全核心默默阻擋。
  2. Windows WebView2 在無邊框模式下，HTML 原生 `data-tauri-drag-region` 容易被內層 DOM 遮蔽。
- **具體解決方案**：
  - 在 `src-tauri/capabilities/default.json` 完整補齊權限：
    `core:window:allow-start-dragging`, `core:window:allow-minimize`, `core:window:allow-maximize`, `core:window:allow-unmaximize`, `core:window:allow-toggle-maximize`, `core:window:allow-close`, `core:window:allow-destroy`, `core:window:allow-is-maximized`。
  - 在 `src-tauri/src/commands.rs` 實作直接綁定 `tauri::Window` 的原生控制指令：`window_minimize`、`window_toggle_maximize`、`window_close`、`window_start_dragging`，並於 `lib.rs` 註冊。
  - 於 `src/components/Header.tsx` 透過 `invoke` 調用原生指令，實現極致穩固的拖曳與視窗操作（包含雙擊標題列最大化/還原切換）。

### ② 縮圖破圖 (404 Not Found)
- **根因分析**：
  - 前端發起 `tinypress-thumb://{taskId}` 時，Windows WebView2 的 URL 標準解析將任務 ID 當作 `host`（`request.uri().host()`），而 `request.uri().path()` 僅為 `"/"`。後端原本以 `path.trim_start_matches('/')` 讀取，導致提取出空字串 `""`，查不到 DashMap 快取而回傳 404。
- **具體解決方案**：
  - 更新 `src-tauri/src/lib.rs` 的通訊協定註冊器，同時提取並比對 `uri.path()` 與 `uri.host()`。
  - 前端 `TaskRow.tsx` 規範請求網址為 `tinypress-thumb://localhost/${task.id}`，並加上 `onError` 副檔名徽章兜底。

### ③ 佇列已有檔案時，拖曳新圖片導致所有舊圖片重新轉檔
- **根因分析**：
  - 在 `App.tsx` 的路徑接收處理（`handleIngestPaths`）中，原本的過濾條件僅排除了正在處理中的檔案（`status === "processing"`）。因此當舊檔案已轉檔完成（`status === "completed"`），使用者拖入包含舊檔或資料夾時，舊檔案被再度包裝為新任務推入後端 `start_batch_compression`，引發全體重新編碼。
- **具體解決方案**：
  - 於 `src/App.tsx` 加入嚴格路徑比對：
    `const existingPaths = new Set(Object.values(currentTasks).map((t) => t.filePath));`
    僅過濾出清單中**不存在**的全新檔案（`!existingPaths.has(t.file_path)`）啟動壓縮。
  - 既有已完成之項目維持原狀，確保新增圖片與既有佇列互不干擾。

### ④ 完成轉換後彈窗時機奇妙
- **根因分析**：
  - 原先後端每當一個批次完成時（`start_batch` 的區域 completed 計數器達標），就發射 `batch_finished`，前端直接無條件彈窗。如果使用者接續拖入檔案，先前的批次完成便會強行彈出半途結算視窗，打斷操作體驗。
- **具體解決方案**：
  - 於 `src/store.ts` 建立全域狀態門禁 `checkAndTriggerSummaryModal` 與旗標 `hasShownSummaryModal`。
  - 每次任務完成時進行 250ms 防抖校驗：**僅當佇列中「所有項目」皆已脫離 `processing` 與 `conflict` 狀態**（即全佇列完成）時，才計算完整總結數據並彈窗。

### ⑤ 壓縮進度條改進與文字擁擠修復
- **根因分析**：
  - 欄位寬度僅 70px，同時塞入進度條與「壓縮中」文字造成空間極度壓迫；且橫向無限循環動畫無法提供實際階段反饋。
- **具體解決方案**：
  - 移除「壓縮中」冗餘文字，將寬度完整釋放給進度條軌道（64px）。
  - 建立專屬微型進度組件 `TaskProgressBar`：於壓縮期間平滑過渡（25% 載入/解碼 → 65% 感知編碼 → 90% 快取寫入），並帶有深色螢光綠發光陰影，完成瞬間無縫切換為負百分比標籤。

### ⑥ 其他已落地之細節優化
- **佇列結構化表頭**：`TaskList.tsx` 頂部加入高度 32px 黏性表頭（縮圖 40px ｜ 檔案名稱與尺寸 flex-1 ｜ 體積變化 140px ｜ 壓縮率 70px ｜ 操作 56px）。
- **字級整體放大 1~2px**：全域介面文字升級至 13~16px，改善閱覽舒適度。
- **格式即時切換**：`QuickBar.tsx` 格式下拉選單更換為 WebP/AVIF/JPEG/PNG 時，自動觸發 `reprocessAll()` 重新編碼。
- **空狀態清爽化**：移除右下角常駐累計節省空間文字，僅在結算彈窗呈現統計。

---

## 3. 專案核心檔案結構指南

```
tinypress/
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json          # Tauri 2 核心權限宣告 (已配置 window:allow-*)
│   ├── src/
│   │   ├── codecs.rs             # MozJPEG, WebP, AVIF, PNG 編碼實作與縮圖生成
│   │   ├── commands.rs           # Tauri IPC 指令 (路徑掃描、視窗拖曳/縮放控制)
│   │   ├── guard.rs              # RAII 暫存檔管理與冷啟動孤兒檔案清掃
│   │   ├── lib.rs                # 應用程式進入點與 tinypress-thumb 自訂通訊協定
│   │   ├── models.rs             # 共享資料結構定義 (CompressionConfig, Payloads)
│   │   └── pipeline.rs           # Fast/Heavy Lane 雙通道處理與記憶體門禁 Semaphore
│   ├── Cargo.toml                # Rust 依賴庫宣告
│   └── tauri.conf.json           # 視窗無邊框、尺寸與 CSP 設定
│
├── src/
│   ├── components/
│   │   ├── AnimatedSize.tsx      # 180ms 數字滾動動畫組件
│   │   ├── EmptyState.tsx        # 待機拖曳落地區 (支援全域 dropzone)
│   │   ├── Header.tsx            # 原生拖曳標題列、雙擊最大化、系統三鍵
│   │   ├── QuickBar.tsx          # 底部常駐列 (即時格式切換、品質滑桿)
│   │   ├── SettingsDrawer.tsx    # 右側 360px 偏好設定抽屜
│   │   ├── SummaryModal.tsx      # 全佇列完成結算摘要彈窗
│   │   ├── TaskList.tsx          # 虛擬滾動清單容器與 32px 黏性表頭
│   │   └── TaskRow.tsx           # 單一圖檔列 (縮圖、檔名、平滑進度條、覆蓋/更名衝突按鈕)
│   ├── hooks/
│   │   ├── useKeyboardStack.ts   # 快捷鍵分層調度器 (Esc, Enter, R)
│   │   └── useTauriEvents.ts     # 後端事件監聽器 (防抖全佇列結算)
│   ├── store.ts                  # Zustand 全域狀態 (佇列任務、配置、門禁控制)
│   ├── types.ts                  # 前端 TypeScript 型別定義
│   ├── utils.ts                  # formatBytes, truncateFilename, isTauri 工具函式
│   ├── App.tsx                   # 應用程式根組件 (全域防瀏覽器預設導航事件)
│   └── App.css                   # Tailwind v4 配置、主題變數與進度條動態曲線
├── handoff.md                    # 本交接紀錄文件
└── package.json
```

---

## 4. 本地啟動與驗證指令

### 啟動開發伺服器
```powershell
# 在專案目錄執行：
npm run tauri dev
```

### 前端獨立型別檢查與打包編譯
```powershell
npm run build
```

### Rust 後端語法與相依性檢查
```powershell
cd src-tauri
cargo check
```

---

## 5. 後續開發候選清單 (Backlog & Next Steps)

1. **更豐富的圖片格式擴充**：評估是否納入 `.svg`（透過 resvg 轉點陣圖）或 `.heic` / `.tiff` 之解碼支援。
2. **多圖並發衝突批次解決**：當遇到大量同名檔案衝突時，提供「套用至所有衝突項目（全部覆蓋 / 全部更名）」之快捷操作。
3. **輸出子目錄名稱自訂**：除了預設的 `min/` 之外，允許使用者在偏好設定中自訂子資料夾名稱（如 `compressed/` 或 `optimized/`）。
4. **壓縮前後畫質比對視窗 (Before/After Slider)**：點選縮圖可彈出類似 Squoosh 的中線分割拖曳比對器。
