# Pair-list QoL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-row subtitle `<select>` with a searchable `SubPicker` that hides already-assigned subs, add per-row ✕ unlink + 🔒 lock-override, and a header kebab menu with Auto-assign all / Unassign all.

**Architecture:** All row-mutation logic stays pure in `lib/match.ts` (new `Row.locked`, `mergeLocked`, `fillEmpty`, `unassignAll`; `applyReassign` learns to lock). A new `SubPicker` component (portal-rendered popover) replaces the native select inside `PairList`, which also gains a kebab menu. `App.tsx` wires recompute to preserve locks and adds three handlers.

**Tech Stack:** React 19, TypeScript, Vitest + jsdom + @testing-library/react (NO jest-dom matchers registered — use `queryBy*`/`findBy*` + plain matchers only), CSS tokens from `src/styles/depth.css`.

**Spec:** `docs/superpowers/specs/2026-06-26-pair-list-qol-design.md`

## Global Constraints

- Branch: `feat/pair-list-qol` (already created). Commit per task. No AI attribution in commit messages.
- No new npm dependencies. No Rust / `src-tauri` changes. Search & Replace mode is untouched.
- Tests must NOT use `@testing-library/jest-dom` matchers (`toBeInTheDocument`, etc.) — `vite.config.ts` has `test.setupFiles: []`. Use `screen.queryBy*/findBy*/getBy*` returning elements/null + plain assertions (`.toBeNull()`, `.toBeTruthy()`, `.toHaveLength()`). For multiple matches use `getAllBy*`/`queryAllBy*`.
- The `Icon` component (`src/components/icons.tsx`) is `<Icon name="…" size={18} className="…" />`; its path table `PATHS` is a `Record<string, ReactNode>` of JSX fragments. Existing names include: `logo, folder, refresh, video, captions, arrow, sliders, sun, moon, grip, undo, chevron, sparkles, plus, x, alert, search, file`. Missing names you must ADD: `lock, unlock, check, more, eraser`.
- Style with existing Depth tokens only (`var(--depth-bg-elevated)`, `--accent`, `--sub-bg/-fg/-border`, `--shadow-large`, `--r-md`, `--t-fast`, etc.). No hard-coded colours, no new tokens.
- Run one test file: `npx vitest run <path>`. Full suite: `npx vitest run`. Typecheck: `npx tsc --noEmit`.

---

## Task 1: Pure row reducers + `Row.locked` in `lib/match.ts`

**Files:**
- Modify: `src/lib/match.ts` (the `Row` interface ~L17-20; `applyReassign` ~L159-171; append three new exports)
- Test: `src/lib/__tests__/match.test.ts`

**Interfaces:**
- Produces (used by Task 4 — App):
  - `Row` now has `locked: boolean`.
  - `applyReassign(rows: Row[], videoId: string, sub: MediaFile | null): Row[]` — manual pick/swap sets target `locked = true`; explicit unlink (`sub === null`) sets `locked = false`.
  - `mergeLocked(prevRows: Row[], videos: MediaFile[], subs: MediaFile[], freshByVideo: Map<string, MediaFile>): Row[]` — fresh auto-match with locked overrides restored (a lock whose sub is no longer in `subs` falls back to fresh and unlocks).
  - `fillEmpty(rows: Row[], freshPairs: Pair[]): Row[]` — fills each empty row with its fresh-pair sub (skipping subs used anywhere); results unlocked.
  - `unassignAll(rows: Row[]): Row[]` — every row `sub = null`, `locked = false`.

- [ ] **Step 1: Update the `Row` interface**

In `src/lib/match.ts`, change:
```ts
/** One row per video in the UI. `sub` is null until a subtitle is assigned.
 *  `locked` marks a manual override that survives re-match / pattern edits. */
export interface Row {
  video: MediaFile;
  sub: MediaFile | null;
  locked: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

In `src/lib/__tests__/match.test.ts`, replace the `mk` helper inside the `applyReassign` describe block:
```ts
  const mk = (rows: { video: MediaFile; sub: MediaFile | null; locked?: boolean }[]): Row[] =>
    rows.map((r) => ({ ...r, locked: r.locked ?? false }));
```
Add these `it(...)` cases inside that same `describe('applyReassign', …)` block:
```ts
  it('marks a manual assignment as locked', () => {
    const out = applyReassign(mk([{ video: v('ep1.mkv'), sub: null }]), 'ep1.mkv', s('a.srt'));
    expect(out[0].locked).toBe(true);
  });

  it('clears the lock on an explicit unlink', () => {
    const out = applyReassign(mk([{ video: v('ep1.mkv'), sub: s('a.srt'), locked: true }]), 'ep1.mkv', null);
    expect(out[0].sub).toBeNull();
    expect(out[0].locked).toBe(false);
  });

  it('locks the target of a swap but leaves the displaced row lock untouched', () => {
    const rows = mk([
      { video: v('ep1.mkv'), sub: s('a.srt'), locked: true },
      { video: v('ep2.mkv'), sub: s('b.srt'), locked: false },
    ]);
    const out = applyReassign(rows, 'ep2.mkv', s('a.srt'));
    expect(out[0].sub?.name).toBe('b.srt'); // displaced b → ep1
    expect(out[0].locked).toBe(true);       // ep1 lock untouched
    expect(out[1].sub?.name).toBe('a.srt'); // a → ep2
    expect(out[1].locked).toBe(true);       // manual pick locks ep2
  });
```
Append three new describe blocks at the end of the file:
```ts
describe('mergeLocked', () => {
  const videos = [v('ep1.mkv'), v('ep2.mkv'), v('ep3.mkv')];
  const subs = [s('ep01.srt'), s('ep02.srt'), s('ep03.srt')];

  it('restores a locked override on top of the fresh auto-match', () => {
    const prev: Row[] = [
      { video: videos[0], sub: s('ep03.srt'), locked: true },
      { video: videos[1], sub: s('ep02.srt'), locked: false },
      { video: videos[2], sub: null, locked: false },
    ];
    const fresh = new Map([[videos[0].id, s('ep01.srt')], [videos[1].id, s('ep02.srt')]]);
    const out = mergeLocked(prev, videos, subs, fresh);
    expect(out[0].sub?.name).toBe('ep03.srt'); // override kept
    expect(out[0].locked).toBe(true);
    expect(out[1].sub?.name).toBe('ep02.srt'); // fresh kept
    expect(out[1].locked).toBe(false);
    expect(out[2].sub).toBeNull();
  });

  it('drops a lock whose subtitle no longer exists (falls back to fresh)', () => {
    const prev: Row[] = [{ video: videos[0], sub: s('gone.srt'), locked: true }];
    const fresh = new Map([[videos[0].id, s('ep01.srt')]]);
    const out = mergeLocked(prev, videos, subs, fresh);
    expect(out[0].sub?.name).toBe('ep01.srt');
    expect(out[0].locked).toBe(false);
  });
});

describe('fillEmpty', () => {
  it('fills empty rows from fresh pairs and leaves assigned rows alone', () => {
    const freshPairs = [
      { video: v('ep1.mkv'), sub: s('ep01.srt') },
      { video: v('ep2.mkv'), sub: s('ep02.srt') },
    ];
    const rows: Row[] = [
      { video: v('ep1.mkv'), sub: null, locked: false },
      { video: v('ep2.mkv'), sub: s('manual.srt'), locked: true },
    ];
    const out = fillEmpty(rows, freshPairs);
    expect(out[0].sub?.name).toBe('ep01.srt');
    expect(out[0].locked).toBe(false); // auto guesses are unlocked
    expect(out[1].sub?.name).toBe('manual.srt'); // untouched
    expect(out[1].locked).toBe(true);
  });

  it('does not assign a sub already used by another row', () => {
    const freshPairs = [{ video: v('ep2.mkv'), sub: s('ep02.srt') }];
    const rows: Row[] = [
      { video: v('ep1.mkv'), sub: s('ep02.srt'), locked: false }, // already has it
      { video: v('ep2.mkv'), sub: null, locked: false },
    ];
    const out = fillEmpty(rows, freshPairs);
    expect(out[1].sub).toBeNull(); // ep02.srt already used → not reused
  });
});

describe('unassignAll', () => {
  it('clears every sub and lock', () => {
    const rows: Row[] = [
      { video: v('ep1.mkv'), sub: s('a.srt'), locked: true },
      { video: v('ep2.mkv'), sub: null, locked: false },
    ];
    const out = unassignAll(rows);
    expect(out.every((r) => r.sub === null && r.locked === false)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/match.test.ts`
Expected: FAIL (`mergeLocked`/`fillEmpty`/`unassignAll` not defined; locked assertions fail).

- [ ] **Step 4: Implement the reducers**

In `src/lib/match.ts`, replace `applyReassign` and append three functions:
```ts
export function applyReassign(rows: Row[], videoId: string, sub: MediaFile | null): Row[] {
  if (!rows.some((r) => r.video.id === videoId)) return rows;
  const next = rows.map((r) => ({ ...r }));
  const target = next.find((r) => r.video.id === videoId)!;
  const displaced = target.sub;
  if (sub) {
    for (const r of next) if (r.sub?.id === sub.id) r.sub = displaced; // swap; locks untouched
    target.sub = sub;
    target.locked = true; // a manual pick (or swap target) is an override
  } else {
    target.sub = null;
    target.locked = false; // explicit unlink drops the override
  }
  return next;
}

/** Rebuild rows from a fresh auto-match, then restore locked overrides from
 *  `prevRows`. A lock whose subtitle is no longer in `subs` (e.g. the file
 *  vanished after a rename) falls back to the fresh result and unlocks. */
export function mergeLocked(
  prevRows: Row[],
  videos: MediaFile[],
  subs: MediaFile[],
  freshByVideo: Map<string, MediaFile>,
): Row[] {
  const prevByVideo = new Map(prevRows.map((r) => [r.video.id, r]));
  const subExists = new Set(subs.map((s) => s.id));
  return videos.map((video) => {
    const prev = prevByVideo.get(video.id);
    const fresh = freshByVideo.get(video.id) ?? null;
    if (prev?.locked && prev.sub && subExists.has(prev.sub.id)) {
      return { video, sub: prev.sub, locked: true };
    }
    return { video, sub: fresh, locked: false };
  });
}

/** Auto-assign-all: fill each empty row with its fresh-pair sub, skipping subs
 *  already used by any row. Results are unlocked (auto guesses, not overrides). */
export function fillEmpty(rows: Row[], freshPairs: Pair[]): Row[] {
  const used = new Set(rows.filter((r) => r.sub).map((r) => r.sub!.id));
  const freshByVideo = new Map(freshPairs.map((p) => [p.video.id, p.sub]));
  return rows.map((r) => {
    if (r.sub) return r; // assigned (incl. locked) — leave alone
    const cand = freshByVideo.get(r.video.id);
    if (cand && !used.has(cand.id)) {
      used.add(cand.id);
      return { ...r, sub: cand, locked: false };
    }
    return r;
  });
}

/** Unassign-all: blank slate — every sub cleared, every lock cleared. */
export function unassignAll(rows: Row[]): Row[] {
  return rows.map((r) => ({ ...r, sub: null, locked: false }));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/match.test.ts`
Expected: PASS (all `applyReassign`, `mergeLocked`, `fillEmpty`, `unassignAll` cases green; existing suites still green).

- [ ] **Step 6: Typecheck (the new required `locked` field surfaces Row-literal sites)**

Run: `npx tsc --noEmit`
Expected: errors only in `src/App.tsx` (the `recompute` row literal at ~L170 lacks `locked`) — that is fixed in Task 4. No other file builds `Row` literals, so proceed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/match.ts src/lib/__tests__/match.test.ts
git commit -m "feat(match): add Row.locked + mergeLocked/fillEmpty/unassignAll reducers"
```

---

## Task 2: `SubPicker` component (searchable, hides used, ✕, 🔒)

**Files:**
- Create: `src/components/SubPicker.tsx`
- Modify: `src/components/icons.tsx` (add 5 paths), `src/App.css` (append styles)
- Test: `src/__tests__/SubPicker.test.tsx`

**Interfaces:**
- Consumes: `MediaFile` from `../lib/match`, `Icon` from `./icons`.
- Produces (used by Task 3 — PairList):
```ts
interface SubPickerProps {
  current: MediaFile | null;          // this row's assigned sub (null = empty)
  allSubs: MediaFile[];               // every subtitle in the folder
  hiddenSubIds: Set<string>;          // subs assigned to OTHER rows → hidden by default
  locked: boolean;
  onSelect: (sub: MediaFile) => void; // pick (applyReassign swaps if used)
  onUnlink: () => void;               // ✕
  onToggleLock: () => void;           // 🔒
}
```

**Structure note (important):** the trigger and the lock/✕ actions are **sibling buttons inside a wrapper `<span class="sub-picker">`**, NOT nested buttons (nesting `<button>` is invalid HTML and breaks role queries). The wrapper span is the visual pill; `.sp-trigger` is the main button that opens the popover.

- [ ] **Step 1: Add the missing icons**

In `src/components/icons.tsx`, add these entries to the `PATHS` record (do not duplicate any that already exist):
```tsx
  lock: <><path d="M5 11h14v9H5z" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  unlock: <><path d="M5 11h14v9H5z" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  more: <><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></>,
  eraser: <><path d="M16 3l5 5-9 9H7l-4-4a2 2 0 0 1 0-3l9-9a2 2 0 0 1 3 0z" /><path d="M9 21h11" /></>,
```

- [ ] **Step 2: Write the failing tests**

Create `src/__tests__/SubPicker.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubPicker } from '../components/SubPicker';
import type { MediaFile } from '../lib/match';

const s = (name: string): MediaFile => ({ id: name, name, path: 'C:/d/' + name, ext: 'srt', kind: 'subtitle' });
const ALL = [s('a.srt'), s('b.srt'), s('c.srt')];

function renderPicker(props: Partial<Parameters<typeof SubPicker>[0]> = {}) {
  const handlers = { onSelect: vi.fn(), onUnlink: vi.fn(), onToggleLock: vi.fn() };
  return render(
    <SubPicker
      current={s('a.srt')} allSubs={ALL} hiddenSubIds={new Set(['b.srt'])} locked={false}
      {...handlers} {...props} />,
  );
}

describe('SubPicker', () => {
  it('hides subs assigned elsewhere and shows the hidden count', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'a.srt' })); // open trigger
    expect(screen.queryByText('b.srt')).toBeNull();     // hidden
    expect(screen.queryByText('c.srt')).toBeTruthy();   // free
    expect(screen.getByText(/1 already assigned/i)).toBeTruthy();
  });

  it('filters options by typing', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'a.srt' }));
    fireEvent.change(screen.getByPlaceholderText(/search subtitles/i), { target: { value: 'c.srt' } });
    expect(screen.queryByText('c.srt')).toBeTruthy();
    expect(screen.queryAllByText('a.srt')).toHaveLength(1); // only the trigger now
  });

  it('reveals hidden subs on Show', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'a.srt' }));
    fireEvent.click(screen.getByRole('button', { name: /^show$/i }));
    expect(screen.queryByText('b.srt')).toBeTruthy();
  });

  it('calls onUnlink when ✕ is clicked', () => {
    const handlers = { onSelect: vi.fn(), onUnlink: vi.fn(), onToggleLock: vi.fn() };
    render(<SubPicker current={s('a.srt')} allSubs={ALL} hiddenSubIds={new Set()} locked={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: /unlink/i }));
    expect(handlers.onUnlink).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleLock when the lock is clicked', () => {
    const handlers = { onSelect: vi.fn(), onUnlink: vi.fn(), onToggleLock: vi.fn() };
    render(<SubPicker current={s('a.srt')} allSubs={ALL} hiddenSubIds={new Set()} locked={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: /lock/i }));
    expect(handlers.onToggleLock).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect when a visible option is chosen', () => {
    const handlers = { onSelect: vi.fn(), onUnlink: vi.fn(), onToggleLock: vi.fn() };
    render(<SubPicker current={s('a.srt')} allSubs={ALL} hiddenSubIds={new Set()} locked={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'a.srt' }));
    fireEvent.click(screen.getByText('c.srt'));
    expect(handlers.onSelect).toHaveBeenCalledWith(s('c.srt'));
  });

  it('renders the empty affordance when current is null', () => {
    renderPicker({ current: null });
    expect(screen.getByRole('button', { name: /assign subtitle/i })).toBeTruthy();
  });
});
```
> Note: `renderPicker` (the shared helper) is only used by the first three and the last cases; the four callback cases render their own `SubPicker` with fresh handlers so they can assert on the exact `vi.fn()` instances.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/SubPicker.test.tsx`
Expected: FAIL (`../components/SubPicker` does not exist).

- [ ] **Step 4: Implement the component**

Create `src/components/SubPicker.tsx`:
```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import type { MediaFile } from '../lib/match';

interface Props {
  current: MediaFile | null;
  allSubs: MediaFile[];
  hiddenSubIds: Set<string>;
  locked: boolean;
  onSelect: (sub: MediaFile) => void;
  onUnlink: () => void;
  onToggleLock: () => void;
}

export function SubPicker({ current, allSubs, hiddenSubIds, locked, onSelect, onUnlink, onToggleLock }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240 });

  // Anchor the portal under the trigger whenever it opens.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) });
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Close on outside click, Esc, or any scroll/resize.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const close = () => { setOpen(false); setQuery(''); setShowHidden(false); };
  const pick = (sub: MediaFile) => { onSelect(sub); close(); };

  const q = query.trim().toLowerCase();
  const visible = allSubs.filter((x) => !hiddenSubIds.has(x.id) && (!q || x.name.toLowerCase().includes(q)));
  const hiddenList = showHidden ? allSubs.filter((x) => hiddenSubIds.has(x.id) && (!q || x.name.toLowerCase().includes(q))) : [];
  const hiddenCount = allSubs.filter((x) => hiddenSubIds.has(x.id)).length;

  return (
    <span className={'sub-picker ' + (current ? 'is-assigned' : 'is-empty')} data-open={open ? 'true' : 'false'}>
      <button
        ref={triggerRef} type="button" className="sp-trigger"
        aria-haspopup="listbox" aria-expanded={open}
        title={current?.name ?? 'Assign subtitle…'}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {current ? <Icon name="captions" /> : null}
        <span className="sp-label">{current ? current.name : 'Assign subtitle…'}</span>
        <Icon name="chevron" className="sp-caret" />
      </button>

      {current ? (
        <span className="sp-actions">
          <button type="button" className={'sp-iconbtn lock-btn' + (locked ? ' on' : '')}
            aria-label={locked ? 'Locked — survives re-match' : 'Lock this override'}
            title={locked ? 'Locked — survives re-match' : 'Lock this override'}
            onClick={onToggleLock}>
            <Icon name={locked ? 'lock' : 'unlock'} />
          </button>
          <button type="button" className="sp-iconbtn sp-x" aria-label="Unlink" title="Unlink"
            onClick={() => { onUnlink(); close(); }}>
            <Icon name="x" />
          </button>
        </span>
      ) : null}

      {open ? createPortal(
        <div ref={popRef} className="picker-pop" role="listbox"
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width }}>
          <div className="picker-search">
            <Icon name="search" />
            <input ref={searchRef} type="text" placeholder="Search subtitles…" value={query}
              onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="picker-list">
            {visible.map((sub) => (
              <div key={sub.id} className={'picker-opt' + (current?.id === sub.id ? ' cur' : '')}
                role="option" aria-selected={current?.id === sub.id} title={sub.name} onClick={() => pick(sub)}>
                <Icon name="captions" /><span className="nm">{sub.name}</span>
                {current?.id === sub.id ? <Icon name="check" /> : null}
              </div>
            ))}
            {visible.length === 0 && hiddenList.length === 0 ? <div className="picker-empty">No matches</div> : null}
            {hiddenList.map((sub) => (
              <div key={sub.id} className="picker-opt hidden-opt" role="option"
                title={sub.name + ' (assigned elsewhere — picking swaps rows)'} onClick={() => pick(sub)}>
                <Icon name="captions" /><span className="nm">{sub.name}</span>
              </div>
            ))}
          </div>
          {hiddenCount > 0 ? (
            <div className="picker-foot">
              <span>✓ {hiddenCount} already assigned — hidden</span>
              <button type="button" className="pill-toggle" onClick={() => setShowHidden((v) => !v)}>{showHidden ? 'Hide' : 'Show'}</button>
            </div>
          ) : null}
        </div>, document.body) : null}
    </span>
  );
}
```

- [ ] **Step 5: Add the SubPicker + kebab CSS**

Append to `src/App.css`:
```css
/* ============================ SUB PICKER + PAIRS KEBAB ============================ */
.sub-cell { min-width: 0; }
.sub-picker { display: flex; align-items: stretch; width: 100%; min-width: 0; border-radius: var(--r-sm); transition: all var(--t-fast); }
.sub-picker.is-assigned { background: var(--sub-bg); border: 1px solid var(--sub-border); color: var(--sub-fg); }
.sub-picker.is-empty { background: var(--depth-bg-elevated); border: 1px solid var(--border-strong); box-shadow: var(--shadow-small); color: var(--text-subtle); }
.sub-picker[data-open="true"] { box-shadow: 0 0 0 3px var(--accent-soft); border-color: var(--accent-border) !important; }
.sp-trigger {
  flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px;
  font: inherit; font-size: 12.5px; font-weight: 500; text-align: left;
  background: transparent; border: none; color: inherit; cursor: pointer; padding: 6px 4px 6px 10px; outline: none;
}
.sub-picker.is-empty .sp-trigger { padding: 7px 10px; }
.sp-trigger .icon { width: 15px; height: 15px; flex: 0 0 auto; }
.sub-picker.is-empty .sp-trigger .icon { color: var(--text-subtle); }
.sp-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto; }
.sp-caret { width: 16px; height: 16px; flex: 0 0 auto; opacity: .65; transition: transform var(--t-fast); }
.sub-picker[data-open="true"] .sp-caret { transform: rotate(180deg); }
.sp-actions { display: inline-flex; align-items: center; gap: 1px; flex: 0 0 auto; padding-right: 4px; }
.sp-iconbtn { width: 24px; min-height: 24px; display: grid; place-items: center; background: transparent; border: none; color: inherit; cursor: pointer; border-radius: 5px; opacity: .65; transition: all var(--t-fast); }
.sp-iconbtn .icon { width: 14px; height: 14px; color: inherit; }
.sp-iconbtn:hover { opacity: 1; background: oklch(0 0 0 / 0.18); }
.sp-x:hover { color: var(--error); }
.lock-btn.on { opacity: 1; color: var(--accent); }

.picker-pop { background: var(--depth-bg-elevated); border: 1px solid var(--border-strong); border-radius: var(--r-md); box-shadow: var(--shadow-large); padding: 8px; display: flex; flex-direction: column; gap: 6px; z-index: 1000; max-height: 340px; }
.picker-search { position: relative; display: flex; align-items: center; }
.picker-search > .icon { position: absolute; left: 9px; width: 14px; height: 14px; color: var(--text-subtle); pointer-events: none; }
.picker-search input { width: 100%; font: inherit; font-size: 12.5px; color: var(--text); background: var(--depth-bg-darkest); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 7px 11px 7px 30px; box-shadow: var(--shadow-inset); outline: none; }
.picker-search input:focus { border-color: var(--accent-border); box-shadow: var(--shadow-inset), 0 0 0 3px var(--accent-soft); }
.picker-list { display: flex; flex-direction: column; gap: 1px; overflow-y: auto; max-height: 230px; }
.picker-opt { display: flex; align-items: center; gap: 9px; min-width: 0; cursor: pointer; font-size: 12.5px; padding: 7px 9px; border-radius: var(--r-sm); border: 1px solid transparent; transition: background var(--t-fast); }
.picker-opt .icon { width: 15px; height: 15px; color: var(--sub-fg); flex: 0 0 auto; }
.picker-opt .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto; font-family: var(--mono); font-size: 11.5px; }
.picker-opt .icon:last-child { color: var(--accent); }
.picker-opt:hover { background: var(--depth-bg-elevated-hover); }
.picker-opt.cur { background: var(--accent-soft); border-color: var(--accent-border); }
.picker-opt.hidden-opt { opacity: .45; }
.picker-opt.hidden-opt .nm { text-decoration: line-through; }
.picker-empty { padding: 12px 9px; font-size: 12px; color: var(--text-subtle); text-align: center; }
.picker-foot { display: flex; align-items: center; gap: 8px; padding-top: 6px; border-top: 1px solid var(--border); font-size: 11.5px; color: var(--text-subtle); }
.picker-foot .pill-toggle { margin-left: auto; background: none; border: none; font: inherit; font-size: 11.5px; font-weight: 700; color: var(--accent); cursor: pointer; padding: 2px 4px; border-radius: 5px; }
.picker-foot .pill-toggle:hover { background: var(--accent-soft); }

.pairs-actions { position: relative; display: inline-flex; align-items: center; }
.pairs-kebab { width: 30px; height: 30px; display: grid; place-items: center; background: var(--depth-bg-elevated); border: 1px solid var(--border); border-radius: var(--r-sm); box-shadow: var(--shadow-small); color: var(--text-muted); cursor: pointer; transition: all var(--t-fast); }
.pairs-kebab:hover, .pairs-kebab[aria-expanded="true"] { color: var(--text); border-color: var(--border-strong); background: var(--depth-bg-elevated-hover); }
.pairs-kebab .icon { width: 17px; height: 17px; }
.pairs-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; min-width: 214px; padding: 6px; background: var(--depth-bg-elevated); border: 1px solid var(--border-strong); border-radius: var(--r-md); box-shadow: var(--shadow-large); display: flex; flex-direction: column; gap: 2px; }
.pairs-menu-item { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; font: inherit; font-size: 13px; font-weight: 500; color: var(--text); background: transparent; border: none; border-radius: var(--r-sm); padding: 8px 10px; cursor: pointer; transition: all var(--t-fast); }
.pairs-menu-item .icon { width: 16px; height: 16px; color: var(--text-muted); flex: 0 0 auto; }
.pairs-menu-item:hover { background: var(--depth-bg-elevated-hover); }
.pairs-menu-item:hover .icon { color: var(--accent); }
.pairs-menu-item.danger:hover, .pairs-menu-item.danger:hover .icon { color: var(--error); }
.pairs-menu-hint { font-size: 11px; color: var(--text-subtle); padding: 2px 10px 6px; line-height: 1.4; }
.pairs-menu-sep { height: 1px; background: var(--border); margin: 4px 2px; }

.pair-row.locked { box-shadow: inset 3px 0 0 var(--accent); }
.pair-row.locked:hover { box-shadow: inset 3px 0 0 var(--accent); background: var(--accent-soft); }
```

- [ ] **Step 6: Run the SubPicker tests to verify they pass**

Run: `npx vitest run src/__tests__/SubPicker.test.tsx`
Expected: PASS (all cases green).

- [ ] **Step 7: Commit**

```bash
git add src/components/SubPicker.tsx src/components/icons.tsx src/App.css src/__tests__/SubPicker.test.tsx
git commit -m "feat(ui): SubPicker combobox (hide used, search, unlink, lock)"
```

---

## Task 3: Wire `SubPicker` + kebab menu into `PairList`

**Files:**
- Modify: `src/components/PairList.tsx`
- Test: `src/__tests__/PairList.test.tsx`

**Interfaces:**
- Consumes: `SubPicker` from `./SubPicker` (Task 2); `Row`/`MediaFile` from `../lib/match`.
- Produces (used by Task 4 — App): the `PairList` props gain `onAutoAssignAll`, `onUnassignAll`, `onToggleLock` (plus existing `onReassign`).

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/PairList.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PairList } from '../components/PairList';
import type { MediaFile, Row } from '../lib/match';

const v = (name: string): MediaFile => ({ id: name, name, path: 'C:/d/' + name, ext: 'mkv', kind: 'video' });
const s = (name: string): MediaFile => ({ id: name, name, path: 'C:/d/' + name, ext: 'srt', kind: 'subtitle' });

const rows: Row[] = [
  { video: v('ep1.mkv'), sub: s('ep01.srt'), locked: true },
  { video: v('ep2.mkv'), sub: null, locked: false },
];
const allSubs = [s('ep01.srt'), s('ep02.srt')];

function renderList() {
  const handlers = { onReassign: vi.fn(), onAutoAssignAll: vi.fn(), onUnassignAll: vi.fn(), onToggleLock: vi.fn() };
  render(<PairList rows={rows} allSubs={allSubs} pattern="(\\d+)" folder="C:/d" {...handlers} />);
  return handlers;
}

describe('PairList', () => {
  it('renders a SubPicker per row (assigned + empty)', () => {
    renderList();
    expect(screen.getByText('ep01.srt')).toBeTruthy();              // assigned trigger label
    expect(screen.getByRole('button', { name: /assign subtitle/i })).toBeTruthy(); // empty trigger
  });

  it('hides a subtitle used on another row from the empty row picker', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /assign subtitle/i })); // open ep2's picker
    expect(screen.getByText(/1 already assigned/i)).toBeTruthy();
    expect(screen.queryAllByText('ep01.srt')).toHaveLength(1); // only ep1's closed trigger
  });

  it('invokes onUnassignAll from the kebab menu', () => {
    const h = renderList();
    fireEvent.click(screen.getByRole('button', { name: /bulk actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /unassign all/i }));
    expect(h.onUnassignAll).toHaveBeenCalledTimes(1);
  });

  it('invokes onAutoAssignAll from the kebab menu', () => {
    const h = renderList();
    fireEvent.click(screen.getByRole('button', { name: /bulk actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /auto-assign all/i }));
    expect(h.onAutoAssignAll).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/PairList.test.tsx`
Expected: FAIL (PairList still renders a `<select>`; new props absent).

- [ ] **Step 3: Rewrite `PairList.tsx`**

Replace the entire contents of `src/components/PairList.tsx` with:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { extractIndex } from '../lib/match';
import { splitRelative } from '../lib/path';
import { FilePath } from './FilePath';
import { Icon } from './icons';
import { SubPicker } from './SubPicker';
import type { MediaFile, Row } from '../lib/match';

interface Props {
  rows: Row[];
  allSubs: MediaFile[];
  pattern: string;
  folder: string;
  onReassign: (videoId: string, sub: MediaFile | null) => void;
  onAutoAssignAll: () => void;
  onUnassignAll: () => void;
  onToggleLock: (videoId: string) => void;
}

function PairsKebab({ onAutoAssignAll, onUnassignAll }: { onAutoAssignAll: () => void; onUnassignAll: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.pairs-actions')) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <span className="pairs-actions">
      <button type="button" className="pairs-kebab" aria-expanded={open} aria-haspopup="true"
        aria-label="Bulk actions" title="Bulk actions" onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {open ? (
        <div className="pairs-menu">
          <button type="button" className="pairs-menu-item"
            onClick={() => { onAutoAssignAll(); setOpen(false); }}>
            <Icon name="sparkles" /> Auto-assign all
          </button>
          <div className="pairs-menu-hint">Fill empty rows with the best-guess match.</div>
          <div className="pairs-menu-sep" />
          <button type="button" className="pairs-menu-item danger"
            onClick={() => { onUnassignAll(); setOpen(false); }}>
            <Icon name="eraser" /> Unassign all
          </button>
          <div className="pairs-menu-hint">Clear every link — locked rows unlock too.</div>
        </div>
      ) : null}
    </span>
  );
}

function RowItem({ row, allRows, allSubs, pattern, folder, onReassign, onToggleLock }: {
  row: Row;
  allRows: Row[];
  allSubs: MediaFile[];
  pattern: string;
  folder: string;
  onReassign: (videoId: string, sub: MediaFile | null) => void;
  onToggleLock: (videoId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'row:' + row.video.id, data: { videoId: row.video.id } });
  const idx = extractIndex(row.video.name, pattern);
  const matched = !!row.sub;
  const vRel = splitRelative(row.video.path, folder);
  const hiddenElsewhere = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) if (r.video.id !== row.video.id && r.sub) set.add(r.sub.id);
    return set;
  }, [allRows, row.video.id]);
  return (
    <div ref={setNodeRef} className={'pair-row' + (matched ? ' matched' : '') + (row.locked ? ' locked' : '') + (isOver ? ' over' : '')}>
      <div className={'idx' + (idx === null ? ' warn' : '')}>{idx === null ? '—' : idx}</div>
      <div className="cell video">
        <Icon name="video" />
        <FilePath dir={vRel.dir} base={vRel.base} abs={row.video.path} />
      </div>
      <div className="arrow"><Icon name="arrow" size={14} /></div>
      <div className="cell sub-cell">
        <SubPicker
          current={row.sub}
          allSubs={allSubs}
          hiddenSubIds={hiddenElsewhere}
          locked={row.locked}
          onSelect={(sub) => onReassign(row.video.id, sub)}
          onUnlink={() => onReassign(row.video.id, null)}
          onToggleLock={() => onToggleLock(row.video.id)}
        />
      </div>
      <div className="row-state"><span className={'dot ' + (matched ? 'success' : 'warn')} /></div>
    </div>
  );
}

export function PairList({ rows, allSubs, pattern, folder, onReassign, onAutoAssignAll, onUnassignAll, onToggleLock }: Props) {
  return (
    <div className="pairs">
      <div className="pairs-head">
        <h2 className="pairs-title">Match subtitles to videos</h2>
        <PairsKebab onAutoAssignAll={onAutoAssignAll} onUnassignAll={onUnassignAll} />
      </div>
      <div className="pairs-grid-head"><div>#</div><div>Video</div><div></div><div>Subtitle</div><div></div></div>
      <div className="scroll-area">
        {rows.map((r) => (
          <RowItem key={r.video.id} row={r} allRows={rows} allSubs={allSubs} pattern={pattern}
            folder={folder} onReassign={onReassign} onToggleLock={onToggleLock} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the PairList tests to verify they pass**

Run: `npx vitest run src/__tests__/PairList.test.tsx`
Expected: PASS (all 4 cases green).

- [ ] **Step 5: Commit**

```bash
git add src/components/PairList.tsx src/__tests__/PairList.test.tsx
git commit -m "feat(ui): SubPicker + bulk kebab in PairList"
```

---

## Task 4: Wire locks + handlers into `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Test: `src/__tests__/App.pairqol.test.tsx`

**Interfaces:**
- Consumes: `mergeLocked`, `fillEmpty`, `unassignAll` from `./lib/match` (Task 1); `Row` (now with `locked`); `buildPairs`.
- Produces: the three new `PairList` props and lock-preserving `recompute`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/App.pairqol.test.tsx` (mirrors `App.refresh.test.tsx`):
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => mocks.invoke(...a) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...a: unknown[]) => mocks.open(...a) }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: () => Promise.resolve(() => {}) }) }));

function entry(name: string, dir = 'F:/Shows') {
  return { name, path: `${dir}/${name}`, is_dir: false, size: 0 };
}
function setup() {
  mocks.open.mockResolvedValue('F:/Shows');
  mocks.invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'load_presets') return [];
    if (cmd === 'load_last_rename') return null;
    if (cmd === 'list_files') return [entry('Show.E01.mkv'), entry('Show.E02.mkv'), entry('subs.E01.srt'), entry('subs.E02.srt')];
    return undefined;
  });
}
async function openFolder() {
  render(<App />);
  fireEvent.click(await screen.findByText('Drop a folder here'));
  await screen.findAllByText('subs.E01.srt');
}

describe('App — pair-list QoL', () => {
  beforeEach(() => { mocks.invoke.mockReset(); mocks.open.mockReset(); });

  it('Unassign all clears every subtitle link', async () => {
    setup();
    await openFolder();
    expect(screen.getAllByText('subs.E01.srt').length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: /bulk actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /unassign all/i }));
    await waitFor(() => {
      expect(screen.queryByText('subs.E01.srt')).toBeNull();
      expect(screen.getAllByRole('button', { name: /assign subtitle/i }).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Auto-assign all is a no-op when everything is already matched', async () => {
    setup();
    await openFolder();
    const before = screen.getAllByText('subs.E01.srt').length;
    fireEvent.click(screen.getByRole('button', { name: /bulk actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /auto-assign all/i }));
    await waitFor(() => expect(screen.getAllByText('subs.E01.srt').length).toBe(before));
  });

  it('Auto-assign all fills rows that were unassigned', async () => {
    setup();
    await openFolder();
    fireEvent.click(screen.getByRole('button', { name: /bulk actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /unassign all/i }));
    await waitFor(() => expect(screen.queryByText('subs.E01.srt')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /bulk actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /auto-assign all/i }));
    await waitFor(() => expect(screen.getByText('subs.E01.srt')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/App.pairqol.test.tsx`
Expected: FAIL (`/bulk actions/i` button not found — App doesn't pass the new props yet).

- [ ] **Step 3: Update imports + `recompute`**

In `src/App.tsx`, update the `./lib/match` import (~L10) to include the new helpers:
```ts
import { buildPairs, detectBestPattern, applyReassign, candidatePatterns, REGEX_PRESETS, mergeLocked, fillEmpty, unassignAll, type MediaFile, type Row } from './lib/match';
```
Replace the `recompute` function (~L168-171):
```ts
  // Rebuild rows from files + per-side patterns + shift. `prevRows` carries
  // manual overrides to preserve: a fresh folder open passes [] (no carry-over);
  // every other caller (pattern edit, re-match, auto-detect, post-rename reload)
  // passes the current rows so 🔒 locks survive. mergeLocked overlays the
  // overrides on top of the fresh auto-match.
  const recompute = (vids: MediaFile[], subz: MediaFile[], vPat: string, sPat: string, sh: number, prevRows: Row[]) => {
    const freshByVideo = new Map(buildPairs(vids, subz, vPat, sPat, sh).pairs.map((p) => [p.video.id, p.sub]));
    setRows(mergeLocked(prevRows, vids, subz, freshByVideo));
  };
```

- [ ] **Step 4: Pass `prevRows` at every `recompute` call site (6 sites)**

Search the file for `recompute(` and set the last argument:
- `onFolder` (~L246) — fresh folder → `[]`:
  `recompute(vids, subz, detected.videoPattern, detected.subPattern, shift, []);`
- `reloadFiles` (~L183) — preserve: `recompute(vids, subz, videoPattern, subPattern, shift, rows);`
- `onAutoDetect` (~L274): `recompute(videos, subs, best.videoPattern, best.subPattern, shift, rows);`
- `changeVideoPattern` (~L287): `recompute(videos, subs, p, nextSubPat, shift, rows);`
- `changeSubPattern` (~L292): `recompute(videos, subs, videoPattern, p, shift, rows);`
- PatternPanel `onReMatch` (~L329): `onReMatch={() => recompute(videos, subs, videoPattern, subPattern, shift, rows)}`

- [ ] **Step 5: Add the three handlers (near `reassign` ~L161)**

```ts
  const onAutoAssignAll = useCallback(() => {
    const fresh = buildPairs(videos, subs, videoPattern, subPattern, shift).pairs;
    setRows((prev) => fillEmpty(prev, fresh));
  }, [videos, subs, videoPattern, subPattern, shift]);

  const onUnassignAll = useCallback(() => {
    setRows((prev) => unassignAll(prev));
  }, []);

  const onToggleLock = useCallback((videoId: string) => {
    setRows((prev) => prev.map((r) => (r.video.id === videoId ? { ...r, locked: !r.locked } : r)));
  }, []);
```

- [ ] **Step 6: Pass the new props to `PairList` (~L359)**

```tsx
          <PairList rows={rows} allSubs={subs} pattern={videoPattern} folder={folder}
                    onReassign={reassign} onAutoAssignAll={onAutoAssignAll}
                    onUnassignAll={onUnassignAll} onToggleLock={onToggleLock} />
```

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npx vitest run`
Expected: PASS — `match`, `SubPicker`, `PairList`, `App.pairqol`, and pre-existing suites all green.
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/__tests__/App.pairqol.test.tsx
git commit -m "feat(app): lock-preserving recompute + auto/unassign-all + lock toggle"
```

---

## Self-Review (completed during authoring)

**Spec coverage:** ✓ SubPicker (Task 2) + hide-used (Tasks 2/3) + ✕ unlink (Task 2) + 🔒 lock (Tasks 1-4) + header kebab Auto/Unassign all (Tasks 3-4) + lock-preserving recompute (Tasks 1 & 4) + pure tested helpers (Task 1) + Stray list untouched (derives from rows, no task needed).

**Placeholder scan:** none — every step has real code or an exact command.

**Type consistency:** `Row.locked`, `mergeLocked`, `fillEmpty`, `unassignAll` signatures match across Task 1 (def) and Task 4 (use). `SubPicker` props match Task 2 (def) and Task 3 (use). `PairList` new props match Task 3 (def) and Task 4 (use). `recompute`'s new `prevRows` arg applied at all 6 call sites. Icon names used (`lock, unlock, check, more, eraser`, plus existing `search, sparkles, x, captions, chevron`) all resolve after Task 2 Step 1.
