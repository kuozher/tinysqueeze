# TinySqueeze v1.3.3 Release Notes

[English](#english) • [繁體中文](#繁體中文)

---

<a name="english"></a>
## 🚀 What's New in v1.3.3

TinySqueeze v1.3.3 introduces major usability refinements, visual polish, robust file conflict resolution, and architectural optimizations to deliver the smoothest native image compression experience on Windows.

### 🌟 Key Highlights & Improvements

1. **🧭 EXIF Orientation Auto-Correction**
   - Automatically inspects EXIF orientation tags before stripping metadata.
   - Accurately rotates photos taken from smartphones and digital cameras to their upright position before encoding, preventing sideways or upside-down output images.

2. **⚡ Instant Thumbnail Delivery (Fixed WebView2 Restriction)**
   - Switched from internal scheme resolution to high-performance Base64 Data URL streaming (`data:image/webp;base64,...`).
   - Completely resolves the issue where thumbnails were blocked by Windows WebView2 sandbox security policies, ensuring instant 80×80 WebP thumbnail previews directly in the queue.

3. **📊 Non-blocking Sticky Result Bar**
   - Replaced intrusive modal dialogs with a sleek sticky result bar that slides in smoothly from the top upon batch settlement.
   - Shows total files completed, disk space saved (in MB/GB and percentage), skipped count, and failure count.
   - Includes a quick **"Failed Only"** toggle to isolate errors and a direct **"Open Folder"** shortcut to the destination folder.

4. **🛑 Atomic "Cancel All" with Zero Temp-File Leak**
   - Redesigned task cancellation to be instantaneous and clean.
   - Seamlessly aborts all active worker threads and immediately purges `.image.tinysqueeze_tmp_*` temporary files.

5. **🎨 WCAG AAA Light Mode & UI Aesthetics**
   - Polished light mode colors to achieve full WCAG AAA contrast ratio compliance (`#056547` solid forest green buttons with crisp white typography).
   - Uniform border styling and aligned heights between the "Cancel All" and queue control buttons.
   - Added smooth sliding animations for the settings drawer and result bar.

6. **📁 Enhanced Folder Drag-and-Drop & AVIF Format Guidance**
   - Fully supports dragging nested folders directly into the app window, with recursive image discovery.
   - Clarified format support: TinySqueeze supports high-efficiency **AVIF encoding output**, but does not support AVIF decoding input. Clear, non-intrusive warnings are displayed if unsupported source files are ingested.

7. **🌐 100% Bilingual Localization Parity**
   - Every single component, toast alert, dialog, and action prompt is fully translated in both Traditional Chinese (`zh-TW`) and English (`en-US`).
   - Switch languages on the fly in the Settings Drawer without restarting the app.

---

### 📦 Download & Release Files

| File | Description | Target | SHA-256 Checksum |
| :--- | :--- | :--- | :--- |
| **`TinySqueeze_1.3.3_x64-setup.exe`** | NSIS Setup Installer (Recommended) | Windows 10 / 11 (x64) | `B82DC2DE793F0B1135A1D83811C1BC43F5135D5FF152668018C23C7F4E00DEB5` |
| **`TinySqueeze_1.3.3_x64_en-US.msi`** | WiX MSI Installer | Windows 10 / 11 (x64) | `003457A74B88B9802F927C3863501F5B56B39863F046506BD6D7E312F24CB182` |
| **`TinySqueeze_v1.3.3_x64_portable.zip`** | Portable Archive (Extract & Run) | Windows 10 / 11 (x64) | `4BA7217217838F02454D63F8A3D1C3FFE5F1E8B47FB8022E1732E07D8C993C63` |
| **`TinySqueeze.exe`** | Standalone Executable (Zero install) | Windows 10 / 11 (x64) | `7C7703F8C9C1C5CA224114C5D5B113FA72CA23901F43BC01A5FFCA25606BE92C` |

> **Note on Windows SmartScreen**: As an open-source project without a paid EV code-signing certificate, Windows SmartScreen may show a warning. Click **More info** -> **Run anyway** to proceed.

---

<a name="繁體中文"></a>
## 🚀 v1.3.3 更新日誌

TinySqueeze v1.3.3 帶來了全面的使用體驗升級、介面精修、檔案衝突管理與底層架構強化，致力於提供 Windows 平台上最輕巧流暢的原生圖片壓縮轉檔體驗。

### 🌟 核心更新與改進項目

1. **🧭 EXIF 方向自動旋轉導正**
   - 在抹除中繼資料以保護隱私前，自動解析數位相機與智慧型手機拍攝之 EXIF 旋轉標記並物理轉正像素。
   - 徹底解決直式拍攝照片壓縮後方向錯誤或顛倒的問題。

2. **⚡ 即時縮圖串流渲染（修復 WebView2 沙盒阻擋）**
   - 全面改採高效能 Base64 Data URL 直接傳遞 80×80 WebP 縮圖（`data:image/webp;base64,...`）。
   - 徹底排除 Windows WebView2 自訂通訊協定跨網域安全性限制所導致的縮圖破圖與回退文字問題，佇列一加入即刻毫秒級顯示實體縮圖。

3. **📊 頂部非阻塞滑動結算條**
   - 捨棄阻礙操作的置中彈窗，改採具備流暢進出滑動動效的頂部結算條。
   - 一目了然呈現總完成張數、節省體積（MB/GB 與百分比）、略過項目與失敗張數。
   - 支援「僅看失敗」一鍵篩選功能與「開啟資料夾」捷徑按鈕。

4. **🛑 「取消全部」即時終止與暫存清掃**
   - 重構任務中止邏輯，支援「取消全部」立即中斷所有背景並發執行緒。
   - 嚴格清掃未完成之 `.image.tinysqueeze_tmp_*` 暫存檔，確保磁碟空間零污染。

5. **🎨 淺色模式 WCAG AAA 對比度與介面精修**
   - 綠色底按鈕全面採用高對比度 `#056547` 搭配純白字體，完全符合 WCAG AAA 無障礙規範。
   - 統一頂部「取消全部」與控制項之外框高度與間距樣式。
   - 設定側邊欄與結算條均具備平滑進出動態過渡。

6. **📁 強化資料夾拖曳支援與 AVIF 輸出說明**
   - 支援將深層嵌套的檔案夾直接拖曳至視窗中，自動遞迴掃描所有支援圖檔。
   - 明確標示格式規範：TinySqueeze 支援次世代 **AVIF 編碼輸出**，但不支援作為輸入來源圖檔解碼；若拖入不支援檔案將給予清晰提示。

7. **🌐 100% 完整雙語系支援**
   - 全介面（包含側欄、對話框、狀態提示、按鈕及結算條）達成繁體中文 (`zh-TW`) 與 English (`en-US`) 完整對應。
   - 於設定側欄隨選即切，無需重啟程式。

---

### 📦 下載與安裝檔案

| 檔案名稱 | 說明 | 適用環境 | SHA-256 校驗碼 |
| :--- | :--- | :--- | :--- |
| **`TinySqueeze_1.3.3_x64-setup.exe`** | NSIS 安裝程式（推薦） | Windows 10 / 11 (64 位元) | `B82DC2DE793F0B1135A1D83811C1BC43F5135D5FF152668018C23C7F4E00DEB5` |
| **`TinySqueeze_1.3.3_x64_en-US.msi`** | WiX MSI 企業安裝檔 | Windows 10 / 11 (64 位元) | `003457A74B88B9802F927C3863501F5B56B39863F046506BD6D7E312F24CB182` |
| **`TinySqueeze_v1.3.3_x64_portable.zip`** | 免安裝可攜壓縮包（解壓即用） | Windows 10 / 11 (64 位元) | `4BA7217217838F02454D63F8A3D1C3FFE5F1E8B47FB8022E1732E07D8C993C63` |
| **`TinySqueeze.exe`** | 獨立執行檔（免安裝單一檔案） | Windows 10 / 11 (64 位元) | `7C7703F8C9C1C5CA224114C5D5B113FA72CA23901F43BC01A5FFCA25606BE92C` |

> **Windows SmartScreen 提示說明**：本專案為開源軟體，未購買昂貴之微軟商業簽章憑證。若系統彈出提示，請點擊「其他資訊」並選擇「仍要執行」即可正常啟動。
