<div align="center">

<img src="assets/icon_dark.png" alt="TinySqueeze Logo" width="96" height="96" />

# TinySqueeze

**A lightweight, privacy-first desktop tool for batch image compression and format conversion.**  
**極致輕量、本機離線的高效能批次圖片壓縮與轉檔工具**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-orange?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-cyan?logo=react)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![AI Powered](https://img.shields.io/badge/AI%20Implemented-Gemini%203.8%20Flash-4285F4?logo=google)](https://deepmind.google/technologies/gemini/)

[English](#english) • [繁體中文](#繁體中文)

</div>

---

<a name="english"></a>
# English

## 📷 Interface Preview

| 1. Standby & Dropzone | 2. Live Compression Queue | 3. Batch Summary Modal |
| :---: | :---: | :---: |
| <img src="assets/screenshot_01.png" alt="Standby & Dropzone" width="280" /> | <img src="assets/screenshot_02.png" alt="Compression Queue" width="280" /> | <img src="assets/screenshot_03.png" alt="Summary Modal" width="280" /> |

---

## 💬 Author's Note

> *This project started as an experiment. I used to rely on services like TinyJPG, but wondered if modern AI could help construct a fast, self-contained desktop tool from scratch. While there are existing wrappers connecting to online APIs, building a native, zero-cost local version was surprisingly approachable—so why not give it a shot?*

---

## 🤖 AI Transparency & Disclosure

> **This project was implemented end-to-end with Google Gemini 3.8 Flash (High). The concept, product direction, UI/UX design review, and original app icons were created and directed by the author.**

---

## ✨ Key Features & Technical Highlights

TinySqueeze focuses on pure speed, visual quality, and rock-solid stability without unnecessary bloat:

- **🔒 100% Local & Privacy-First**:
  All encoding and decoding happen entirely on your device via native Rust cores. No network calls, no cloud servers, no API quotas or subscription fees. Your private photos and sensitive commercial graphics never leave your computer.
- **🎯 MozJPEG Perceptual Quantization & 4:4:4 Chroma Subsampling**:
  Traditional encoders default to aggressive 4:2:0 subsampling, causing blurry edges and bleeding on UI screenshots, graphics, and text. TinySqueeze uses perceptual quantization matrices (Ahumada-Watson) and preserves 4:4:4 chroma where needed, matching or surpassing TinyJPG's text crispness.
- **⚡ Dual-Lane Pipeline Architecture**:
  - **Fast Lane**: Extracts 80×80 WebP thumbnails in async background threads, cached in DashMap memory for instant zero-latency UI rendering.
  - **Heavy Lane**: Scales workers dynamically based on CPU core count, governed by a `512MB` memory semaphore. Queueing hundreds of multi-megapixel images will never freeze the system or cause out-of-memory crashes.
- **🛡️ Anti-Bloat Guard & 100% Lossless Mode**:
  - Selecting `100%` quality triggers true mathematical lossless encoding for WebP.
  - If a compressed file ends up larger than the original due to edge-case noise, the pipeline automatically keeps the original file.
- **💾 Atomic Writes & RAII Temp Sweep**:
  Encodes to `.image.tinysqueeze_tmp_{uuid}` temporary files first and atomically renames them upon success. Crash-resilient RAII guards and cold-startup sweepers ensure zero orphaned temp files.
- **🌓 Native Dark/Light Themes & Bilingual UI**:
  Designed with a dark-first tool aesthetic (`#121314`) to protect image viewing clarity. Supports one-click switching to light mode and instant bilingual toggling between Traditional Chinese and English.

---

## 📦 Supported Formats

| Format | Decoding (Input) | Encoding (Output) | Highlights |
| :---: | :---: | :---: | :--- |
| **JPEG / JPG** | ✅ | ✅ | MozJPEG perceptual quantization, adaptive 4:4:4 chroma |
| **PNG** | ✅ | ✅ | oxipng parallel filters, imagequant color quantization |
| **WebP** | ✅ | ✅ | Lossy compression & 100% pure mathematical lossless |
| **AVIF** | ✅ | ✅ | High-efficiency next-gen compression via ravif |
| **Original** | — | ✅ | Preserves original extension while slimming file size |

---

## 📥 Installation & Windows Security Notice

### Windows Installer (.msi / .exe)
You can download the pre-compiled installer from GitHub Releases or build it from source.

> [!NOTE]
> **Windows SmartScreen Notice**:  
> Because TinySqueeze is a free, open-source project without a paid commercial EV Code Signing Certificate, Windows Defender SmartScreen may display a warning:
> *"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."*  
> **How to proceed:**
> 1. Click **More info** (*其他資訊*).
> 2. Click **Run anyway** (*仍要執行*).  
> The entire codebase is open-source under the MIT license, completely transparent, and safe to inspect.

---

## 🛠️ Building from Source

### Prerequisites
1. **Node.js** (v18+ recommended)
2. **Rust & Cargo** (v1.78+ recommended, 2021 edition)
3. C++ Build Tools (e.g. Visual Studio Build Tools with C++ workload on Windows)

```bash
# Clone the repository
git clone https://github.com/<your-username>/tinysqueeze.git
cd tinysqueeze

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev

# Build production bundle (.exe / .msi)
npm run tauri build
```

---

<a name="繁體中文"></a>
# 繁體中文

## 📷 介面預覽

| 1. 待機拖曳區 | 2. 轉檔佇列與平滑進度 | 3. 結算摘要彈窗 |
| :---: | :---: | :---: |
| <img src="assets/screenshot_01.png" alt="待機拖曳區" width="280" /> | <img src="assets/screenshot_02.png" alt="轉檔佇列" width="280" /> | <img src="assets/screenshot_03.png" alt="結算摘要" width="280" /> |

---

## 💬 作者碎碎唸

> 這個專案就是個實驗，原先用 tinyjpg 這類服務，但想到 AI 也許也能做個簡單快速的版本，就陸陸續續架構出來。其實也是有利用 API 套 GUI 的現成項目，但既然動手的成本不高，那就來試試吧～

---

## 🤖 AI 參與揭露

> **本專案程式全程使用 Google Gemini 3.8 Flash (High) 實做，並由作者本人構思專案方向、審核 UI/UX、製作 icon。**

---

## ✨ 核心特色與技術專門

TinySqueeze 專注於極致輕快、安全無損的本機圖片壓縮與格式轉換體驗：

- **🔒 100% 本機原生運行，零隱私洩漏**：
  所有編解碼皆由 Rust 本機核心原生運算。無任何網路請求、不依賴外部 Python/Node.js runtime、無雲端 API 額度限制，商業設計稿與敏感照片絕不上雲。
- **🎯 MozJPEG 感知量化與自適應採樣（對標 TinyJPG 銳利度）**：
  傳統工具預設強制 4:2:0 色度降採樣，造成文字邊緣模糊發虛與色彩滲透。TinySqueeze 整合 Ahumada-Watson 感知量化矩陣與自適應 4:4:4 色度採樣，在大幅瘦身同時維持細緻文字線條。
- **⚡ 雙通道管線架構與記憶體水線**：
  - **Fast Lane（極速通道）**：拖入檔案即刻由非同步背景執行緒抽取輕量 80×80 WebP 縮圖並寫入 DashMap 快取，毫秒級顯示清單。
  - **Heavy Lane（編碼通道）**：動態依 CPU 核心分配編碼執行緒，並受 `512MB` 記憶體門禁計數器（Semaphore）保護，百張大圖同時拖入不爆記憶體。
- **🛡️ 負向膨脹防禦與 100% 真無損**：
  - 當品質拉至 100% 時，WebP 自動啟動純數學無損編碼。
  - 若壓縮後體積反向膨脹，管線自動維持原檔輸出，杜絕越壓越大的情況。
- **💾 原子落盤與孤兒暫存防禦**：
  採暫存檔寫入後原子替換（Atomic Rename），避免寫入中途遭中斷損壞原檔；搭配 RAII Guard 與冷啟動清掃器，程式斷電重開亦能自動回收孤兒檔案。
- **🌓 原生深淺雙色與雙語系支援**：
  低彩度暗色專業工具介面，並支援淺色模式與繁體中文 / English 即時切換。

---

## 📦 支援格式

| 格式 | 解碼輸入 (Input) | 編碼輸出 (Output) | 特色說明 |
| :---: | :---: | :---: | :--- |
| **JPEG / JPG** | ✅ | ✅ | MozJPEG 感知量化、自適應 4:4:4 色度採樣 |
| **PNG** | ✅ | ✅ | oxipng 並發濾鏡優化、色彩量化 (imagequant) |
| **WebP** | ✅ | ✅ | 支援一般有損壓縮與 100% 純數學無損編碼 |
| **AVIF** | ✅ | ✅ | ravif 次世代高壓縮比格式支援 |
| **原格式 (Original)** | — | ✅ | 自動沿用原圖副檔名並進行高效瘦身 |

---

## 📥 安裝與 Windows 安全提示說明

### 下載安裝檔 (.msi / .exe)
您可以直接從 GitHub Releases 下載預編譯安裝包，或依下方教學自行由原始碼編譯。

> [!NOTE]
> **Windows SmartScreen 提示說明**：  
> 由於 TinySqueeze 為個人開源項目，尚未購買昂貴的微軟商業 EV 程式碼簽章憑證，因此在 Windows 安裝或首次執行時，系統可能彈出防護提示：  
> *「Windows 已保護您的電腦 — Microsoft Defender SmartScreen 已防止未辨識的應用程式啟動。」*  
> **操作方式：**
> 1. 點擊彈窗上的 **「其他資訊」**（*More info*）。
> 2. 點擊 **「仍要執行」**（*Run anyway*）。  
> 本專案為 100% 開源軟體（MIT License），所有原始碼公開透明，請安心使用。

---

## 🛠️ 本地建置與編譯

```bash
# 複製專案
git clone https://github.com/<your-username>/tinysqueeze.git
cd tinysqueeze

# 安裝前端相依套件
npm install

# 啟動開發熱重載模式
npm run tauri dev

# 打包生產發行安裝檔 (.exe / .msi)
npm run tauri build
```

---

## 📄 開源授權 (License)

本專案採用 [MIT License](LICENSE) 開源授權。
