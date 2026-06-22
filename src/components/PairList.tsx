import { useDroppable } from '@dnd-kit/core';
import { extractIndex } from '../lib/match';
import { splitRelative } from '../lib/path';
import { FilePath } from './FilePath';
import type { MediaFile, Row } from '../lib/match';

interface Props {
  rows: Row[];
  allSubs: MediaFile[];
  pattern: string;
  folder: string;
  onReassign: (videoId: string, sub: MediaFile | null) => void;
}

function VideoRow({ row, allSubs, pattern, folder, onReassign }: {
  row: Row;
  allSubs: MediaFile[];
  pattern: string;
  folder: string;
  onReassign: (videoId: string, sub: MediaFile | null) => void;
}) {
  // The whole row is a drop target (for drag from the Unmatched panel) AND the
  // subtitle is a <select> so linking works reliably without drag.
  const { setNodeRef, isOver } = useDroppable({ id: 'row:' + row.video.id, data: { videoId: row.video.id } });
  const idx = extractIndex(row.video.name, pattern);
  const vRel = splitRelative(row.video.path, folder);
  const subRel = row.sub ? splitRelative(row.sub.path, folder) : null;
  return (
    <div ref={setNodeRef} className={'pair-row' + (isOver ? ' over' : '')}>
      <div className="cell video">
        {idx !== null && <span className="badge">{idx}</span>}
        <FilePath dir={vRel.dir} base={vRel.base} abs={row.video.path} />
      </div>
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
          <option value="">— none —</option>
          {allSubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {subRel ? (
          <FilePath dir={subRel.dir} base={subRel.base} abs={row.sub!.path} />
        ) : (
          <span className="sub-current muted">— none —</span>
        )}
      </div>
    </div>
  );
}

export function PairList({ rows, allSubs, pattern, folder, onReassign }: Props) {
  return (
    <div className="pairs">
      <div className="head"><div>Video</div><div>Subtitle</div></div>
      {rows.map((r) => (
        <VideoRow key={r.video.id} row={r} allSubs={allSubs} pattern={pattern} folder={folder} onReassign={onReassign} />
      ))}
    </div>
  );
}
