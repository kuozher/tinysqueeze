# TinySqueeze v1.3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade TinySqueeze to v1.3 by solving concurrency deadlocks, adding skipped terminal states, native file dialogs, EXIF orientation correction, ICC profile passthrough, Result Bar summary banner, deterministic naming, and WCAG contrast improvements.

**Architecture:** Rust (Tauri 2) pipeline pre-decode path & conflict resolution + detached semaphore permits; pure `plan_output` logic; `image` + ICC marker extraction & re-embedding for JPEG, PNG, WebP; EXIF orientation normalization; React 19 + Zustand + Tailwind v4 + `@tauri-apps/plugin-dialog`.

**Tech Stack:** Tauri 2, Rust 2021, React 19, TypeScript, Zustand, Tailwind CSS v4, Phosphor Icons.

---

## Phase 1: Lifecycle & Concurrency Deadlock Fixes (R-01, R-05, U-03, E-01)

### Task 1.1: Extract Pure Function `plan_output` & Add Unit Tests (E-01, R-05)
- **Files**:
  - Modify: `src-tauri/src/pipeline.rs`
  - Modify: `src-tauri/src/models.rs`
- **Actions**:
  - Define `OutputPlan` struct in `models.rs`: `target_path: PathBuf`, `target_dir: PathBuf`, `is_conflict: bool`, `should_copy_original: bool`, `skip_reason: Option<String>`.
  - Implement `plan_output(config: &CompressionConfig, orig_path: &Path, target_ext: &str, is_same_fmt: bool, prior_output: Option<&Path>) -> OutputPlan`.
  - Add unit tests in `pipeline.rs` for `plan_output` covering `same`, `sub`, `custom` modes and conflict detection.

### Task 1.2: Move Conflict Detection Before Decoding & Detach Semaphore Permit While Awaiting Decision (R-05, R-01)
- **Files**:
  - Modify: `src-tauri/src/pipeline.rs`
  - Modify: `src-tauri/src/models.rs`
- **Actions**:
  - In `start_batch`, compute output plan *before* acquiring `heavy_semaphore` or `memory_semaphore`.
  - If conflict exists and `strategy == "ask"`, emit `conflict_detected` and wait for resolution *without* holding any worker or memory permits.
  - Implement `task_skipped` event with reason (`strategy_skip`, `conflict_timeout`, `user_skip`, `no_gain`).
  - Guarantee exactly one terminal event (`task_completed`, `task_skipped`, `task_error`) per task.
  - Update `TaskSkippedPayload` in `models.rs`.

### Task 1.3: Update Frontend Store & Types for Skipped State (R-01)
- **Files**:
  - Modify: `src/types.ts`
  - Modify: `src/store.ts`
  - Modify: `src/hooks/useTauriEvents.ts`
  - Modify: `src/components/TaskRow.tsx`
  - Modify: `src/i18n.ts`
- **Actions**:
  - Add `skipped` to `TaskStatus`.
  - Handle `task_skipped` in `useTauriEvents.ts`.
  - Render skipped state with gray icon and reason badge in `TaskRow.tsx`.
  - Ensure skipped items count toward idle queue resolution.

### Task 1.4: Integrate `@tauri-apps/plugin-dialog` for Native File & Folder Picking (U-03, U-09)
- **Files**:
  - Modify: `src-tauri/Cargo.toml`
  - Modify: `src-tauri/src/lib.rs`
  - Modify: `src-tauri/capabilities/default.json`
  - Modify: `package.json`
  - Modify: `src/components/EmptyState.tsx`
  - Modify: `src/components/Header.tsx`
  - Modify: `src/components/SettingsDrawer.tsx`
  - Modify: `src/App.tsx`
- **Actions**:
  - Add `tauri-plugin-dialog = "2"` in `src-tauri/Cargo.toml` and npm package `@tauri-apps/plugin-dialog`.
  - Add permission `"dialog:default"` in `capabilities/default.json`.
  - Update `EmptyState.tsx` and `Header.tsx` to call `open({ multiple: true, filters: [...] })` and folder picker.
  - Add "Browse..." button in `SettingsDrawer.tsx` for custom directory selection.

---

## Phase 2: Color Fidelity & Image Decoding (R-03, R-04a, R-02)

### Task 2.1: EXIF Orientation Normalization (R-03)
- **Files**:
  - Modify: `src-tauri/src/pipeline.rs`
- **Actions**:
  - When decoding image via `image::open` or `ImageReader`, read EXIF orientation tag.
  - Apply physical rotation/flip to raw `DynamicImage` (e.g. `img.apply_orientation(...)`).
  - Clear orientation tag on encoded output so viewers display pixels upright without secondary transforms.

### Task 2.2: ICC Profile Passthrough (R-04a)
- **Files**:
  - Modify: `src-tauri/src/codecs.rs`
  - Modify: `src-tauri/src/pipeline.rs`
- **Actions**:
  - Read source ICC chunk (APP2 for JPEG, iCCP for PNG, ICCP for WebP).
  - Pass ICC bytes to `ImageEncoder::encode` or re-embed into output buffer.
  - MozJPEG: write ICC via `comp.set_icc_profile()`.
  - WebP: write ICC via `webp::Mux`.
  - PNG: write ICC via `png::Encoder::set_icc_profile()`.

### Task 2.3: Reject AVIF Input with Friendly Toast & UI Docs (R-02)
- **Files**:
  - Modify: `src-tauri/src/commands.rs`
  - Modify: `src/components/EmptyState.tsx`
  - Modify: `src/components/Header.tsx`
  - Modify: `src/i18n.ts`
  - Modify: `README.md`
- **Actions**:
  - Exclude `"avif"` from `VALID_EXTENSIONS` in `commands.rs` for scanning.
  - If a `.avif` file is dragged/selected, display a non-blocking toast: "AVIF 目前僅支援輸出格式".
  - Update empty state formats list to `PNG, JPG, WebP`.

---

## Phase 3: UX Workflow & Output Reorganization (U-01, U-02, U-07, E-03)

### Task 3.1: Output Naming `{name}_min.{ext}` & Idempotent Reprocess (U-01)
- **Files**:
  - Modify: `src-tauri/src/pipeline.rs`
  - Modify: `src-tauri/src/models.rs`
  - Modify: `src/store.ts`
  - Modify: `src/components/SettingsDrawer.tsx`
- **Actions**:
  - Default filename pattern: `{name}_min.{ext}`.
  - Reprocessing (`R`) overwrites the previous round's `_min` output file without triggering conflict.
  - Negative compression guard: if compressed size >= original size:
    - Same folder: do NOT write file, mark task as `skipped` (reason `no_gain`).
    - Sub/custom folder: copy original file and mark "維持原檔".

### Task 3.2: Top Result Bar (Summary Banner) Replacing SummaryModal (U-02)
- **Files**:
  - Create: `src/components/ResultBar.tsx`
  - Modify: `src/components/SummaryModal.tsx`
  - Modify: `src/store.ts`
  - Modify: `src/App.tsx`
  - Modify: `src/hooks/useTauriEvents.ts`
- **Actions**:
  - Replace intrusive popup modal with an inline/sticky ResultBar situated between Header and TaskList.
  - Display: total completed count, total saved MB, percentage, skipped & failed count, `[僅看失敗]` filter toggle, single folder `[開啟資料夾]` button, and close `[✕]` button.
  - Multi-directory batches display "已輸出至 N 個資料夾", avoiding ambiguous single folder open.

### Task 3.3: Header Action Semantics ("Cancel All" vs "Clear List") (U-07)
- **Files**:
  - Modify: `src/components/Header.tsx`
  - Modify: `src/store.ts`
  - Modify: `src/i18n.ts`
- **Actions**:
  - When queue is active (`isProcessing`), Header button displays "取消全部" (Cancel All).
  - When queue is idle, Header button displays "清除清單" (Clear List).

### Task 3.4: Remove TinyPress Legacy Compatibility Code (E-03)
- **Files**:
  - Modify: `src-tauri/src/lib.rs`
  - Modify: `src-tauri/src/guard.rs`
  - Modify: `src/store.ts`
  - Modify: `index.html`
- **Actions**:
  - Remove `tinypress-thumb://` protocol alias and CSP entries.
  - Remove legacy `tinypress_*` localStorage migration reads.
  - Clean up all residual references.

---

## Phase 4: Visual Polish, Progress Feedback & A11y (U-05, U-10, U-06, U-08)

### Task 4.1: Real Stage Events & Dynamic Micro-Progress Track (U-05)
- **Files**:
  - Modify: `src-tauri/src/pipeline.rs`
  - Modify: `src-tauri/src/models.rs`
  - Modify: `src/components/TaskRow.tsx`
  - Modify: `src/hooks/useTauriEvents.ts`
- **Actions**:
  - Emit `task_stage { id, stage: "decoding" | "encoding" | "writing" }`.
  - Replace fake setTimeout percentages with stage-based micro progress track.
  - Add timer for long-running tasks (>10s) showing elapsed seconds.

### Task 4.2: WCAG Color Contrast & Accessibility (U-10)
- **Files**:
  - Modify: `src/App.css`
  - Modify: `src/components/Header.tsx`
  - Modify: `src/components/TaskRow.tsx`
  - Modify: `src/components/QuickBar.tsx`
  - Modify: `src/components/SettingsDrawer.tsx`
- **Actions**:
  - Fix dark theme green button text contrast (from white to `#121314`, improving contrast to 8.9:1).
  - Deepen `--text-dim` from 2.69:1 to >= 4.5:1 for readable information.
  - Add `aria-label` to all icon-only buttons.
  - Add `prefers-reduced-motion` media query.

### Task 4.3: Window Close Protection & Cumulative Savings Reset (U-06, U-08)
- **Files**:
  - Modify: `src/components/Header.tsx`
  - Modify: `src/components/EmptyState.tsx`
  - Modify: `src/store.ts`
- **Actions**:
  - Warn when closing window while tasks are processing.
  - Reset cumulative saved bytes default seed from 1.38GB to 0.
