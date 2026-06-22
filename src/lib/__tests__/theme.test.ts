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
