import type { RenameOp, RenameReport } from '../api';
import './RenamePanel.css';

interface Props {
  ops: RenameOp[];
  onConflict: 'skip' | 'overwrite';
  setOnConflict: (v: 'skip' | 'overwrite') => void;
  onRun: () => void;
  onUndo: () => void;
  busy: boolean;
  canUndo: boolean;
  report: RenameReport | null;
  apiError: string | null;
}

export function RenamePanel({ ops, onConflict, setOnConflict, onRun, onUndo, busy, canUndo, report, apiError }: Props) {
  return (
    <div className="rename-panel">
      <div className="bar">
        <label>On conflict
          <select value={onConflict} onChange={(e) => setOnConflict(e.target.value as 'skip' | 'overwrite')}>
            <option value="skip">Skip</option>
            <option value="overwrite">Overwrite</option>
          </select>
        </label>
        <button className="primary" onClick={onRun} disabled={busy || ops.length === 0}>
          Rename {ops.length} file{ops.length === 1 ? '' : 's'}
        </button>
        <button onClick={onUndo} disabled={busy || !canUndo}>Undo last</button>
      </div>

      <details open>
        <summary>Preview ({ops.length})</summary>
        <table className="preview">
          <tbody>
            {ops.map((op) => (
              <tr key={op.src}>
                <td>{op.src.split(/[\\/]/).pop()}</td>
                <td>→</td>
                <td>{op.dest.split(/[\\/]/).pop()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {report && (
        <div className="report">
          <p>✓ Applied: {report.applied.length} · Skipped: {report.skipped.length} · Errors: {report.errors.length}</p>
          {report.errors.length > 0 && (
            <ul>{report.errors.map((e, i) => <li key={i} className="err">{e}</li>)}</ul>
          )}
        </div>
      )}

      {apiError && <p className="err">{apiError}</p>}
    </div>
  );
}
