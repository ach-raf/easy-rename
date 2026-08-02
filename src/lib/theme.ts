import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

export const DEFAULT_ACCENT_HUE = 250;
export const ACCENT_HUES = [250, 295, 155, 70, 15];

const THEME_KEY = 'er-theme';
const ACCENT_KEY = 'er-accent-hue';

// ── External store ────────────────────────────────────────────────────────
// Theme + accent are modeled as external stores consumed via useSyncExternalStore.
// This replaces the render-time localStorage.getItem reads that ThemeControls
// used to do (via useState(getTheme())) and adds cross-window reactivity: a
// `storage` event from another window updates this one without a manual
// listener. Mutators write to localStorage, notify subscribers, and apply to
// the DOM in one step.

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l();
}

function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  // Cross-window: another tab writing to localStorage fires `storage` here.
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

// ── Reads (also used as useSyncExternalStore snapshots) ───────────────────

export function getTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

export function getAccentHue(): number {
  const raw = Number(localStorage.getItem(ACCENT_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ACCENT_HUE;
}

// Stable snapshot strings so useSyncExternalStore doesn't loop when the value
// is unchanged (the hook compares with Object.is).
function getThemeSnapshot(): Theme {
  return getTheme();
}
function getAccentSnapshot(): number {
  return getAccentHue();
}

// ── Writes ────────────────────────────────────────────────────────────────

/** Apply the current theme to the DOM: body.light class + --accent-hue var.
 *  Called at app entry (before React renders) so there's no flash, and again
 *  implicitly from setTheme/setAccentHue whenever the value changes. Exported
 *  for the boot-time call in main.tsx. */
export function applyTheme(): void {
  document.body.classList.toggle('light', getTheme() === 'light');
  document.documentElement.style.setProperty('--accent-hue', String(getAccentHue()));
}

export function setTheme(t: Theme): void {
  localStorage.setItem(THEME_KEY, t);
  applyTheme();
  notify();
}

export function setAccentHue(h: number): void {
  localStorage.setItem(ACCENT_KEY, String(h));
  applyTheme();
  notify();
}

// ── Hooks ─────────────────────────────────────────────────────────────────

/** Reactive theme value. Re-renders when setTheme is called OR when another
 *  window changes it (storage event). */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getThemeSnapshot, getThemeSnapshot);
}

/** Reactive accent hue. Same reactivity contract as useTheme. */
export function useAccentHue(): number {
  return useSyncExternalStore(subscribe, getAccentSnapshot, getAccentSnapshot);
}
