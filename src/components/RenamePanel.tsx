import type { RenameOp, RenameReport } from '../api';

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
              const from = op.src.split(/[\\/]/).pop();
              const to = op.dest.split(/[\\/]/).pop();
              return (
                <tr key={op.src}>
                  <td title={from}>{from}</td>
                  <td className="arrow">→</td>
                  <td className="dest" title={to}>{to}</td>
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
