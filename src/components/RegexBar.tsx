import { extractIndex } from '../lib/match';
import { splitRelative } from '../lib/path';
import { FilePath } from './FilePath';
import type { MediaFile } from '../lib/match';
import type { Preset } from '../api';

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
}

/** The quick-pick chips for one side. Renders the live (saved) preset list,
 *  highlights the active pattern, and offers a per-preset delete. */
function PresetRow({
  presets,
  active,
  onApply,
  onDelete,
}: {
  presets: Preset[];
  active: string;
  onApply: (p: string) => void;
  onDelete: (label: string) => void;
}) {
  return (
    <>
      {presets.map((p) => (
        <span className="preset" key={p.label}>
          <button
            className={p.pattern === active ? 'active' : ''}
            title={p.pattern}
            onClick={() => onApply(p.pattern)}
          >
            {p.label}
          </button>
          <button
            className="preset-del"
            title="Delete preset"
            aria-label={`Delete preset ${p.label}`}
            onClick={() => onDelete(p.label)}
          >
            ×
          </button>
        </span>
      ))}
    </>
  );
}

export function RegexBar({
  videoPattern,
  subPattern,
  linked,
  onVideoPattern,
  onSubPattern,
  onToggleLinked,
  shift,
  setShift,
  presets,
  onSavePreset,
  onDeletePreset,
  onResetPresets,
}: Props) {
  // Save the current VIDEO pattern under a name the user types. prompt() works
  // in WebView2; null = cancelled, empty = ignored by the handler.
  const handleSave = () => {
    const name = window.prompt('Save current video pattern as a preset:', videoPattern);
    if (name === null) return;
    onSavePreset(name);
  };

  return (
    <div className="card regexbar">
      <div className="regex-side">
        <div className="field">
          <span>Video pattern</span>
          <input
            type="text"
            value={videoPattern}
            onChange={(e) => onVideoPattern(e.target.value)}
            placeholder={'e.g. S\\d+E(\\d+)'}
            spellCheck={false}
          />
        </div>
        <div className="presets">
          <PresetRow presets={presets} active={videoPattern} onApply={onVideoPattern} onDelete={onDeletePreset} />
          <button className="preset-add" onClick={handleSave} title="Save current video pattern as a preset">＋ Save</button>
          <button className="preset-reset" onClick={onResetPresets} title="Restore the default presets">Reset</button>
        </div>
      </div>

      <label className="link-toggle">
        <input type="checkbox" checked={linked} onChange={onToggleLinked} />
        Same pattern for subtitles
      </label>

      <div className={'regex-side' + (linked ? ' disabled' : '')}>
        <div className="field">
          <span>Subtitle pattern</span>
          <input
            type="text"
            value={linked ? videoPattern : subPattern}
            disabled={linked}
            onChange={(e) => onSubPattern(e.target.value)}
            placeholder={'e.g. E\\d+'}
            spellCheck={false}
          />
        </div>
        {!linked && (
          <div className="presets">
            <PresetRow presets={presets} active={subPattern} onApply={onSubPattern} onDelete={onDeletePreset} />
          </div>
        )}
      </div>

      <div className="field">
        <span>Shift (off-by-one)</span>
        <input
          type="number"
          value={shift}
          onChange={(e) => setShift(Number(e.target.value) || 0)}
        />
      </div>
    </div>
  );
}

export function IndexPreview({
  files,
  pattern,
  folder,
}: {
  files: MediaFile[];
  pattern: string;
  folder: string;
}) {
  return (
    <div className="preview-scroll">
      <table className="preview">
        <tbody>
          {files.map((f) => {
            const idx = extractIndex(f.name, pattern);
            const { dir, base } = splitRelative(f.path, folder);
            return (
              <tr key={f.id}>
                <td className="name">
                  <FilePath dir={dir} base={base} abs={f.path} />
                </td>
                <td className={'idx' + (idx === null ? ' miss' : '')}>{idx === null ? '—' : idx}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
