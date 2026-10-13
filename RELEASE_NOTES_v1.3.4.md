## 🚀 What's New in v1.3.4

TinySqueeze v1.3.4 introduces persistent preference memory across application sessions, empty filename suffix support, a smart "Reset All Defaults" action with in-situ micro-feedback, and polished localization terminology.

### 🌟 Key Highlights & Improvements

1. **💾 Persistent Sticky Preferences (Automatic Preference Memory)**
   - All compression and workflow configurations—including custom filename suffix, file conflict strategy, destination directory mode, custom folder path, target format, quality, and metadata stripping—are now automatically persisted to local storage.
   - TinySqueeze seamlessly remembers and applies your last adjusted preferences on subsequent launches or when ingesting new batches, with safe fallback to factory defaults.

2. **🏷️ Empty Filename Suffix Support**
   - The filename suffix setting now explicitly allows an empty string (`""`), enabling users to output files directly under their original filenames. File collisions are smoothly resolved by your chosen conflict strategy.
   - Real-time preview updates dynamically (`photo.jpg → photo.jpg`).

3. **🔄 "Reset All Defaults" with In-Situ Micro-Feedback**
   - Added a clean, unified "Reset" module at the bottom of the Settings Drawer matching the layout of the language and appearance controls.
   - **Dirty State Awareness**: The button is automatically disabled when settings are already at default values, serving as an instant visual status indicator.
   - **Zero Eye-Jump Feedback**: Clicking the button instantly restores defaults and smoothly fades in a subtle green checkmark (`✓ Defaults restored`) right beside the button without distracting popups.

4. **🇹🇼 Localization & Technical Terminology Polish**
   - Refined documentation and code comments to adhere to standard Taiwanese technical terminology, adopting natural expressions such as "安全原子寫入" (Atomic Write) and "寫入磁碟" (Write to Disk).

---

### 📦 Download & Release Files

| File | Description | Target | SHA-256 Checksum |
| :--- | :--- | :--- | :--- |
| **`TinySqueeze_1.3.4_x64-setup.exe`** | NSIS Setup Installer (Recommended) | Windows 10 / 11 (x64) | `B10C7D228A6ACC90706D3D554BE124FE0D1EB87C14C7B9E8A9AE7FCC221ECD0B` |
| **`TinySqueeze_1.3.4_x64_en-US.msi`** | WiX MSI Installer | Windows 10 / 11 (x64) | `7FB5F7A354B98FF561EAAA708F57A3CC4F33FC2D80E77E01102251CA075BABB1` |
| **`TinySqueeze_v1.3.4_x64_portable.zip`** | Portable Archive (Extract & Run) | Windows 10 / 11 (x64) | `0EF5B7779BFBD75A5ABED8A84679F08D71261666287134CED8E3CD7430E6904C` |
| **`TinySqueeze.exe`** | Standalone Executable (Zero install) | Windows 10 / 11 (x64) | `C2CBA21542473204D7C4D3320B4565B0DA736082920A02391362EE7614749A08` |

> **Note on Windows SmartScreen**: As an open-source project without a paid EV code-signing certificate, Windows SmartScreen may show a warning on first launch. Click **More info** -> **Run anyway** to proceed.

---

## 🚀 v1.3.4 更新日誌

TinySqueeze v1.3.4 帶來了全域偏好設定自動記憶持久化、新檔名尾綴支援空字串保留、設定抽屜「還原設定」智慧按鈕與原處即時微反饋，並進行了繁體中文技術用語在地化修訂。

### 🌟 核心更新與改進項目

1. **💾 全域偏好設定自動記憶（Sticky Preferences）**
   - 所有的壓縮與流程偏好（包含新檔名尾綴、同檔名衝突策略、輸出路徑模式、自訂目錄路徑、輸出格式、壓縮品質、抹除中繼資料）均會自動持久化儲存至本機。
   - 下次重新啟動應用程式或加入新圖檔時，自動沿用最後一次調整的結果，無需重複手動調整。

2. **🏷️ 新檔名尾綴支援空字串保留**
   - 檔名後綴輸入框正式支援保留空字串（`""`），允許輸出直接維持原檔名（同名檔案由使用者選定之衝突策略自然處理）。
   - 即時預覽文字即時反映 `photo.jpg → photo.jpg`。

3. **🔄 「還原設定」模組與原處即時微反饋**
   - 於設定抽屜底部新增「還原設定」模組，排版風格與介面語系、介面外觀保持一致節奏。
   - **狀態感知（Dirty State）**：當前所有設定若已為預設值，按鈕自動呈現禁用態（`disabled`），作為直觀的「已處於出廠預設」指示器。
   - **視線零跳轉反饋**：點擊「恢復全域預設值」後，按鈕轉為禁用，右側原處淡入微型綠色勾勾 `✓ 已恢復預設`（2 秒後自然淡出），完全不遮擋畫面且無彈窗干擾。

4. **🇹🇼 技術用語在地化修訂**
   - 全面檢視並修正文件與程式註解，將「落盤」修訂為臺灣標準技術語境之「安全原子寫入」與「寫入磁碟」。

---

### 📦 下載與安裝檔案

| 檔案名稱 | 說明 | 適用環境 | SHA-256 校驗碼 |
| :--- | :--- | :--- | :--- |
| **`TinySqueeze_1.3.4_x64-setup.exe`** | NSIS 安裝程式（推薦） | Windows 10 / 11 (64 位元) | `B10C7D228A6ACC90706D3D554BE124FE0D1EB87C14C7B9E8A9AE7FCC221ECD0B` |
| **`TinySqueeze_1.3.4_x64_en-US.msi`** | WiX MSI 企業安裝檔 | Windows 10 / 11 (64 位元) | `7FB5F7A354B98FF561EAAA708F57A3CC4F33FC2D80E77E01102251CA075BABB1` |
| **`TinySqueeze_v1.3.4_x64_portable.zip`** | 免安裝可攜壓縮包（解壓即用） | Windows 10 / 11 (64 位元) | `0EF5B7779BFBD75A5ABED8A84679F08D71261666287134CED8E3CD7430E6904C` |
| **`TinySqueeze.exe`** | 獨立執行檔（免安裝單一檔案） | Windows 10 / 11 (64 位元) | `C2CBA21542473204D7C4D3320B4565B0DA736082920A02391362EE7614749A08` |

> **Windows SmartScreen 提示說明**：本專案為開源軟體，未購買昂貴之微軟商業簽章憑證。若首次啟動時系統彈出防護提示，請點擊「其他資訊」並選擇「仍要執行」即可正常啟動。
