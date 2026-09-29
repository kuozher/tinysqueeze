use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

/// RAII Scope Guard 確保任務意外終止、中途取消或 Panic 時，磁碟暫存檔自動銷毀
pub struct TempFileGuard {
    pub path: PathBuf,
    pub committed: bool,
}

impl TempFileGuard {
    pub fn new(path: PathBuf) -> Self {
        InFlightJournal::register(&path);
        Self {
            path,
            committed: false,
        }
    }

    /// 在成功完成原子 Rename 後呼叫，標記已安全提交，解除 Drop 銷毀
    pub fn commit(mut self) {
        self.committed = true;
        InFlightJournal::unregister(&self.path);
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if !self.committed {
            if self.path.exists() {
                let _ = fs::remove_file(&self.path);
            }
            InFlightJournal::unregister(&self.path);
        }
    }
}

/// 飛行中暫存登記日誌 (In-Flight Temp Journal)
/// 記錄於 AppData 目錄，專供冷啟動時進行精準 O(1) 清掃，無須全硬碟盲目遞迴
pub struct InFlightJournal;

static JOURNAL_LOCK: Mutex<()> = Mutex::new(());

impl InFlightJournal {
    fn journal_path() -> Option<PathBuf> {
        dirs::data_local_dir().map(|mut p| {
            p.push("tinysqueeze");
            let _ = fs::create_dir_all(&p);
            p.push("in_flight_temps.json");
            p
        })
    }

    fn legacy_journal_path() -> Option<PathBuf> {
        dirs::data_local_dir().map(|mut p| {
            p.push("tinypress");
            p.push("in_flight_temps.json");
            p
        })
    }

    pub fn register(path: &Path) {
        let _guard = JOURNAL_LOCK.lock().unwrap();
        if let Some(journal_file) = Self::journal_path() {
            let mut list = Self::read_list(&journal_file);
            let path_str = path.to_string_lossy().to_string();
            if !list.contains(&path_str) {
                list.push(path_str);
                let _ = fs::write(&journal_file, serde_json::to_string(&list).unwrap_or_default());
            }
        }
    }

    pub fn unregister(path: &Path) {
        let _guard = JOURNAL_LOCK.lock().unwrap();
        if let Some(journal_file) = Self::journal_path() {
            let mut list = Self::read_list(&journal_file);
            let path_str = path.to_string_lossy().to_string();
            if let Some(pos) = list.iter().position(|p| p == &path_str) {
                list.remove(pos);
                let _ = fs::write(&journal_file, serde_json::to_string(&list).unwrap_or_default());
            }
        }
    }

    fn read_list(journal_file: &Path) -> Vec<String> {
        if let Ok(content) = fs::read_to_string(journal_file) {
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Vec::new()
        }
    }

    /// 冷啟動清掃器 (Startup Sweeper)
    /// 於應用程式初始化階段在背景非同步執行一次：
    /// 讀取日誌，清理距離 mtime 超過 1 小時 (或上次異常斷電殘留) 之遺留暫存檔
    pub fn sweep_orphans_on_startup() {
        std::thread::spawn(|| {
            let _guard = JOURNAL_LOCK.lock().unwrap();
            let now = SystemTime::now();

            // 1. 清理舊版 tinypress 遺留清單（若存在）
            if let Some(legacy_file) = Self::legacy_journal_path() {
                if legacy_file.exists() {
                    let legacy_list = Self::read_list(&legacy_file);
                    for item in legacy_list {
                        let path = PathBuf::from(&item);
                        if path.exists() {
                            let _ = fs::remove_file(&path);
                        }
                    }
                    let _ = fs::remove_file(&legacy_file);
                }
            }

            // 2. 清理當前 tinysqueeze 清單
            if let Some(journal_file) = Self::journal_path() {
                let list = Self::read_list(&journal_file);
                let mut remaining = Vec::new();

                for item in list {
                    let path = PathBuf::from(&item);
                    if path.exists() {
                        if let Ok(metadata) = fs::metadata(&path) {
                            if let Ok(mtime) = metadata.modified() {
                                // 超過 1 小時或上次斷電殘留
                                if now.duration_since(mtime).unwrap_or(Duration::ZERO) > Duration::from_secs(3600) {
                                    let _ = fs::remove_file(&path);
                                    continue;
                                }
                            }
                        }
                        remaining.push(item);
                    }
                }

                let _ = fs::write(&journal_file, serde_json::to_string(&remaining).unwrap_or_default());
            }
        });
    }
}
