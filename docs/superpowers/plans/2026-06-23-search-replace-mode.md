# Search & Replace Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PowerRename-style "Search & Replace" rename mode to Easy Rename, alongside the existing "Match Subtitles" mode, with a live Original → Renamed preview and last-run persistence.

**Architecture:** A topbar mode switch selects between two shells. Match Subtitles is untouched. Search & Replace adds a new pure engine (`src/lib/searchReplace.ts`) that turns find/replace options into the same generic `RenameOp[]` the existing Rust `rename_pairs`/`undo` already consume — so execution, conflict policy, undo, and the report card are all reused. SR mode renders a left control panel + right preview (mockup `design-mockups/search-replace-left.html`). Last-used inputs + mode persist to a Tauri config-dir JSON.

**Tech Stack:** Tauri 2 (Rust backend), React 19 + TypeScript 5.8 (Vite 7), vitest 4 for logic tests, Depth Design System tokens (`depth.css` + `app.css`, OKLCH).

## Global Constraints

- **No AI attribution in commits, ever.** Every commit is authored as the user alone — no `Co-Authored-By: Claude` or Anthropic/AI trailer/footer. (Project-wide rule.)
- **Colors:** use the Depth CSS variables already defined (`--depth-bg-*`, `--accent*`, `--text*`, `--success`, `--warning`, etc.). No arbitrary hex / `oklch(...)` literals in component CSS — only the existing tokens.
- **Rename engine is generic and shared:** `RenameOp = { src: string; dest: string }`. Do **not** modify `rename_pairs`, `undo`, or `RenameOp` — SR feeds the same shape.
- **Match Subtitles mode must stay behaviorally unchanged** — only `App.tsx` branching + `Topbar` props change for it.
- **Folders are never renamed.** `allFiles` excludes `is_dir` entries at load.
- **Tests:** pure logic goes in `src/lib/__tests__/*.test.ts` (vitest, `npm test`). Rust logic tested with `cargo test`. There is no React component test harness in this repo — UI tasks gate on `npx tsc --noEmit` + a final manual run.
- **Commit style:** conventional commits matching the repo (`feat(sr): …`, `feat(persist): …`, etc.), one logical change per commit.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/searchReplace.ts` | Pure find/replace engine: compile matcher, evaluate files → preview rows + ops | Create |
| `src/lib/__tests__/searchReplace.test.ts` | Engine unit tests | Create |
| `src-tauri/src/commands.rs` | `load_last_rename` / `save_last_rename` Tauri commands + pure helpers + tests | Modify |
| `src-tauri/src/lib.rs` | Register the two new commands | Modify |
| `src/api.ts` | `LastRenameState` type + `loadLastRename` / `saveLastRename` wrappers | Modify |
| `src/components/icons.tsx` | Add `search` + `file` icons | Modify |
| `src/components/Topbar.tsx` | Mode-switch segmented control (optional props) | Modify |
| `src/components/SearchReplacePanel.tsx` | Left-panel controls (search/replace inputs, toggles, apply-to, summary) | Create |
| `src/components/SearchReplaceList.tsx` | Original → Renamed preview table | Create |
| `src/app.css` | `.layout-sr` shell + SR component classes | Modify |
| `src/App.tsx` | `mode`/`srOpts`/`allFiles` state, mode-aware `ops`, branch render, persistence wiring | Modify |

---

## Task 1: Search & Replace engine (pure, TDD)

**Files:**
- Create: `src/lib/searchReplace.ts`
- Test: `src/lib/__tests__/searchReplace.test.ts`

**Interfaces:**
- Consumes: `RenameOp` from `src/api.ts`; `stemOf`, `extOf` from `src/lib/classify.ts`; `dirname`, `joinPath` from `src/lib/renamePlan.ts`.
- Produces (used by Tasks 7, 8, 9): `type ApplyTo = 'both' | 'name' | 'ext'`; `interface SearchReplaceOpts { search: string; replace: string; useRegex: boolean; caseSensitive: boolean; applyTo: ApplyTo }`; `interface PreviewRow { path: string; original: string; renamed: string | null; state: 'matched' | 'unmatched' | 'conflict' }`; `interface SearchReplaceResult { rows: PreviewRow[]; ops: RenameOp[]; matched: number; unmatched: number; conflicts: number; dropped: number; error?: string }`; `compileMatcher(opts) => MatcherResult`; `isValidFileName(name) => boolean`; `evaluateSearchReplace(files: { name: string; path: string }[], opts) => SearchReplaceResult`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/searchReplace.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { compileMatcher, isValidFileName, evaluateSearchReplace, type SearchReplaceOpts } from '../searchReplace';

const o = (patch: Partial<SearchReplaceOpts> = {}): SearchReplaceOpts => ({
  search: 'S3', replace: 'S4', useRegex: false, caseSensitive: false, applyTo: 'both', ...patch,
});

describe('compileMatcher', () => {
  it('replaces every occurrence (global)', () => {
    const m = compileMatcher(o({ search: 'ab', replace: 'X' }));
    expect(m.kind).toBe('ok');
    if (m.kind === 'ok') expect(m.apply('ab ab ab')).toBe('X X X');
  });
  it('is case-insensitive by default', () => {
    const m = compileMatcher(o({ search: 'a', replace: 'X' }));
    if (m.kind === 'ok') expect(m.apply('Aa')).toBe('XX');
  });
  it('respects caseSensitive', () => {
    const m = compileMatcher(o({ search: 'a', replace: 'X', caseSensitive: true }));
    if (m.kind === 'ok') expect(m.apply('Aa')).toBe('AX');
  });
  it('escapes literal special chars', () => {
    const m = compileMatcher(o({ search: '.', replace: '_' }));
    if (m.kind === 'ok') expect(m.apply('a.b.c')).toBe('a_b_c');
  });
  it('uses regex with capture groups when useRegex', () => {
    const m = compileMatcher(o({ search: 'S(\\d)', replace: 'S0$1', useRegex: true }));
    if (m.kind === 'ok') expect(m.apply('Show S3')).toBe('Show S03');
  });
  it('returns error on invalid regex', () => {
    expect(compileMatcher(o({ search: '(', useRegex: true })).kind).toBe('error');
  });
  it('returns error on empty search', () => {
    expect(compileMatcher(o({ search: '' })).kind).toBe('error');
  });
});

describe('isValidFileName', () => {
  it('rejects empty / reserved / illegal', () => {
    expect(isValidFileName('')).toBe(false);
    expect(isValidFileName('   ')).toBe(false);
    expect(isValidFileName('.')).toBe(false);
    expect(isValidFileName('..')).toBe(false);
    expect(isValidFileName('a<b')).toBe(false);
    expect(isValidFileName('a/b')).toBe(false);
    expect(isValidFileName('a:b')).toBe(false);
    expect(isValidFileName('good.mkv')).toBe(true);
  });
  it('allows spaces and hyphens (common in real names)', () => {
    expect(isValidFileName('S4 - 01.mkv')).toBe(true);
    expect(isValidFileName('Show Name [Group].ass')).toBe(true);
  });
});

describe('evaluateSearchReplace', () => {
  const files = (names: string[]) => names.map((n) => ({ name: n, path: `/root/${n}` }));

  it('matches and builds rename ops on the full name', () => {
    const r = evaluateSearchReplace(files(['S3 - 01.mkv', 'thumbs.jpg']), o({ search: 'S3', replace: 'S4' }));
    expect(r.matched).toBe(1);
    expect(r.unmatched).toBe(1);
    expect(r.ops[0]).toEqual({ src: '/root/S3 - 01.mkv', dest: '/root/S4 - 01.mkv' });
    expect(r.rows[0].renamed).toBe('S4 - 01.mkv');
    expect(r.rows[0].state).toBe('matched');
    expect(r.rows[1].state).toBe('unmatched');
  });

  it("applyTo 'name' preserves the extension", () => {
    const r = evaluateSearchReplace(files(['S3.mkv']), o({ search: 'S3', replace: 'S4', applyTo: 'name' }));
    expect(r.rows[0].renamed).toBe('S4.mkv');
  });

  it("applyTo 'ext' preserves the stem", () => {
    const r = evaluateSearchReplace(files(['show.MKV']), o({ search: 'mkv', replace: 'mp4', applyTo: 'ext' }));
    expect(r.rows[0].renamed).toBe('show.mp4');
  });

  it("applyTo 'ext' is a no-op when there is no extension", () => {
    const r = evaluateSearchReplace(files(['README']), o({ search: 'X', replace: 'Y', applyTo: 'ext' }));
    expect(r.rows[0].state).toBe('unmatched');
    expect(r.ops).toHaveLength(0);
  });

  it('regex with capture group in replacement', () => {
    const r = evaluateSearchReplace(files(['Major S3 - 01.mkv']), o({ search: 'S(\\d+) - (\\d+)', replace: 'S0$1E$2', useRegex: true }));
    expect(r.rows[0].renamed).toBe('Major S03E01.mkv');
  });

  it('drops matches that produce an illegal name', () => {
    const r = evaluateSearchReplace(files(['ok.mkv']), o({ search: 'ok', replace: 'a/b' }));
    expect(r.matched).toBe(0);
    expect(r.dropped).toBe(1);
    expect(r.ops).toHaveLength(0);
  });

  it('flags conflicts when two files collapse to the same dest', () => {
    const r = evaluateSearchReplace(files(['a1.txt', 'a2.txt']), o({ search: 'a[12]', replace: 'x', useRegex: true }));
    expect(r.conflicts).toBe(1);
    expect(r.rows.every((row) => row.state === 'conflict')).toBe(true);
    expect(r.ops).toHaveLength(2);
  });

  it('returns error + all unmatched on invalid regex', () => {
    const r = evaluateSearchReplace(files(['a.txt', 'b.txt']), o({ search: '(', useRegex: true }));
    expect(r.error).toBeTruthy();
    expect(r.matched).toBe(0);
    expect(r.unmatched).toBe(2);
    expect(r.ops).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- searchReplace`
Expected: FAIL — module `../searchReplace` not found.

- [ ] **Step 3: Implement the engine**

Create `src/lib/searchReplace.ts`:

```ts
import type { RenameOp } from '../api';
import { stemOf, extOf } from './classify';
import { dirname, joinPath } from './renamePlan';

export type ApplyTo = 'both' | 'name' | 'ext';

export interface SearchReplaceOpts {
  search: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  applyTo: ApplyTo;
}

export type MatcherResult =
  | { kind: 'ok'; apply: (input: string) => string }
  | { kind: 'error'; message: string };

export interface PreviewRow {
  path: string;
  original: string;
  renamed: string | null;
  state: 'matched' | 'unmatched' | 'conflict';
}

export interface SearchReplaceResult {
  rows: PreviewRow[];
  ops: RenameOp[];
  matched: number;
  unmatched: number;
  conflicts: number;
  dropped: number;
  error?: string;
}

/** Escape regex-special characters so a literal search can reuse the RegExp path. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Compile the search/replace into a single global matcher. Always global —
 *  there is no "first match only" mode. Invalid regex → error result. */
export function compileMatcher(opts: SearchReplaceOpts): MatcherResult {
  if (opts.search === '') return { kind: 'error', message: 'Search is empty' };
  const flags = 'g' + (opts.caseSensitive ? '' : 'i');
  const source = opts.useRegex ? opts.search : escapeRegex(opts.search);
  try {
    const re = new RegExp(source, flags);
    return { kind: 'ok', apply: (input: string) => input.replace(re, opts.replace) };
  } catch (e) {
    return { kind: 'error', message: `Invalid regex: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Windows-reserved filename characters. (Plain array + charCodeAt avoids any
// regex-escape pitfalls; spaces and hyphens are NOT here — real names like
// `S4 - 01.mkv` must pass validation.)
const ILLEGAL_CHARS = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/** A rename target must be a real, non-reserved, legal Windows filename. */
export function isValidFileName(name: string): boolean {
  if (!name || name.trim() === '') return false;
  if (name === '.' || name === '..') return false;
  if (ILLEGAL_CHARS.some((c) => name.includes(c))) return false;
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) < 0x20) return false; // block control chars (NUL, newline, etc.)
  }
  return true;
}

/** Apply the matcher to the chosen scope and reassemble the full filename. */
function applyScoped(fileName: string, opts: SearchReplaceOpts, apply: (s: string) => string): string {
  const ext = extOf(fileName);
  const stem = stemOf(fileName);
  if (opts.applyTo === 'name') return apply(stem) + (ext ? '.' + ext : '');
  if (opts.applyTo === 'ext') return ext ? stem + '.' + apply(ext) : fileName;
  return apply(fileName);
}

/** One pass: preview rows + rename ops + counts. Source of truth for both the
 *  preview list (`.rows`) and the rename engine (`.ops`). */
export function evaluateSearchReplace(files: { name: string; path: string }[], opts: SearchReplaceOpts): SearchReplaceResult {
  const matcher = compileMatcher(opts);
  if (matcher.kind === 'error') {
    return {
      rows: files.map((f) => ({ path: f.path, original: f.name, renamed: null, state: 'unmatched' as const })),
      ops: [], matched: 0, unmatched: files.length, conflicts: 0, dropped: 0, error: matcher.message,
    };
  }
  const apply = matcher.apply;
  const rows: PreviewRow[] = [];
  const ops: RenameOp[] = [];
  let matched = 0, unmatched = 0, dropped = 0;

  for (const f of files) {
    const next = applyScoped(f.name, opts, apply);
    if (next === f.name) {
      rows.push({ path: f.path, original: f.name, renamed: null, state: 'unmatched' });
      unmatched++;
      continue;
    }
    if (!isValidFileName(next)) {
      rows.push({ path: f.path, original: f.name, renamed: null, state: 'unmatched' });
      unmatched++;
      dropped++;
      continue;
    }
    rows.push({ path: f.path, original: f.name, renamed: next, state: 'matched' });
    ops.push({ src: f.path, dest: joinPath(dirname(f.path), next) });
    matched++;
  }

  // Conflict detection: multiple ops targeting the same dest path.
  const byDest = new Map<string, number>();
  for (const op of ops) byDest.set(op.dest, (byDest.get(op.dest) ?? 0) + 1);
  const conflictDests = new Set<string>();
  for (const [dest, n] of byDest) if (n > 1) conflictDests.add(dest);
  if (conflictDests.size > 0) {
    for (const r of rows) {
      if (r.renamed && conflictDests.has(joinPath(dirname(r.path), r.renamed))) r.state = 'conflict';
    }
  }
  const conflicts = conflictDests.size;

  return { rows, ops, matched, unmatched, conflicts, dropped };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- searchReplace`
Expected: PASS — all `compileMatcher`, `isValidFileName`, `evaluateSearchReplace` cases green.

- [ ] **Step 5: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/searchReplace.ts src/lib/__tests__/searchReplace.test.ts
git commit -m "feat(sr): add pure search/replace engine"
```

---

## Task 2: Persistence backend (Rust + api.ts, TDD)

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/api.ts`

**Interfaces:**
- Consumes: the Tauri `app_config_dir` pattern + atomic write already used by `load_presets`/`save_presets`.
- Produces (used by Task 8): Tauri commands `load_last_rename` / `save_last_rename`; TS `LastRenameState` type (= `{ mode } & SearchReplaceOpts` in flat camelCase) + `loadLastRename()` / `saveLastRename(state)` in `src/api.ts`. Rust `LastRename` serializes with `#[serde(rename_all = "camelCase")]` so JSON keys are `{ mode, search, replace, useRegex, caseSensitive, applyTo }`.

- [ ] **Step 1: Add the Rust pure helpers + commands + tests**

In `src-tauri/src/commands.rs`, add after the `Preset` / `presets_file` block (near line 40):

```rust
/// The last-used Search & Replace inputs + active mode. Persisted as JSON in
/// the app config dir (camelCase keys to match the TS SearchReplaceOpts shape).
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LastRename {
    pub mode: String,
    pub search: String,
    pub replace: String,
    pub use_regex: bool,
    pub case_sensitive: bool,
    pub apply_to: String,
}

/// Where the last-run state lives: `<app_config_dir>/last_rename.json`.
fn last_rename_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("last_rename.json"))
}

/// Pure load (path-based) so it is unit-testable without an AppHandle.
/// Missing file (first run) and corrupt file both resolve to None.
fn load_last_rename_at(path: &Path) -> Option<LastRename> {
    match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).ok(),
        Err(_) => None,
    }
}

/// Pure save (path-based): write a temp sibling then move, so a crash mid-write
/// cannot leave a half-written file behind. Mirrors save_presets.
fn save_last_rename_at(path: &Path, state: &LastRename) -> Result<(), String> {
    let s = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, s).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_last_rename(app: tauri::AppHandle) -> Result<Option<LastRename>, String> {
    Ok(load_last_rename_at(&last_rename_file(&app)?))
}

#[tauri::command]
pub fn save_last_rename(app: tauri::AppHandle, state: LastRename) -> Result<(), String> {
    save_last_rename_at(&last_rename_file(&app)?, &state)
}
```

Then, inside the existing `#[cfg(test)] mod tests` block, append:

```rust
    #[test]
    fn last_rename_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("last_rename.json");
        let state = LastRename {
            mode: "searchReplace".into(), search: "S3".into(), replace: "S4".into(),
            use_regex: false, case_sensitive: true, apply_to: "both".into(),
        };
        save_last_rename_at(&path, &state).unwrap();
        let loaded = load_last_rename_at(&path).expect("should load after save");
        assert_eq!(loaded.search, "S3");
        assert!(loaded.case_sensitive);
        assert_eq!(loaded.apply_to, "both");
    }

    #[test]
    fn last_rename_missing_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("nope.json");
        assert!(load_last_rename_at(&path).is_none());
    }

    #[test]
    fn last_rename_corrupt_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("last_rename.json");
        std::fs::write(&path, b"{ not valid json").unwrap();
        assert!(load_last_rename_at(&path).is_none());
    }
```

- [ ] **Step 2: Run the Rust tests to verify they fail then pass**

Run (from repo root): `npx tauri build --no-bundle` is too slow for a gate — instead run the Rust tests directly:

```bash
cd src-tauri && cargo test last_rename && cd ..
```

Expected: the three `last_rename_*` tests PASS (they test the pure helpers added in this same step). If you prefer strict TDD order, add only the tests + `LastRename` struct first, run to see them fail to compile, then add the helpers — but because the helpers are trivial mirrors of `presets_*`, adding together is acceptable.

- [ ] **Step 3: Register the commands in `lib.rs`**

In `src-tauri/src/lib.rs`, extend the `generate_handler!` list (currently ends at `commands::save_presets,`) to add the two new commands:

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
        ])
```

- [ ] **Step 4: Add the TS wrappers in `api.ts`**

In `src/api.ts`, append after the `savePresets` export:

```ts
export type RenameMode = 'match' | 'searchReplace';

/** Flat camelCase mirror of the Rust `LastRename` struct. */
export interface LastRenameState {
  mode: RenameMode;
  search: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  applyTo: 'both' | 'name' | 'ext';
}

export const loadLastRename = () => invoke<LastRenameState | null>('load_last_rename');

export const saveLastRename = (state: LastRenameState) =>
  invoke<void>('save_last_rename', { state });
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs src/api.ts
git commit -m "feat(persist): add last-used rename persistence backend"
```

---

## Task 3: Topbar mode switch

**Files:**
- Modify: `src/components/Topbar.tsx`

**Interfaces:**
- Consumes: `.segmented` / `.seg` / `.seg-label` classes (already in `app.css`); `Icon` from `./icons`.
- Produces (used by Task 7): `Topbar` now accepts optional `mode?: 'match' | 'searchReplace'` and `onModeChange?: (m) => void`; renders a `Match Subtitles | Search & Replace` segmented control between `<Dropzone>` and `<ThemeControls>` **only when both are passed** (so it stays backward-compatible until App wires it).

- [ ] **Step 1: Add the mode switch**

Replace the entire contents of `src/components/Topbar.tsx` with:

```tsx
import { Dropzone } from './Dropzone';
import { Icon } from './icons';
import { ThemeControls } from './ThemeControls';

export type Mode = 'match' | 'searchReplace';

interface Props {
  onFolder: (dir: string) => void;
  folder: string | null;
  mode?: Mode;
  onModeChange?: (mode: Mode) => void;
}

export function Topbar({ onFolder, folder, mode, onModeChange }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo"><Icon name="logo" size={17} /></span>
        Easy Rename
      </div>
      <Dropzone onFolder={onFolder} loaded={folder} />
      {mode && onModeChange ? (
        <div className="segmented mode-switch" role="radiogroup" aria-label="Rename mode">
          <span className="seg-label">Mode</span>
          <button
            type="button" role="radio" aria-checked={mode === 'match'}
            className={'seg' + (mode === 'match' ? ' active' : '')}
            onClick={() => onModeChange('match')}
          >Match Subtitles</button>
          <button
            type="button" role="radio" aria-checked={mode === 'searchReplace'}
            className={'seg' + (mode === 'searchReplace' ? ' active' : '')}
            onClick={() => onModeChange('searchReplace')}
          >Search &amp; Replace</button>
        </div>
      ) : null}
      <ThemeControls />
    </header>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the new props are optional, so existing call sites still compile).

- [ ] **Step 3: Commit**

```bash
git add src/components/Topbar.tsx
git commit -m "feat(ui): add rename-mode switch to Topbar"
```

---

## Task 4: SearchReplacePanel (left-panel controls)

**Files:**
- Modify: `src/components/icons.tsx` (add `search`)
- Create: `src/components/SearchReplacePanel.tsx`

**Interfaces:**
- Consumes: `SearchReplaceOpts`, `SearchReplaceResult`, `ApplyTo` from `src/lib/searchReplace.ts` (Task 1); `.depth-card`, `.rail-section`, `.field`, `.text-input`, `.link-toggle`, `.switch`, `.sub-select`, `.badge badge-*`, `.hint`, `.api-error` classes (app.css / depth.css). New classes `.sr-controls`, `.sr-fields`, `.sr-input-wrap`, `.lead-icon`, `.sr-toggles`, `.summary-row` are added in Task 6.
- Produces (used by Task 7): default export `SearchReplacePanel({ opts, onChange, summary })` where `onChange(next: SearchReplaceOpts)` fires on every edit.

- [ ] **Step 1: Add the `search` icon**

In `src/components/icons.tsx`, add one entry to the `PATHS` object (e.g. after the `alert` entry):

```tsx
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
```

- [ ] **Step 2: Create the component**

Create `src/components/SearchReplacePanel.tsx`:

```tsx
import { Icon } from './icons';
import type { ApplyTo, SearchReplaceOpts, SearchReplaceResult } from '../lib/searchReplace';

interface Props {
  opts: SearchReplaceOpts;
  onChange: (next: SearchReplaceOpts) => void;
  summary: SearchReplaceResult;
}

const APPLY_TO: { value: ApplyTo; label: string }[] = [
  { value: 'both', label: 'Filename + extension' },
  { value: 'name', label: 'Filename only' },
  { value: 'ext', label: 'Extension only' },
];

export function SearchReplacePanel({ opts, onChange, summary }: Props) {
  const set = (patch: Partial<SearchReplaceOpts>) => onChange({ ...opts, ...patch });

  return (
    <div className="depth-card rail-section sr-controls">
      <h3>Search &amp; Replace</h3>

      <div className="sr-fields">
        <div className="field">
          <label>Search for</label>
          <div className="sr-input-wrap">
            <Icon name="search" size={15} className="lead-icon" />
            <input
              className="text-input"
              value={opts.search}
              onChange={(e) => set({ search: e.target.value })}
              placeholder="Text or regex"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="field">
          <label>Replace with</label>
          <input
            className="text-input"
            value={opts.replace}
            onChange={(e) => set({ replace: e.target.value })}
            placeholder="Replacement"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="sr-toggles">
        <label className="link-toggle">
          <input type="checkbox" checked={opts.useRegex} onChange={(e) => set({ useRegex: e.target.checked })} />
          <span className="switch" />Use regular expressions
        </label>
        <label className="link-toggle">
          <input type="checkbox" checked={opts.caseSensitive} onChange={(e) => set({ caseSensitive: e.target.checked })} />
          <span className="switch" />Case sensitive
        </label>
      </div>

      <div className="field">
        <label>Apply to</label>
        <select className="sub-select" value={opts.applyTo} onChange={(e) => set({ applyTo: e.target.value as ApplyTo })}>
          {APPLY_TO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="summary-row">
        <span className="badge badge-success">{summary.matched} matched</span>
        <span className="badge badge-neutral">{summary.unmatched} unmatched</span>
        <span className="badge badge-info">{summary.conflicts} conflicts</span>
      </div>

      {summary.error ? <p className="api-error">{summary.error}</p> : null}
      <p className="hint">Auto-saved — restored on next launch.</p>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/icons.tsx src/components/SearchReplacePanel.tsx
git commit -m "feat(sr): add SearchReplacePanel controls"
```

---

## Task 5: SearchReplaceList (Original → Renamed preview)

**Files:**
- Modify: `src/components/icons.tsx` (add `file`)
- Create: `src/components/SearchReplaceList.tsx`

**Interfaces:**
- Consumes: `PreviewRow` from `src/lib/searchReplace.ts` (Task 1); `classify` from `src/lib/classify.ts` (to pick the row icon); `.pairs`, `.depth-card`, `.preview-*`, `.scroll-area`, `.idx`, `.file`, `.arrow`, `.row-state`, `.dot` classes. New `.preview-*` classes are added in Task 6.
- Produces (used by Task 7): default export `SearchReplaceList({ rows })` rendering the two-column preview.

- [ ] **Step 1: Add the `file` icon**

In `src/components/icons.tsx`, add one entry to `PATHS` (e.g. after the new `search` entry):

```tsx
  file: <><path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" /><path d="M15 3v4h4" /></>,
```

- [ ] **Step 2: Create the component**

Create `src/components/SearchReplaceList.tsx`:

```tsx
import { Icon, type IconName } from './icons';
import { classify } from '../lib/classify';
import type { PreviewRow } from '../lib/searchReplace';

interface Props {
  rows: PreviewRow[];
}

function iconFor(name: string): IconName {
  const kind = classify(name);
  if (kind === 'video') return 'video';
  if (kind === 'subtitle') return 'captions';
  return 'file';
}

export function SearchReplaceList({ rows }: Props) {
  const renamedCount = rows.filter((r) => r.state === 'matched' || r.state === 'conflict').length;

  return (
    <div className="pairs depth-card preview-card">
      <div className="preview-head">
        <h2 className="pairs-title">Search &amp; Replace preview</h2>
        <span className="pairs-count">{rows.length} files in scope</span>
      </div>
      <div className="preview-grid-head">
        <div>#</div>
        <div>Original <span className="count">{rows.length}</span></div>
        <div></div>
        <div>Renamed <span className="count">{renamedCount}</span></div>
        <div></div>
      </div>
      <div className="scroll-area">
        {rows.map((r, i) => (
          <div key={r.path} className={'preview-row ' + r.state}>
            <div className="idx">{String(i + 1).padStart(2, '0')}</div>
            <div className="file">
              <Icon name={iconFor(r.original)} size={15} />
              <span className="name" title={r.original}>{r.original}</span>
            </div>
            <div className="arrow">{r.state === 'unmatched' ? '·' : '→'}</div>
            <div className="file renamed">
              <span className="name" title={r.renamed ?? ''}>
                {r.renamed ?? (r.state === 'conflict' ? '— conflict' : '— no match')}
              </span>
            </div>
            <div className="row-state">
              <span className={'dot ' + (r.state === 'matched' ? 'success' : 'warn')}></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/icons.tsx src/components/SearchReplaceList.tsx
git commit -m "feat(sr): add Original/Renamed preview list"
```

---

## Task 6: Styles for SR mode (`.layout-sr` shell + components)

**Files:**
- Modify: `src/app.css`

**Interfaces:**
- Consumes: all Depth tokens already in `app.css` / `depth.css`.
- Produces: `.app.layout-sr` grid shell, `.left-panel`, `.mode-switch`, `.sr-controls`, `.sr-fields`, `.sr-input-wrap`, `.lead-icon`, `.sr-toggles`, `.summary-row`, `.preview-card`, `.preview-head`, `.preview-grid-head`, `.preview-row` (+ states) — consumed by Tasks 3, 4, 5, 7.

- [ ] **Step 1: Append the SR styles**

Append the following block to the end of `src/app.css`:

```css

/* ============================ SEARCH & REPLACE MODE (.layout-sr) ============================ */
.app.layout-sr {
  grid-template-columns: 340px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
}
.app.layout-sr .topbar     { grid-column: 1 / -1; }
.app.layout-sr .left-panel { grid-column: 1; grid-row: 2; display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; padding-right: 2px; }
.app.layout-sr .work       { grid-column: 2; grid-row: 2; }

/* mode switch in topbar */
.mode-switch { margin-left: 4px; }
.mode-switch .seg { padding: 6px 11px; }

/* search/replace controls */
.sr-controls { display: flex; flex-direction: column; gap: 14px; }
.sr-controls h3 { margin: 0 0 2px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-subtle); }
.sr-fields { display: flex; flex-direction: column; gap: 12px; }
.sr-input-wrap { position: relative; display: flex; align-items: center; }
.sr-input-wrap .lead-icon { position: absolute; left: 10px; color: var(--text-subtle); pointer-events: none; }
.sr-input-wrap .text-input { padding-left: 32px; width: 100%; }
.sr-toggles { display: flex; flex-direction: column; gap: 11px; }
.sr-toggles .link-toggle { font-size: 13px; color: var(--text); }
.summary-row { display: flex; gap: 7px; flex-wrap: wrap; align-items: center; }
.summary-row .badge { font-size: 11.5px; }

/* preview table (original -> renamed) */
.preview-card { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.preview-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 14px 16px 10px; }
.preview-grid-head {
  display: grid; grid-template-columns: 34px minmax(0, 1fr) 30px minmax(0, 1fr) 30px;
  gap: 10px; align-items: center;
  padding: 0 16px 8px; margin: 0 8px; border-bottom: 1px solid var(--border);
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-subtle);
}
.preview-grid-head .count { font-family: var(--mono); color: var(--text-muted); margin-left: 4px; text-transform: none; letter-spacing: 0; }
.preview-row {
  display: grid; grid-template-columns: 34px minmax(0, 1fr) 30px minmax(0, 1fr) 30px;
  gap: 10px; align-items: center;
  padding: 8px 10px; border-radius: var(--r-sm); border: 1px solid transparent;
  transition: background var(--t-fast), border-color var(--t-fast);
}
.preview-row + .preview-row { margin-top: 2px; }
.preview-row:hover { background: var(--depth-bg-elevated); }
.preview-row .file .name {
  font-family: var(--mono); font-size: 11.5px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.preview-row.matched .renamed .name { color: var(--accent); }
.preview-row.unmatched { opacity: 0.5; }
.preview-row.unmatched .renamed .name { color: var(--text-subtle); font-style: italic; }
.preview-row.conflict .renamed .name { color: var(--warning); }
```

- [ ] **Step 2: Build to verify CSS parses + no broken imports**

Run: `npm run build`
Expected: `tsc` + `vite build` succeed, producing `dist/`.

- [ ] **Step 3: Commit**

```bash
git add src/app.css
git commit -m "feat(sr): add layout-sr shell + component styles"
```

---

## Task 7: App integration (mode state, allFiles, branch render)

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `evaluateSearchReplace`, `type SearchReplaceOpts` from `./lib/searchReplace` (Task 1); `SearchReplacePanel` (Task 4); `SearchReplaceList` (Task 5); `Topbar` with new `mode`/`onModeChange` props (Task 3); existing `buildRenamePlan`, `RenamePanel`, `listFiles`, `classify`, `extOf`.
- Produces: a working two-mode app. Match mode unchanged; SR mode renders `layout-sr` shell with left panel (`SearchReplacePanel` + `RenamePanel`) and right preview (`SearchReplaceList`). `ops` is mode-aware. Persistence wiring is added separately in Task 8.

- [ ] **Step 1: Add imports + state**

In `src/App.tsx`:

Add to the existing import from `./lib/match` line is unchanged. Add these imports near the other `./lib` imports:

```ts
import { evaluateSearchReplace, type SearchReplaceOpts } from './lib/searchReplace';
```

Add the component imports near the other `./components` imports:

```ts
import { SearchReplacePanel } from './components/SearchReplacePanel';
import { SearchReplaceList } from './components/SearchReplaceList';
```

Inside `App()`, after the existing `useState` declarations (e.g. after the `presets` state line, ~line 35), add:

```ts
  const [mode, setMode] = useState<'match' | 'searchReplace'>('match');
  const [srOpts, setSrOpts] = useState<SearchReplaceOpts>({
    search: '', replace: '', useRegex: false, caseSensitive: false, applyTo: 'both',
  });
  const [allFiles, setAllFiles] = useState<{ name: string; path: string }[]>([]);
```

- [ ] **Step 2: Make `ops` mode-aware and add the SR memo**

Replace the existing `ops` `useMemo` (the one calling `buildRenamePlan`) with:

```ts
  const matchOps = useMemo(
    () => buildRenamePlan(rows.filter((r) => r.sub).map((r) => ({ video: r.video, sub: r.sub! }))),
    [rows],
  );
  const srResult = useMemo(() => evaluateSearchReplace(allFiles, srOpts), [allFiles, srOpts]);
  const ops = mode === 'searchReplace' ? srResult.ops : matchOps;
```

- [ ] **Step 3: Populate `allFiles` in `onFolder`**

In the `onFolder` callback, the loop currently builds `vids` and `subz` from non-dir entries. Extend it to also collect every non-dir entry into `all`. Replace the loop body region (the `for (const e of entries)` block) so it reads:

```ts
    const vids: MediaFile[] = [];
    const subz: MediaFile[] = [];
    const all: { name: string; path: string }[] = [];
    for (const e of entries) {
      if (e.is_dir) continue;
      all.push({ name: e.name, path: e.path });
      const kind = classify(e.name);
      if (kind === 'other') continue;
      const mf: MediaFile = { id: e.path, name: e.name, path: e.path, ext: extOf(e.name), kind };
      if (kind === 'video') vids.push(mf); else subz.push(mf);
    }
```

Then, alongside the existing `setVideos(vids)` / `setSubs(subz)` calls in the same callback, add:

```ts
    all.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setAllFiles(all);
```

- [ ] **Step 4: Branch the render by mode**

Locate the final `return ( <div className="app layout-rail"> … </div> )` (the loaded-state match-mode render). Immediately **before** it, insert the SR-mode render:

```tsx
  if (mode === 'searchReplace') {
    return (
      <div className="app layout-sr">
        <Topbar onFolder={onFolder} folder={folder} mode={mode} onModeChange={setMode} />
        <aside className="left-panel">
          <SearchReplacePanel opts={srOpts} onChange={setSrOpts} summary={srResult} />
          <RenamePanel
            ops={ops} folder={folder} onConflict={onConflict} setOnConflict={setOnConflict}
            onRun={onRun} onUndo={onUndo} busy={busy} canUndo={lastApplied !== null}
            report={report} apiError={apiError} totalVideos={allFiles.length}
          />
        </aside>
        <main className="work">
          <SearchReplaceList rows={srResult.rows} />
        </main>
      </div>
    );
  }
```

Then, in the existing match-mode `return`, pass the mode props to `<Topbar>`:

```tsx
      <Topbar onFolder={onFolder} folder={folder} mode={mode} onModeChange={setMode} />
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(sr): wire Search & Replace mode into App"
```

---

## Task 8: Persistence wiring (restore on launch, debounced save)

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `loadLastRename`, `saveLastRename` from `./api` (Task 2); the `mode` and `srOpts` state from Task 7.
- Produces: last-used `mode` + `srOpts` restored on mount, and saved (debounced) whenever they change.

- [ ] **Step 1: Add the import**

In `src/App.tsx`, extend the `./api` import to include the two new wrappers. The current import line reads:

```ts
import { listFiles, renamePairs, undoRenames, loadPresets, savePresets, type RenameOp, type RenameReport, type Preset } from './api';
```

Change it to:

```ts
import { listFiles, renamePairs, undoRenames, loadPresets, savePresets, loadLastRename, saveLastRename, type RenameOp, type RenameReport, type Preset } from './api';
```

- [ ] **Step 2: Add a hydration flag + load effect**

At the top of `App()` with the other hooks, add:

```ts
  const hydratedRef = useRef(false);
```

(Add `useRef` to the existing `react` import if not already present — the current import is `import { useCallback, useEffect, useMemo, useState } from 'react';`, so add `useRef`.)

Then add this effect (next to the existing presets-load effect):

```ts
  // Restore last-used Search & Replace inputs + mode on launch.
  useEffect(() => {
    let cancelled = false;
    loadLastRename()
      .then((s) => {
        if (cancelled || !s) return;
        setMode(s.mode);
        setSrOpts({ search: s.search, replace: s.replace, useRegex: s.useRegex, caseSensitive: s.caseSensitive, applyTo: s.applyTo });
      })
      .catch(() => { /* first run or unreadable — keep defaults */ })
      .finally(() => { if (!cancelled) hydratedRef.current = true; });
    return () => { cancelled = true; };
  }, []);
```

- [ ] **Step 3: Add the debounced save effect**

Add this effect after the load effect:

```ts
  // Debounced-save the SR inputs + mode whenever they change (after hydration).
  useEffect(() => {
    if (!hydratedRef.current) return;
    const id = setTimeout(() => {
      saveLastRename({ mode, ...srOpts }).catch((e) => setApiError(String(e)));
    }, 400);
    return () => clearTimeout(id);
  }, [mode, srOpts]);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(persist): restore + auto-save last-used rename inputs"
```

---

## Task 9: Verify (build, tests, manual run)

**Files:** none (verification only)

**Interfaces:** consumes the whole feature.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all existing tests + the new `searchReplace` tests + Rust `last_rename_*` tests pass. (Rust tests are run via `cd src-tauri && cargo test && cd ..` if not already green from Task 2.)

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `tsc` + `vite build` succeed.

- [ ] **Step 3: Run the app**

Run: `npm run tauri dev`
Expected: the window opens. Load a folder with mixed files (videos, subtitles, an image, a subfolder).

- [ ] **Step 4: Manual checklist**

Confirm each by interacting:
- Topbar shows the **Mode** switch; default is **Match Subtitles** (existing flow unchanged).
- Switch to **Search & Replace**: layout flips to left control panel + right preview; all files (incl. non-media) listed; subfolder contents present, the folder row itself absent (folders excluded).
- Type a search present in some filenames (e.g. a release-group tag) and a replacement: matched rows show the renamed name in accent with a green dot; unmatched rows dimmed. Header counts `Original (N)` / `Renamed (M)` update live.
- Toggle **Use regular expressions**, enter a pattern with a capture group (e.g. `S(\d+) - (\d+)` → `S0$1E$2`); preview reflects it. Enter an invalid regex (e.g. `(`): summary shows an error, Rename button disabled.
- Toggle **Case sensitive**: matching narrows as expected.
- Change **Apply to** to *Filename only* / *Extension only*: extension / stem preserved accordingly.
- Click **Rename**: files rename on disk; **Undo last** reverts them; the report card shows applied/skipped/errors.
- Reload the window (`Ctrl+R`): mode stays **Search & Replace** and the last search/replace/options are restored.

- [ ] **Step 5: Final commit (if any fixups were needed)**

Only if verification surfaced fixes:

```bash
git add -A
git commit -m "fix(sr): verification fixes"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** Mode switch (Task 3 + 7); engine with regex/case/apply-to/global (Task 1); all-files/no-folders scope (Task 7 `allFiles`); Original→Renamed preview + counts (Task 5); persistence of inputs+mode (Tasks 2 + 8); RenamePanel reuse (Task 7 passes `totalVideos={allFiles.length}`); undo/conflict/report reuse (unchanged, exercised in Task 9). All spec goals covered.
- **Placeholder scan:** none — every step has complete code or exact commands.
- **Type consistency:** `SearchReplaceOpts` / `PreviewRow` / `SearchReplaceResult` / `ApplyTo` names match across Tasks 1, 4, 5, 7. `LastRenameState` (camelCase) matches the Rust `#[serde(rename_all = "camelCase")]` struct. `evaluateSearchReplace` is the single entry used by App (the spec's `previewRename`/`buildSearchReplacePlan` are realized inside it).
