import { Icon, type IconName } from './icons';
import { VirtualList } from './VirtualList';
import { classify } from '../lib/classify';
import type { PreviewRow } from '../lib/searchReplace';

interface Props {
  rows: PreviewRow[];
}

function iconFor(name: string): IconName {
  const kind = classify(name);
  if (kind === 'video') return 'video';
  if (kind === 'subtitle') return 'captions';
  return 'file';
}

export function SearchReplaceList({ rows }: Props) {
  const renamedCount = rows.filter((r) => r.state === 'matched' || r.state === 'conflict').length;

  return (
    <div className="pairs depth-card preview-card">
      <div className="preview-head">
        <h2 className="pairs-title">Search &amp; Replace preview</h2>
        <span className="pairs-count">{rows.length} files in scope</span>
      </div>
      <div className="preview-grid-head">
        <div>#</div>
        <div>Original <span className="count">{rows.length}</span></div>
        <div></div>
        <div>Renamed <span className="count">{renamedCount}</span></div>
        <div></div>
      </div>
      <VirtualList items={rows} getKey={(r) => r.path}>
        {(r, i) => (
          <div className={'preview-row ' + r.state}>
            <div className="idx">{String(i + 1).padStart(2, '0')}</div>
            <div className="file">
              <Icon name={iconFor(r.original)} size={15} />
              <span className="name" title={r.original}>{r.original}</span>
            </div>
            <div className="arrow">{r.state === 'unmatched' ? '·' : '→'}</div>
            <div className="file renamed">
              <span className="name" title={r.renamed ?? ''}>
                {r.renamed ?? (r.state === 'conflict' ? '— conflict' : '— no match')}
              </span>
            </div>
            <div className="row-state">
              <span className={'dot ' + (r.state === 'matched' ? 'success' : 'warn')}></span>
            </div>
          </div>
        )}
      </VirtualList>
    </div>
  );
}
