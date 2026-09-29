# [PRD-BE v1.1] 輕量級圖片壓縮與轉檔桌面工具：後端技術架構規格書 (Backend Architecture Specification)

## 1. 架構決策與三輪自我正反攻訐 (Adversarial Dialectics)

在底層架構定案前，針對桌面端效能、硬體資源限制與維護性進行三輪正反辯證推演：

### 第一輪：並發模型與功耗散熱
* **正方（極致吞吐量）**：拖入大量圖檔時應榨乾多核潛能，直接以 `num_cpus::get() - 1` 開滿執行緒並行運算，縮短處理總時長。
* **反方（資源與發熱質疑）**：若使用者拖入數十張單眼相機高解析度（如 24MP+）圖檔，解碼為無壓縮 RGBA32 後單張佔用約 100MB。多核全開瞬間將消耗數 GB 記憶體，引發系統分頁置換（Pagefile Swap）造成整機卡頓；同時輕薄筆電 CPU 瞬間滿載會觸發溫度牆降頻（Thermal Throttling），總耗時反而惡化。
* **辯證結論（Synthesis）**：**採「記憶體水線門禁（Memory-Gated Semaphore）」與「全域動態核心預算池」**。
  * **記憶體係數修正**：單圖記憶體配額估算不僅包含解碼緩衝，更涵蓋編碼中繼狀態（Trellis 量化、色盤直方圖），公式納入 $1.8\times$ 安全係數。
  * **全域核心上限**：總並發執行緒嚴格鎖定在 $\max(1, \min(\text{num\_cpus} - 1, 8))$，兼顧高吞吐量與硬體溫控。

### 第二輪：編碼核心選型與長遠維護性
* **正方（極致畫質對標）**：使用者要求品質對標 TinyJPG/TinyPNG，必須引入以 C 語言撰寫的 MozJPEG（Trellis 量化編碼）與 libwebp，純 Rust 現階段缺乏同等級感知壓縮演算法。
* **反方（跨平台建置與安全質疑）**：C-FFI 在 Windows MSVC 環境常因 NASM、CMake 或 CRT 連結問題導致建置失敗（Build Hell）；且 C 函式庫若因畸形檔案發生記憶體越界或崩潰，將直接導致桌面程式閃退。
* **辯證結論（Synthesis）**：**採「原生優先、關鍵隔離」的分層架構**。
  * PNG 全面採用純 Rust 的 `imagequant` + `oxipng`；AVIF 採用純 Rust 的 `ravif`。
  * JPEG 與 WebP 採用預打包原始碼的 `mozjpeg`（`features = ["vendored"]`）與 `webp`。
  * 在 FFI 外層以 `std::panic::catch_unwind` 建立隔離防護，任何非預期錯誤均降級為標準 `Result::Err`，絕不波及主程序。

### 第三輪：縮圖管線與 IPC 通訊負擔
* **正方（即時推播反饋）**：縮圖產生後，後端立即將 Base64 WebP 字串透過 Tauri Event 推送給前端展示，邏輯最直覺。
* **反方（傳輸阻塞與渲染掉幀）**：批次拖入 100 張圖時，連續廣播 100 個包含 Base64 的 JSON 事件會造成 IPC 暴風雨，Base64 膨脹與頻繁 JSON 反序列化會佔據 WebView2 主執行緒，導致前端進場動畫微卡頓（Micro-stuttering）。
* **辯證結論（Synthesis）**：**採「自訂資產協定 + 事件極度瘦身（Slim Event Notification）」機制**。
  * 縮圖由縮圖快軌解碼後存入記憶體快取，前端透過 `asset://thumbnail/{task_id}` 走二進位串流載入（零 Base64 開銷）。
  * 縮圖就緒時，後端發射微型通知事件 `thumbnail_ready { id: String }`（僅約 40 Bytes 的極小 Payload），前端收到後動態指派 `<img src>`，既免除輪詢與 404 競態重試，又徹底解決 IPC 頻寬塞車。

---

## 2. 系統架構總圖

```text
                  [ 前端 UI / WebView2 ]
                     │            ▲
        Tauri Command│            │ Tauri Events: task_completed / thumbnail_ready (Slim)
        (Tasks, Opts)│            │ Asset Protocol: asset://thumbnail/{id} (Binary)
                     ▼            │
  ┌─────────────────────────────────────────────────────────────┐
  │                 Tauri IPC Core Dispatcher                   │
  └──────────────┬──────────────────────────────┬───────────────┘
                 │                              │
         (Fast Path: 抽取縮圖)           (Heavy Path: 檔案解碼與壓縮)
                 │                              │
                 ▼                              ▼
  ┌─────────────────────────────┐┌──────────────────────────────┐
  │ Unified Worker Pool Manager ││ Memory-Gated Worker Pool     │
  │ • 動態共用核心預算          ││ • 實體並發上限受全域預算約束 │
  │ • Fast Lane 享高搶佔優先權  ││ • 512MB 預算 (含 1.8x 係數)  │
  └──────────────┬──────────────┘└──────────────┬───────────────┘
                 │                              │
                 ▼                              ▼
  ┌─────────────────────────────┐┌──────────────────────────────┐
  │ Shared Thumbnail Cache      ││ Codec Pipeline Engine        │
  │ • DashMap<CacheKey, Bytes>  ││ • Trait: ImageEncoder        │
  │ • 提供 asset:// 串流讀取    ││ • MozJPEG / imagequant /     │
  └─────────────────────────────┘│   oxipng / webp / ravif      │
                                 └──────────────┬───────────────┘
                                                │
                                                ▼
                                 ┌──────────────────────────────┐
                                 │ Atomic I/O & 落盤同步器       │
                                 │ • Tempfile -> fsync()        │
                                 │ • Atomic Rename 替換         │
                                 └──────────────────────────────┘
```

## 3. 全域硬體資源動態預算管理

為徹底避免低核心數裝置（如 4 核心筆電）因縮圖與壓縮執行緒競爭導致 CPU 滿載與溫度牆降頻，實施統一預算管理：

### 3.1 核心預算上限（Thread Allocation）
全域工作者預算池（Worker Budget）：
$$\text{Budget} = \max(1, \min(\text{num\_cpus::get()} - 1, 8))$$

動態優先權分配策略：
* **縮圖快軌（Fast Lane）**：優先權高，最多動態佔用 $\min(2, \text{Budget})$ 個執行緒。未處理縮圖時釋出額度。
* **壓縮重軌（Heavy Lane）**：佔用剩餘之 $(\text{Budget} - \text{Active Fast Threads})$ 額度。
* **效果**：四核心環境下總工作執行緒恆定為 3，任一瞬間均不會發生 5 執行緒搶佔 4 核心之情境。

### 3.2 記憶體水線門禁（Memory-Gated Semaphore）
* **全域記憶體預算額度**：配置 `Arc<tokio::sync::Semaphore>`，預設總容量為 512 MB（$512 \times 1024 \times 1024$ 位元組）。
* **計算公式（含編碼中繼膨脹係數）**：
  透過檔案標頭快速探測解析度 $W \times H$，考量 MozJPEG Trellis 量化緩衝、色彩空間轉換與調色盤浮點運算，實際申請額度為：
  $$\text{申請額度 (Bytes)} = (W \times H \times 4) \times 1.8$$
* **動態背壓（Backpressure）**：
  單張 24MP（$6000 \times 4000$）相片約申請 $164.7\text{ MB}$ 配額。記憶體額度不足時，任務於非同步佇列等待，直至前案完成釋放配額，徹底杜絕記憶體置換與崩潰。

---

## 4. 縮圖抽取、通知與快取架構

### 4.1 處理與載入動線（零競態時序）
```text
[檔案拖入佇列]
       │
[Fast Lane 非同步解碼抽取 80x80] 
       │
[寫入 DashMap 記憶體快取] ── Key: SHA1(path + size + mtime)
       │
[後端發送輕量通知] ───────> app.emit("thumbnail_ready", { id })  (~40 Bytes)
                               │
[前端收到通知] ────────────────┘
       │
[前端動態設定 DOM] ───────> <img src="tinypress-thumb://{id}" />
       │
[Tauri Asset Protocol] ────> 從 DashMap 串流回傳二進位 RAW/WebP (無 JSON/Base64 開銷)
```

### 4.2 重壓快取沿用
若使用者點擊 (R) 重新處理，縮圖快取維持不變，僅重跑 Heavy Lane，達成零額外縮圖 I/O。

---

## 5. 編碼引擎抽象層與選型規範

透過 Trait 隔離各格式編碼細節：
```rust
pub trait ImageEncoder: Send + Sync {
    fn encode(&self, input: &image::RgbaImage, config: &EncodingOptions) -> Result<Vec<u8>, CodecError>;
}
```

### 格式選型矩陣
| 目標格式 | 選用 Rust Crate | 演算法細節與配置 | 安全與維護策略 |
| :--- | :--- | :--- | :--- |
| **PNG** | `imagequant` + `oxipng` | • 8-bit 色彩向量量化（Vector Quantization）<br>• Alpha 邊緣抖動處理（Dithering 1.0）<br>• 多執行緒 Deflate 排程優化 | 100% 純 Rust，跨平台編譯零負擔，無記憶體安全隱患。 |
| **JPEG** | `mozjpeg (vendored)` | • Trellis Quantization（格狀量化）<br>• 感知色彩降採樣（Chroma subsampling: 4:2:0）<br>• Progressive scan 霍夫曼樹最佳化 | 啟用靜態封裝，以 FFI 安全層包裹，隔離底層例外。 |
| **WebP** | `webp (libwebp)` | • 有損預設壓縮（Lossy mode）<br>• 啟用 Multi-threading 與空間色彩預測 | Google 官方維護庫，兼顧效能與壓縮比。 |
| **AVIF** | `ravif` | • 基於 rav1e 原生 AV1 編碼器<br>• 速度平衡檔位（Speed: 6） | 純 Rust 實作，擺脫系統層級龐大的 AOMedia/libaom 編譯鏈。 |

---

## 6. 檔案系統原子寫入與資料一致性管線

貫徹「前端收到完成事件時，磁碟檔案絕對處於安全可存取狀態」原則：

```text
1. 建立暫存檔:
   Path: {target_dir}/.{target_filename}.tinypress_tmp_{uuid}

2. 串流寫入編碼資料:
   let mut file = std::fs::File::create(&temp_path)?;
   file.write_all(&encoded_bytes)?;

3. 強制磁碟同步 (fsync):
   file.sync_all()?;  <-- 確保 OS 磁碟寫入快取已真正刷入實體硬體

4. 釋放檔案控制代碼 (Drop Handle)

5. 原子替換 (Atomic Rename):
   std::fs::rename(&temp_path, &final_target_path)?;

6. 發送 IPC 事件:
   app.emit("task_completed", payload);
```

### 負向膨脹處理（Negative Compression Guard）
若 `encoded_bytes.len() >= original_file_size`：
1. 刪除已編碼暫存檔。
2. 將原檔案直接複製至目標路徑。
3. `TaskCompletedPayload.is_kept_original` 設為 `true`，通知前端標記「已維持原檔」。

---

## 7. 前後端 IPC 介面與資料合約

### 7.1 前端主動呼叫指令（Tauri Commands）
```rust
// 啟動批次任務
#[tauri::command]
pub async fn start_batch_compression(
    app: tauri::AppHandle,
    tasks: Vec<TaskInput>,
    config: CompressionConfig,
) -> Result<BatchInitAck, String>;

// 非阻塞衝突回傳決策
#[tauri::command]
pub async fn resolve_file_conflict(
    task_id: String,
    resolution: ConflictResolution, // Overwrite, AutoRename, Skip
) -> Result<(), String>;
```

### 7.2 核心傳輸資料結構（Rust Structs）
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Clone)]
pub struct CompressionConfig {
    pub quality: u8,               // 1 - 100
    pub target_format: String,     // "original" | "webp" | "avif" | "jpeg" | "png"
    pub output_dir_mode: String,   // "same" | "sub" | "custom"
    pub custom_dir_path: Option<String>,
    pub conflict_strategy: String, // "auto_rename" | "overwrite" | "skip" | "ask"
    pub strip_metadata: bool,
    pub convert_to_srgb: bool,
}

#[derive(Debug, Deserialize)]
pub struct TaskInput {
    pub id: String,                // 唯一任務識別碼 (UUIDv4)
    pub file_path: String,         // 本機檔案絕對路徑
}

// 縮圖就緒極簡通知 (Slim Payload，約 40 Bytes)
#[derive(Debug, Serialize, Clone)]
pub struct ThumbnailReadyPayload {
    pub id: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct TaskCompletedPayload {
    pub id: String,
    pub original_size: u64,
    pub compressed_size: u64,
    pub savings_ratio: f32,        // 例：0.68 代表省下 68%
    pub output_path: String,
    pub output_format: String,     // "WEBP", "JPG", "PNG", "AVIF" (供前端即時更新標籤)
    pub is_kept_original: bool,    // 是否發生反向膨脹而保留原檔
}

#[derive(Debug, Serialize, Clone)]
pub struct ConflictDetectedPayload {
    pub id: String,
    pub original_path: String,
    pub candidate_output_path: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct BatchFinishedPayload {
    pub total_processed: usize,
    pub total_original_bytes: u64,
    pub total_compressed_bytes: u64,
    pub total_saved_ratio: f32,
    pub output_directory: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictResolution {
    Overwrite,
    AutoRename,
    Skip,
}
```

---

## 8. 例外與邊界防禦矩陣 (Defensive Matrix)

| 邊界/例外情境 | 後端防禦機制 | 前端對應反饋 |
| :--- | :--- | :--- |
| **檔案被其他程式鎖定（如編輯中）** | 讀取時以共用模式開啟，若遇到鎖定錯誤，重試 3 次（間隔 100ms）。失敗後回傳 `task_error`。 | 該列顯示紅色文字「檔案被佔用」，不中斷其餘任務。 |
| **圖檔損毀或標頭異常** | 透過 `image::io::Reader` 驗證 Magic Bytes。驗證失敗立即中止，不進入編碼流程。 | 該列標記「檔案已毀損或不支援」，狀態欄顯示略過。 |
| **遇到同名衝突且設定為 ask** | 1. 立即釋放 Memory Semaphore 配額與解碼緩衝。<br>2. 該任務發射 `conflict_detected` 後進入掛起狀態。<br>3. 收到決策後重新排隊申請配額。 | 該列呈現「覆蓋/更名/略過」互動按鈕；其餘任務不受任何阻塞、持續處理。 |
| **衝突決策逾時處置** | 若使用者超過 10 分鐘未回應決策，自動將該任務標記為「已略過（等待逾時）」並釋放所有暫存資源。 | 該列狀態轉為灰色文字「已逾時略過」。 |
| **磁碟空間耗盡（Disk Full）** | 寫入暫存檔時捕捉 `ErrorKind::StorageFull`，立即清理未完成暫存檔並停止新任務排程。 | 跳出全域警示彈窗「磁碟空間不足，已暫停處理」。 |

---

## 9. 長遠維護與依賴清單（Cargo.toml）

```toml
[package]
name = "tinypress-core"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2.0", features = ["protocol-asset"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
rayon = "1.10"
dashmap = "5.5"
uuid = { version = "1.8", features = ["v4"] }

# 影像解碼基礎
image = { version = "0.25", default-features = false, features = ["png", "jpeg", "webp"] }

# 編碼引擎
imagequant = "4.3"      # 純 Rust 原生重寫之 pngquant
oxipng = { version = "9.0", default-features = false, features = ["parallel"] }
ravif = "0.11"          # 純 Rust AV1/AVIF 編碼器
mozjpeg = { version = "0.10", features = ["vendored"] }
webp = "0.3"
```
