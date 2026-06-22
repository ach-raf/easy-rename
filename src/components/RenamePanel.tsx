import type { RenameOp, RenameReport } from '../api';
import { Icon } from './icons';

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
  totalVideos?: number;
}

export function RenamePanel({
  ops, folder, onConflict, setOnConflict, onRun, onUndo, busy, canUndo, report, apiError, totalVideos,
}: Props) {
  void folder; // retained for API symmetry; hero does not render a path table
  const total = totalVideos && totalVideos > 0 ? totalVideos : ops.length;
  const ready = ops.length;
  const remaining = Math.max(0, total - ready);
  const pct = total > 0 ? Math.round((ready / total) * 100) : 0;

  return (
    <div className="rename-card">
      <div className="rail-hero-row">
        <div>
          <div className="hero-k">Ready to rename</div>
          <div className="hero-num">
            {ready} {remaining > 0 ? <span className="muted">of {total}</span> : null}
          </div>
        </div>
        {remaining > 0 ? (
          <span className="badge badge-warning"><Icon name="alert" size={12} /> {remaining} left</span>
        ) : null}
      </div>

      <div className="progress"><div className="progress-fill" style={{ width: pct + '%' }} /></div>

      <button
        type="button"
        className="depth-button-primary"
        onClick={onRun}
        disabled={busy || ready === 0}
      >
        {busy ? 'Working…' : `Rename ${ready} file${ready === 1 ? '' : 's'}`}
        {!busy ? <Icon name="arrow" size={16} /> : null}
      </button>

      <div className="segmented" role="radiogroup" aria-label="On conflict">
        <span className="seg-label">Conflict</span>
        <button
          type="button" role="radio" aria-checked={onConflict === 'skip'}
          className={'seg' + (onConflict === 'skip' ? ' active' : '')}
          onClick={() => setOnConflict('skip')}
        >Skip</button>
        <button
          type="button" role="radio" aria-checked={onConflict === 'overwrite'}
          className={'seg' + (onConflict === 'overwrite' ? ' active' : '')}
          onClick={() => setOnConflict('overwrite')}
        >Overwrite</button>
      </div>

      <button
        type="button"
        className="depth-button"
        onClick={onUndo}
        disabled={busy || !canUndo}
        style={{ justifyContent: 'center' }}
      >
        <Icon name="undo" size={16} /> Undo last
      </button>

      {report ? (
        <div className={'report' + (report.errors.length > 0 ? ' has-errors' : '')}>
          <p>✓ Applied: {report.applied.length} · Skipped: {report.skipped.length} · Errors: {report.errors.length}</p>
          {report.errors.length > 0 ? (
            <ul>{report.errors.map((e, i) => <li key={i} className="err">{e}</li>)}</ul>
          ) : null}
        </div>
      ) : null}

      {apiError ? <p className="api-error">{apiError}</p> : null}
    </div>
  );
}
