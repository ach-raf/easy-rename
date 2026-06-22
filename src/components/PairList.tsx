import { useDroppable } from '@dnd-kit/core';
import { extractIndex } from '../lib/match';
import { splitRelative } from '../lib/path';
import { FilePath } from './FilePath';
import { Icon } from './icons';
import type { MediaFile, Row } from '../lib/match';

interface Props {
  rows: Row[];
  allSubs: MediaFile[];
  pattern: string;
  folder: string;
  onReassign: (videoId: string, sub: MediaFile | null) => void;
}

function RowItem({ row, allSubs, pattern, folder, onReassign }: {
  row: Row;
  allSubs: MediaFile[];
  pattern: string;
  folder: string;
  onReassign: (videoId: string, sub: MediaFile | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'row:' + row.video.id, data: { videoId: row.video.id } });
  const idx = extractIndex(row.video.name, pattern);
  const matched = !!row.sub;
  const vRel = splitRelative(row.video.path, folder);
  const subRel = row.sub ? splitRelative(row.sub.path, folder) : null;
  return (
    <div ref={setNodeRef} className={'pair-row' + (matched ? ' matched' : '') + (isOver ? ' over' : '')}>
      <div className={'idx' + (idx === null ? ' warn' : '')}>{idx === null ? '—' : idx}</div>
      <div className="cell video">
        <Icon name="video" />
        <FilePath dir={vRel.dir} base={vRel.base} abs={row.video.path} />
      </div>
      <div className="arrow">→</div>
      <div className="cell sub-cell">
        <select
          className="sub-select"
          value={row.sub?.id ?? ''}
          title={row.sub?.name ?? 'No subtitle linked'}
          onChange={(e) => {
            const id = e.target.value;
            const sub = id ? allSubs.find((s) => s.id === id) ?? null : null;
            onReassign(row.video.id, sub);
          }}
        >
          <option value="">Assign subtitle…</option>
          {allSubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {subRel ? <FilePath dir={subRel.dir} base={subRel.base} abs={row.sub!.path} /> : null}
      </div>
      <div className="row-state"><span className={'dot ' + (matched ? 'success' : 'warn')} /></div>
    </div>
  );
}

export function PairList({ rows, allSubs, pattern, folder, onReassign }: Props) {
  return (
    <div className="pairs">
      <div className="pairs-head">
        <h2 className="pairs-title">Match subtitles to videos</h2>
        <span className="pairs-count">drag a stray subtitle onto a row, or use its menu</span>
      </div>
      <div className="pairs-grid-head"><div>#</div><div>Video</div><div></div><div>Subtitle</div><div></div></div>
      <div className="scroll-area">
        {rows.map((r) => <RowItem key={r.video.id} row={r} allSubs={allSubs} pattern={pattern} folder={folder} onReassign={onReassign} />)}
      </div>
    </div>
  );
}
