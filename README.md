<div align="center">

<img src="assets/icon_dark.png" alt="TinySqueeze Logo" width="96" height="96" />

# TinySqueeze

**極致輕量、本機離線的高效能批次圖片壓縮與轉檔工具**  
*A lightweight, privacy-first desktop tool for batch image compression and format conversion.*

[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-orange?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-cyan?logo=react)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![AI Powered](https://img.shields.io/badge/AI%20Implemented-Gemini%203.8%20Flash-4285F4?logo=google)](https://deepmind.google/technologies/gemini/)

</div>

---

## 📷 介面預覽 (Preview)

> 💡 *歡迎將應用程式截圖命名為 `preview.png` 置於 `assets/` 資料夾中以展示介面。*

<div align="center">
  <img src="assets/preview.png" alt="TinySqueeze Interface Preview" width="760" onerror="this.src='assets/icon_dark.png'; this.width=160;" />
</div>

---

## 💬 作者碎碎唸 (Author's Notes)

> 這個專案就是個實驗，原先用 tinyjpg 這類服務，但想到 AI 也許也能做個簡單快速的版本，就陸陸續續架構出來。其實也是有利用 API 套 GUI 的現成項目，但既然動手的成本不高，那就來試試吧～
>
> *This project started as an experiment. I used to rely on services like TinyJPG, but wondered if modern AI could help construct a fast, self-contained desktop tool from scratch. While there are existing wrappers connecting to online APIs, building a native, zero-cost local version was surprisingly approachable—so why not give it a shot?*

---

## 🤖 AI 參與揭露 (AI Transparency & Disclosure)

> **本專案程式全程使用 Google Gemini 3.8 Flash (High) 實做，並由作者本人構思專案方向、審核 UI/UX、製作 icon。**
>
> *This project was implemented end-to-end with Google Gemini 3.8 Flash (High). The concept, product direction, UI/UX design review, and original app icons were created and directed by the author.*

---

## ✨ 核心特色與技術專門 (Key Features)

TinySqueeze 沒有繁複的花俏功能，專注於提供**極致輕快、安全無損**的看圖與壓縮體驗：

### 🔒 1. 本機原生運行，零隱私洩漏
- 所有圖片解碼與編碼皆在使用者本機電腦原生由 Rust 核心計算。
- **無任何網路請求、不依賴外部 Python/Node.js 環境、無第三方雲端 API 額度限制**，個人敏感照片與商業設計稿完全私密。

### 🎯 2. MozJPEG 感知量化與自適應採樣
- **告別字緣發虛**：傳統壓縮工具預設強加 4:2:0 色度降採樣，造成含文字、線條或 UI 截圖邊緣嚴重滲色。
- TinySqueeze 採用感知量化矩陣（Ahumada-Watson 演算法）與動態 4:4:4 色度保留策略，以極高的體積削減率達成媲美或超越 TinyJPG 的文字銳利度。

### ⚡ 3. 雙通道管線架構與記憶體水線
- **Fast Lane（極速通道）**：拖入檔案即刻在非同步背景執行緒抽取輕量 80×80 WebP 縮圖，即時寫入記憶體 DashMap 快取，毫秒級渲染清單。
- **Heavy Lane（編碼通道）**：根據實體 CPU 核心動態排程工作執行緒，配合 `512MB` 記憶體門禁計數器（Semaphore）與 1.8x 安全係數，一次拖入數百張大圖亦不卡死系統或耗盡記憶體。

### 🛡️ 4. 負向膨脹防禦與真無損支援
- **100% 純數學無損 WebP**：當品質設定為 100% 時，WebP 自動啟動真無損編碼通道（Lossless WebP）。
- **反向膨脹防禦**：若壓縮後體積因演算法邊界情況反而大於原檔，管線自動保留原檔（維持原檔狀態），絕不產生反向肥大的檔案。

### 💾 5. 原子落盤與孤兒暫存防禦
- 採用 `.image.tinysqueeze_tmp_{uuid}` 寫入後原地原子替換（Atomic Rename），避免寫入中途遭中斷導致原檔損毀。
- 搭載 Rust RAII Scope Guard 與冷啟動清掃機制，即使程式異常中斷或強制斷電，孤兒暫存檔亦會在下次啟動時被自動回收。

### 🌓 6. 原生深淺雙色與雙語系支援
- 提供專為看圖與色彩敏感度打造的暗色工具介面（Dark-first），同時支援淺色模式與即時繁體中文 / 英文（zh-TW / en-US）切換。
- 支援完整無邊框原生拖曳、雙擊最大化/還原、視窗記憶尺寸、即時暫停/繼續與佇列衝突決策。

---

## 📦 支援格式 (Supported Formats)

| 格式 | 解碼輸入 (Input) | 編碼輸出 (Output) | 特色說明 |
| :---: | :---: | :---: | :--- |
| **JPEG / JPG** | ✅ | ✅ | MozJPEG 感知量化、自適應 4:4:4 色度採樣 |
| **PNG** | ✅ | ✅ | oxipng 並發濾鏡優化、色彩量化 (imagequant) |
| **WebP** | ✅ | ✅ | 支援一般有損壓縮與 100% 純數學無損編碼 |
| **AVIF** | ✅ | ✅ | ravif 高壓縮比次世代格式支援 |
| **原格式 (Original)** | — | ✅ | 自動沿用原圖副檔名並進行高效瘦身 |

---

## 🛠️ 開發與本地建置 (Development & Build)

### 前置需求 (Prerequisites)
1. **Node.js** (建議 v18 或更新版本)
2. **Rust & Cargo** (建議 1.78 或更新版本，支援 2021 edition)
3. 平台相關之 C++ 編譯建置工具（Windows 請安裝 Visual Studio Build Tools C++ 工作負載）

### 1. 複製專案與安裝前端相依性
```bash
git clone https://github.com/<your-username>/tinysqueeze.git
cd tinysqueeze
npm install
```

### 2. 啟動本機開發模式 (Hot-Reload)
```bash
npm run tauri dev
```

### 3. 建置生產發行版 (Production Build)
```bash
npm run tauri build
```
編譯完成後，執行檔將位於 `src-tauri/target/release/`（Windows 為 `TinySqueeze.exe` 與 `.msi` 安裝包）。

---

## 📄 開源授權 (License)

本專案基於 [MIT License](LICENSE) 條款開源發布。
