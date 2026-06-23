# CLI Folder Argument Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the built exe open straight into a folder passed as a command-line argument (`easyrename.exe F:\Shows\Major\Season 2`).

**Architecture:** The webview can't read `argv`, so a new Rust command `get_launch_folder()` reads `std::env::args()`, returns the first positional arg only if it's an existing directory (else `None`). The frontend calls it once on mount and, on `Some(dir)`, calls the existing `onFolder(dir)` — reusing all current classify → auto-detect → build-rows logic. Multi-instance: each launch is an independent process/window.

**Tech Stack:** Tauri 2, Rust (`std::env`, `std::path`), React 19 + TypeScript. No new dependencies — Rust tests reuse the existing `tempfile` dev-dependency; the frontend reuses `@tauri-apps/api/core`'s `invoke`.

## Global Constraints

- Tauri 2 + React 19 + TypeScript + Rust. No new crate or npm dependencies.
- Multi-instance only (Approach A). Do NOT add `tauri-plugin-single-instance` or any event-forwarding.
- **Directories only:** a missing path or a file path yields `None` → app opens to the empty dropzone. Never resolve a file to its parent.
- No AI/Claude attribution in commit messages (project rule).
- Project commits directly to `main` (established pattern — no feature branch needed).
- Command/snake_case on the Rust side (`get_launch_folder`); camelCase wrapper on the TS side (`getLaunchFolder`).

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src-tauri/src/commands.rs` | Pure helper `launch_folder_from_args` + `get_launch_folder` command + unit tests | Create (additive) |
| `src-tauri/src/lib.rs` | Register the new command in the Tauri `invoke_handler` | Modify (1 line) |
| `src/api.ts` | TS wrapper `getLaunchFolder()` calling `invoke` | Create (additive) |
| `src/App.tsx` | Fire-once mount effect that loads the launch folder via `onFolder` | Modify (import + ref + effect) |

---

## Task 1: Rust — `get_launch_folder` command with unit tests

**Files:**
- Modify: `src-tauri/src/commands.rs` (add helper + command near the other commands; add tests in the existing `#[cfg(test)] mod tests`)
- Modify: `src-tauri/src/lib.rs` (register the command)

**Interfaces:**
- Consumes: `std::env::args()`, `std::path::Path` (both already used in this file).
- Produces:
  - `fn launch_folder_from_args(args: &[String]) -> Option<String>` — pure, private to the module, called by the command and by tests.
  - `pub fn get_launch_folder() -> Option<String>` — the `#[tauri::command]`, returns `Some(dir)` when the first positional CLI arg is an existing directory, else `None`.

- [ ] **Step 1: Write the failing tests**

Add these four tests to the end of the existing `#[cfg(test)] mod tests` block in `src-tauri/src/commands.rs` (just before the closing `}` of the `tests` module, after the `last_rename_corrupt_returns_none` test):

```rust
    #[test]
    fn launch_folder_returns_existing_dir_arg() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().to_string_lossy().into_owned();
        let args = vec!["easyrename.exe".to_string(), dir.clone()];
        // Returns the arg verbatim (no canonicalization).
        assert_eq!(launch_folder_from_args(&args), Some(dir));
    }

    #[test]
    fn launch_folder_none_for_missing_path() {
        let args = vec!["easyrename.exe".to_string(), "Z:\\no\\such\\dir\\hopefully".into()];
        assert_eq!(launch_folder_from_args(&args), None);
    }

    #[test]
    fn launch_folder_none_for_file_arg() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("a.txt");
        std::fs::write(&file, b"x").unwrap();
        let file_s = file.to_string_lossy().into_owned();
        let args = vec!["easyrename.exe".to_string(), file_s];
        assert_eq!(launch_folder_from_args(&args), None);
    }

    #[test]
    fn launch_folder_none_without_positional_arg() {
        let args = vec!["easyrename.exe".to_string()];
        assert_eq!(launch_folder_from_args(&args), None);
    }
```

- [ ] **Step 2: Run the tests to verify they fail (compile error)**

Run: `cd src-tauri && cargo test launch_folder`
Expected: COMPILE ERROR — `cannot find function launch_folder_from_args in this scope` (the helper does not exist yet).

- [ ] **Step 3: Implement the helper and the command**

Add this to `src-tauri/src/commands.rs`, placing the helper and command just above the `#[cfg(test)] mod tests` line (i.e. after the `undo` command function):

```rust
/// Pick the first positional CLI arg iff it is an existing directory.
/// `args[0]` is the executable path and is skipped. Pure (takes a slice) so it
/// is unit-testable with `tempfile` without touching the real process args.
fn launch_folder_from_args(args: &[String]) -> Option<String> {
    let candidate = args.get(1)?;
    if Path::new(candidate).is_dir() {
        Some(candidate.clone())
    } else {
        None
    }
}

/// The folder the app was launched with via the command line
/// (`easyrename.exe <folder>`), or `None` when launched without a usable
/// directory argument. Read once by the frontend on mount so the app can open
/// straight into that folder.
#[tauri::command]
pub fn get_launch_folder() -> Option<String> {
    launch_folder_from_args(&std::env::args().collect::<Vec<_>>())
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test launch_folder`
Expected: PASS — 4 tests (`launch_folder_returns_existing_dir_arg`, `launch_folder_none_for_missing_path`, `launch_folder_none_for_file_arg`, `launch_folder_none_without_positional_arg`).

- [ ] **Step 5: Register the command in the Tauri handler**

In `src-tauri/src/lib.rs`, add `commands::get_launch_folder,` to the `tauri::generate_handler![...]` list. The block becomes:

```rust
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::list_files,
            commands::rename_pairs,
            commands::undo,
            commands::load_presets,
            commands::save_presets,
            commands::load_last_rename,
            commands::save_last_rename,
            commands::get_launch_folder,
        ])
```

- [ ] **Step 6: Verify the whole crate builds and all Rust tests pass**

Run: `cd src-tauri && cargo test`
Expected: full suite PASS (the 4 new tests plus all pre-existing `commands` tests), and the crate compiles cleanly (confirming the new command + handler registration).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(cli): read launch folder from argv + tests"
```

---

## Task 2: Frontend — load the launch folder on startup

**Files:**
- Modify: `src/api.ts` (add the `getLaunchFolder` wrapper after `listFiles`)
- Modify: `src/App.tsx` (add import, a `didInitRef`, and a fire-once mount effect)

**Interfaces:**
- Consumes: `get_launch_folder` command from Task 1 (via `invoke`); the existing `onFolder(dir: string) => Promise<void>` and `setApiError` already in `App.tsx`.
- Produces: a `getLaunchFolder()` export in `api.ts` (`() => Promise<string | null>`); the launch behavior in `App.tsx` (no new export).

Note: There is no existing React component test harness for `App.tsx` (only pure-logic tests under `src/lib/__tests__/`). This task is glue, so it is verified by the typecheck/build (`pnpm build` runs `tsc`), the Vitest regression suite, and manual exe verification — no new unit test is added.

- [ ] **Step 1: Add the `getLaunchFolder` wrapper to `api.ts`**

In `src/api.ts`, immediately after the `listFiles` export (lines 19–20), add:

```ts
/** Folder passed on the command line at launch (`easyrename.exe <folder>`), or null. */
export const getLaunchFolder = () => invoke<string | null>('get_launch_folder');
```

So the region reads:

```ts
export const listFiles = (dir: string, recursive = true) =>
  invoke<FileEntry[]>('list_files', { dir, recursive });

/** Folder passed on the command line at launch (`easyrename.exe <folder>`), or null. */
export const getLaunchFolder = () => invoke<string | null>('get_launch_folder');
```

- [ ] **Step 2: Add the import in `App.tsx`**

In `src/App.tsx` line 8, add `getLaunchFolder` to the existing import from `'./api'`:

```ts
import { listFiles, renamePairs, undoRenames, loadPresets, savePresets, loadLastRename, saveLastRename, getLaunchFolder, type RenameOp, type RenameReport, type Preset } from './api';
```

- [ ] **Step 3: Add the `didInitRef`**

In `src/App.tsx`, immediately after the two existing refs (lines 45–46):

```ts
  const hydratedRef = useRef(false);
  const srTouchedRef = useRef(false);
```

add a third:

```ts
  const didInitRef = useRef(false);
```

- [ ] **Step 4: Add the fire-once mount effect**

In `src/App.tsx`, insert this effect immediately after the `loadLastRename` hydration effect (which ends around line 90 with `}, []);`) and before the debounced-save effect (`// Debounced-save the SR inputs...`). The new effect:

```ts
  // Open the folder passed on the command line at launch, if any
  // (`easyrename.exe F:\Shows\...`). Runs once: the ref guards against re-firing
  // when `onFolder`'s identity changes after presets load. A load failure (e.g.
  // permission denied) surfaces via apiError and leaves the empty dropzone.
  useEffect(() => {
    if (didInitRef.current) return;
    // No-op outside the Tauri runtime (e.g. `vite dev` browser preview).
    if (!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return;
    didInitRef.current = true;
    void (async () => {
      try {
        const dir = await getLaunchFolder();
        if (dir) await onFolder(dir);
      } catch (e) {
        setApiError(String(e));
      }
    })();
  }, [onFolder]);
```

- [ ] **Step 5: Typecheck via build**

Run: `pnpm build`
Expected: `tsc` and `vite build` succeed with no errors (confirms types, the new `useEffect`/`useRef` usage, and the import resolve).

- [ ] **Step 6: Run the Vitest suite (regression)**

Run: `pnpm test`
Expected: all existing tests PASS (no regressions — this task adds no app-level logic that the unit tests cover).

- [ ] **Step 7: Build the Windows exe**

Run: `pnpm tauri build`
Expected: clean release build. The raw binary lands at `src-tauri/target/release/tauri-app.exe` (per README). This step also re-runs `pnpm build` as the `beforeBuildCommand`, so a frontend typecheck failure would abort here.

- [ ] **Step 8: Manually verify — folder arg opens that folder**

Pick any real folder on disk, e.g. `F:\Shows\Major\Season 2` (any folder works — it need not contain videos/subtitles to confirm the path is selected; the Topbar folder chip will show it).

Run:
```
src-tauri\target\release\tauri-app.exe "F:\Shows\Major\Season 2"
```
Expected: the app opens straight into the loaded-folder view (not the empty dropzone), and the folder chip shows the path. If the folder has videos + subtitles, the rows are populated as if it had been dropped.

- [ ] **Step 9: Manually verify — invalid path falls back gracefully**

Run:
```
src-tauri\target\release\tauri-app.exe "Z:\does\not\exist"
```
Expected: app opens to the empty dropzone, no crash, no error popup.

- [ ] **Step 10: Manually verify — no arg is unchanged**

Run:
```
src-tauri\target\release\tauri-app.exe
```
Expected: normal launch to the empty dropzone (unchanged behavior).

- [ ] **Step 11: Commit**

```bash
git add src/api.ts src/App.tsx
git commit -m "feat(cli): open launched folder on app startup"
```

---

## Definition of Done

- `cd src-tauri && cargo test` passes (4 new `launch_folder_*` tests + all existing).
- `pnpm build` and `pnpm test` pass.
- `pnpm tauri build` produces `src-tauri/target/release/tauri-app.exe`.
- `tauri-app.exe "<folder>"` opens into that folder; nonexistent path and no-arg both open the empty dropzone.
