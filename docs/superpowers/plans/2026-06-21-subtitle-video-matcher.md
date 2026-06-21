# Easy Rename — Subtitle/Video Matcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tauri desktop app where you drop a folder of videos + subtitle files, auto-match them by regex-extracted episode index, drag to fix any wrong matches, then rename each subtitle to match its video's name while keeping the subtitle's extension.

**Architecture:** Pure TypeScript domain functions (classify → extract index → build pairs → rename plan) drive a React UI. The Rust/Tauri backend only lists directories and performs/undoes renames. Drag-and-drop uses Tauri 2's built-in webview drag-drop event; reassignment uses `@dnd-kit`.

**Tech Stack:** Tauri 2.x, React 18 + TypeScript + Vite, Vitest, `@dnd-kit/core` + `@dnd-kit/sortable`, `tauri-plugin-dialog`. Rust: `serde`, `std::fs`.

## Global Constraints

- **Platform target:** Windows first (`x86_64-pc-windows-msvc`). Build via `pnpm tauri build` → produces `.msi` + `.exe` (NSIS) under `src-tauri/target/release/bundle/`.
- **Toolchain (already verified present):** Rust 1.96, Node 24, pnpm 9.9, VS Build Tools 2022, WebView2 runtime.
- **Package manager:** pnpm everywhere (`pnpm install`, `pnpm tauri dev`, etc.).
- **Naming rule:** subtitle's new name = video basename (no extension) + `.` + subtitle's original extension, lowercased. Example: video `Show.S01E01.mkv` + sub `ep01.srt` → sub renamed to `Show.S01E01.srt`.
- **Scope:** single folder per session; operate only on files the user explicitly loads (no recursive filesystem scanning outside the dropped folder).
- **No AI attribution** in commits or anywhere else (per user's global rule).
- **DRY / YAGNI / TDD** for all pure logic.
- Project root: `d:/PycharmProjects/easy_rename`.

## File Structure

```
easy_rename/
├── docs/superpowers/plans/            # this plan
├── package.json                       # pnpm, frontend deps, tauri scripts
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/                               # frontend (TS)
│   ├── main.tsx                       # React entry
│   ├── App.tsx                        # top-level state + layout
│   ├── app.css                        # global styles
│   ├── lib/
│   │   ├── classify.ts                # ext/kind helpers (Task 2)
│   │   ├── match.ts                   # extractIndex + buildPairs (Task 3)
│   │   ├── renamePlan.ts              # buildRenamePlan + path helpers (Task 4)
│   │   └── __tests__/
│   │       ├── classify.test.ts
│   │       ├── match.test.ts
│   │       └── renamePlan.test.ts
│   ├── components/
│   │   ├── Dropzone.tsx               # OS drop + folder picker (Task 6)
│   │   ├── RegexBar.tsx               # presets + custom + live preview (Task 7)
│   │   ├── PairList.tsx               # dnd-kit matched rows (Task 8)
│   │   ├── UnmatchedList.tsx          # drag source for leftovers (Task 8)
│   │   ├── RenamePanel.tsx            # preview + execute + undo (Task 9)
│   │   └── *.css
│   └── api.ts                         # invoke wrappers around Tauri commands
├── src-tauri/                         # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/default.json
│   └── src/
│       ├── main.rs                    # builder + handler registration
│       ├── commands.rs                # list_files, rename_pairs, undo (Task 5)
│       └── commands_tests.rs          # #[cfg(test)] unit tests (Task 5)
```

**Responsibilities:**
- `lib/*.ts` — pure, no React, no Tauri. The entire matching brain. Heavily unit-tested.
- `api.ts` — typed wrappers over `invoke(...)`. The only place frontend touches Tauri.
- `components/*` — presentational + local interaction state; receive data + callbacks via props.
- `App.tsx` — owns the single source of truth: loaded files, current regex, shift, pairs (after manual edits), rename report.
- `commands.rs` — all filesystem mutation; returns typed reports for undo.

---

### Task 1: Scaffold Tauri 2 + React + TS + Vite app with Vitest

**Files:**
- Create: entire scaffold via `create-tauri-app`, then `vite.config.ts` test block, `src/lib/__tests__/smoke.test.ts`
- Modify: `package.json` (add `test` script, vitest deps), `src-tauri/tauri.conf.json` (product name → "Easy Rename")

**Interfaces:**
- Produces: a runnable `pnpm tauri dev` app and a runnable `pnpm test` (Vitest).

- [ ] **Step 1: Scaffold into the empty project directory**

Run from `d:/PycharmProjects/easy_rename`:
```bash
pnpm create tauri-app@latest . --template react-ts --manager pnpm --yes
```
If the `.` (current dir) form is rejected by the scaffolder, instead run from the parent directory:
```bash
pnpm create tauri-app@latest easy_rename --template react-ts --manager pnpm --yes
```
Expected: `package.json`, `src/`, `src-tauri/`, `index.html`, `vite.config.ts` created.

- [ ] **Step 2: Install dependencies**

```bash
pnpm install
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
pnpm tauri add dialog
```
Expected: `node_modules` populated; `tauri-plugin-dialog` added to `src-tauri/Cargo.toml` and capabilities scaffolded.

- [ ] **Step 3: Wire Vitest into Vite**

Replace `vite.config.ts` with:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
});
```

Add to `package.json` `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Smoke test to confirm the harness runs**

Create `src/lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```
Run: `pnpm test`
Expected: 1 test passes.

- [ ] **Step 5: Set product/window name**

In `src-tauri/tauri.conf.json`, set `"productName": "Easy Rename"` and the window `"title": "Easy Rename"`.

- [ ] **Step 6: Verify dev build launches**

Run: `pnpm tauri dev`
Expected: a native window opens showing the default React app. Close it once confirmed.

- [ ] **Step 7: Commit**

```bash
git init 2>$null
git add -A
git commit -m "chore: scaffold Tauri 2 + React + TS + Vitest"
```
(If `git init` was already run, skip it. PowerShell note: `2>$null` suppresses the "reinitialized" message.)

---

### Task 2: classify.ts — extension & kind helpers

**Files:**
- Create: `src/lib/classify.ts`
- Test: `src/lib/__tests__/classify.test.ts`

**Interfaces:**
- Produces: `type FileKind`; `VIDEO_EXTS`, `SUB_EXTS` (Sets); `extOf(name): string`; `stemOf(name): string`; `classify(name): FileKind`.

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/classify.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { classify, extOf, stemOf } from '../classify';

describe('extOf', () => {
  it('returns lowercased extension without dot', () => {
    expect(extOf('ep01.SRT')).toBe('srt');
    expect(extOf('video.MKV')).toBe('mkv');
  });
  it('returns empty for no extension', () => {
    expect(extOf('README')).toBe('');
  });
});

describe('stemOf', () => {
  it('returns name without final extension', () => {
    expect(stemOf('Show.S01E01.mkv')).toBe('Show.S01E01');
    expect(stemOf('ep01.srt')).toBe('ep01');
  });
});

describe('classify', () => {
  it('classifies videos', () => {
    expect(classify('a.mkv')).toBe('video');
    expect(classify('a.mp4')).toBe('video');
  });
  it('classifies subtitles', () => {
    expect(classify('a.srt')).toBe('subtitle');
    expect(classify('a.ass')).toBe('subtitle');
    expect(classify('a.vtt')).toBe('subtitle');
  });
  it('classifies unknown as other', () => {
    expect(classify('a.txt')).toBe('other');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test classify`
Expected: FAIL — `Cannot find module '../classify'`.

- [ ] **Step 3: Implement**

`src/lib/classify.ts`:
```ts
export type FileKind = 'video' | 'subtitle' | 'other';

export const VIDEO_EXTS = new Set<string>([
  'mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v',
  'mpg', 'mpeg', 'ts', 'm2ts', '3gp', 'ogv',
]);

export const SUB_EXTS = new Set<string>([
  'srt', 'ass', 'ssa', 'vtt', 'sub', 'smi', 'sami', 'idx',
]);

export function extOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i < 0 || i === fileName.length - 1) return '';
  return fileName.slice(i + 1).toLowerCase();
}

export function stemOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i > 0 ? fileName.slice(0, i) : fileName;
}

export function classify(fileName: string): FileKind {
  const ext = extOf(fileName);
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (SUB_EXTS.has(ext)) return 'subtitle';
  return 'other';
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm test classify`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/classify.ts src/lib/__tests__/classify.test.ts
git commit -m "feat: add file classify/extension helpers"
```

---

### Task 3: match.ts — index extraction + pairing

**Files:**
- Create: `src/lib/match.ts`
- Test: `src/lib/__tests__/match.test.ts`

**Interfaces:**
- Consumes: `classify`, `extOf`, `stemOf` from `./classify`.
- Produces: `interface MediaFile` (`{ id, name, path, ext, kind }`), `interface Pair`, `interface MatchResult`, `extractIndex(name, pattern, group=1): number | null`, `buildPairs(videos, subs, pattern, shift=0): MatchResult`.

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/match.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractIndex, buildPairs, MediaFile, Pair } from '../match';

const v = (name: string): MediaFile => ({ id: name, name, path: 'C:/d/' + name, ext: name.split('.').pop()!.toLowerCase(), kind: 'video' });
const s = (name: string): MediaFile => ({ id: name, name, path: 'C:/d/' + name, ext: name.split('.').pop()!.toLowerCase(), kind: 'subtitle' });

describe('extractIndex', () => {
  it('uses first capture group', () => {
    expect(extractIndex('ep01.srt', '(\\d+)')).toBe(1);
    expect(extractIndex('ep1.mkv', '(\\d+)')).toBe(1);
  });
  it('targets episode in SxxExx', () => {
    expect(extractIndex('Show.S01E02.mkv', 'S\\d+E(\\d+)')).toBe(2);
  });
  it('returns null when no match', () => {
    expect(extractIndex('trailer.srt', 'E(\\d+)')).toBeNull();
  });
  it('returns null for invalid regex', () => {
    expect(extractIndex('ep01.srt', '(')).toBeNull();
  });
});

describe('buildPairs', () => {
  const videos = [v('ep1.mkv'), v('ep2.mkv'), v('ep3.mkv')];
  const subs = [s('ep01.srt'), s('ep02.srt'), s('ep03.ass')];

  it('pairs by index', () => {
    const r = buildPairs(videos, subs, '(\\d+)');
    expect(r.pairs).toHaveLength(3);
    expect(r.pairs[0].video.name).toBe('ep1.mkv');
    expect(r.pairs[0].sub.name).toBe('ep01.srt');
    expect(r.unmatchedVideos).toHaveLength(0);
    expect(r.unmatchedSubs).toHaveLength(0);
  });

  it('shift fixes off-by-one', () => {
    const shiftedSubs = [s('ep02.srt'), s('ep03.srt'), s('ep04.srt')]; // subs are +1
    const r = buildPairs(videos, shiftedSubs, '(\\d+)', -1);
    expect(r.pairs).toHaveLength(3);
    expect(r.pairs[0].sub.name).toBe('ep02.srt'); // ep1.mkv <- ep02.srt after shift
  });

  it('reports unmatched', () => {
    const r = buildPairs(videos, [s('ep01.srt')], '(\\d+)');
    expect(r.pairs).toHaveLength(1);
    expect(r.unmatchedVideos).toHaveLength(2);
    expect(r.unmatchedSubs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test match`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/match.ts`:
```ts
import { classify, extOf } from './classify';

export type FileKind = 'video' | 'subtitle' | 'other';

export interface MediaFile {
  id: string;
  name: string;
  path: string;
  ext: string;
  kind: FileKind;
}

export interface Pair {
  video: MediaFile;
  sub: MediaFile;
}

export interface MatchResult {
  pairs: Pair[];
  unmatchedVideos: MediaFile[];
  unmatchedSubs: MediaFile[];
}

export function extractIndex(fileName: string, pattern: string, group = 1): number | null {
  if (!pattern) return null;
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    return null;
  }
  const stem = fileName.lastIndexOf('.') > 0 ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
  const m = re.exec(stem);
  if (!m) return null;
  const token = m.length > 1 ? m[group] : m[0];
  if (token === undefined) return null;
  const digits = String(token).match(/\d+/);
  if (!digits) return null;
  const n = parseInt(digits[0], 10);
  return Number.isNaN(n) ? null : n;
}

export function buildPairs(
  videos: MediaFile[],
  subs: MediaFile[],
  pattern: string,
  shift = 0,
): MatchResult {
  const videoByIdx = new Map<number, MediaFile>();
  for (const vid of videos) {
    const idx = extractIndex(vid.name, pattern);
    if (idx !== null && !videoByIdx.has(idx)) videoByIdx.set(idx, vid);
  }

  const usedVideos = new Set<string>();
  const usedSubs = new Set<string>();
  const pairs: Pair[] = [];

  for (const sub of subs) {
    const raw = extractIndex(sub.name, pattern);
    if (raw === null) continue;
    const target = raw + shift;
    const vid = videoByIdx.get(target);
    if (vid && !usedVideos.has(vid.id)) {
      pairs.push({ video: vid, sub });
      usedVideos.add(vid.id);
      usedSubs.add(sub.id);
    }
  }

  pairs.sort(
    (a, b) =>
      (extractIndex(a.video.name, pattern) ?? 0) - (extractIndex(b.video.name, pattern) ?? 0),
  );

  return {
    pairs,
    unmatchedVideos: videos.filter((vid) => !usedVideos.has(vid.id)),
    unmatchedSubs: subs.filter((sub) => !usedSubs.has(sub.id)),
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm test match`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/match.ts src/lib/__tests__/match.test.ts
git commit -m "feat: add index extraction and video/subtitle pairing"
```

---

### Task 4: renamePlan.ts — rename plan + path helpers

**Files:**
- Create: `src/lib/renamePlan.ts`
- Test: `src/lib/__tests__/renamePlan.test.ts`

**Interfaces:**
- Consumes: `Pair` from `./match`; `stemOf` from `./classify`.
- Produces: `interface RenameOp { src: string; dest: string }`, `dirname(path): string`, `joinPath(dir, name): string`, `buildRenamePlan(pairs: Pair[]): RenameOp[]`.

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/renamePlan.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildRenamePlan, dirname, joinPath } from '../renamePlan';
import { Pair } from '../match';

const pair = (videoName: string, subName: string): Pair => ({
  video: { id: videoName, name: videoName, path: 'C:/shows/' + videoName, ext: 'mkv', kind: 'video' },
  sub: { id: subName, name: subName, path: 'C:/shows/' + subName, ext: subName.split('.').pop()!, kind: 'subtitle' },
});

describe('dirname / joinPath', () => {
  it('handles forward and back slashes', () => {
    expect(dirname('C:/shows/ep1.mkv')).toBe('C:/shows');
    expect(dirname('C:\\shows\\ep1.mkv')).toBe('C:/shows');
  });
  it('joins without double slash', () => {
    expect(joinPath('C:/shows', 'ep1.srt')).toBe('C:/shows/ep1.srt');
  });
});

describe('buildRenamePlan', () => {
  it('sub takes video basename + sub extension, in video dir', () => {
    const ops = buildRenamePlan([pair('Show.S01E01.mkv', 'ep01.srt')]);
    expect(ops).toEqual([{ src: 'C:/shows/ep01.srt', dest: 'C:/shows/Show.S01E01.srt' }]);
  });
  it('keeps .ass extension', () => {
    const ops = buildRenamePlan([pair('Show.S01E02.mkv', 'ep02.ass')]);
    expect(ops[0].dest).toBe('C:/shows/Show.S01E02.ass');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test renamePlan`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/renamePlan.ts`:
```ts
import { Pair } from './match';
import { stemOf } from './classify';

export interface RenameOp {
  src: string;
  dest: string;
}

export function dirname(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  return i >= 0 ? norm.slice(0, i) : '';
}

export function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  const d = dir.replace(/[\\/]+$/, '');
  return d + '/' + name;
}

export function buildRenamePlan(pairs: Pair[]): RenameOp[] {
  return pairs.map(({ video, sub }) => {
    const dir = dirname(video.path);
    const newName = stemOf(video.name) + '.' + sub.ext;
    return { src: sub.path, dest: joinPath(dir, newName) };
  });
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm test renamePlan`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/renamePlan.ts src/lib/__tests__/renamePlan.test.ts
git commit -m "feat: add rename plan generation"
```

---

### Task 5: Rust commands — list_files, rename_pairs, undo

**Files:**
- Modify: `src-tauri/Cargo.toml` (ensure `serde` with `derive` feature)
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs` (register handlers, dialog plugin)
- Modify: `src-tauri/capabilities/default.json` (allow dialog)
- Test: inline `#[cfg(test)]` module in `commands.rs`

**Interfaces:**
- Produces Tauri commands (callable from frontend via `invoke`):
  - `list_files(dir: String, recursive: bool) -> Result<Vec<FileEntry>, String>` where `FileEntry { name, path, is_dir, size }`
  - `rename_pairs(ops: Vec<RenameOp>, on_conflict: String) -> Result<RenameReport, String>` where `RenameOp { src, dest }`, `RenameReport { applied: Vec<RenameOp>, skipped: Vec<RenameOp>, errors: Vec<String> }`, `on_conflict ∈ {"skip","overwrite"}`
  - `undo(ops: Vec<RenameOp>) -> Result<RenameReport, String>` (reverses each applied op)

- [ ] **Step 1: Write the failing Rust unit test (rename logic)**

In `src-tauri/src/commands.rs`, add at the bottom:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn touch(path: &std::path::Path) {
        fs::write(path, b"x").unwrap();
    }

    #[test]
    fn apply_one_skip_when_dest_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("a.srt");
        let dest = tmp.path().join("b.srt");
        touch(&src);
        touch(&dest);
        let op = RenameOp { src: src.to_string_lossy().into_owned(), dest: dest.to_string_lossy().into_owned() };
        assert_eq!(apply_one(&op, "skip").unwrap(), false);
        assert!(src.exists(), "src must still exist on skip");
    }

    #[test]
    fn apply_one_overwrite_replaces_dest() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("a.srt");
        let dest = tmp.path().join("b.srt");
        fs::write(&src, b"new").unwrap();
        fs::write(&dest, b"old").unwrap();
        let op = RenameOp { src: src.to_string_lossy().into_owned(), dest: dest.to_string_lossy().into_owned() };
        assert_eq!(apply_one(&op, "overwrite").unwrap(), true);
        assert!(!src.exists());
        assert_eq!(fs::read_to_string(&dest).unwrap(), "new");
    }

    #[test]
    fn undo_reverses_applied_ops() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("orig.srt");
        let dest = tmp.path().join("renamed.srt");
        touch(&src);
        let op = RenameOp { src: src.to_string_lossy().into_owned(), dest: dest.to_string_lossy().into_owned() };
        let report = rename_pairs(vec![op.clone()], "overwrite".into()).unwrap();
        assert_eq!(report.applied.len(), 1);
        let report = undo(report.applied).unwrap();
        assert_eq!(report.applied.len(), 1);
        assert!(src.exists(), "undo should restore original path");
    }
}
```

- [ ] **Step 2: Add tempfile dev-dependency and run to confirm failure**

Add to `src-tauri/Cargo.toml` `[dev-dependencies]`:
```toml
[dev-dependencies]
tempfile = "3"
```
Run: `pnpm tauri build --debug --no-bundle` is heavy; instead run unit tests directly:
```bash
cd src-tauri && cargo test
```
Expected: FAIL — `apply_one`, `rename_pairs`, `undo`, `RenameOp`, `RenameReport` not defined.

- [ ] **Step 3: Implement commands.rs**

`src-tauri/src/commands.rs`:
```rust
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RenameOp {
    pub src: String,
    pub dest: String,
}

#[derive(Serialize)]
pub struct RenameReport {
    pub applied: Vec<RenameOp>,
    pub skipped: Vec<RenameOp>,
    pub errors: Vec<String>,
}

#[tauri::command]
pub fn list_files(dir: String, recursive: bool) -> Result<Vec<FileEntry>, String> {
    let root = Path::new(&dir);
    let mut out = Vec::new();
    list_inner(root, recursive, &mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

fn list_inner(dir: &Path, recursive: bool, out: &mut Vec<FileEntry>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let meta = entry.metadata()?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let path_s = path.to_string_lossy().into_owned();
        if meta.is_dir() {
            if recursive {
                list_inner(&path, recursive, out)?;
            } else {
                out.push(FileEntry { name, path: path_s, is_dir: true, size: 0 });
            }
        } else {
            out.push(FileEntry { name, path: path_s, is_dir: false, size: meta.len() });
        }
    }
    Ok(())
}

fn apply_one(op: &RenameOp, on_conflict: &str) -> Result<bool, String> {
    let src = Path::new(&op.src);
    let dest = Path::new(&op.dest);
    if dest.exists() {
        match on_conflict {
            "skip" => return Ok(false),
            "overwrite" => {
                if dest.is_dir() {
                    return Err("destination is a directory".into());
                }
                std::fs::remove_file(dest).map_err(|e| e.to_string())?;
            }
            _ => return Ok(false),
        }
    }
    std::fs::rename(src, dest).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn rename_pairs(ops: Vec<RenameOp>, on_conflict: String) -> Result<RenameReport, String> {
    let mut applied = Vec::new();
    let mut skipped = Vec::new();
    let mut errors = Vec::new();
    for op in ops {
        match apply_one(&op, &on_conflict) {
            Ok(true) => applied.push(op),
            Ok(false) => skipped.push(op),
            Err(e) => errors.push(format!("{}: {}", op.src, e)),
        }
    }
    Ok(RenameReport { applied, skipped, errors })
}

#[tauri::command]
pub fn undo(ops: Vec<RenameOp>) -> Result<RenameReport, String> {
    let reversed: Vec<RenameOp> = ops
        .into_iter()
        .rev()
        .map(|o| RenameOp { src: o.dest, dest: o.src })
        .collect();
    rename_pairs(reversed, "overwrite".into())
}
```

- [ ] **Step 4: Register handlers + dialog plugin in main.rs**

Replace `src-tauri/src/main.rs` with:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_files,
            commands::rename_pairs,
            commands::undo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Ensure `src-tauri/Cargo.toml` `[dependencies]` includes:
```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri-plugin-dialog = "2"
```

- [ ] **Step 5: Allow dialog in capabilities**

In `src-tauri/capabilities/default.json`, add `"dialog:default"` to the `"permissions"` array (keeps existing entries):
```json
"permissions": ["core:default", "dialog:default"]
```

- [ ] **Step 6: Run Rust tests to confirm pass**

Run: `cd src-tauri && cargo test`
Expected: 3 tests pass.

- [ ] **Step 7: Verify commands are reachable from the frontend**

Run `pnpm tauri dev`. In `src/App.tsx` (temporarily), add a button that calls `await invoke('list_files', { dir: 'C:/Windows', recursive: false })` and logs the result; confirm a non-empty array prints in the devtools console. Remove the throwaway code afterward.
Expected: array of `FileEntry` objects logged.

- [ ] **Step 8: Commit**

```bash
git add src-tauri
git commit -m "feat: add list_files, rename_pairs, undo Tauri commands"
```

---

### Task 6: api.ts wrapper + Dropzone (load folder)

**Files:**
- Create: `src/api.ts`
- Create: `src/components/Dropzone.tsx`, `src/components/Dropzone.css`
- Modify: `src/App.tsx`, `src/app.css`

**Interfaces:**
- Consumes: Tauri commands from Task 5; `getCurrentWebview().onDragDropEvent`; `open` from `@tauri-apps/plugin-dialog`.
- Produces: `App` state `videos: MediaFile[]`, `subs: MediaFile[]`, `folder: string | null`.

- [ ] **Step 1: Create the typed API wrapper**

`src/api.ts`:
```ts
import { invoke } from '@tauri-apps/api/core';

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface RenameOp { src: string; dest: string; }
export interface RenameReport {
  applied: RenameOp[];
  skipped: RenameOp[];
  errors: string[];
}

export const listFiles = (dir: string, recursive = true) =>
  invoke<FileEntry[]>('list_files', { dir, recursive });

export const renamePairs = (ops: RenameOp[], onConflict: 'skip' | 'overwrite') =>
  invoke<RenameReport>('rename_pairs', { ops, onConflict });

export const undoRenames = (ops: RenameOp[]) =>
  invoke<RenameReport>('undo', { ops });
```

- [ ] **Step 2: Build the Dropzone component**

`src/components/Dropzone.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import './Dropzone.css';

interface Props {
  onFolder: (dir: string) => void;
  loaded: string | null;
}

export function Dropzone({ onFolder, loaded }: Props) {
  const hoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const { type, paths } = event.payload;
      const el = hoverRef.current;
      if (type === 'enter' || type === 'over') el?.classList.add('drag');
      else el?.classList.remove('drag');
      if (type === 'drop' && paths && paths.length > 0) {
        onFolder(paths[0]);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [onFolder]);

  const pick = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === 'string') onFolder(dir);
  };

  return (
    <div className="dropzone" ref={hoverRef} onClick={pick}>
      <p><strong>{loaded ? 'Folder loaded:' : 'Drop a folder here'}</strong></p>
      <p className="muted">{loaded ?? 'or click to browse'}</p>
      <p className="muted">Videos + subtitles inside will be auto-detected.</p>
    </div>
  );
}
```

`src/components/Dropzone.css`:
```css
.dropzone {
  border: 2px dashed #6b7280;
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: background .15s, border-color .15s;
}
.dropzone.drag { border-color: #3b82f6; background: #eff6ff; }
.muted { color: #6b7280; margin: 4px 0; }
```

- [ ] **Step 3: Wire App state to load + classify**

Replace `src/App.tsx` with the foundation used by later tasks (matching UI added in Tasks 7–9):
```tsx
import { useState, useCallback } from 'react';
import { Dropzone } from './components/Dropzone';
import { listFiles } from './api';
import { classify, extOf } from './lib/classify';
import type { MediaFile } from './lib/match';
import './app.css';

export default function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [subs, setSubs] = useState<MediaFile[]>([]);

  const onFolder = useCallback(async (dir: string) => {
    const entries = await listFiles(dir, true);
    const vids: MediaFile[] = [];
    const subz: MediaFile[] = [];
    for (const e of entries) {
      if (e.is_dir) continue;
      const kind = classify(e.name);
      if (kind === 'other') continue;
      const mf: MediaFile = { id: e.path, name: e.name, path: e.path, ext: extOf(e.name), kind };
      if (kind === 'video') vids.push(mf); else subz.push(mf);
    }
    vids.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    subz.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setFolder(dir);
    setVideos(vids);
    setSubs(subz);
  }, []);

  return (
    <div className="app">
      <header><h1>Easy Rename</h1></header>
      <Dropzone onFolder={onFolder} loaded={folder} />
      <p className="muted">Videos: {videos.length} · Subtitles: {subs.length}</p>
    </div>
  );
}
```

Minimal `src/app.css`:
```css
:root { color-scheme: light dark; }
body { margin: 0; font-family: system-ui, Segoe UI, sans-serif; }
.app { max-width: 980px; margin: 0 auto; padding: 24px; }
header h1 { margin: 0 0 16px; }
.muted { color: #6b7280; }
```

- [ ] **Step 4: Verify in dev**

Run `pnpm tauri dev`. Drop (or pick) a folder containing a few videos + subs. Confirm the "Videos: N · Subtitles: M" line shows correct counts and `other` files are excluded.
Expected: counts reflect only video/subtitle files.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: load folder via drag-drop or picker and classify files"
```

---

### Task 7: RegexBar — presets, custom pattern, live preview

**Files:**
- Create: `src/components/RegexBar.tsx`, `src/components/RegexBar.css`
- Modify: `src/App.tsx` (add `pattern` state, render RegexBar, derive preview)

**Interfaces:**
- Consumes: `extractIndex` from `./lib/match`; `videos`, `subs` from App state.
- Produces: App gains `pattern: string`, `shift: number`; RegexBar receives `videos`, `subs`, `pattern`, `shift`, setters.

- [ ] **Step 1: Build RegexBar**

`src/components/RegexBar.tsx`:
```tsx
import './RegexBar.css';

const PRESETS: { label: string; pattern: string }[] = [
  { label: 'Any number  (\\d+)', pattern: '(\\d+)' },
  { label: 'After E  E(\\d+)', pattern: 'E(\\d+)' },
  { label: 'SxxExx  S\\d+E(\\d+)', pattern: 'S\\d+E(\\d+)' },
  { label: 'After -  -(\\d+)', pattern: '-(\\d+)' },
];

interface Props {
  pattern: string;
  setPattern: (p: string) => void;
  shift: number;
  setShift: (n: number) => void;
}

export function RegexBar({ pattern, setPattern, shift, setShift }: Props) {
  return (
    <div className="regexbar">
      <label>Match pattern
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="e.g. (\\d+)"
          spellCheck={false}
        />
      </label>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.pattern} onClick={() => setPattern(p.pattern)}>{p.label}</button>
        ))}
      </div>
      <label>Shift (off-by-one)
        <input
          type="number"
          value={shift}
          onChange={(e) => setShift(Number(e.target.value) || 0)}
        />
      </label>
    </div>
  );
}
```

`src/components/RegexBar.css`:
```css
.regexbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin: 16px 0; }
.regexbar label { display: flex; flex-direction: column; font-size: 13px; gap: 4px; }
.regexbar input { padding: 6px 8px; font: inherit; min-width: 200px; }
.presets { display: flex; flex-wrap: wrap; gap: 6px; }
.presets button { padding: 6px 10px; font: inherit; cursor: pointer; }
```

- [ ] **Step 2: Add a small preview helper component inside RegexBar file**

Append to `src/components/RegexBar.tsx`:
```tsx
import { extractIndex } from '../lib/match';
import type { MediaFile } from '../lib/match';

export function IndexPreview({ files, pattern }: { files: MediaFile[]; pattern: string }) {
  return (
    <table className="preview">
      <tbody>
        {files.slice(0, 8).map((f) => {
          const idx = extractIndex(f.name, pattern);
          return (
            <tr key={f.id}>
              <td>{f.name}</td>
              <td>{idx === null ? '—' : idx}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Wire into App**

In `src/App.tsx`, add imports and state, and render the bar + previews after the Dropzone:
```tsx
import { RegexBar, IndexPreview } from './components/RegexBar';
// ...inside App:
const [pattern, setPattern] = useState('(\\d+)');
const [shift, setShift] = useState(0);
// ...in JSX, after the counts line:
{folder && (
  <>
    <RegexBar pattern={pattern} setPattern={setPattern} shift={shift} setShift={setShift} />
    <div className="previews">
      <div><h3>Videos</h3><IndexPreview files={videos} pattern={pattern} /></div>
      <div><h3>Subtitles</h3><IndexPreview files={subs} pattern={pattern} /></div>
    </div>
  </>
)}
```
Add to `src/app.css`:
```css
.previews { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
.preview { width: 100%; font-size: 13px; border-collapse: collapse; }
.preview td { padding: 2px 6px; border-bottom: 1px solid #e5e7eb; }
.preview td:last-child { text-align: right; font-variant-numeric: tabular-nums; color: #6b7280; }
```

- [ ] **Step 4: Verify live preview**

Run `pnpm tauri dev`. Load a folder, change the pattern (try a preset). Confirm the extracted index column updates per file in both tables.
Expected: indices update live as you type or pick a preset; non-matching files show `—`.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: regex pattern bar with presets and live index preview"
```

---

### Task 8: PairList + UnmatchedList — drag-to-reassign with dnd-kit

**Files:**
- Create: `src/components/PairList.tsx`, `src/components/UnmatchedList.tsx`, `src/components/PairList.css`
- Modify: `src/App.tsx` (own `rows`, wire `DndContext`, add `recompute`/`onDragEnd`/`clearSub`)

**Interfaces:**
- Consumes: `buildPairs` from `./lib/match`; `MediaFile`, `Pair` types.
- Produces: App owns `rows: Row[]` where `Row = { video: MediaFile; sub: MediaFile | null }` — one row per video, `sub` null means unmatched. Operations: `recompute(vids, subz, pattern, shift)`, `onDragEnd(e)`, `clearSub(videoId)`. Derived via `useMemo`: `unmatchedSubs`.

**Interaction model:** Each matched row shows video + its sub. Unmatched subs appear in a side list. Dragging an unmatched sub onto a row assigns it (replacing that row's current sub, which returns to unmatched). Dragging a sub from one row to another swaps them. A `✕` on a row's sub clears it back to unmatched.

- [ ] **Step 1: Create the UnmatchedList (drag source)**

`src/components/UnmatchedList.tsx`:
```tsx
import { useDraggable } from '@dnd-kit/core';
import type { MediaFile } from '../lib/match';

function SubCard({ sub }: { sub: MediaFile }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'sub:' + sub.id,
    data: { sub },
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={'sub-card' + (isDragging ? ' dragging' : '')}>
      {sub.name}
    </div>
  );
}

export function UnmatchedList({ subs }: { subs: MediaFile[] }) {
  return (
    <div className="unmatched">
      <h3>Unmatched subtitles ({subs.length})</h3>
      {subs.length === 0 && <p className="muted">None — drag subs onto a video row to assign.</p>}
      {subs.map((s) => <SubCard key={s.id} sub={s} />)}
    </div>
  );
}
```

- [ ] **Step 2: Create PairList (droppable rows + in-row clear + swap)**

`src/components/PairList.tsx`:
```tsx
import { useDroppable, useDraggable } from '@dnd-kit/core';
import type { Pair } from '../lib/match';

function Row({ pair, onClear }: { pair: Pair; onClear: (videoId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'row:' + pair.video.id, data: { videoId: pair.video.id } });
  const drag = useDraggable({ id: 'rowsub:' + pair.video.id, data: { videoId: pair.video.id, sub: pair.sub } });
  return (
    <tr ref={setNodeRef} className={isOver ? 'over' : ''}>
      <td>{pair.video.name}</td>
      <td>
        <span ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} className="sub-chip">
          {pair.sub.name}
        </span>
        <button className="x" title="Unassign" onClick={() => onClear(pair.video.id)}>✕</button>
      </td>
    </tr>
  );
}

export function PairList({ pairs, onClear }: { pairs: Pair[]; onClear: (videoId: string) => void }) {
  return (
    <table className="pairs">
      <thead><tr><th>Video</th><th>Subtitle</th></tr></thead>
      <tbody>
        {pairs.map((p) => <Row key={p.video.id} pair={p} onClear={onClear} />)}
      </tbody>
    </table>
  );
}
```

`src/components/PairList.css`:
```css
.pairs { width: 100%; border-collapse: collapse; font-size: 13px; }
.pairs th { text-align: left; border-bottom: 2px solid #d1d5db; padding: 4px 8px; }
.pairs td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
.pairs tr.over { background: #eff6ff; }
.sub-chip { display: inline-block; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 6px; padding: 2px 8px; cursor: grab; }
.sub-chip:active { cursor: grabbing; }
.unmatched { background: #f9fafb; border-radius: 8px; padding: 8px; }
.sub-card { background: #fff; border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px; margin: 4px 0; cursor: grab; }
.sub-card.dragging { opacity: .5; }
button.x { margin-left: 8px; background: none; border: none; cursor: pointer; color: #9ca3af; }
.layout { display: grid; grid-template-columns: 1fr 280px; gap: 16px; margin-top: 12px; }
```

- [ ] **Step 3: Own rows in App + DndContext**

The source of truth is `rows: Row[]` — one row per video, each carrying a `sub` that may be `null` (unmatched). This keeps every video addressable as a drop target and makes `unmatchedSubs` a derived value. There is exactly one `onDragEnd`, one `clearSub`, one `recompute` — do not add alternates.

Merge into `src/App.tsx` imports (alongside the Task 6/7 imports):
```tsx
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { PairList } from './components/PairList';
import { UnmatchedList } from './components/UnmatchedList';
import { buildPairs, type MediaFile } from './lib/match';
import { useMemo, useState } from 'react';

type Row = { video: MediaFile; sub: MediaFile | null };
```

Add state, derived value, and handlers inside `App` (after the existing `videos`/`subs`/`pattern`/`shift` state):
```tsx
const [rows, setRows] = useState<Row[]>([]);
const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

const unmatchedSubs = useMemo(() => {
  const used = new Set(rows.filter((r) => r.sub).map((r) => r.sub!.id));
  return subs.filter((s) => !used.has(s.id));
}, [rows, subs]);

// Rebuild rows from files + pattern + shift. Manual drag edits are discarded
// on re-match (acceptable for v1; noted in the plan). Takes the arrays as args
// so it can be called from onFolder with freshly-built locals (state is async).
const recompute = (vids: MediaFile[], subz: MediaFile[], pat: string, sh: number) => {
  const matched = new Map(buildPairs(vids, subz, pat, sh).pairs.map((p) => [p.video.id, p.sub]));
  setRows(vids.map((v) => ({ video: v, sub: matched.get(v.id) ?? null })));
};

const onDragEnd = (e: DragEndEvent) => {
  const toVideoId = (e.over?.data.current as { videoId?: string } | undefined)?.videoId;
  const dragged = (e.active.data.current as { sub?: MediaFile } | undefined)?.sub;
  if (!toVideoId || !dragged) return;
  setRows((prev) => {
    const next = prev.map((r) => ({ ...r }));
    const target = next.find((r) => r.video.id === toVideoId);
    if (!target) return prev;
    const displaced = target.sub;                          // what the target row held before
    for (const r of next) if (r.sub?.id === dragged.id) r.sub = displaced;  // pull from old row
    target.sub = dragged;
    return next;
  });
};

const clearSub = (videoId: string) =>
  setRows((prev) => prev.map((r) => (r.video.id === videoId ? { ...r, sub: null } : r)));
```

Seed rows on load: in the Task 6 `onFolder` handler, after building the local `vids`/`subz` arrays and setting folder/videos/subs, call `recompute` with those locals (state updates are async, so pass the locals):
```tsx
setFolder(dir);
setVideos(vids);
setSubs(subz);
recompute(vids, subz, pattern, shift);
```
Add a **Re-match** button next to the RegexBar that calls `recompute(videos, subs, pattern, shift)` so the user can rebuild after editing the pattern or shift.

Render the matching UI inside the `folder` block, below the RegexBar:
```tsx
<DndContext sensors={sensors} onDragEnd={onDragEnd}>
  <div className="layout">
    <div>
      <h3>Matched pairs</h3>
      <PairList
        pairs={rows.filter((r) => r.sub).map((r) => ({ video: r.video, sub: r.sub! }))}
        onClear={clearSub}
      />
      <h3>Unmatched videos ({rows.filter((r) => !r.sub).length})</h3>
      <ul className="muted">
        {rows.filter((r) => !r.sub).map((r) => <li key={r.video.id}>{r.video.name}</li>)}
      </ul>
    </div>
    <UnmatchedList subs={unmatchedSubs} />
  </div>
</DndContext>
```

- [ ] **Step 4: Verify drag interactions**

Run `pnpm tauri dev`. Load a folder. Confirm:
1. Auto-match fills the pairs table.
2. Dragging an unmatched sub onto a row assigns it.
3. Dragging a sub from one row onto another swaps.
4. Clicking `✕` returns the sub to the unmatched list.
5. Changing the pattern/shift and re-matching rebuilds rows (manual edits are replaced — acceptable for v1).

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: paired list with drag-to-reassign and unmatched panel"
```

---

### Task 9: RenamePanel — preview, execute, undo, status

**Files:**
- Create: `src/components/RenamePanel.tsx`, `src/components/RenamePanel.css`
- Modify: `src/App.tsx` (pass rows, call rename API, track last applied ops for undo)

**Interfaces:**
- Consumes: `buildRenamePlan` from `./lib/renamePlan`; `renamePairs`, `undoRenames` from `./api`.

- [ ] **Step 1: Build RenamePanel**

`src/components/RenamePanel.tsx`:
```tsx
import type { RenameOp, RenameReport } from '../api';
import './RenamePanel.css';

interface Props {
  ops: RenameOp[];
  onConflict: 'skip' | 'overwrite';
  setOnConflict: (v: 'skip' | 'overwrite') => void;
  onRun: () => void;
  onUndo: () => void;
  canUndo: boolean;
  report: RenameReport | null;
}

export function RenamePanel({ ops, onConflict, setOnConflict, onRun, onUndo, canUndo, report }: Props) {
  return (
    <div className="rename-panel">
      <div className="bar">
        <label>On conflict
          <select value={onConflict} onChange={(e) => setOnConflict(e.target.value as 'skip' | 'overwrite')}>
            <option value="skip">Skip</option>
            <option value="overwrite">Overwrite</option>
          </select>
        </label>
        <button className="primary" onClick={onRun} disabled={ops.length === 0}>
          Rename {ops.length} file{ops.length === 1 ? '' : 's'}
        </button>
        <button onClick={onUndo} disabled={!canUndo}>Undo last</button>
      </div>

      <details open>
        <summary>Preview ({ops.length})</summary>
        <table className="preview">
          <tbody>
            {ops.map((op) => (
              <tr key={op.src}>
                <td>{op.src.split(/[\\/]/).pop()}</td>
                <td>→</td>
                <td>{op.dest.split(/[\\/]/).pop()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {report && (
        <div className="report">
          <p>✓ Applied: {report.applied.length} · Skipped: {report.skipped.length} · Errors: {report.errors.length}</p>
          {report.errors.length > 0 && (
            <ul>{report.errors.map((e, i) => <li key={i} className="err">{e}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
```

`src/components/RenamePanel.css`:
```css
.rename-panel { margin-top: 16px; }
.bar { display: flex; gap: 12px; align-items: end; }
.bar label { display: flex; flex-direction: column; font-size: 13px; gap: 4px; }
button.primary { background: #2563eb; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font: inherit; }
button.primary:disabled { background: #9ca3af; }
.report { margin-top: 12px; padding: 8px; background: #f0fdf4; border-radius: 6px; }
.err { color: #b91c1c; }
.rename-panel .preview td { padding: 2px 6px; }
```

- [ ] **Step 2: Wire into App**

In `src/App.tsx`, compute ops and run/undo:
```tsx
import { buildRenamePlan } from './lib/renamePlan';
import { renamePairs, undoRenames, type RenameReport } from './api';

const [onConflict, setOnConflict] = useState<'skip' | 'overwrite'>('skip');
const [report, setReport] = useState<RenameReport | null>(null);
const [lastApplied, setLastApplied] = useState<RenameOp[] | null>(null);

const ops = useMemo(
  () => buildRenamePlan(rows.filter((r) => r.sub).map((r) => ({ video: r.video, sub: r.sub! }))),
  [rows],
);

const onRun = async () => {
  const r = await renamePairs(ops, onConflict);
  setReport(r);
  setLastApplied(r.applied);
};
const onUndo = async () => {
  if (!lastApplied) return;
  const r = await undoRenames(lastApplied);
  setReport(r);
  setLastApplied(null);
};
```
Render `<RenamePanel ... />` inside the folder block, below the layout.

- [ ] **Step 3: Verify rename + undo end-to-end**

Prepare a temp folder with copies of a few `.mkv`/`.srt` files. Run `pnpm tauri dev`. Load folder, match, click **Rename**. Confirm subs are renamed to the video names (keeping `.srt`/`.ass`). Click **Undo** and confirm they revert. Test a conflict by renaming twice with **Skip** then **Overwrite**.
Expected: subs rename correctly; undo restores; report counts are accurate.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat: rename preview, execute with conflict policy, and undo"
```

---

### Task 10: Production build + README

**Files:**
- Create: `README.md`
- Verify: `src-tauri/tauri.conf.json` bundle config

- [ ] **Step 1: Configure bundler (Windows)**

Confirm `src-tauri/tauri.conf.json` `bundle` section targets include `"msi"` and `"nsis"`:
```json
"bundle": {
  "active": true,
  "targets": ["msi", "nsis"]
}
```

- [ ] **Step 2: Build the release artifact**

Run: `pnpm tauri build`
Expected: completes and prints paths under `src-tauri/target/release/bundle/msi/Easy Rename_*.msi` and `.../nsis/Easy Rename_*.exe`.

- [ ] **Step 3: Smoke-test the built `.exe`**

Run the produced NSIS-installed `.exe` (or the raw `src-tauri/target/release/easy_rename.exe`). Repeat the rename+undo flow on a temp folder.
Expected: same behavior as `tauri dev`, in a standalone window with no dev server.

- [ ] **Step 4: Write README**

`README.md`:
````markdown
# Easy Rename

Drag-and-drop utility to match subtitle files (`.srt`/`.ass`/`.vtt`/…) to video files (`.mkv`/`.mp4`/…) by episode number, fix mismatches by dragging, then rename each subtitle to match its video's name while keeping the subtitle extension.

## Develop

```bash
pnpm install
pnpm tauri dev     # run the app
pnpm test          # run Vitest unit tests (TS domain logic)
cd src-tauri && cargo test   # run Rust command tests
```

## Build a Windows installer

```bash
pnpm tauri build
```

Outputs an `.msi` and an NSIS `.exe` installer under `src-tauri/target/release/bundle/`.

## How matching works

1. Drop a folder. Files are split into videos and subtitles by extension.
2. Pick a regex pattern with one capturing group that extracts the episode index from each name. Presets: `(\d+)`, `E(\d+)`, `S\d+E(\d+)`, `-(\d+)`. Use **Shift** to correct off-by-one mismatches.
3. Auto-match pairs subs to videos by index. Drag subs between rows to fix any wrong matches.
4. Review the rename preview and click **Rename**. **Undo** reverts the last batch.
````

- [ ] **Step 5: Commit**

```bash
git add README.md src-tauri/tauri.conf.json
git commit -m "docs: README and Windows bundle config"
```

---

## Self-Review Notes

- **Spec coverage:** drag-drop UI ✓ (Task 6), regex auto-detect with switchable patterns ✓ (Task 7), reorder/reassign "this sub belongs to this video" ✓ (Task 8), rename to video name keeping extension ✓ (Tasks 4 + 9), 26-file scale ✓ (no per-file limits), `.srt`/`.ass` supported ✓ (Task 2), Tauri `.exe` release ✓ (Task 10).
- **Off-by-one shift** covered via `buildPairs(..., shift)` (Task 3) wired to a number input (Task 7).
- **Conflict + undo** covered (Task 5 + 9).
- **Known v1 simplification:** changing the pattern/shift rebuilds rows and discards manual edits; a future iteration can preserve manual assignments across re-match. This is acceptable for the stated use case (match once, fix a few, rename).
- **Type consistency:** `MediaFile`, `Pair`, `RenameOp`, `RenameReport` are defined once and reused across `lib`, `api`, and components. App-level `Row` (Task 8) is a UI-only extension of `Pair` with `sub: MediaFile | null`.
