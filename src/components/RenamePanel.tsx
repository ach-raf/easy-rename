import type { RenameOp, RenameReport } from '../api';
import { splitRelative } from '../lib/path';
import { FilePath } from './FilePath';

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
}

export function RenamePanel({ ops, folder, onConflict, setOnConflict, onRun, onUndo, busy, canUndo, report, apiError }: Props) {
  return (
    <div className="card rename-panel">
      <div className="bar">
        <div className="field">
          <span>On conflict</span>
          <select value={onConflict} onChange={(e) => setOnConflict(e.target.value as 'skip' | 'overwrite')}>
            <option value="skip">Skip</option>
            <option value="overwrite">Overwrite</option>
          </select>
        </div>
        <button className="primary" onClick={onRun} disabled={busy || ops.length === 0}>
          {busy ? 'Working…' : `Rename ${ops.length} file${ops.length === 1 ? '' : 's'}`}
        </button>
        <button onClick={onUndo} disabled={busy || !canUndo}>Undo last</button>
      </div>

      <details open>
        <summary>Preview ({ops.length})</summary>
        <table className="rename-preview">
          <tbody>
            {ops.map((op) => {
              const f = splitRelative(op.src, folder);
              const t = splitRelative(op.dest, folder);
              return (
                <tr key={op.src}>
                  <td><FilePath dir={f.dir} base={f.base} abs={op.src} /></td>
                  <td className="arrow">→</td>
                  <td className="dest"><FilePath dir={t.dir} base={t.base} abs={op.dest} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>

      {report && (
        <div className={'report' + (report.errors.length > 0 ? ' has-errors' : '')}>
          <p>✓ Applied: {report.applied.length} · Skipped: {report.skipped.length} · Errors: {report.errors.length}</p>
          {report.errors.length > 0 && (
            <ul>{report.errors.map((e, i) => <li key={i} className="err">{e}</li>)}</ul>
          )}
        </div>
      )}

      {apiError && <p className="api-error">{apiError}</p>}
    </div>
  );
}
