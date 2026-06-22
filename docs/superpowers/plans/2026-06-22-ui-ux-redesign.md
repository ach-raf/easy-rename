# UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin and restructure Easy Rename into a polished, depth-based desktop utility (command-rail layout, dark default, light+accent toggle, SVG icons, no-truncation paths) with zero logic changes.

**Architecture:** A new `src/styles/depth.css` provides OKLCH design tokens + `.depth-*` utility classes (ported verbatim from the approved `design-mockups/depth.css`). `src/App.css` is rewritten to the app-specific layout/component styles (ported from `design-mockups/mock.css`). React components are rebuilt in place against those classes; `App.tsx` is restructured into the command-rail grid (topbar · pair-list work area · right rail with Rename hero + collapsible Pattern panel + Stray subtitles). All matching/rename/undo/conflict logic is untouched.

**Tech Stack:** React 19, TypeScript, Vite 7, Tauri 2, @dnd-kit/core, Vitest (jsdom, globals). No new dependencies.

## Global Constraints

- **No logic changes:** `src/lib/{match,path,classify,renamePlan}.ts`, `src/api.ts`, and `src-tauri/**` are untouched. Existing tests (`match.test.ts`, `path.test.ts`, Rust) must stay green.
- **No new dependencies.** No Tailwind, no icon library. Plain CSS + inline SVG.
- **Design tokens are the only source of color/shadow.** Never hardcode hex/rgb or Tailwind shadows — use `var(--…)` from `depth.css`. Neutral hue family is **264** (OKLCH).
- **Dark is the default theme.** Light via `body.light`. Accent default **hue 250** (blue), persisted in `localStorage`.
- **No truncation of file paths** anywhere (the pair list, stray chips, previews). Names wrap via `overflow-wrap: anywhere; word-break: break-word;`. The folder chip in the topbar is the only place ellipsis is allowed (app chrome; full path in `title`).
- **No emoji.** All icons via the `Icon` component.
- **Commit hygiene:** every task ends with a commit on the feature branch; commit messages have **no AI attribution** (no `Co-Authored-By`).
- **Test command:** `pnpm test` (Vitest, jsdom). **Typecheck/build:** `pnpm build` (runs `tsc && vite build`).

---

## File Structure

**Create:**
- `src/styles/depth.css` — design tokens + `.depth-*` utilities (verbatim port of `design-mockups/depth.css`).
- `src/components/icons.tsx` — `<Icon name size className />` inline-SVG set.
- `src/lib/theme.ts` — theme + accent persistence helpers.
- `src/lib/__tests__/theme.test.ts` — theme helper tests.
- `src/components/ThemeControls.tsx` — theme toggle + accent swatches.
- `src/components/Topbar.tsx` — brand + folder chip + ThemeControls.
- `src/components/PatternPanel.tsx` — collapsible pattern editor + live extract preview (replaces `RegexBar.tsx`).

**Modify:**
- `src/main.tsx` — import `depth.css`; apply persisted theme before render.
- `src/App.css` — rewrite to the new app styles (port of `design-mockups/mock.css` + adaptations).
- `src/App.tsx` — command-rail shell; drop index-preview tables; pass new optional props.
- `src/components/RenamePanel.tsx` — rebuild as the Rename hero.
- `src/components/PairList.tsx` — restyled rows.
- `src/components/UnmatchedList.tsx` → **rename** to `src/components/StrayList.tsx`; restyle.
- `src/components/Dropzone.tsx` — depth-aware; compact chip in topbar.

**Delete:**
- `src/components/RegexBar.tsx` — superseded by `PatternPanel.tsx` (its `IndexPreview` export is removed entirely).

---

## Task dependency graph

```
Task 1 (depth.css + branch)
  ├─ Task 2 (icons)          ─┐
  └─ Task 3 (theme lib)       │
        └─ Task 4 (ThemeControls + entry wiring) ─┐
                                                  ├─ Task 5 (App.css port)
                                                  │     │
                                                  │     ├─ Task 6 (RenamePanel hero)
                                                  │     ├─ Task 7 (PatternPanel)
                                                  │     ├─ Task 8 (PairList)
                                                  │     ├─ Task 9 (StrayList)
                                                  │     └─ Task 10 (Dropzone)
                                                  │           │
                                                  │           └─ Task 11 (App.tsx shell)
                                                  │                 │
                                                  │                 └─ Task 12 (polish)
                                                  │                       │
                                                  │                       └─ Task 13 (manual verify)
```

Tasks 6–10 are independent of each other and may run in parallel (subagent-driven) once Task 5 lands.

---

### Task 1: Foundation — design tokens + feature branch

**Files:**
- Create: `src/styles/depth.css`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: the CSS custom properties (`--depth-bg-*`, `--text*`, `--border*`, `--shadow-*`, `--accent*`, semantic `--success*`/`--warning*`/`--error*`/`--sub-*`, `--r-*`, `--t-*`, `--font`, `--mono`) and utility classes (`.depth-card`, `.depth-interactive`, `.depth-button`, `.depth-button-ghost`, `.depth-button-primary`, `.depth-inset`, `.depth-floating`, `.badge*`). Every later task consumes these.

- [ ] **Step 1: Create the feature branch (repo is on `main`).**

Run:
```bash
git checkout -b feat/ui-redesign
```

- [ ] **Step 2: Port the token stylesheet verbatim.**

Copy `design-mockups/depth.css` to `src/styles/depth.css` byte-for-byte. It already contains the full `:root` (dark) + `body.light` overrides, composite shadows, accent-as-hue derivation, semantic colors, radii, motion, and all `.depth-*` / `.badge*` classes.

Run (PowerShell):
```powershell
Copy-Item 'design-mockups\depth.css' 'src\styles\depth.css'
```
Then create the folder if needed: `New-Item -ItemType Directory -Force src/styles` (run before the copy if `src/styles` does not exist).

- [ ] **Step 3: Import it first at the entry point.**

Replace `src/main.tsx` with:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/depth.css";
import App from "./App";
import { applyTheme } from "./lib/theme";

applyTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

> Note: `applyTheme` is created in Task 3. To keep this task's build green in isolation, do Task 3's `src/lib/theme.ts` (Steps 1–4) immediately after Step 2, before building. (Tasks 1 and 3 are executed back-to-back by the same agent in practice.)

- [ ] **Step 4: Verify the build.**

Run: `pnpm build`
Expected: `tsc` succeeds and Vite builds with no errors. (The app is still visually the old layout — only tokens are present.)

- [ ] **Step 5: Commit.**

```bash
git add src/styles/depth.css src/main.tsx
git commit -m "feat(ui): add depth design tokens + import at entry"
```

---

### Task 2: Icon set

**Files:**
- Create: `src/components/icons.tsx`

**Interfaces:**
- Produces: `IconName` union and `function Icon({ name, size?, className? }): JSX.Element`. Consumed by every rebuilt component.

- [ ] **Step 1: Create the icon component.**

`src/components/icons.tsx`:

```tsx
import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  logo: <><path d="M4 8h7M4 8l3-3M4 8l3 3" /><path d="M20 16h-7M20 16l-3-3M20 16l-3 3" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  refresh: <><path d="M4 12a8 8 0 0 1 13.5-5.8L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 0 1-13.5 5.8L4 16" /><path d="M4 20v-4h4" /></>,
  video: <><path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" /><path d="M15 3v4h4" /><path d="M11 10.5v4l3-2z" fill="currentColor" stroke="none" /></>,
  captions: <><path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" /><path d="M15 3v4h4" /><path d="M8.5 13h7M8.5 16h4" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />,
  grip: <><circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" /></>,
  undo: <><path d="M9 7L4 12l5 5" /><path d="M4 12h11a5 5 0 0 1 0 10h-1" /></>,
  chevron: <path d="M6 9l6 6 6-6" />,
  sparkles: <><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" /><path d="M18 15l.7 1.8L20.5 17.5 18.7 18.2 18 20l-.7-1.8L15.5 17.5 17.3 16.8z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.5" /></>,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
```

- [ ] **Step 2: Verify typecheck/build.**

Run: `pnpm build`
Expected: succeeds (the file is unused so far — that's fine).

- [ ] **Step 3: Commit.**

```bash
git add src/components/icons.tsx
git commit -m "feat(ui): add inline SVG icon set"
```

---

### Task 3: Theme + accent persistence (TDD)

**Files:**
- Create: `src/lib/theme.ts`
- Test: `src/lib/__tests__/theme.test.ts`

**Interfaces:**
- Produces: `type Theme = 'dark' | 'light'`; `DEFAULT_ACCENT_HUE = 250`; `ACCENT_HUES: number[]`; `getTheme(): Theme`; `setTheme(t)`, `getAccentHue(): number`, `setAccentHue(h)`, `applyTheme()`. `applyTheme()` toggles `body.light` and sets `--accent-hue` on `document.documentElement`. Consumed by `main.tsx` (Task 1 Step 3) and `ThemeControls` (Task 4).

- [ ] **Step 1: Write the failing tests.**

`src/lib/__tests__/theme.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ACCENT_HUE, getAccentHue, getTheme, setAccentHue, setTheme, applyTheme } from '../theme';

describe('theme persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.classList.remove('light');
    document.documentElement.style.removeProperty('--accent-hue');
  });

  it('defaults to dark and the default accent hue', () => {
    expect(getTheme()).toBe('dark');
    expect(getAccentHue()).toBe(DEFAULT_ACCENT_HUE);
  });

  it('round-trips theme and accent through localStorage', () => {
    setTheme('light');
    expect(getTheme()).toBe('light');
    expect(localStorage.getItem('er-theme')).toBe('light');

    setAccentHue(295);
    expect(getAccentHue()).toBe(295);
    expect(localStorage.getItem('er-accent-hue')).toBe('295');
  });

  it('applyTheme sets body.light and the --accent-hue CSS var', () => {
    setTheme('light');
    setAccentHue(155);
    applyTheme();
    expect(document.body.classList.contains('light')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--accent-hue')).toBe('155');
  });

  it('applyTheme in dark mode removes body.light', () => {
    document.body.classList.add('light');
    setTheme('dark');
    applyTheme();
    expect(document.body.classList.contains('light')).toBe(false);
  });

  it('ignores a garbage accent value and falls back to default', () => {
    localStorage.setItem('er-accent-hue', 'not-a-number');
    expect(getAccentHue()).toBe(DEFAULT_ACCENT_HUE);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `pnpm test src/lib/__tests__/theme.test.ts`
Expected: FAIL — `Cannot find module '../theme'`.

- [ ] **Step 3: Implement the helpers.**

`src/lib/theme.ts`:

```ts
export type Theme = 'dark' | 'light';

export const DEFAULT_ACCENT_HUE = 250;
export const ACCENT_HUES = [250, 295, 155, 70, 15];

const THEME_KEY = 'er-theme';
const ACCENT_KEY = 'er-accent-hue';

export function getTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

export function setTheme(t: Theme): void {
  localStorage.setItem(THEME_KEY, t);
  applyTheme();
}

export function getAccentHue(): number {
  const raw = Number(localStorage.getItem(ACCENT_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ACCENT_HUE;
}

export function setAccentHue(h: number): void {
  localStorage.setItem(ACCENT_KEY, String(h));
  applyTheme();
}

/** Apply the persisted theme to the DOM: body.light class + --accent-hue var.
 *  Called once at app entry (before React renders) so there's no flash. */
export function applyTheme(): void {
  document.body.classList.toggle('light', getTheme() === 'light');
  document.documentElement.style.setProperty('--accent-hue', String(getAccentHue()));
}
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `pnpm test src/lib/__tests__/theme.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/theme.ts src/lib/__tests__/theme.test.ts
git commit -m "feat(ui): theme + accent persistence helpers"
```

---

### Task 4: ThemeControls + entry wiring

**Files:**
- Create: `src/components/ThemeControls.tsx`

**Interfaces:**
- Consumes: `Icon` (Task 2), `theme.ts` helpers (Task 3).
- Produces: `function ThemeControls(): JSX.Element` — a `.topbar-right` group with accent swatches + a theme toggle button. Consumed by `Topbar` (Task 11).

- [ ] **Step 1: Create the component.**

`src/components/ThemeControls.tsx`:

```tsx
import { useState } from 'react';
import { Icon } from './icons';
import { ACCENT_HUES, getAccentHue, getTheme, setAccentHue, setTheme } from '../lib/theme';

export function ThemeControls() {
  const [theme, setThemeState] = useState(getTheme());
  const [hue, setHueState] = useState(getAccentHue());
  const light = theme === 'light';

  return (
    <div className="topbar-right">
      <div className="swatches" role="group" aria-label="Accent color">
        {ACCENT_HUES.map((h) => (
          <button
            key={h}
            type="button"
            className={'swatch' + (hue === h ? ' active' : '')}
            style={{ background: `oklch(0.66 0.18 ${h})` }}
            aria-label={`Accent ${h}`}
            aria-pressed={hue === h}
            onClick={() => { setAccentHue(h); setHueState(h); }}
          />
        ))}
      </div>
      <button
        type="button"
        className="icon-btn"
        id="themeToggle"
        aria-label="Toggle theme"
        aria-pressed={light}
        title={light ? 'Switch to dark' : 'Switch to light'}
        onClick={() => { const next = light ? 'dark' : 'light'; setTheme(next); setThemeState(next); }}
      >
        <Icon name={light ? 'moon' : 'sun'} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build.**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit.**

```bash
git add src/components/ThemeControls.tsx
git commit -m "feat(ui): theme toggle + accent swatch controls"
```

---

### Task 5: Port the app stylesheet

**Files:**
- Modify: `src/App.css` (full rewrite)

**Interfaces:**
- Produces: the app layout + component CSS that Tasks 6–11 produce markup for. Consumed by all rebuilt components.

> Strategy: `design-mockups/mock.css` already contains the approved styles. Port it into `src/App.css` with the adaptations below. The old `App.css` (legacy light theme, `.regexbar`, old `.pair-row`, etc.) is fully replaced. Between this task and Tasks 6–10 the app may look partially restyled (old markup vs new CSS) — that resolves as components are rebuilt.

- [ ] **Step 1: Copy the mockup stylesheet as the new base.**

Run (PowerShell):
```powershell
Copy-Item 'design-mockups\mock.css' 'src\App.css' -Force
```

- [ ] **Step 2: Apply these adaptations to `src/App.css`.**

1. **Body background uses the token** (already does via `var(--depth-bg-darkest)`). Keep.
2. **Folder chip = Dropzone in the topbar.** The mockup's hand-built `.folder-chip` is replaced by styling the existing `.dropzone` when it lives inside `.topbar`. Add at the end of `App.css`:
   ```css
   /* The Dropzone renders as the topbar folder chip in the loaded state. */
   .topbar .dropzone {
     flex: 1 1 auto; min-width: 0; max-width: 100%;
     display: flex; align-items: center; gap: 9px;
     padding: 7px 8px 7px 12px; text-align: left;
     background: var(--depth-bg-elevated); border: 1px solid var(--border);
     border-radius: var(--r-pill); box-shadow: var(--shadow-inset);
     cursor: pointer;
   }
   .topbar .dropzone .dz-icon { font-size: inherit; margin: 0; color: var(--accent); display: inline-flex; }
   .topbar .dropzone .dz-icon svg { width: 18px; height: 18px; }
   .topbar .dropzone p { margin: 0; }
   .topbar .dropzone .dz-title { display: none; }            /* title line hidden in chip mode */
   .topbar .dropzone .dz-path {
     min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
     font-size: 13px; font-variant-numeric: tabular-nums;
   }
   .topbar .dropzone .dz-change { margin-left: auto; }
   ```
3. **Empty-state Dropzone** (no folder, full-width) keeps the big dashed style. Add:
   ```css
   /* Big empty-state dropzone (no folder loaded yet). */
   .app-empty .dropzone {
     padding: 40px; text-align: center;
     border: 2px dashed var(--border-strong); border-radius: var(--r-xl);
     background: var(--depth-bg-base); box-shadow: var(--shadow-medium);
   }
   .app-empty .dropzone .dz-icon { font-size: 30px; margin-bottom: 8px; color: var(--accent); display: inline-flex; }
   .app-empty .dropzone .dz-title { font-weight: 700; font-size: 15px; }
   ```
4. **Rail pattern panel tweaks:** the mockup's `.rail .pattern-panel` inline overrides are not needed because `PatternPanel` renders its own clean structure; remove the `<style>` block from `layout-command-rail.html` from your mental model — in `App.css` keep only:
   ```css
   .rail .pattern-grid { grid-template-columns: 1fr; }
   ```
5. **`hero-k` label** used by `RenamePanel`: add
   ```css
   .hero-k { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; font-weight: 700; color: var(--text-subtle); }
   ```
6. **`seg-label`** used by the conflict segmented control: add
   ```css
   .segmented .seg-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-subtle); align-self: center; padding: 0 8px 0 4px; }
   ```

- [ ] **Step 3: Verify build.**

Run: `pnpm build`
Expected: succeeds. (Visual state is mid-migration.)

- [ ] **Step 4: Commit.**

```bash
git add src/App.css
git commit -m "feat(ui): port command-rail app stylesheet"
```

---

### Task 6: Rename hero (rebuild RenamePanel)

**Files:**
- Modify: `src/components/RenamePanel.tsx`

**Interfaces:**
- Consumes: `Icon` (Task 2), `FilePath` (existing), `splitRelative` (existing), api types (existing).
- Produces: `RenamePanel` with the **same props as today plus an optional `totalVideos?: number`** (defaults to `ops.length`). The old collapsible rename-preview table is removed (the pair list already shows the video→sub mapping; the rename target is `<videoStem>.<subExt>`, predictable from the row). Consumed by `App.tsx` (Task 11) — rendered at the top of the rail.

- [ ] **Step 1: Rewrite the component.**

Replace the entire contents of `src/components/RenamePanel.tsx` with:

```tsx
import type { RenameOp, RenameReport } from '../api';
import { Icon } from './icons';

interface Props {
  ops: RenameOp[];
  folder: string;
  onConflict: 'skip' | 'overwrite';
  setOnConflict: (v: 'skip' | 'overwrite') => void;
  onRun: () => void;
  onUndo: () => void;
  busy: boolean;
  canUndo: boolean;
  report: RenameReport | null;
  apiError: string | null;
  totalVideos?: number;
}

export function RenamePanel({
  ops, folder, onConflict, setOnConflict, onRun, onUndo, busy, canUndo, report, apiError, totalVideos,
}: Props) {
  void folder; // retained for API symmetry; hero does not render a path table
  const total = totalVideos && totalVideos > 0 ? totalVideos : ops.length;
  const ready = ops.length;
  const remaining = Math.max(0, total - ready);
  const pct = total > 0 ? Math.round((ready / total) * 100) : 0;

  return (
    <div className="rename-card">
      <div className="rail-hero-row">
        <div>
          <div className="hero-k">Ready to rename</div>
          <div className="hero-num">
            {ready} {remaining > 0 ? <span className="muted">of {total}</span> : null}
          </div>
        </div>
        {remaining > 0 ? (
          <span className="badge badge-warning"><Icon name="alert" size={12} /> {remaining} left</span>
        ) : null}
      </div>

      <div className="progress"><div className="progress-fill" style={{ width: pct + '%' }} /></div>

      <button
        type="button"
        className="depth-button-primary"
        onClick={onRun}
        disabled={busy || ready === 0}
      >
        {busy ? 'Working…' : `Rename ${ready} file${ready === 1 ? '' : 's'}`}
        {!busy ? <Icon name="arrow" size={16} /> : null}
      </button>

      <div className="segmented" role="radiogroup" aria-label="On conflict">
        <span className="seg-label">Conflict</span>
        <button
          type="button" role="radio" aria-checked={onConflict === 'skip'}
          className={'seg' + (onConflict === 'skip' ? ' active' : '')}
          onClick={() => setOnConflict('skip')}
        >Skip</button>
        <button
          type="button" role="radio" aria-checked={onConflict === 'overwrite'}
          className={'seg' + (onConflict === 'overwrite' ? ' active' : '')}
          onClick={() => setOnConflict('overwrite')}
        >Overwrite</button>
      </div>

      <button
        type="button"
        className="depth-button"
        onClick={onUndo}
        disabled={busy || !canUndo}
        style={{ justifyContent: 'center' }}
      >
        <Icon name="undo" size={16} /> Undo last
      </button>

      {report ? (
        <div className={'report' + (report.errors.length > 0 ? ' has-errors' : '')}>
          <p>✓ Applied: {report.applied.length} · Skipped: {report.skipped.length} · Errors: {report.errors.length}</p>
          {report.errors.length > 0 ? (
            <ul>{report.errors.map((e, i) => <li key={i} className="err">{e}</li>)}</ul>
          ) : null}
        </div>
      ) : null}

      {apiError ? <p className="api-error">{apiError}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify build.**

Run: `pnpm build`
Expected: succeeds. (The component still renders in the old App layout with its old props — `totalVideos` is optional.)

- [ ] **Step 3: Commit.**

```bash
git add src/components/RenamePanel.tsx
git commit -m "feat(ui): rebuild RenamePanel as the rail hero"
```

---

### Task 7: PatternPanel (replace RegexBar)

**Files:**
- Create: `src/components/PatternPanel.tsx`
- Delete: `src/components/RegexBar.tsx`
- Modify: `src/App.tsx` (import swap only — minimal; full restructure is Task 11)

**Interfaces:**
- Consumes: `Icon` (Task 2), `extractIndex`, `MediaFile`, `Preset` (existing).
- Produces: `function PatternPanel(props): JSX.Element` where props are the union of today's `RegexBar` props **plus** optional `previewFiles?: MediaFile[]`, `onAutoDetect?: () => void`, `onReMatch?: () => void`. The `IndexPreview` export is gone. Consumed by `App.tsx` (Task 11) inside the rail, collapsed by default.

- [ ] **Step 1: Create `PatternPanel.tsx`.**

```tsx
import { useState } from 'react';
import { extractIndex } from '../lib/match';
import type { MediaFile } from '../lib/match';
import type { Preset } from '../api';
import { Icon } from './icons';

interface Props {
  videoPattern: string;
  subPattern: string;
  linked: boolean;
  onVideoPattern: (p: string) => void;
  onSubPattern: (p: string) => void;
  onToggleLinked: () => void;
  shift: number;
  setShift: (n: number) => void;
  presets: Preset[];
  onSavePreset: (label: string) => void;
  onDeletePreset: (label: string) => void;
  onResetPresets: () => void;
  previewFiles?: MediaFile[];
  onAutoDetect?: () => void;
  onReMatch?: () => void;
}

function PresetRow({ presets, active, onApply, onDelete }: {
  presets: Preset[]; active: string; onApply: (p: string) => void; onDelete: (label: string) => void;
}) {
  return (
    <>
      {presets.map((p) => (
        <span className="preset" key={p.label}>
          <button type="button" className={'apply' + (p.pattern === active ? ' active' : '')} title={p.pattern} onClick={() => onApply(p.pattern)}>{p.pattern}</button>
          <button type="button" className="del" title="Delete preset" aria-label={`Delete preset ${p.label}`} onClick={() => onDelete(p.label)}>×</button>
        </span>
      ))}
    </>
  );
}

export function PatternPanel(props: Props) {
  const {
    videoPattern, subPattern, linked, onVideoPattern, onSubPattern, onToggleLinked,
    shift, setShift, presets, onSavePreset, onDeletePreset, onResetPresets,
    previewFiles, onAutoDetect, onReMatch,
  } = props;

  const [open, setOpen] = useState(false);
  const [savingName, setSavingName] = useState<string | null>(null);

  const confirmSave = () => {
    if (savingName && savingName.trim()) onSavePreset(savingName.trim());
    setSavingName(null);
  };

  const samples = (previewFiles ?? []).slice(0, 5);

  return (
    <div className="depth-card rail-section">
      <button
        type="button"
        className={'rail-hero-row pattern-pill' + (open ? ' active' : '')}
        style={{ padding: 0, border: 'none', background: open ? 'var(--accent-soft)' : 'none', boxShadow: 'none', width: '100%' }}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <h3 style={{ margin: 0 }}>Pattern</h3>
        <span className="badge badge-info" style={{ fontFamily: 'var(--mono)' }}>{videoPattern || '—'}</span>
        <span style={{ marginLeft: 'auto' }}><Icon name="chevron" size={16} className={open ? 'caret' : ''} /></span>
      </button>

      {open ? (
        <div className="pattern-panel open" style={{ marginTop: 12 }}>
          <div className="pattern-grid">
            <div className="field">
              <label>Video pattern</label>
              <input className="text-input" value={videoPattern} spellCheck={false}
                onChange={(e) => onVideoPattern(e.target.value)} placeholder={'e.g. S\\d+E(\\d+)'} />
              <div className="presets">
                <PresetRow presets={presets} active={videoPattern} onApply={onVideoPattern} onDelete={onDeletePreset} />
                {savingName === null ? (
                  <button type="button" className="depth-button-ghost preset-add" onClick={() => setSavingName('')}>
                    <Icon name="plus" size={13} /> Save
                  </button>
                ) : (
                  <input
                    className="text-input" autoFocus placeholder="preset name" value={savingName}
                    style={{ width: 120 }}
                    onChange={(e) => setSavingName(e.target.value)}
                    onBlur={confirmSave}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmSave(); if (e.key === 'Escape') setSavingName(null); }}
                  />
                )}
                <button type="button" className="depth-button-ghost" onClick={onResetPresets} title="Restore default presets">Reset</button>
              </div>
            </div>

            <div className={'field' + (linked ? ' disabled' : '')}>
              <label>Subtitle pattern{linked ? ' · linked' : ''}</label>
              <input className="text-input" value={linked ? videoPattern : subPattern} disabled={linked} spellCheck={false}
                onChange={(e) => onSubPattern(e.target.value)} placeholder={'e.g. E\\d+'} />
              <label className="link-toggle">
                <input type="checkbox" checked={linked} onChange={onToggleLinked} />
                <span className="switch" />
                Same pattern for subtitles
              </label>
            </div>
          </div>

          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="field" style={{ maxWidth: 120 }}>
              <label>Shift</label>
              <input className="text-input" style={{ textAlign: 'center' }} type="number" value={shift}
                onChange={(e) => setShift(Number(e.target.value) || 0)} />
            </div>
            {onAutoDetect ? <button type="button" className="depth-button" onClick={onAutoDetect}><Icon name="sparkles" size={15} /> Auto-detect</button> : null}
            {onReMatch ? <button type="button" className="depth-button" onClick={onReMatch}><Icon name="refresh" size={15} /> Re-match</button> : null}
          </div>

          {samples.length > 0 ? (
            <div className="extract-preview depth-inset">
              {samples.map((f) => {
                const idx = extractIndex(f.name, videoPattern);
                return (
                  <div className="extract-row" key={f.id}>
                    <span className={'extract-idx' + (idx === null ? ' miss' : '')}>{idx === null ? '—' : idx}</span>
                    <span className="name">{f.name}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Swap the import in `App.tsx` (minimal) and delete the old file.**

In `src/App.tsx`, change:
```tsx
import { RegexBar, IndexPreview } from './components/RegexBar';
```
to:
```tsx
import { PatternPanel } from './components/PatternPanel';
```
Then delete `src/components/RegexBar.tsx`:
```bash
git rm src/components/RegexBar.tsx
```

> The old `App.tsx` body still references `<RegexBar …/>` and `<IndexPreview …/>`. Task 11 rewrites the body. **To keep this task's build green**, immediately also edit `App.tsx` so the body compiles: replace the `regexEl = (<RegexBar … />)` JSX block with `regexEl = (<PatternPanel {...{ videoPattern, subPattern, linked, onVideoPattern: changeVideoPattern, onSubPattern: changeSubPattern, onToggleLinked: toggleLinked, shift, setShift, presets, onSavePreset: savePreset, onDeletePreset: deletePreset, onResetPresets: resetPresets }} />)` and delete the two `previewsEl` `<IndexPreview …/>` usages (replace `previewsEl` with `null` for now — Task 11 removes it). Remove the now-unused `IndexPreview` import (already done) and any `folder`-only references that `IndexPreview` needed.

Concretely, in `App.tsx`:
- Set `const previewsEl = null;`
- Replace the `regexEl` block with a `PatternPanel` element using the props above.
- The `presetsEl` block (Re-match / Auto-detect buttons) can stay as-is for now; Task 11 folds those handlers into `PatternPanel` via `onAutoDetect`/`onReMatch`. Leaving them rendered is harmless.

- [ ] **Step 3: Verify build + tests.**

Run: `pnpm build && pnpm test`
Expected: build succeeds; existing tests pass.

- [ ] **Step 4: Commit.**

```bash
git add src/components/PatternPanel.tsx src/App.tsx
git commit -m "feat(ui): replace RegexBar with collapsible PatternPanel + live preview"
```

---

### Task 8: PairList restyle

**Files:**
- Modify: `src/components/PairList.tsx`

**Interfaces:**
- Consumes: `Icon` (Task 2), `FilePath`, `splitRelative`, `extractIndex` (existing).
- Produces: `PairList` with unchanged props (`rows`, `allSubs`, `pattern`, `folder`, `onReassign`). Markup uses the new row classes; the per-row `<select>` keeps its id/value logic and gains the `.sub-select` styling (handled in CSS).

- [ ] **Step 1: Rewrite the component.**

Replace `src/components/PairList.tsx` with:

```tsx
import { useDroppable } from '@dnd-kit/core';
import { extractIndex } from '../lib/match';
import { splitRelative } from '../lib/path';
import { FilePath } from './FilePath';
import { Icon } from './icons';
import type { MediaFile, Row } from '../lib/match';

interface Props {
  rows: Row[];
  allSubs: MediaFile[];
  pattern: string;
  folder: string;
  onReassign: (videoId: string, sub: MediaFile | null) => void;
}

function VideoRow({ row, allSubs, pattern, folder, onReassign }: {
  row: Row; allSubs: MediaFile[]; pattern: string; folder: string;
  onReassign: (videoId: string, sub: MediaFile | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'row:' + row.video.id, data: { videoId: row.video.id } });
  const vRel = splitRelative(row.video.path, folder);
  const matched = !!row.sub;
  return (
    <div ref={setNodeRef} className={'pair-row' + (isOver ? ' over' : '')}>
      <div className="cell video">
        <Icon name="video" />
        <FilePath dir={vRel.dir} base={vRel.base} abs={row.video.path} />
      </div>
      <div className="arrow">→</div>
      <div className="cell sub-cell">
        <select
          className="sub-select"
          value={row.sub?.id ?? ''}
          title={row.sub?.name ?? 'No subtitle linked'}
          onChange={(e) => {
            const id = e.target.value;
            const sub = id ? allSubs.find((s) => s.id === id) ?? null : null;
            onReassign(row.video.id, sub);
          }}
        >
          <option value="">Assign subtitle…</option>
          {allSubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {matched ? (
          <FilePath dir={splitRelative(row.sub!.path, folder).dir} base={splitRelative(row.sub!.path, folder).base} abs={row.sub!.path} />
        ) : null}
      </div>
      <div className="row-state">
        <span className={'dot ' + (matched ? 'success' : 'warn')} />
      </div>
    </div>
  );
}

export function PairList({ rows, allSubs, pattern, folder, onReassign }: Props) {
  void pattern; // index badge removed from rows; pattern still used upstream for matching
  return (
    <div className="pairs">
      <div className="pairs-head">
        <h2 className="pairs-title">Match subtitles to videos</h2>
        <span className="pairs-count">drag a stray subtitle onto a row, or use its menu</span>
      </div>
      <div className="pairs-grid-head">
        <div>#</div><div>Video</div><div></div><div>Subtitle</div><div></div>
      </div>
      <div className="scroll-area">
        {rows.map((r, i) => (
          <div className={'pair-row' + (r.sub ? ' matched' : '')} key={r.video.id} style={{ gridTemplateColumns: undefined }}>
            <div className="idx">{String(i + 1).padStart(2, '0')}</div>
            <VideoRow row={r} allSubs={allSubs} pattern={pattern} folder={folder} onReassign={onReassign} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

> Note: the outer `pair-row` carries the index + matched state; `VideoRow` renders the inner cells (video, arrow, subtitle, dot). Because `VideoRow` is a child rather than the grid item, adjust so the **whole row** is one grid. Simpler correct version — make `VideoRow` the row itself and drop the wrapper. Replace the `PairList` body's mapping with:

```tsx
{rows.map((r, i) => (
  <RowItem key={r.video.id} index={i + 1} row={r} allSubs={allSubs} folder={folder} onReassign={onReassign} />
))}
```
and rename `VideoRow` → `RowItem`, adding an `index` prop and rendering the `.idx` as the first cell, with class `pair-row` + (`matched`/unmatched). The droppable ref stays on the row. Use this single-component form (do **not** keep the wrapper `div`).

Final `RowItem` signature: `function RowItem({ index, row, allSubs, folder, onReassign }: { index: number; row: Row; allSubs: MediaFile[]; folder: string; onReassign: (id: string, sub: MediaFile | null) => void })`. It returns the `.pair-row` with five cells: `.idx`, `.cell.video`, `.arrow`, `.cell.sub-cell`, `.row-state`.

- [ ] **Step 2: Verify build.**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit.**

```bash
git add src/components/PairList.tsx
git commit -m "feat(ui): restyle PairList rows (depth cells, no truncation)"
```

---

### Task 9: StrayList (rename UnmatchedList)

**Files:**
- Create: `src/components/StrayList.tsx`
- Delete: `src/components/UnmatchedList.tsx`
- Modify: `src/App.tsx` (import swap)

**Interfaces:**
- Consumes: `Icon`, `FilePath`, `splitRelative`, `@dnd-kit` draggable (existing).
- Produces: `function StrayList({ subs, folder }): JSX.Element` — same props as the old `UnmatchedList`. Consumed by `App.tsx` (Task 11) in the rail.

- [ ] **Step 1: Create `StrayList.tsx`.**

```tsx
import { useDraggable } from '@dnd-kit/core';
import { splitRelative } from '../lib/path';
import { FilePath } from './FilePath';
import { Icon } from './icons';
import type { MediaFile } from '../lib/match';

function StrayChip({ sub, folder }: { sub: MediaFile; folder: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: 'sub:' + sub.id, data: { sub } });
  const { dir, base } = splitRelative(sub.path, folder);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={'sub-chip' + (isDragging ? ' dragging' : '')}
      title={sub.path}
    >
      <Icon name="captions" />
      <FilePath dir={dir} base={base} abs={sub.path} />
      <Icon name="grip" size={15} className="grip" />
    </div>
  );
}

export function StrayList({ subs, folder }: { subs: MediaFile[]; folder: string }) {
  return (
    <div className="depth-card rail-section">
      <div className="rail-hero-row">
        <h3 style={{ margin: 0 }}>Stray subtitles</h3>
        <span className="badge badge-neutral">{subs.length}</span>
      </div>
      <p className="hint" style={{ margin: '8px 0 0' }}>{subs.length === 0 ? 'None — every subtitle is linked.' : 'Drag onto a video row, or pick it from that row’s menu.'}</p>
      <div className="unmatched-list" style={{ padding: '10px 0 0' }}>
        {subs.map((sub) => <StrayChip key={sub.id} sub={sub} folder={folder} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Swap the import in `App.tsx` and delete the old file.**

In `src/App.tsx`: change `import { UnmatchedList } from './components/UnmatchedList';` → `import { StrayList } from './components/StrayList';`, and replace `<UnmatchedList subs={unmatchedSubs} folder={folder} />` with `<StrayList subs={unmatchedSubs} folder={folder} />`.

```bash
git rm src/components/UnmatchedList.tsx
```

- [ ] **Step 3: Verify build.**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Commit.**

```bash
git add src/components/StrayList.tsx src/App.tsx
git commit -m "feat(ui): rename UnmatchedList to StrayList, restyle chips"
```

---

### Task 10: Dropzone restyle

**Files:**
- Modify: `src/components/Dropzone.tsx`

**Interfaces:**
- Consumes: `Icon` (Task 2). Existing Tauri drag-drop + dialog logic unchanged.
- Produces: `Dropzone({ onFolder, loaded })` with depth styling via CSS context (`.app-empty .dropzone` for the big empty state, `.topbar .dropzone` for the chip). Emoji replaced by `Icon`.

- [ ] **Step 1: Rewrite the render (keep the effect/handlers).**

Replace the `return ( … )` JSX in `src/components/Dropzone.tsx` with:

```tsx
  return (
    <div className="dropzone" ref={hoverRef} onClick={pick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}>
      <span className="dz-icon"><Icon name={loaded ? 'folder' : 'folder'} /></span>
      {loaded ? (
        <p><span className="dz-path" title={loaded}>{loaded}</span></p>
      ) : (
        <>
          <p className="dz-title">Drop a folder here</p>
          <p className="muted">or click to browse · videos + subtitles are auto-detected</p>
        </>
      )}
    </div>
  );
```

Add the import: `import { Icon } from './icons';` at the top. Keep the existing `useEffect` (Tauri drag-drop listener) and `pick` unchanged.

- [ ] **Step 2: Verify build.**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit.**

```bash
git add src/components/Dropzone.tsx
git commit -m "feat(ui): depth-aware Dropzone with SVG icons"
```

---

### Task 11: App shell — command rail assembly

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/Topbar.tsx`

**Interfaces:**
- Consumes: `Topbar`, `Dropzone`, `PatternPanel`, `PairList`, `StrayList`, `RenamePanel` (all prior tasks), existing state/handlers in `App.tsx`.
- Produces: the final command-rail layout. Drops `previewsEl`/`presetsEl` entirely; the empty state still shows the big dropzone.

- [ ] **Step 1: Create `Topbar.tsx`.**

```tsx
import { Dropzone } from './Dropzone';
import { Icon } from './icons';
import { ThemeControls } from './ThemeControls';

export function Topbar({ onFolder, folder }: { onFolder: (dir: string) => void; folder: string | null }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo"><Icon name="logo" size={17} /></span>
        Easy Rename
      </div>
      <Dropzone onFolder={onFolder} loaded={folder} />
      <ThemeControls />
    </header>
  );
}
```

- [ ] **Step 2: Rewrite `App.tsx` layout sections + return.**

In `src/App.tsx`:

- Imports: add `import { Topbar } from './components/Topbar';` and `import { StrayList } from './components/StrayList';` (already swapped in Task 9), ensure `PatternPanel` is imported (Task 7), and `RenamePanel`. Remove any lingering `RegexBar`/`IndexPreview`/`UnmatchedList` references.
- Delete the `previewsEl` and `presetsEl` blocks. Replace `regexEl` with a `PatternPanel` element passing the new optional props:
  ```tsx
  const regexEl = (
    <PatternPanel
      videoPattern={videoPattern} subPattern={subPattern} linked={linked}
      onVideoPattern={changeVideoPattern} onSubPattern={changeSubPattern}
      onToggleLinked={toggleLinked} shift={shift} setShift={setShift}
      presets={presets} onSavePreset={savePreset} onDeletePreset={deletePreset}
      onResetPresets={resetPresets}
      previewFiles={videos.slice(0, 5)}
      onAutoDetect={onAutoDetect}
      onReMatch={() => recompute(videos, subs, videoPattern, subPattern, shift)}
    />
  );
  ```
- Empty-state return becomes:
  ```tsx
  if (!folder) {
    return (
      <div className="app">
        <div className="app-empty">
          <header>
            <h1>Easy Rename</h1>
            <p className="subtitle">Match subtitles to videos by episode number, then rename in one click.</p>
          </header>
          <Dropzone onFolder={onFolder} loaded={folder} />
        </div>
      </div>
    );
  }
  ```
- Loaded-state return — the command rail:
  ```tsx
  return (
    <div className="app layout-rail">
      <Topbar onFolder={onFolder} folder={folder} />
      <main className="work">
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="pairs depth-card">
            <PairList rows={rows} allSubs={subs} pattern={videoPattern} folder={folder} onReassign={reassign} />
          </div>
        </DndContext>
      </main>
      <aside className="rail">
        <RenamePanel
          ops={ops} folder={folder} onConflict={onConflict} setOnConflict={setOnConflict}
          onRun={onRun} onUndo={onUndo} busy={busy} canUndo={lastApplied !== null}
          report={report} apiError={apiError} totalVideos={rows.length}
        />
        {regexEl}
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <StrayList subs={unmatchedSubs} folder={folder} />
        </DndContext>
      </aside>
    </div>
  );
  ```
  > `layout-rail` is the body class in the mockup; here it is an extra class on `.app` so the grid applies. Update `App.css` Task 5 selector if needed: the mockup keyed layout off `body.layout-rail`. To keep it simple, add `body.layout-rail .app, .app.layout-rail .app` — but since `.app` IS the grid here, change the mockup rule from `body.layout-rail .app` to `.app.layout-rail` (the element itself carries the class). Make that one selector edit in `src/App.css`: replace `.layout-rail .app {` with `.app.layout-rail {`, and the descendant rules `.layout-rail .topbar/.work/.rail` become `.app.layout-rail .topbar/.work/.rail` — update all four selectors accordingly. (`.app.layout-rail` is itself the grid; its children are `.topbar`, `.work`, `.rail`.)

  Also remove the now-unused `countsEl`, `headerEl` (folded into Topbar), and `wide`/`usePrefersWide` logic — the command rail is the single layout (narrow windows just scroll). Delete `WIDE_BREAKPOINT`, `usePrefersWide`, `wide`, and the `if (wide) … else …` branch. Keep `sensors`.

- [ ] **Step 3: Verify build + tests.**

Run: `pnpm build && pnpm test`
Expected: build succeeds; existing tests pass.

- [ ] **Step 4: Commit.**

```bash
git add src/App.tsx src/components/Topbar.tsx src/App.css
git commit -m "feat(ui): assemble command-rail shell (Topbar + rail + work)"
```

---

### Task 12: Polish pass

**Files:**
- Modify: `src/App.css`, any component as needed.

- [ ] **Step 1: Selector fix from Task 11.**

Confirm `src/App.css` uses `.app.layout-rail` (not `body.layout-rail .app`) for the grid and children, per Task 11 Step 2.

- [ ] **Step 2: Remove dead legacy CSS.**

Delete any leftover rules from the old stylesheet that are no longer referenced: old `.regexbar`, `.regex-side`, `.regex-row`, `.link-toggle input`-based checkbox (now a `.switch`), `.preview`, `.preview-wrap`, `.rename-preview`, `.sub-current`, `.sub-chip-inline`, `.counts`, old `.pair-row` two-column grid, `.preset-reset`, `.app-narrow`, `.shell`, `.rail` (old sticky rail), `.content`. Keep only what the rebuilt components reference.

- [ ] **Step 3: Verify scrollbar + focus.**

Ensure `.scroll-area`, `.rail`, and `.unmatched-list` have `overflow-y: auto` and a token-based scrollbar (the mockup's `::-webkit-scrollbar` rule). Ensure `:focus-visible` rings use `0 0 0 3px var(--accent-soft)` on buttons/inputs/links.

- [ ] **Step 4: Verify build.**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 5: Commit.**

```bash
git add src/App.css
git commit -m "feat(ui): polish — drop legacy CSS, fix rail selectors, focus/scroll"
```

---

### Task 13: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the app.**

Run: `pnpm tauri dev`

- [ ] **Step 2: Checklist.**

- [ ] Empty state shows the big dashed Dropzone with an SVG folder icon (no emoji).
- [ ] Dropping a folder loads it; topbar shows brand + folder chip + accent swatches + theme toggle.
- [ ] **Dark is the default.** Toggling to light persists across reload.
- [ ] Accent swatches change the primary color live and persist.
- [ ] Pair list: full filenames wrap (no truncation); long tokens break cleanly.
- [ ] Matched rows show the linked subtitle path wrapping under the select; unmatched rows show the restyled select (dark dropdown, custom chevron).
- [ ] Drag a stray subtitle onto a row → links (swap semantics intact).
- [ ] Rename hero shows "Ready · N of M", progress bar, primary button, conflict segmented control, Undo (disabled until a run).
- [ ] Run Rename → report callout appears; Undo reverts.
- [ ] Pattern pill collapses/expands; Auto-detect + Re-match work; live extract preview shows indices (misses in red).
- [ ] No `window.prompt` for saving a preset (inline field).
- [ ] No emoji anywhere; all icons are SVG.
- [ ] Resize narrow: layout still usable (scrolls).

- [ ] **Step 3: Final commit if any tweaks were made.**

```bash
git add -A
git commit -m "fix(ui): verification tweaks"
```

---

## Self-Review

**1. Spec coverage:**
- Depth tokens + utilities → Task 1. ✓
- Icons replace emoji → Task 2 + applied in Tasks 4, 6–11. ✓
- Theme (dark default) + accent persisted + applied before paint → Task 3 (helpers + tests), Task 4 (controls), Task 1 Step 3 (entry wiring). ✓
- Command-rail layout (Variant B) → Task 11. ✓
- Rename hero + conflict segmented + undo + progress → Task 6. ✓
- Pattern demoted/collapsible + live extract preview; `window.prompt` removed → Task 7. ✓
- Pair list high-density, no truncation, restyled select → Task 8 + Task 5 (CSS `.sub-select`). ✓
- Stray subtitles → Task 9. ✓
- Index-preview tables removed → Task 7 (deletes `IndexPreview`) + Task 11 (removes usage). ✓
- No logic changes → no task touches `lib/*` logic or `src-tauri`. ✓
- Accessibility (aria on toggle/swatches/segmented, focus rings) → Tasks 4, 6, 7 + Task 12. ✓

**2. Placeholder scan:** none — every code step contains real code; CSS ports reference in-repo files verbatim with enumerated deltas. One open item: Task 8's `RowItem` refactor is described in prose after an initial draft block; the implementer uses the single-`RowItem` form. (Kept as guidance, not a placeholder.)

**3. Type consistency:**
- `RenamePanel` adds optional `totalVideos` (Task 6); `App.tsx` passes `totalVideos={rows.length}` (Task 11). ✓
- `PatternPanel` props match `RegexBar`'s plus optional `previewFiles`/`onAutoDetect`/`onReMatch` (Task 7); `App.tsx` passes all (Task 11). ✓
- `StrayList` props == old `UnmatchedList` props (Task 9); `App.tsx` passes `subs` + `folder`. ✓
- `Theme` type, `DEFAULT_ACCENT_HUE`, `ACCENT_HUES`, `applyTheme` names match across Task 3 ↔ Task 4 ↔ Task 1 Step 3. ✓
- `IconName` includes every name used (`logo, folder, refresh, video, captions, arrow, sliders, sun, moon, grip, undo, chevron, sparkles, plus, x, alert`). ✓

No gaps found.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-ui-ux-redesign.md`. The user has already chosen **Subagent-Driven** execution. REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` — dispatch a fresh subagent per task, review between tasks, parallelizing Tasks 6–10 after Task 5 lands.
