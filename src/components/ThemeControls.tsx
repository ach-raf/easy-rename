import { Icon } from './icons';
import { ACCENT_HUES, useAccentHue, useTheme, setAccentHue, setTheme } from '../lib/theme';

export function ThemeControls() {
  // Reactive theme + accent via useSyncExternalStore-backed hooks. No local
  // useState needed — the value re-renders automatically when setTheme /
  // setAccentHue run (or when another window changes localStorage).
  const theme = useTheme();
  const hue = useAccentHue();
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
            onClick={() => setAccentHue(h)}
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
        onClick={() => setTheme(light ? 'dark' : 'light')}
      >
        <Icon name={light ? 'moon' : 'sun'} />
      </button>
    </div>
  );
}
