import { useDroppable } from '@dnd-kit/core';
import { extractIndex } from '../lib/match';
import type { MediaFile, Row } from '../lib/match';

interface Props {
  rows: Row[];
  allSubs: MediaFile[];
  pattern: string;
  onReassign: (videoId: string, sub: MediaFile | null) => void;
}

function VideoRow({ row, allSubs, pattern, onReassign }: {
  row: Row;
  allSubs: MediaFile[];
  pattern: string;
  onReassign: (videoId: string, sub: MediaFile | null) => void;
}) {
  // The whole row is a drop target (for drag from the Unmatched panel) AND the
  // subtitle is a <select> so linking works reliably without drag.
  const { setNodeRef, isOver } = useDroppable({ id: 'row:' + row.video.id, data: { videoId: row.video.id } });
  const idx = extractIndex(row.video.name, pattern);
  return (
    <div ref={setNodeRef} className={'pair-row' + (isOver ? ' over' : '')}>
      <div className="cell video" title={row.video.name}>
        {idx !== null && <span className="badge">{idx}</span>}
        <span className="name">{row.video.name}</span>
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
      </div>
    </div>
  );
}

export function PairList({ rows, allSubs, pattern, onReassign }: Props) {
  return (
    <div className="pairs">
      <div className="head"><div>Video</div><div>Subtitle</div></div>
      {rows.map((r) => (
        <VideoRow key={r.video.id} row={r} allSubs={allSubs} pattern={pattern} onReassign={onReassign} />
      ))}
    </div>
  );
}
