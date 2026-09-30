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

### ⑦ 介面與排版重大體驗修復 (2026-09-29)
- **深色/淺色模式無法切換修復**：
  - 根因：`src/App.css` 中將 `@media` 與類別選擇器混在同一個清單 `[data-theme="light"], @media (prefers-color-scheme: light)`，此為無效 CSS 語法導致整段淺色變數規則被瀏覽器引擎捨棄。
  - 解決方案：拆開為獨立的 `[data-theme="light"]` 與 `@media (prefers-color-scheme: light)` 區塊，並在 `SettingsDrawer.tsx` 加上 active 視覺高亮與 `localStorage` 持久化，於 `index.html` 與 `App.tsx` 注入無閃爍同步邏輯。
- **佇列表頭動態狀態與欄寬重整**：
  - 佇列處理中時表頭第四欄顯示「狀態」；佇列全數完成後無縫翻轉為「壓縮率」。
  - 移除表頭「縮圖」文字（保留 40px 空格與列資料對齊）。
  - 檔名寬度收斂 25%（`max-w-[210px]`），釋放之空間讓給狀態/壓縮率（84px，進度條加寬至 76px）與操作（64px），徹底根除擠壓。
- **品質調控策略定案：預設 85% 推薦高保真 ＋ 100% 真無損/極限天花板**：
  - **預設值設為 85%**：兼顧人眼感知臨界點（JND）與有感體積瘦身，並作為各格式平衡預設。
  - **WebP 真無損落地**：在 `codecs.rs` 中，當品質為 100 時調用 `webp::Encoder::encode_lossless()`，產出數學級真無損 WebP。
  - **JPEG 100% 天花板防禦**：標準 JPEG 先天無純數學無損，若以 Q=100 編碼易導致體積反向膨脹數倍；底層在品質為 100 時將 MozJPEG 鎖定在 95.0 感知極限，搭配 4:4:4 與 Ahumada-Watson 表，達成肉眼零失真且杜絕膨脹。
  - **QuickBar 動態情境反饋**：滑桿在 100% 時顯示 `💎 100% 無損` 綠色徽章與動態格式技術提示（如 `(純數學無損)` 或 `(最高保真 4:4:4)`）；在 85% 時提示 `(推薦·高保真)`，避免隱式竄改造成使用者困惑。

### ⑧ MozJPEG 感知量化矩陣與自適應色度採樣（對標 TinyJPG 文字銳利度）
- **根因與原理**：
  - 傳統壓縮腳本預設強制 4:2:0 色度降採樣，造成包含 UI、深底白字或高飽和圖標之文字邊緣色滲發虛。
  - 針對本機批次工具定位（杜絕多遍 Butteraugli 二分搜尋帶來的 CPU 發熱降頻與風扇狂飆），採用低開銷高投報之心理視覺優化。
- **具體解決方案**：
  - **自適應 4:4:4 色度採樣**：在 `src-tauri/src/codecs.rs` 實作跨步相鄰色差分析 `should_use_444_subsampling`（<0.02ms，零記憶體分配），若檢測到高對比邊界或品質 $\ge 85$，啟用 `comp.set_chroma_sampling_pixel_sizes((1, 1), (1, 1))`（4:4:4），自然風景圖則維持 4:2:0。

### ⑨ 佇列微調、操作集中、體積上下雙欄與品質刻度定案 (2026-09-29)
- **品質五段刻度磁吸與一致性排版**：
  - 預設品質調降至 `75%`（對標 TinyJPG 平衡結果）。
  - 滑桿鎖定五段離散值：`30%（極限瘦身）`、`50%（體積優先）`、`75%（推薦·平衡）`、`85%（高保真）`、`100%（無損 / 純數學無損 / 最高保真 4:4:4）`。
  - 說明文字全數採用全形括號「（」與「）」，100% 移除鑽石圖標與綠色高亮外框，與其他刻度回歸統一純文字排版。
  - QuickBar 維持三欄分佈，中央品質欄寬度固定且內容內部靠左錨定，杜絕切換說明文字時滑桿左右晃動。
  - 轉檔期間 QuickBar 三個控制項直接套用 `opacity-40 pointer-events-none select-none` 常態反灰凍結，無需 hover 即可一眼辨識不可操作。
- **參數調整與自動轉檔解耦（手動重新開始）**：
  - 切換格式或調整品質滑桿時，**徹底拔除自動觸發 reprocessAll**，變更僅更新底層配置以供後續新拖入檔案採納，舊有已完成項目維持原狀。
  - 標題列按鈕更新為 `重新開始 (R)`，僅在使用者手動點擊（或按 R 鍵）時，才將既有清單以最新參數重新發起壓縮。
- **全域暫停/繼續控制與排程取消**：
  - 標題列進度區提供緊湊集中之 `[暫停]` / `[繼續]` 控制按鈕。
  - Rust 後端引入 `is_paused`、`pause_notify` 與 `cancelled_tasks`，實現乾淨的 Worker 派發暫停與任務取消。
  - 轉檔中單列隱藏尚未產出的「開啟資料夾」，並將刪除按鈕改為安全意圖的 `MinusCircle`（Tooltip: `從佇列移除（不影響磁碟原檔）`）。
- **體積變化改為上下雙欄與佇列欄位重整**：
  - 檔名欄位過寬問題根治：移除人為的半幅截斷限制，讓檔名自然運用空間（支援顯示長度由 24 提升至 34 字元）。
  - 將檔名欄位多餘空間收斂約 30%，釋放之寬度精準回饋右側：
    - 體積變化欄拉寬至 `160px`，上下雙欄排版更具呼吸感與數字安定度。
    - 壓縮率／狀態欄拉寬至 `100px`，進度條加寬至 `88px`。
    - 操作欄位拉寬至 `80px`（`w-20`），按鈕懸停感更加從容俐落。
- **視窗尺寸記憶與還原（Window State Persistence）**：
  - `tauri.conf.json` 預設寬高設為最小尺寸 `720×520`，全新開啟時維持極簡緊湊。
  - 支援視窗狀態持久化：調整視窗大小時防抖紀錄至 `localStorage`，關閉後重複開啟時自動調用原生地圖指令 `window_set_size` 還原上次寬高（排除最大化狀態）。
- **完成佇列解耦與結算彈窗微調**：
  - 拖入新檔案不再受已完成歷史列路徑阻擋，同檔名重拖入一律配發新 UUID 建立新任務。
  - 結算彈窗 CTA 更名為「開啟輸出資料夾」，文字改為白色，移除右側 `↵` 箭頭；關閉按鈕移除 `(Esc)` 提示。

---

## 3. 專案核心檔案結構指南

```
tinypress/
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json          # Tauri 2 核心權限宣告 (已配置 window:allow-*)
│   ├── src/
│   │   ├── codecs.rs             # MozJPEG (感知量化+自適應444), WebP, AVIF, PNG
│   │   ├── commands.rs           # Tauri IPC 指令 (路徑掃描、視窗拖曳/縮放控制)
│   │   ├── guard.rs              # RAII 暫存檔管理與冷啟動孤兒檔案清掃
│   │   ├── lib.rs                # 應用程式進入點與 tinypress-thumb 自訂通訊協定
│   │   ├── models.rs             # 共享資料結構定義 (CompressionConfig, Payloads)
│   │   └── pipeline.rs           # Fast/Heavy Lane 雙通道處理與記憶體門禁 Semaphore
│   ├── Cargo.toml                # Rust 依賴庫宣告
│   └── tauri.conf.json           # 視窗無邊框、尺寸與 CSP 設定
│
├── src/
│   ├── i18n.ts                   # 繁體中文 (zh-TW) 與英文 (en-US) 輕量型別字典
│   ├── components/
│   │   ├── AnimatedSize.tsx      # 180ms 數字滾動動畫組件
│   │   ├── EmptyState.tsx        # 待機拖曳落地區 (支援全域 dropzone)
│   │   ├── Header.tsx            # 原生拖曳標題列、雙擊最大化、系統三鍵、深淺自適應 Logo
│   │   ├── QuickBar.tsx          # 底部常駐列 (即時格式切換、品質刻度滑桿、暫停/繼續/重新處理)
│   │   ├── SettingsDrawer.tsx    # 右側偏好設定 (深淺主題、語言切換 zh-TW/en-US、輸出設定)
│   │   ├── SummaryModal.tsx      # 全佇列完成結算摘要彈窗 (白色文字高對比主按鈕)
│   │   ├── TaskList.tsx          # 虛擬滾動清單容器與動態語意表頭 (狀態置中 ↔ 壓縮率)
│   │   └── TaskRow.tsx           # 單一圖檔列 (水平箭頭、雙欄前後尺寸、縮圖載入)
│   ├── hooks/
│   │   ├── useKeyboardStack.ts   # 快捷鍵分層調度器 (Esc, Enter, R)
│   │   └── useTauriEvents.ts     # 後端事件監聽器 (防抖全佇列結算)
│   ├── store.ts                  # Zustand 全域狀態 (雙向相容 tinypress_* 遷移)
│   ├── types.ts                  # 前端 TypeScript 型別定義
│   ├── utils.ts                  # formatBytes, truncateFilename, isTauri 工具函式
│   ├── App.tsx                   # 應用程式根組件 (全域防瀏覽器預設導航、記憶體/視窗寬高持久化)
│   └── App.css                   # Tailwind v4 配置、語法合規主題變數
├── handoff.md                    # 本交接紀錄文件
└── package.json
```

---

## 4. 最新重構與升級歷程 (2026-09-29)

### ① 品牌重命名：TinySqueeze (原 TinyPress)
- **名稱變更緣由**：原 `press` 偏向出版/印刷，新命名 `TinySqueeze` 直觀傳達「極致擠壓/微型壓縮」概念，保留 `Tiny*` 系列辨識度。
- **全方位無損相容遷移**：
  - **資料持久化**：`localStorage` 自動從 `tinypress_*` 平滑讀取至 `tinysqueeze_*`（涵蓋累計省下容量、視窗記憶尺寸、主題與語言）。
  - **後端通訊協定**：註冊主協定 `tinysqueeze-thumb://`，同時保留 `tinypress-thumb://` 別名，確保任何快取或舊版請求絕不 404。
  - **暫存檔防禦與清掃**：日誌路徑升級至 `tinysqueeze/in_flight_temps.json`，冷啟動清掃器同時巡邏並清理遺留之舊版 `tinypress` 孤兒檔案。
  - **Rust crate 與套件**：更新 `Cargo.toml`（`tinysqueeze` / `tinysqueeze_lib`）、`package.json` 與 `tauri.conf.json`（`productName: "TinySqueeze"`, `identifier: "com.tinysqueeze.app"`）。

### ② 雙語系系統 (繁體中文 / English)
- **輕量零外部依賴設計**：建立 `src/i18n.ts`，採用嚴格 TypeScript 字典鍵值映射（`zh-TW` 與 `en-US`），無須引入額外大型 i18n 庫。
- **即時無縫切換**：於偏好設定抽屜提供雙語切換按鈕，全域 Zustand store 響應式觸發，標題列、快捷設定列、佇列表頭、狀態標籤、摘要彈窗均支援完整本地化。

### ③ 應用程式圖示 (App Icons) 與自適應品牌 Logo
- **原生多尺寸圖示**：依據 `scratch/icon_dark.png`，透過 Tauri 核心工具鏈產生完整平台圖示集（Windows `.ico`、macOS `.icns`、各尺寸 `.png` 與市集圖示）。
- **深淺主題自適應標題列 Logo**：
  - 深色模式：使用 `icon_light.png`（高對比白條紋＋薄荷綠切片）。
  - 淺色模式：使用 `icon_dark.png`（深黑條紋＋薄荷綠切片）。
  - 透過 Tailwind CSS 選擇器無閃爍即時切換。

---

## 5. 本地啟動與驗證指令

### 啟動開發伺服器
```powershell
# 在專案目錄執行：
npm run tauri dev
```

### 前端獨立型別檢查與打包編譯
```powershell
npm run build
```

### Rust 後端語法與單元測試
```powershell
cd src-tauri
cargo check
cargo test
```

---

## 6. 競品觀摩與技術評估：Hando 對標分析與畫質演進建議 (2026-09-29)

> **交接備忘說明**：本段落記錄針對開源專案 [Hando](https://github.com/homer-create/Hando)（Tauri 2 + Rust + Vanilla TS，作者 Homer Shie）之橫向架構對標與品質評估。本記錄旨在作為後續與同儕另一份建議共同討論、交叉評估與版本調整之依據，**核心聚焦於「畫質（Quality）」與「架構落地性」**。

### ① 總體對比矩陣 (Overview Matrix)

| 評估維度 | TinySqueeze (本專案) | Hando (對標專案) | 比較結論與定位差異 |
| :--- | :--- | :--- | :--- |
| **品質 (Quality)** | 人眼啟發式（自適應 4:4:4 採樣）＋ MozJPEG Ahumada-Watson 矩陣 ＋ 經驗檔位 | `ssimulacra2` 客觀二分搜尋 ＋ 世代損失防禦 ＋ ICC Passthrough ＋ EXIF 旋轉歸一 | **Hando 演算法深度勝出**。<br>TinySqueeze 偏向極速啟發式與文字保護；Hando 在色彩管理與二次壓縮保護上更為嚴謹。 |
| **效率與效能** | 雙通道（Fast 縮圖 / Heavy 編碼）＋ `512MB` 記憶體門禁計數器 ＋ 單次極速編碼 | 缺乏記憶體門禁水線；Auto 模式需 3~5 輪編碼＋感知評分，整體延遲顯著拉長 | **TinySqueeze 併發與穩定性勝出**。<br>TinySqueeze 保證百張 48MP 大圖不爆 RAM；Hando 缺乏記憶體預估保護。 |
| **可維護性** | React 19 ＋ Zustand ＋ Tailwind v4，UI 模組化清晰；Rust 採用高階主流 Crates | Vanilla TS 直接操作 DOM（無框架）；Rust 大量引入 C-sys 底層繫結（編譯門檻高） | **互有勝負**。<br>TinySqueeze 前端擴充與維護性遠高；Hando 具備 `docs/rubric.md`、自動化基準測試與快照測試。 |
| **UX 動線** | 80×80 WebP 即時縮圖流 ＋ 虛擬滾動 ＋ 非破壞性多模式目錄 ＋ 衝突彈窗 ＋ 結算卡片 | 僅純文字列表 ＋ 預設覆蓋原檔 ＋ 依賴系統資源回收筒一鍵 Undo | **TinySqueeze 體驗大幅勝出**。<br>TinySqueeze 提供豐富的視覺反饋與掌控感；Hando 偏極簡命令列風格。 |

---

### ② 核心技術落差與原因深析 (Deep Dive)

1. **色彩空間保真度 (ICC Profile Passthrough)**：
   - **現狀問題**：TinySqueeze 使用 `image::open` 解碼與標準編碼器輸出時，未保留原圖的 ICC 色彩設定檔。iPhone 或相機直出的 Display P3 / AdobeRGB 廣色域照片，壓縮後在部分色彩管理環境下會有微幅彩度下降（偏淡）。
   - **Hando 作法**：在解碼階段抽出 ICC（JPEG APP2 / PNG iCCP / WebP ICCP），編碼後原樣嵌回，確保 100% 廣色域不偏色。
2. **手機直拍照片方向異常 (EXIF Orientation Normalization)**：
   - **現狀問題**：直接剝除 EXIF 後，某些依賴 EXIF 標記旋轉角度（如 Tag 6）的照片可能在不支援 EXIF 的檢視器中呈現橫躺。
   - **Hando 作法**：解碼進入像素記憶體時，依據 EXIF 標籤執行物理旋轉校正（Bake orientation into pixels），使輸出圖片即使完全剝除 EXIF 也能維持正確正向。
3. **已壓縮圖檔的二次劣化 (Generation Loss)**：
   - **現狀問題**：若使用者拖入已嚴重壓縮的 JPEG（如通訊軟體壓縮過），TinySqueeze 仍會重新解碼並量化編碼，導致方塊雜訊放大。
   - **Hando 作法**：透過每像素位元率 `bpp = (bytes * 8) / (width * height)` 評估。若 `bpp < 1.0`，主動切換至 `mozjpeg-sys` 的無損 DCT 係數轉碼（`optimize_lossless`），像素 100% 不變，只做霍夫曼重排；或提高門檻杜絕劣質二度壓縮。
4. **客觀畫質指標 vs 單次編碼速度權衡**：
   - Hando 採用 `ssimulacra2` 模型二分搜尋，可自動找出符合視覺臨界點的最小檔案，但耗時增加 3~8 倍。
   - TinySqueeze 採用「自適應 4:4:4 色差抽樣 + 固定檔位」，耗時僅 0.02ms，適合大批次高效吞吐。

---

### ③ 下次回來與同儕共同評估的具體討論題綱 (Peer Review Agenda)

請於下次工作會議中，攜帶同儕的另一份建議，針對以下 5 個決策點進行交叉確認：

- [ ] **決策點 1：是否將「ICC Profile Passthrough」列為 v1.1 最高優先級實作？**
  - *實施成本*：中等（在 Rust `codecs.rs` 讀取 APP2 / iCCP 標記並重嵌）。
  - *預期收益*：徹底根絕專業相片偏色問題，畫質保真度邁向商業級。
- [ ] **決策點 2：EXIF 旋轉歸一化（Orientation Normalization）納入解碼管線**
  - *實施成本*：低（在 `pipeline.rs` 解碼後依據 EXIF 標籤轉正 raw 像素）。
  - *預期收益*：消除手機直拍照片旋轉異常的邊界 Bug。
- [ ] **決策點 3：是否引入低 bpp 判定與「防二次重壓保護」？**
  - *討論重點*：當偵測到圖檔 `bpp < 0.8` 時，是在 UI 上提示「已為高壓縮檔案，建議保留原檔」，或是後端自動退回無損轉碼？
- [ ] **決策點 4：畫質評判閉環的定位取捨（保持極速 vs 引入 Auto 搜尋）**
  - *取捨評估*：是否需要額外新增一個可選的「自動感知模式 (Auto Mode)」，還是維持目前「五段磁吸滑桿 + 4:4:4 啟發式」以維持極限吞吐速度？
- [x] **決策點 5：落盤機制評估（維持目錄選擇 vs 引入資源回收筒 Undo）**
  - *討論重點*：TinySqueeze 現有的「非破壞性多模式（同目錄/子目錄/自訂）+ 衝突彈窗」對日常辦公非常直覺安全；是否有必要借鑒 Hando 的 `trash` crate 支援原地覆蓋時的 Undo？

---

## 7. v1.3 里程碑落地完成紀錄 (2026-09-30)

經 3 輪嚴格詰辯與壓力測試後，已全面落實 PRD v1.3 核心架構與 UX 改造：

### ① 後端並發與管線穩定性 (R-01, R-03, R-05, E-03)
- **並發死鎖徹底解除 (R-05)**：
  - 重構 `pipeline.rs` 之 `plan_output` 純函數，將衝突檢測移至解碼前（Pre-decode）。
  - 當遇到同名衝突且策略為 `ask` 時，在等待前端決策（`rx.await`）期間**絕不佔用 Worker 與 Memory Permits**，杜絕並發任務卡死佇列。
- **終態跳過狀態規範 (R-01)**：
  - 新增 `skipped` 狀態與 `task_skipped` 事件，涵蓋 `strategy_skip`、`user_skip`、`no_gain`、`conflict_timeout`，釋放記憶體且不計入錯誤。
- **純 Rust EXIF 方向正規化 (R-03)**：
  - 實作無外部 C 依賴的 JPEG APP1 TIFF Orientation 解析器，將手機直拍相片於記憶體中物理旋轉正向，輸出後完全移除 EXIF 仍能保證正向。
- **舊名稱清理 (E-03)**：
  - 清理所有遺留之 `tinypress` 代碼、自訂協定與本機快取 Key。

### ② 前端與使用者體驗升級 (U-01 ~ U-10)
- **非阻塞式 Sticky ResultBar (U-02)**：
  - 移除原先阻擋操作的 Modal 彈窗，改為置頂常駐結果列，即時展示完成數、節省容量、失敗數、單一目錄開啟資料夾、以及「僅看失敗」一鍵過濾。
- **原生檔案與目錄選擇對話框 (U-03, U-09)**：
  - 整合 `@tauri-apps/plugin-dialog`，修復 Windows WebView2 瀏覽器原生 `<input type="file">` 缺少路徑之問題。
- **真實階段反饋 (U-05)**：
  - 透過 `task_stage` 廣播「解碼中」、「壓縮中」、「寫入中」，超過 10s 自動顯示經過時間。
- **視窗關閉防禦 (U-06) 與按鈕語意 (U-07)**：
  - 處理中關閉視窗強制跳出確認；處理中 Header 按鈕明確切換為「取消全部 (Esc)」。
- **累積節省數據重置 (U-08)**：
  - 種子值自 0 起算，支援增量重新處理防重複計算。
- **無障礙對比標準與動態模式 (U-10)**：
  - 深淺色主題全體文字達到 WCAG AA 4.5:1 對比門檻，主按鈕確保高對比文字，完整支援 `@media (prefers-reduced-motion: reduce)`。

### ③ 驗證結果
- `npm run build`：0 錯誤，0 警告，類型檢查與 Vite 打包完全通過。
- `cargo test`：4/4 單元測試全部通過（`test_webp_roundtrip`, `test_plan_output_same_dir`, `test_exif_orientation_parser`, `test_scan_paths_dir`）。

### ④ 穩定度與無障礙精修 (v1.3.1 Refinements)
- **淺色主題綠底按鈕**：改用 `#056547` 搭配純白文字（`#ffffff`），對比度達 **7.14:1**（符合 WCAG AAA）。
- **佇列控制按鈕統一**：「取消全部」移至中央緊鄰「暫停」按鈕，高度、細外框、微圓角全面對齊，右側動作區在處理中時維持簡潔。
- **視窗頂部崩潰與跳動根除**：移除 `<header>` 上與 Windows 原生 `data-tauri-drag-region` 衝突的 JS `start_dragging` 與雙擊最大化 IPC，完全由 Windows OS 原生處理，徹底消除 Win32 訊息重入引發之 Panic 與閃退。
- **資料夾拖曳強化與 AVIF 警示**：`scan_paths` 結構化回傳圖檔總數、`.avif` 數量與未支援數量；新增非阻塞頂部 `<Toast />`，拖入 `.avif` 或空目錄時即時提示，絕不靜默失效。
- **AVIF 輸出定位全站對齊**：於 `README.md`、`EmptyState.tsx` 與多國語系字串同步澄清「AVIF 僅支援輸出，不支援輸入」。
- **側邊欄與結算列滑動進出動畫**：`SettingsDrawer` 與 `ResultBar` 升級為常駐平滑 transition，實現真正的 Slide-in 與 Slide-out 自然收合。

### ⑤ 「取消全部」深度修復與 Tauri 版本對齊 (v1.3.2 Fixes)
- **「取消全部」無效之根本原因分析**：
  1. **後端靜默退出**：`pipeline.rs` 原先在檢測到 `cancelled_tasks` 時直接 `return;`，未發送任何 `task_skipped` 事件給前端，導致前端永遠無法得知任務已被取消。
  2. **前端狀態缺乏轉換**：`Header.tsx` 僅透過 `invoke("cancel_task")` 呼叫後端，未同步將 Zustand 中的任務狀態自 `processing` / `pending` 變更為 `skipped`，因此 `isProcessing` 永遠維持 `true`，介面看起來宛如凍結毫無反應。
  3. **暫停與並發死鎖**：若使用者在暫停中或任務正等待 worker permit 時點擊取消全部，worker 卡在等待訊號，無法抵達取消檢查點。
- **具體解決方案**：
  1. **後端原子批次取消 (`cancel_batch`)**：
     - 在 `PipelineState` 增加 `pub is_cancelled: Arc<AtomicBool>`。
     - 在佇列暫停等待、獲取信號量前後、以及落盤寫入前設置四重檢查點；若檢測到全域取消，直接中止並發出 `task_skipped (reason: "user_cancel")`，且 RAII `TempFileGuard` 自動清除在途暫存檔。
     - 實作 `cancel_batch` 指令，將 `is_cancelled` 設為 true、解除暫停狀態、喚醒所有等待 worker 並排空等待中的衝突決策頻道。
  2. **前端即時狀態轉換與反饋**：
     - 在 `src/store.ts` 實作 `cancelAll`：瞬間將所有處理中、等待中與衝突中的任務狀態重設為 `skipped`，清除處理旗標並彈出提示 Toast（「已取消所有處理中任務」），達到零延遲即時 UI 響應。
     - 在 `TaskRow.tsx` 支援 `user_cancel` 顯示為「使用者取消」。
  3. **Tauri NPM 與 Cargo 套件版本對齊**：
     - 修正 `package.json`：將 `@tauri-apps/api` 鎖定為 `~2.11.0`（解析為 `2.11.1`，對應 Rust `tauri 2.11.6`）；將 `@tauri-apps/plugin-dialog` 鎖定為 `~2.7.0`（解析為 `2.7.3`，精準匹配 Rust `tauri-plugin-dialog 2.7.3`）。
     - 完全根除 `tauri info` 與編譯時之 `version mismatched Tauri packages` 警示。
- **驗證**：
  - `npm run build` 通過（0 錯誤）。
  - `cargo test --lib` 5/5 測試通過（含新增之 `test_cancel_batch_state`）。
  - `tauri info` 檢查無任何版本不相容警告。

### ⑥ UX 極簡去噪與佇列控制收斂 (v1.3.3 Refinements)
- **空狀態「累計節省」徹底移除**：
  - 移除 `EmptyState.tsx` 右下角之「累計節省」文字與數值展示，將空狀態還原為純粹的拖曳引導與按鈕選取工作區。
  - 清理 `store.ts` 中 `cumulativeSavedBytes` 的狀態宣告、localStorage 存取與計算邏輯。
- **佇列控制簡化：廢除「暫停/繼續」，專注「取消全部 (Esc)」**：
  - 圖檔壓縮時間短（毫秒級），原生 C/Rust 編碼執行緒無法無損掛起；使用者真實需求皆為「立即煞車」或「改設定重新開始」。
  - 移除 Header 中的「暫停/繼續」切換按鈕，處理中控制區僅保留一顆清晰的「取消全部 (Esc)」按鈕。
  - 在 `useKeyboardStack.ts` 擴充全域 `Escape` 快捷鍵支援：處理中按 Esc 鍵直接觸發 `cancelAll()`。
- **Toast 提示噪音清理（遵循 Rule of Silence）**：
  - 移除「已取消所有處理中任務」、「所選圖片皆已在處理中佇列內」、「已匯入 X 張圖片...」等成功型過渡 Toast，介面本身的狀態列與即時轉化已能清晰傳遞結果。
  - 僅保留真正無上下文時的阻斷型防禦警示：「未發現支援的圖片檔案（全空或無有效副檔名）」與「純 AVIF 拖入警示」。
- **驗證**：
  - `npm run build` 通過（0 錯誤）。
  - `cargo test --lib` 5/5 測試通過。