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
