# CLI Folder Argument — Design

**Date:** 2026-06-23
**Status:** Approved → ready for implementation plan
**Approach:** A — cold-launch only (multi-instance)

## Goal

Launching the built executable with a folder path as a command-line argument opens
the app with that folder already loaded — identical to dropping the folder onto the
empty dropzone:

```
easyrename.exe F:\Shows\Major\Season 2
```

Primary motivation: automation. A script can point the app at a specific folder
without a human click/browse step.

## Context & constraint

The app is Tauri 2 + React + TypeScript. The webview frontend **cannot read
`argv`** directly (no Node runtime). Any command-line argument must therefore be
read on the Rust side and handed to the frontend through a Tauri command.

All folder loading already funnels through one function, `onFolder(dir)` in
[`src/App.tsx`](../../../src/App.tsx), which lists files, classifies them into
videos/subtitles, auto-detects a regex pattern, and builds the match rows. The
feature reuses this path unchanged.

## Decision: multi-instance (Approach A)

When `easyrename.exe <folder>` is invoked while the app is already running, **a
new independent window/process opens** with its own folder. There is no
"send-to-running-instance" forwarding.

This was chosen over single-instance forwarding (Approach B) and a full CLI
parser (Approach C) because it precisely satisfies the stated need with minimal
surface area. If "feed folders to an already-open app" is wanted later, Approach
B layers on top of this design without rework.

## Design

### Architecture & data flow

1. A new Rust command `get_launch_folder()` reads `std::env::args()` and returns
   the first positional argument **only if it is an existing directory**;
   otherwise it returns `None`.
2. The frontend calls `get_launch_folder()` once on mount. On `Some(dir)` it
   calls the existing `onFolder(dir)`, reusing all current
   classify → auto-detect → build-rows logic.
3. Each launch is a fresh process with its own folder (multi-instance).

### Changes (4 files, ~20 lines)

#### `src-tauri/src/commands.rs`

- Add a pure helper:

  ```rust
  /// Pick the first positional CLI arg iff it is an existing directory.
  /// `args[0]` is the executable path and is skipped. Pure (takes a slice) so it
  /// is unit-testable with tempfile without touching the real process args.
  fn launch_folder_from_args(args: &[String]) -> Option<String> {
      let candidate = args.get(1)?;
      let path = Path::new(candidate);
      if path.is_dir() { Some(candidate.clone()) } else { None }
  }
  ```

- Add the command, which feeds the real process args to the helper:

  ```rust
  #[tauri::command]
  pub fn get_launch_folder() -> Option<String> {
      launch_folder_from_args(&std::env::args().collect::<Vec<_>>())
  }
  ```

#### `src-tauri/src/lib.rs`

- Register `commands::get_launch_folder` in the existing
  `tauri::generate_handler![...]` list.

#### `src/api.ts`

- Add a one-line wrapper:

  ```ts
  export const getLaunchFolder = () => invoke<string | null>('get_launch_folder');
  ```

#### `src/App.tsx`

- Add a fire-once mount effect that loads the launch folder, if any:

  ```ts
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    // No-op outside the Tauri runtime (e.g. `vite dev` browser preview).
    if (!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return;
    didInitRef.current = true;
    (async () => {
      try {
        const dir = await getLaunchFolder();
        if (dir) await onFolder(dir);
      } catch (e) {
        setApiError(String(e));
      }
    })();
  }, [onFolder]);
  ```

  - The `didInitRef` guard ensures it runs exactly once, even though `onFolder`'s
    identity changes when presets load (which would otherwise re-trigger the
    effect).
  - `onFolder` is awaited inside the try so a `list_files` failure (e.g.
    permission denied) is caught and surfaced via `apiError`, leaving the app in
    the empty-dropzone state.

### Behavior decisions

- **Directories only.** A path that is missing or points to a file yields `None`,
  so the app opens to the normal empty dropzone. (Resolving a file path to its
  parent directory was rejected as ambiguous scope creep.)
- **Invalid path = silent fallback.** No error popup; the app opens empty as if
  launched with no argument.
- **Valid directory but unreadable** (e.g. permissions) → caught by the mount
  effect → `apiError` shown, empty state. This is localized to the new effect;
  `onFolder`'s pre-existing lack of try/catch on the manual (click / drag-drop)
  paths is out of scope and left as-is.
- **Spaces and quoting** (e.g. `Season 2`) are handled by the shell and
  `std::env::args()`; nothing extra is required.
- **Release builds** use `windows_subsystem = "windows"` (no console), but the
  GUI process still receives command-line arguments normally — no impact.
- **No conflict with existing launch-time restore.** The app already restores
  last-used Search & Replace inputs on mount, but it does **not** persist the
  folder. The CLI argument is therefore the only initial-folder source; the two
  mechanisms are independent and order does not matter.

### Auto-detect timing note

On first paint, `onFolder` uses the seed preset candidates (`REGEX_PRESETS`)
because saved presets load slightly later. The launch-folder load therefore
auto-detects with seed candidates — exactly the same as a manual drop at that
instant. The user can re-run auto-detect once presets have loaded. This matches
existing first-paint semantics and requires no extra handling.

## Testing

### Rust (unit, in `commands.rs`)

`launch_folder_from_args` is pure and testable with `tempfile` (already a
dev-dependency):

- tempdir path as `args[1]` → `Some(tempdir)`
- nonexistent path → `None`
- a file path (not a directory) → `None`
- only `args[0]` (no positional arg) → `None`

### TypeScript

The change is glue: a one-line `api.ts` wrapper and a mount effect. The matching
logic it triggers is already covered by the Vitest suite. No new unit test is
added; correctness is verified manually (below).

### Manual verification

- `pnpm tauri dev -- "F:\path\to\folder"` → app opens with that folder loaded.
- `pnpm tauri dev -- "F:\does\not\exist"` → app opens to empty dropzone, no crash.
- `pnpm tauri dev` (no arg) → unchanged behavior.
- `pnpm tauri build`, then run the produced exe with a real folder path → folder
  loaded on launch.

## Out of scope

- Single-instance forwarding (Approach B) — feed folders to a running instance.
- A full CLI parser with `--help` / flags (Approach C).
- Resolving a file argument to its parent directory.
- Folder persistence across launches (only SR inputs are persisted today).
