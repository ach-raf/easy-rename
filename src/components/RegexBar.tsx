import './RegexBar.css';
import { extractIndex } from '../lib/match';
import type { MediaFile } from '../lib/match';

const PRESETS: { label: string; pattern: string }[] = [
  { label: 'Any number  (\\d+)', pattern: '(\\d+)' },
  { label: 'After E  E(\\d+)', pattern: 'E(\\d+)' },
  { label: 'SxxExx  S\\d+E(\\d+)', pattern: 'S\\d+E(\\d+)' },
  { label: 'After -  -(\\d+)', pattern: '-(\\d+)' },
];

interface Props {
  pattern: string;
  setPattern: (p: string) => void;
  shift: number;
  setShift: (n: number) => void;
}

export function RegexBar({ pattern, setPattern, shift, setShift }: Props) {
  return (
    <div className="regexbar">
      <label>Match pattern
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="e.g. (\\d+)"
          spellCheck={false}
        />
      </label>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.pattern} onClick={() => setPattern(p.pattern)}>{p.label}</button>
        ))}
      </div>
      <label>Shift (off-by-one)
        <input
          type="number"
          value={shift}
          onChange={(e) => setShift(Number(e.target.value) || 0)}
        />
      </label>
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
              <td>{f.name}</td>
              <td>{idx === null ? '—' : idx}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
