import { Icon, type IconName } from './icons';
import { classify } from '../lib/classify';
import type { RenumberRow, RenumberReason } from '../lib/renumber';

function iconFor(name: string): IconName {
  const k = classify(name);
  if (k === 'video') return 'video';
  if (k === 'subtitle') return 'captions';
  return 'file';
}

const REASON_LABEL: Record<RenumberReason, string> = {
  'out-of-range': '— out of range',
  'no-number': '— no number found',
  invalid: '— invalid name',
  'no-change': '— no change',
};

export function RenumberList({ rows }: { rows: RenumberRow[] }) {
  const renamedCount = rows.filter((r) => r.state === 'matched' || r.state === 'conflict').length;
  return (
    <div className="pairs depth-card preview-card">
      <div className="preview-head">
        <h2 className="pairs-title">Renumber preview</h2>
        <span className="pairs-count">{rows.length} files in scope</span>
      </div>
      <div className="preview-grid-head rn">
        <div>#</div><div>Abs</div><div>Original <span className="count">{rows.length}</span></div><div></div><div>Renamed <span className="count">{renamedCount}</span></div><div></div>
      </div>
      <div className="scroll-area">
        {rows.map((r, i) => (
          <div key={r.path} className={'preview-row rn ' + r.state}>
            <div className="idx">{String(i + 1).padStart(2, '0')}</div>
            <div className="abs">{r.abs ?? '—'}</div>
            <div className="file">
              <Icon name={iconFor(r.original)} size={15} />
              <span className="name" title={r.original}>{r.original}</span>
            </div>
            <div className="arrow">{r.state === 'unmatched' ? '·' : '→'}</div>
            <div className="file renamed">
              <span className="name" title={r.renamed ?? ''}>
                {r.renamed ?? REASON_LABEL[r.reason ?? 'no-number']}
              </span>
            </div>
            <div className="row-state">
              <span className={'dot ' + (r.state === 'matched' ? 'success' : 'warn')}></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
