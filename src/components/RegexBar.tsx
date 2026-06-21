import { extractIndex, REGEX_PRESETS } from '../lib/match';
import type { MediaFile } from '../lib/match';

interface Props {
  pattern: string;
  setPattern: (p: string) => void;
  shift: number;
  setShift: (n: number) => void;
}

export function RegexBar({ pattern, setPattern, shift, setShift }: Props) {
  return (
    <div className="card regexbar">
      <div className="field">
        <span>Match pattern</span>
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="e.g. (\\d+)"
          spellCheck={false}
        />
      </div>
      <div className="field">
        <span>Shift (off-by-one)</span>
        <input
          type="number"
          value={shift}
          onChange={(e) => setShift(Number(e.target.value) || 0)}
        />
      </div>
      <div className="presets">
        {REGEX_PRESETS.map((p) => (
          <button
            key={p.pattern}
            className={p.pattern === pattern ? 'active' : ''}
            title={p.pattern}
            onClick={() => setPattern(p.pattern)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function IndexPreview({ files, pattern }: { files: MediaFile[]; pattern: string }) {
  return (
    <table className="preview">
      <tbody>
        {files.slice(0, 8).map((f) => {
          const idx = extractIndex(f.name, pattern);
          return (
            <tr key={f.id}>
              <td className="name" title={f.name}>{f.name}</td>
              <td className={'idx' + (idx === null ? ' miss' : '')}>{idx === null ? '—' : idx}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
