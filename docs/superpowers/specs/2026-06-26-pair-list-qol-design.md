# Pair-list quality-of-life (QoL) — design

> Date: 2026-06-26
> Status: Approved (concept validated via interactive mockup; visual execution to be rebuilt in the real Depth design system, not the mockup stylesheet).
> Scope: the **Match mode** pair list (`PairList` + its row subtitle selector). Search & Replace mode is untouched.

## Problem

Today every video row uses a native `<select>` that lists **every** subtitle, so:

- Already-assigned subtitles clutter every dropdown — picking the right free one in a big library is a chore.
- The only way to unlink a row is to open its dropdown and re-select the empty option.
- There is no "clear everything and redo" or "fill the gaps" action — only Auto-detect (which also re-detects the pattern) and Re-match.
- Any manual edit (drag/dropdown pick) is silently discarded the moment the pattern changes, re-match runs, or the folder refreshes after a rename. Hand-picked links don't survive.

## Goals (non-goals)

**Goals**
1. Assigned subtitles disappear from other rows' pickers (the headline ask).
2. A searchable picker so big libraries are fast to scan.
3. Per-row ✕ to unlink inline.
4. Lock manual overrides so hand-picks survive re-match / pattern edits / auto-detect / reload.
5. A header menu with **Auto-assign all** and **Unassign all**.

**Non-goals** (explicitly deferred)
- Keyboard row-to-row navigation (arrows to move between rows). The picker itself still has combobox keyboard semantics (↑/↓/Enter/Esc) — that's part of making it usable, not the separate "row navigation" feature.
- Changes to Search & Replace mode.
- Any backend/Rust changes.

## Design

### 1. `SubPicker` — new component, replaces the native `<select>` in each row

The native `<select>` in `PairList`'s `RowItem` is replaced by a custom combobox. No new dependencies.

**Trigger** (a `<button>`):
- **Assigned** → renders as the existing `sub-chip-inline` pill (captions icon + name), with a trailing action cluster: 🔒 lock toggle, ✕ unlink, ▾ caret.
- **Empty** → the old `Assign subtitle…` affordance (elevated field, muted) with a ▾ caret.

**Popover** (opened by the trigger / caret):
- A search input (type-to-filter, case-insensitive substring over the subtitle name).
- A scrollable option list. Each option is `[captions] name`. The list shows **subs not assigned to any other row**, **plus this row's current sub** (marked as current with a check + accent highlight). Typing filters the visible options.
- A footer line: `✓ N already assigned — hidden` with a **Show / Hide** toggle. Show reveals the hidden, assigned subs greyed + struck-through (non-selectable, or selectable to trigger a swap — see decision below).

**Interaction / a11y:**
- Only one picker open at a time. Click-outside, Esc, and selecting an option all close it.
- Combobox keyboard: ↑/↓ to move highlight, Enter to select, Esc to close, typing focuses the search.
- ARIA `combobox` / `listbox` / `option` roles; trigger reflects `aria-expanded`.

**Swap semantics (decision):** Selecting a sub that is already assigned to another row **swaps** the two rows — this is the existing `applyReassign` behaviour and we keep it. So "hidden" subs are hidden from the default list to reduce clutter, but the **Show** toggle reveals them and selecting one performs the same swap as before. This preserves current power-user behaviour while decluttering the common case.

**Rendering against scroll/overflow (decision):** The real `.pairs` card uses `overflow: hidden` and `.scroll-area` uses `overflow-y: auto`, so an absolutely-positioned popover inside a row would clip near the top/bottom of the scroll viewport. The popover is therefore rendered through a **React portal to `document.body`** and anchored under its trigger via `getBoundingClientRect()`. It repositions on open, on scroll/resize (close on ancestor scroll rather than chase it), and is removed on close. This is the robust answer for a scrolling list; no new dependency.

### 2. Lock manual overrides

**Data:** `Row` gains `locked: boolean`.

**Becoming locked:** Any **manual** assignment — a picker pick **or** a drag-and-drop drop (`onDragEnd` → `reassign`) — sets that row's `locked = true`. Pattern-based matches from `buildPairs` are unlocked.

**Surviving:** `recompute` (the shared rebuild used by folder-open, reload, pattern edits, re-match, auto-detect) becomes:
1. Build fresh pairs via `buildPairs` (the auto result).
2. Overlay: for every row that was `locked` in the previous `rows` state, restore its saved `sub` (and keep `locked = true`). A restored sub that no longer exists in the current `subs` list (e.g. its file vanished) is dropped and the row falls back to the auto result.

**Toggle:** The 🔒 in the picker trail toggles `locked` for an assigned row. Locking an auto-matched row is allowed (promotes it to a preserved override).

**Visual cue:** A locked row gets a subtle Depth-consistent accent cue (e.g. an inset accent left-edge via `box-shadow`, plus the filled accent lock icon). Uses existing tokens — no new colours.

**Edge cases (documented behaviour):**
- **Auto-assign all** fills only empty **non-locked** rows; it never disturbs locked rows.
- **Unassign all** clears every `sub` **and** every `locked` flag — a true blank slate.
- **Opening a new folder** (`onFolder`) resets all locks (different library).
- **After a rename / undo**, `reloadFiles` rebuilds `subs` with new paths/ids. Locks whose sub id no longer resolves fall back to the auto match (documented; a rename is a natural re-evaluation point).

### 3. Pairs-header overflow menu (⋯)

A kebab button joins `.pairs-head` beside the existing count text. It opens a small Depth-floating menu with:

- **Auto-assign all** — fills empty non-locked rows by running `buildPairs` against the current patterns/shift and assigning each empty row its best-guess sub (skipping subs already used by any row).
- **Unassign all** — clears all `sub` values and all `locked` flags.

Both route through new handlers on `App` (`onAutoAssignAll`, `onUnassignAll`) passed down to `PairList`. They reuse the same pure reducers as the lock logic.

### 4. Stray list — unchanged

`StrayList` already derives `unmatchedSubs` from `rows`, so it stays in sync with the picker and the new actions automatically. No changes.

### 5. Pure, tested helpers in `lib/match.ts`

All row-mutation logic stays pure and unit-tested (TDD). New / changed:

- `applyReassign(rows, videoId, sub)` — **changed**: when `sub` is non-null, the target row's `locked` becomes `true` (a manual pick / swap); rows displaced by the swap keep their existing `locked` flag. An explicit unlink (`sub === null`, i.e. the ✕) sets `locked = false` — the user is dropping the override.
- `mergeLocked(prevRows, freshByVideoId)` — **new**: the recompute overlay described in §2. Rows that were locked keep their saved sub + `locked = true`; all other rows take the fresh auto result with `locked = false`.
- `fillEmpty(rows, freshPairs)` — **new**: the Auto-assign-all reducer. Fills each empty, non-locked row with its fresh-pair sub, skipping subs already used anywhere in `rows`. The resulting assignments are **unlocked** (`locked = false`) — they're auto guesses, free to change on the next re-match, unlike manual picks.
- `unassignAll(rows)` — **new**: returns rows with every `sub = null` and `locked = false`.

(`Row` type gains `locked: boolean`; all existing construction sites updated.)

### 6. Files touched

- **New:** `src/components/SubPicker.tsx` (+ styles in `App.css`).
- **Edit:** `src/components/PairList.tsx` (use `SubPicker`; add kebab menu + props), `src/lib/match.ts` (`Row.locked` + helpers), `src/App.tsx` (`recompute` merge; `onAutoAssignAll` / `onUnassignAll` handlers; pass new props; lock toggling), `src/App.css` (new component styles, rebuilt against the real `depth.css` tokens — not `mock.css`).
- **Tests:** `src/lib/__tests__/match.test.ts` (lock + new reducers); a new `SubPicker` component test (hides used, filters by typing, ✕ clears, lock toggles, Show reveals, swap-on-select); `PairList` kebab-menu test; keep `src/__tests__/App.refresh.test.tsx` green.

## Testing strategy

- **Pure logic first (TDD):** `applyReassign` lock behaviour, `mergeLocked` (lock survives recompute; unresolvable lock falls back), `fillEmpty` (respects locks + used subs), `unassignAll`. These carry the correctness weight and are the first thing implemented.
- **Component:** `SubPicker` rendered with React Testing Library — hidden-used count, filter-on-type, ✕ → onReassign(null), lock toggle, Show reveals hidden, selecting a used sub calls onReassign with the swap. Plus a `PairList` test that the kebab menu invokes the two handlers.
- **Regression:** existing `App.refresh.test.tsx` and `match.test.ts` stay green; update any row fixtures for the new `locked` field.

## Open questions for review

- None blocking. (Swap-on-select-when-shown and the portal decision are called out above as deliberate choices.)
