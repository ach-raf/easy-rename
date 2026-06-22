# Per-side regex patterns + graceful path display

Date: 2026-06-22

## Problem

Two pain points in the current matcher UI:

1. **One regex for both sides.** A single `pattern` is applied to videos and subtitles alike. Real libraries often name the two sides differently — e.g. videos `Show.Name.S01E05.1080p.WEB.mkv` vs subs `Show.E05.srt` — so no single pattern fits both well. The user wants to apply a regex to one side at a time: a video pattern and a separate subtitle pattern.
2. **Truncated file identity.** Every name cell is `white-space: nowrap; text-overflow: ellipsis` and only reveals the full text on hover. Because the app scans **recursively** (`listFiles(dir, recursive=true)`), two files in different subfolders can share a basename and become indistinguishable. The file's path is the most important info in the app and must always be visible and readable at any length.

## Goals

1. Independent regex per side: `videoPattern` and `subPattern`, applied separately to each side.
2. A **link** toggle. When ON, the video pattern is copied to the subtitle side (video is the source of truth; subs mirror it). When OFF, both sides are editable independently. *(User-specified behavior: link copies video regex → subtitle.)*
3. Auto-detect picks the `(videoPattern, subPattern)` pair that maximizes matched pairs.
4. Show each file's **path relative to the loaded folder**, never truncated, looking good at any length — in every place a file is shown.

## Non-goals

- Changing **what** the parser extracts: still one index per file, via capturing group 1. The bare-number parse result stays.
- Multiple capture groups / season+episode composite matching — explicitly deferred.
- Changes to rename / undo / conflict logic (the backend and `renamePlan` are untouched).

## Design

### A. Matching engine — `src/lib/match.ts`

`extractIndex(name, pattern, group = 1)` — **unchanged**.

`buildPairs(videos, subs, videoPattern, subPattern, shift = 0)`:
- Build `videoByIdx` from videos using **`videoPattern`** (first occurrence of each index wins, as today).
- For each sub, extract its index with **`subPattern`**; `target = idx + shift`; match into `videoByIdx`.
- Dedupe, sort by video index (extracted with `videoPattern`), and return `{ pairs, unmatchedVideos, unmatchedSubs }` — same shape as today.

`detectBestPattern(videos, subs, candidates)` now returns **`{ videoPattern, subPattern }`**:
- Joint, pair-maximizing: iterate every `(cv, cs)` combination of `candidates` (cartesian product, candidate order preserved — ties keep the earliest, video-major).
- Score each combo by `buildPairs(videos, subs, cv, cs, 0).pairs.length`; keep the max.
- Cost is `|candidates|²` (~25) × a cheap `buildPairs` — negligible. This fixes the failure mode where "best video pattern alone" and "best sub pattern alone" live in different index spaces and combine to zero pairs.

`REGEX_PRESETS`, `applyReassign`, types (`MediaFile`, `Pair`, `Row`, `MatchResult`) — **unchanged**.

### B. App state — `src/App.tsx`

- Replace `pattern: string` with `videoPattern: string` and `subPattern: string`. Add `linked: boolean` (default `true`).
- `recompute(vids, subs, vPat, sPat, sh)` builds rows via `buildPairs(vids, subs, vPat, sPat, sh)`.
- `onFolder` / `onAutoDetect`: run joint detect → set `videoPattern` + `subPattern`; set `linked = (videoPattern === subPattern)`; `recompute`.
- Setters with link semantics:
  - `setVideoPattern(p)`: if `linked`, set both `videoPattern = p` and `subPattern = p`; else only `videoPattern`. Then `recompute`.
  - `setSubPattern(p)`: no-op while `linked`; otherwise set `subPattern` + `recompute`.
  - `toggleLinked()`: turning ON copies `videoPattern → subPattern` then recomputes; turning OFF just enables independent editing (no value change).
- `PRESET_PATTERNS` stays as the detect candidate list.

### C. RegexBar — `src/components/RegexBar.tsx`

- Two pattern inputs: **Video pattern** and **Subtitle pattern**.
- While `linked` is true: subtitle input is **disabled** and muted, mirroring `videoPattern`; the sub-side preset row is hidden/disabled.
- Each side has its own preset buttons (active-state highlight per side). Video-side presets drive both when linked.
- A **link toggle** (checkbox/switch) labeled e.g. *“Same for subtitles”*. Toggling routes through `toggleLinked()`.
- Shift input stays.
- `IndexPreview` takes the relevant pattern for the side it renders: the Videos preview uses `videoPattern`, the Subtitles preview uses `subPattern` (already rendered as two separate previews in `App.tsx`; just pass the right pattern to each).

### D. Path display — shared helper + components + `app.css`

New helper `src/lib/path.ts`:

```ts
export function splitRelative(path: string, folder: string): { dir: string; base: string }
```

- Normalize separators: treat both `/` and `\` as separators (paths come from the Tauri backend, Windows-native here).
- Strip the `folder` prefix (after appending a separator to `folder` so we don't strip a partial segment), trim a leading separator.
- Split the remainder at the last separator into `dir` (may be `''`) and `base` (the filename, extension included).
- `MediaFile.path`, `RenameOp.src`, `RenameOp.dest` are all absolute paths, so one helper covers every call site.

New presentational component `src/components/FilePath.tsx`:

```tsx
export function FilePath({ dir, base, abs }: { dir: string; base: string; abs: string })
```

- Renders `<span class="path" title={abs}><span class="dir">{dir + sep}</span><span class="base">{base}</span></span>`; the `dir` span is omitted when `dir === ''`.
- `dir` is dimmed/smaller; `base` is normal weight — the filename (the part you read) stands out, the folder is supporting context.
- Wrapping handled in CSS (see below), not inline.

Call sites:
- `RegexBar.IndexPreview` — replace `<td class="name">{f.name}</td>` with `splitRelative(f.path, folder)` → `<FilePath>`. Requires `folder` to be passed into `IndexPreview` (currently it only gets `files` + `pattern`).
- `PairList.VideoRow` — video `<span class="name">` → `<FilePath>`; keep the index badge.
- `PairList` subtitle identity — today the linked sub shows only as the native `<select>`'s value, which truncates. Add a `<FilePath>` line for the selected sub's relative path (under or beside the select). The select stays as the chooser; its own single-line truncation is acceptable because the full path is shown right next to it. “— none —” shows a muted placeholder. Requires `folder` prop threaded into `PairList`.
- `UnmatchedList.SubCard` — `{sub.name}` → `<FilePath>`; keep drag listeners and `title`.
- `RenamePanel` preview — `from = basename(op.src)` / `to = basename(op.dest)` → `splitRelative(op.src, folder)` / `splitRelative(op.dest, folder)` rendered via `<FilePath>`. Requires `folder` prop.

CSS — `src/app.css`:
- Remove the truncation trio (`white-space: nowrap; text-overflow: ellipsis; overflow: hidden`) from: `.preview td.name`, `.cell`, `.cell.video .name`, `.sub-card`, `.rename-preview td`, and any other name/text cells. Keep it **only** on genuine single-line controls (e.g. the select's own text).
- On the name/path cells, set `white-space: normal; overflow-wrap: anywhere; word-break: break-word; min-width: 0;` so long tokens (e.g. `…WEB-DL.x264-GROUP.mkv`) wrap cleanly instead of overflowing the grid.
- Keep `min-width: 0` on flex/grid children so the name cell can shrink and wrap within the layout.
- Keep the index/badge columns fixed-width and right-aligned; the name cell takes the remaining width and wraps.
- Cap tall lists: `PairList` may grow large in deep folders — give its scroll container a `max-height` + `overflow-y: auto` so very long folders don't push the rename panel off-screen. (`IndexPreview` is already limited to 8 rows.)

### E. Edge cases

- **Separator normalization:** folder and path may mix `/` and `\`; normalize both with the same split regex `[\\/]+` before comparing/stripping.
- **File directly in folder:** `dir === ''` → show just the filename (clean, no dim prefix).
- **Two files, same basename, different subfolders:** full relative paths shown — distinguishable.
- **Empty / invalid pattern:** `extractIndex` returns `null` (existing behavior) → “—” and `.miss` styling, no crash.
- **Link ON + sub-side preset clicked:** disabled, no-op.
- **Auto-detect equal patterns** → `linked` stays true; **unequal** → `linked` set false and each side shows its own.
- **Undo / reload:** existing `lastApplied` clear-on-reload behavior is unaffected; relative-path display is purely presentational.

## Testing (TDD)

`src/lib/__tests__/match.test.ts`:
- Update `buildPairs` calls to the new signature `(videos, subs, videoPattern, subPattern, shift)`. Existing cases pass the same pattern for both args, preserving current behavior.
- New: different patterns per side produce correct pairs (e.g. video `S\d+E(\d+)`, sub `E(\d+)`).
- New: `detectBestPattern` returns the **pair** that maximizes pairs, including a case where independent-per-side detect would pick a zero-pair combination but joint detect picks a high-pair one.
- New `src/lib/__tests__/path.test.ts`: `splitRelative` — prefix stripping, separator normalization (`/` and `\`), file directly in folder (`dir === ''`), subfolder case, trailing-separator on folder.

`renamePlan` and `classify` tests are unaffected.

## Decisions logged

- **Link direction:** video → subtitle. Video pattern is the source of truth while linked; toggling link ON copies video → sub.
- **Default link state:** ON (common case: one pattern fits both). Auto-detect turns it OFF only when the best patterns differ.
- **Path shown:** relative to the loaded folder (common prefix stripped), with the folder portion dimmed and the filename emphasized.
- **Parse result:** unchanged — still one index per file via group 1.
