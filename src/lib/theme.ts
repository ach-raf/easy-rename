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
