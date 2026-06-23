# Search & Replace mode (PowerRename-style find/replace)

Date: 2026-06-23

Reference mockups: `design-mockups/search-replace.html` (overview) + `search-replace-left.html` (chosen Variant 3), `search-replace-rail.html`, `search-replace-topbar.html`.

## Problem

Easy Rename has exactly one rename strategy: match subtitles to videos by episode index, then rename each subtitle to its video's stem. Anything that isn't "subtitle ↔ video pairing by number" is impossible — e.g. rebranding a release-group prefix (`[Shiniori-Raws] Major S3 - ` → `[Shiniori-Raws] Major (2004) - S03E`), normalizing episode markers, or stripping tags across a whole folder.

PowerRename solves this with plain find/replace (literal or regex) across all files, with a live before/after preview. The user wants that capability here. Crucially, the **rename execution is already generic**: `RenameOp = { src, dest }`, and `rename_pairs` / `undo` work on any src→dest pairs. The only mode-specific code is `buildRenamePlan` (which computes dest from video-stem + sub-ext). So a Search & Replace mode needs only its own plan-builder feeding the *same* engine — most of the machinery is reused.

## Goals

1. A second rename mode, **Search & Replace**, alongside the existing **Match Subtitles**, selected via a segmented mode switch in the Topbar.
2. Find/replace on filenames with: literal **or** regex search, a **case-sensitive** toggle, and an **Apply to** scope (Filename + extension / Filename only / Extension only). Replace is always global (every occurrence per file) — no match-all toggle.
3. Operates on **all files** in the loaded folder (recursive); **folders are excluded** from the operating set. No files/folders/subfolders toggles.
4. A live **Original (N) → Renamed (M)** preview with match / unmatched / conflict counts.
5. Last-used inputs, options, and the active mode are **persisted across launches** and restored on next run.

## Non-goals

- No files/folders/subfolders scope toggles (all-files-recursive, fixed; folders excluded).
- No "match all occurrences" toggle (always global).
- No per-row include/exclude checkboxes in the preview.
- No changes to rename / undo / conflict **execution** — the Rust engine and `RenameOp` shape are untouched.
- No changes to Match Subtitles mode behavior; its shell and logic stay as-is.
- No regex presets in Search & Replace (Match mode keeps its own preset system).

## Design

### A. Mode switching & shell — `src/App.tsx`

- New state `mode: 'match' | 'searchReplace'` (default `'match'`), persisted (see §E).
- `Topbar` gains a segmented control: **Match Subtitles** · **Search & Replace**.
- `onFolder` keeps its current media split **and** stores `allFiles: MediaFile[]` — every non-directory entry from `listFiles(dir, true)`, sorted by name. Both modes derive from this single load; switching modes after loading is instant (no re-read).
- The render **branches the whole shell** by `mode`:
  - `match` → existing right-rail shell: work = `PairList`; right rail = `RenamePanel` + `PatternPanel` + `StrayList`.
  - `searchReplace` → **Variant 3 left-panel shell**: left column = `SearchReplacePanel` + `RenamePanel` (hero); right work area = `SearchReplaceList`. (Grid: `topbar` spanning, then `[left-panel | work]`.)
- **Shared across modes:** `folder`, `allFiles`, `onConflict`, `report`, `lastApplied`, `busy`, `apiError`, and the `onRun` / `onUndo` handlers (already generic over `ops`).
- `ops` is computed per mode with `useMemo`:
  - `match` → `buildRenamePlan(rows.filter(r => r.sub)…)` (existing).
  - `searchReplace` → `buildSearchReplacePlan(allFiles, srOpts)` (new, §B).
- `DndContext` wraps only the `match` shell (drag-drop is irrelevant to SR mode).

### B. The engine — new `src/lib/searchReplace.ts`

Options shape:

```ts
type ApplyTo = 'both' | 'name' | 'ext';
interface SearchReplaceOpts { search: string; replace: string; useRegex: boolean; caseSensitive: boolean; applyTo: ApplyTo; }
```

- `compileMatcher(opts): { kind: 'ok'; apply: (s: string) => string } | { kind: 'error'; message: string }`
  - regex: `new RegExp(opts.search, opts.caseSensitive ? 'g' : 'gi')`. Invalid pattern → `{ kind: 'error', message }`.
  - literal: escape `opts.search` (regex-special chars) into a `RegExp` with the same flags — one code path for both, gives global replace + case-sensitivity for free (equivalent to `String.prototype.replaceAll`).
  - `apply(input)` runs the matcher's global replace and returns the result string.
- Name splitting reuses `stemOf` / `extOf` from `classify.ts`. Scoping:
  - `'name'` → `apply(stem)` + (ext ? `'.' + ext` : `''`)
  - `'ext'`  → ext only; if there is no extension this is a no-op (file treated as unmatched)
  - `'both'` → `apply(fullName)`
- `previewRename(file, opts): { matched: boolean; renamed: string } | { error: string }`
  - On matcher error → `{ error }`.
  - Else compute the renamed full name for the chosen scope. `matched = (renamed !== original)` — i.e. the replace actually changed the scoped text. (Replacing a match with identical text still counts as a change only if the result differs.)
- `buildSearchReplacePlan(files, opts): { ops: RenameOp[]; unmatched: number; conflicts: RenameOp[][]; error?: string }`
  - On matcher error → `{ ops: [], unmatched: files.length, conflicts: [], error }`.
  - For each file: `previewRename`. If `matched`, build `RenameOp { src: file.path, dest: joinPath(dirname(file.path), renamed) }` (reuse `dirname`/`joinPath` from `renamePlan.ts`).
  - **Validation drops:** a renamed name that is empty, all-whitespace, or contains Windows-illegal chars (`<>:"/\|?*`) or is `.`/`..` is excluded and counted as a validation error (surfaced in the summary, not silently).
  - **Conflicts:** group resulting ops by `dest`; any `dest` targeted by >1 `src` is returned as a conflict group so the preview can flag it. Execution still respects the existing `onConflict` skip/overwrite.
- **Always global:** no first-match mode exists; the `'g'` flag is unconditional.

### C. Components

- New `src/components/SearchReplacePanel.tsx` (top of the left panel): **Search for** input (with magnifier icon), **Replace with** input (both reuse `.text-input` mono styling), a **Use regular expressions** switch, a **Case sensitive** switch (both reuse the `.link-toggle` + `.switch` pattern), an **Apply to** `<select>` (reuses `.sub-select`), a summary row of badges (`M matched` / `K unmatched` / `C conflicts`), and the "Auto-saved — restored on next launch" hint. Fires a callback on every change; debounced-save happens in `App.tsx`.
- New `src/components/SearchReplaceList.tsx` (right work area): a `.preview-card` with a two-column grid head `# | Original (N) | | Renamed (M) |` and rows. Matched rows render the renamed name in the accent color with a success dot; unmatched rows (incl. the validation drops and the no-extension `'ext'` no-ops) are dimmed with a warn dot; conflict rows get the warning badge. Mono filenames, ellipsis on overflow (the mockups establish the exact markup/CSS).
- **`RenamePanel.tsx` is reused as-is.** It already derives `ready = ops.length` and `total = totalVideos ?? ops.length`; in SR mode we pass `totalVideos = allFiles.length` (in-scope file count), so the hero reads "6 of 8", "2 left", "Rename 6 files" correctly. Conflict segmented control, Undo, and the report card are all generic and unchanged. (Optional polish: a `heroLabel` prop so SR can say "Will rename" instead of "Ready to rename" — non-blocking, defer if it complicates the working component.)

### D. Persistence — `src-tauri/src/commands.rs` + `src/api.ts`

- Two new Tauri commands mirroring `load_presets` / `save_presets`, writing to `<app_config_dir>/last_rename.json` (same atomic write-temp-then-rename pattern):
  - `load_last_rename() -> Option<LastRename>` (None on first run)
  - `save_last_rename(state: LastRename) -> ()`
- `LastRename` shape: `{ mode, search, replace, use_regex, case_sensitive, apply_to }`.
- `api.ts` wrappers `loadLastRename()` / `saveLastRename(state)`.
- `App.tsx`: load on mount (same pattern as the presets effect); on any change to `mode` or the SR inputs/options, debounced-save (≈400ms). Match-mode-only state (patterns, shift) is **not** persisted by this feature — only the SR inputs, options, and the mode selector.

### E. Edge cases

- **Invalid regex** → matcher error → Rename CTA disabled, inline error shown, preview shows every file as unmatched.
- **Empty search** → no file matches (matcher matches nothing meaningful); Rename disabled.
- **Replace yields an illegal/empty name** → validation drop, counted in the summary, never sent to the engine.
- **renamed === original** (search text not present, or replace is a no-op) → unmatched, excluded from ops.
- **Two files collapse to the same dest** → conflict group flagged in preview; execution uses skip/overwrite as configured.
- **No extension** (e.g. `README`) → `stemOf` returns the whole name, `extOf` returns `''`; `'ext'` scope is a no-op (unmatched); `'name'`/`'both'` apply to the full name.
- **Undo after an SR rename** → existing `undo(reversed ops)` restores originals (generic; already tested in Rust).
- **Switching modes** keeps `allFiles`; SR recomputes its plan from `allFiles` + current `srOpts`.
- **Folders** are never in `allFiles` (`is_dir` filtered at load), so they can't be renamed.

## Testing (TDD)

`src/lib/__tests__/searchReplace.test.ts`:
- Literal replace: single occurrence; multiple occurrences in one name (global).
- Regex replace using capture groups in the replacement string (e.g. `S3 - (\d+)` → `S03E$1`).
- Case-sensitive ON vs OFF on the same search.
- `applyTo`: `'name'` preserves extension; `'ext'` preserves stem; `'both'` replaces across the full name.
- Invalid regex → `{ error }` result; empty search → no matches.
- Replace produces empty / illegal-char result → dropped (not in ops), counted.
- `renamed === original` → unmatched.
- Conflict detection: two distinct files whose renamed names collide appear in one conflict group.
- No-extension file: `'ext'` no-op; `'name'` applies to full.

Rust (`commands.rs` tests): `save_last_rename` → `load_last_rename` round-trip; first-run `load` returns None; corrupt file treated as None.

`renamePlan`, `classify`, and the existing Rust `rename_pairs` / `undo` tests are unaffected.

## Decisions logged

- **Two modes** behind a Topbar switch; Match Subtitles is unchanged.
- **Layout:** Variant 3 — Search & Replace uses a dedicated left control panel + right preview grid; Match mode keeps its right-rail shell. The shell branches by `mode`.
- **File scope:** all files, recursive; folders excluded; no toggles.
- **Replace-all:** always on (no toggle).
- **Apply-to default:** `both` (PowerRename parity).
- **Persistence:** Tauri app-config-dir JSON (`last_rename.json`), same pattern as presets; restored on mount, debounced-save on change. Covers `mode` + SR inputs/options only.
- **RenamePanel** reused as-is (`totalVideos` = in-scope count); generic `RenameOp` / `rename_pairs` / `undo` untouched.
