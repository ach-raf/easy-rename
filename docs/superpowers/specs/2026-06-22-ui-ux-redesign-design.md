# UI/UX redesign — polished native utility (Depth Design + command rail)

Date: 2026-06-22

## Problem

The app is functional but reads as an early student MVP:

- **Emoji icons** (📂 🗂️ ＋) — the loudest "not a real app" signal.
- **Flat, hierarchy-less cards.** Every panel is the same visual weight, so nothing communicates "this is the important thing."
- **The regex power-tooling dominates the top of the screen** — Video pattern, Subtitle pattern, link toggle, shift, preset chips — intimidating before any matching is done.
- **The primary action — Rename — is buried** in the left rail among settings. The single thing the user is here to do is the least prominent control.
- **Redundant data.** Two "Videos / Subtitles" index-preview tables restate exactly what the pair list already shows.
- **Light theme only**, generic blue-on-white, no real elevation or depth.
- `window.prompt` for saving presets; plain-text counts; basic green/red report box.

This builds on the already-shipped per-side-regex + path-display work (`src/lib/path.ts`, `FilePath.tsx`, wrapping/no-truncation). That layer stays; this is the visual + architectural pass over it.

## Goals

1. **Adopt the Depth Design System** as a portable CSS token layer — OKLCH neutrals (hue 264), four elevation layers, composite shadows with the inset top-highlight, semantic colors, accent as a hue variable. **No Tailwind, no component-library dependency** — plain CSS vars + utility classes.
2. **Restructure into the command-rail layout (Variant B).** Rename becomes the hero/main-quest action, always one click. The pair list owns the main area; a persistent right rail holds status, the Rename hero, conflict policy, the Pattern panel, and stray subtitles.
3. **Remove the redundant index-preview tables.** Fold their only unique value (verifying what each pattern extracts) into a compact live preview inside the Pattern panel.
4. **Replace every emoji** with a small inline SVG icon set (stroke = `currentColor`).
5. **Dark theme by default; light via a persisted toggle.** Accent color selectable (default blue, hue 250) and persisted.
6. **No logic changes** — matching, rename, undo, conflict policy, and preset persistence are untouched.

## Non-goals

- No change to the matching engine, rename/undo/conflict logic, or the Rust backend.
- No Tailwind or external UI dependency. Plain CSS + React 19 only.
- No new product features (no multi-folder, no profiles, no scheduling). Pure UI/UX + theming.
- No deep redesign of the empty-state dropzone beyond restyling.
- Desktop window only (1280×800). Responsive behavior is best-effort: the existing wide/narrow split is preserved and restyled, not re-architected.

## Design

### A. Design tokens — new `src/styles/depth.css`

A single stylesheet of CSS custom properties + component utility classes, ported from the approved mockup `design-mockups/depth.css` (source of truth). Theme is selected by a class on `<body>`:

```css
:root { color-scheme: dark; /* dark is the default */ }
body.light { color-scheme: light; /* overrides below */ }
```

Token groups (full values in the mockup, summarized here):

- **Elevation layers** (dark): `--depth-bg-darkest .165`, `--depth-bg-base .215`, `--depth-bg-elevated .285`, `--depth-bg-elevated-hover .325` (all `oklch(L 0.0.. 264)`). Light overrides: `.925 / .975 / 1 / .975`.
- **Text**: `--text`, `--text-muted`, `--text-subtle` (OKLCH, overridden per theme).
- **Borders**: `--border`, `--border-strong`, `--border-hi` (the inset top-highlight color).
- **Composite shadows** (each = inset-highlight + sharp-edge + diffuse-ambient): `--shadow-inset`, `-small`, `-small-hover`, `-medium`, `-medium-hover`, `-large`, `-large-hover`, `-xlarge`. **Never** Tailwind/hardcoded shadows.
- **Accent** as a hue variable: `--accent-hue: 250` (default), with `--accent`, `--accent-hover`, `--accent-press`, `--accent-fg`, `--accent-soft`, `--accent-border` derived from it. The accent picker sets `--accent-hue` on `:root`.
- **Semantic** (fg/bg/border): success (hue 150), warning (80), error (25), info (250), plus `--sub-*` for subtitle identity.
- **Radius / motion / type**: `--r-sm..xl`, `--r-pill`, `--t-fast`, `--t-card`, `--font`, `--mono`.

Component utility classes (CSS, not Tailwind): `.depth-card`, `.depth-card-hover`, `.depth-interactive`, `.depth-button`, `.depth-button-ghost`, `.depth-button-primary` (with the shimmer `::before` sweep), `.depth-inset`, `.depth-floating`, `.badge` + `.badge-success/-warning/-error/-info/-neutral`, plus app primitives (`.segmented`/`.seg`, `.switch`, `.progress`/`.progress-fill`).

### B. Theming — `src/lib/theme.ts`

- Toggle is the `body.light` class. **Default = dark** (no class) on first run.
- Persist theme to `localStorage` (`er-theme`: `'dark' | 'light'`) and accent hue (`er-accent-hue`, number, default `250`). Apply both synchronously at app entry, before React renders (set `--accent-hue` on `document.documentElement`, add/remove `light` on `body`), so there's no theme flash.
- `ThemeToggle` (icon button, sun↔moon) + accent swatches (5 hues: 250 blue, 295 violet, 155 emerald, 70 amber, 15 rose) live in the topbar.

### C. Icons — `src/components/icons.tsx`

One inline-SVG `<Icon name="..."/>` component (stroke `currentColor`, `viewBox="0 0 24 24"`, `fill="none"`): `logo, folder, refresh, video, captions, arrow, sliders, sun, moon, grip, undo, chevron, sparkles, plus, x, alert`. Replaces every emoji. No icon-library dependency.

### D. Layout — command rail (Variant B) — `src/App.tsx`

```text
┌─ Topbar (spans full width) ──────────────────────────────────────────┐
│ [logo] Easy Rename   [📁 ~/…/Breaking.Bad.S01  Change]   [swatches][◑]│
├─ Work: pair list ───────────────────────────┬─ Command rail (348px) ─┤
│  Match subtitles to videos · 9 videos, 9 s  │ ┌ Rename hero ────────┐│
│  ─────────────────────────────────────────  │ │ Ready: 8 of 9       ││
│  #   Video              Subtitle         •   │ │ ████████░░ 89%      ││
│  01  …mkv   →   …srt                 ✓      │ │ [  Rename 8 files →]││
│  …                                         │ │ Conflict: Skip|Over ││
│  09  …mkv   →   [Assign subtitle…]    ⚠     │ │ [  Undo last       ]││
│                                            │ └─────────────────────┘│
│                                            │  Pattern  ( \d+ )  ▾   │
│                                            │  Stray subtitles (1)   │
└────────────────────────────────────────────┴────────────────────────┘
```

- `display: grid; grid-template-columns: minmax(0,1fr) 348px; grid-template-rows: auto minmax(0,1fr); gap: 12px;` with the topbar in `grid-column: 1 / -1`.
- Work = single-column pair list. Rail = scrollable.
- The existing `usePrefersWide` / `WIDE_BREAKPOINT` behavior stays: on narrow windows the rail stacks below the list (restyled), so nothing is lost below 1100px.

### E. Topbar

Brand (logo + wordmark) · folder chip (`<Icon folder>` + path with dimmed dir via the existing `FilePath` treatment + a "Change" ghost button that re-opens the folder picker → existing `onFolder`) · accent swatches + `ThemeToggle` on the right.

### F. Rename hero (top of rail) — replaces `RenamePanel` placement

- "Ready to rename · **N** of M" large number + match-progress bar (`.depth-inset` trough + success fill).
- Primary **Rename N files →** (`.depth-button-primary`, full-width). Disabled while `busy` or `ops.length === 0`.
- **Conflict segmented control** (Skip / Overwrite) — replaces the native `<select>` for `onConflict`.
- **Undo last** (`.depth-button`, disabled until `canUndo`).
- Post-run report (applied / skipped / errors) as a depth callout below, reusing the existing `report`/`apiError` state.

### G. Status / match progress

Lives in the rename hero. Count badges — unmatched videos (`badge-warning`), stray subtitles (`badge-neutral`), totals (`badge-info`) — derived from the existing `rows` / `subs` / `unmatchedSubs` state. No new state.

### H. Pattern panel — demoted, collapsible — `src/components/PatternPanel.tsx` (renames `RegexBar`)

- Collapsed to a "Pattern (`…`)" pill by default when auto-detect succeeded; expands on click.
- Fields (existing props, unchanged wiring): Video pattern, link switch ("Same for subtitles"), Subtitle pattern (disabled while linked), Shift, presets (apply + delete + save via existing handlers), **Auto-detect** and **Re-match** buttons.
- **Live extract preview**: 3–5 sample files (mix of video + a stray) each shown with its extracted index (`extractIndex`), misses styled with `--error`. This is the only surviving remnant of the removed index tables.
- Drop `window.prompt` for save: clicking **Save** converts the preset-add chip into an inline text field within the presets row (Enter confirms, Esc cancels) — no native prompt, no popover.

### I. Pair list — high-density, full paths — `src/components/PairList.tsx`

- Row grid: `34px minmax(0,1fr) 26px minmax(0,1fr) 30px` → idx · video · arrow · subtitle · state-dot.
- Video cell: index badge + `<FilePath>` for the video. Subtitle cell: **matched** → `<FilePath>` for the sub + success dot; **unmatched** → restyled `<select>` (`.sub-select`: elevated fill, custom chevron via SVG data-URI, dark dropdown via inherited `color-scheme`, focus ring) + warning dot.
- **No truncation** — `<FilePath>` already wraps (`splitRelative` + `word-break`). Keep `min-width: 0` on cells so columns shrink/wrap.
- Drag-over highlight and the per-row droppable/dropdown dual mechanism (already shipped) are preserved.
- Scroll container gets a `max-height` + `overflow-y: auto`.

### J. Stray subtitles — `src/components/StrayList.tsx` (renames `UnmatchedList`)

Draggable chips with `<FilePath>` (wrapping), a count badge, and an empty-state hint. Reuses the existing `@dnd-kit` draggable wiring. (Renames the `UnmatchedList` *component* to `StrayList`; the underlying `unmatchedSubs` state and props are unchanged.)

## Removals

- `IndexPreview` (in `RegexBar.tsx`) and the two preview cards in `App.tsx` ("Videos" / "Subtitles"). Extraction verification moves into `PatternPanel`'s live preview.
- All emoji. The old left-rail shell markup (replaced by the command rail).

## Accessibility

- Theme toggle and accent swatches carry `aria-pressed` / `aria-label`; segmented control uses `role="radiogroup"`/`role="radio"`; purely-decorative icons are `aria-hidden` with labels on their buttons.
- Focus rings via the token-based `:focus` shadow (`0 0 0 3px var(--accent-soft)`). OKLCH lightness values chosen for AA contrast on text and muted text in both themes.

## Migration / risk

- **No new dependencies.** `depth.css` is additive; ad-hoc colors/borders/shadows in `app.css` are replaced by tokens incrementally.
- **Default flips to dark.** Acceptable per user decision; the toggle + persistence make it one click back.
- **No logic changes** → existing Vitest (`match`, `path`) and Rust tests stay green. Only new unit tests are the theme helpers.

## Implementation approach

The work decomposes into largely independent slices — a good fit for **subagent-driven development** once the plan is written:

1. `depth.css` tokens + component classes (foundation; everything depends on it — do first).
2. `icons.tsx` (independent).
3. `theme.ts` + `ThemeToggle` + accent swatches + persistence (independent).
4. `App.tsx` shell restructure to command rail (depends on 1).
5. Component rebuilds against tokens: RenamePanel→hero, RegexBar→PatternPanel, PairList, StrayList, Dropzone, topbar (depend on 1; mostly parallelizable).

## Testing

- Existing `match.test.ts`, `path.test.ts`, Rust tests — unchanged.
- New `theme.test.ts`: defaults (dark, hue 250), round-trip persistence, application of `body.light` and `--accent-hue`.
- Visual verification: `pnpm tauri dev`; the `design-mockups/` HTML is the pixel reference.

## Reference

- Mockups (approved target = Variant B): `design-mockups/index.html`, `design-mockups/layout-command-rail.html`, `design-mockups/depth.css` (token source of truth), `design-mockups/mock.css`. `layout-action-bar.html` is the alternate, not implemented.
- Builds on `2026-06-22-per-side-regex-and-path-display-design.md` (per-side regex + no-truncation path rendering — already shipped; not re-decided).

## Decisions logged

- **Layout:** Variant B (command rail). Rename = hero, pinned to the top of the rail.
- **Theme:** dark default; light optional, persisted; accent default blue (hue 250), selectable, persisted.
- **Pattern:** demoted to a collapsible panel; Auto-detect stays one tap.
- **Index-preview tables:** removed; live extraction preview folded into the Pattern panel.
- **Icons:** inline SVG set; no emoji; no icon-library dependency.
- **No Tailwind:** Depth tokens as CSS custom properties + utility classes in plain CSS.
- **Paths:** no truncation (already shipped); the design preserves wrapping full relative paths with the folder dimmed and filename emphasized.
