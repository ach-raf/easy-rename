import { useDroppable, useDraggable } from '@dnd-kit/core';
import { extractIndex } from '../lib/match';
import type { Pair } from '../lib/match';

function PairRow({ pair, pattern, onClear }: { pair: Pair; pattern: string; onClear: (videoId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'row:' + pair.video.id, data: { videoId: pair.video.id } });
  const drag = useDraggable({ id: 'rowsub:' + pair.video.id, data: { videoId: pair.video.id, sub: pair.sub } });
  const idx = extractIndex(pair.video.name, pattern);
  return (
    <div ref={setNodeRef} className={'pair-row' + (isOver ? ' over' : '')}>
      <div className="cell video" title={pair.video.name}>
        {idx !== null && <span className="badge">{idx}</span>}
        <span className="name">{pair.video.name}</span>
      </div>
      <div className="cell">
        <span ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} className="sub-chip" title={pair.sub.name}>
          {pair.sub.name}
        </span>
      </div>
      <button className="x" title="Unassign" onClick={() => onClear(pair.video.id)}>✕</button>
    </div>
  );
}

export function PairList({ pairs, pattern, onClear }: { pairs: Pair[]; pattern: string; onClear: (videoId: string) => void }) {
  if (pairs.length === 0) {
    return <p className="muted">No matches yet — try another pattern or Auto-detect.</p>;
  }
  return (
    <div className="pairs">
      <div className="head"><div>Video</div><div>Subtitle</div><div /></div>
      {pairs.map((p) => <PairRow key={p.video.id} pair={p} pattern={pattern} onClear={onClear} />)}
    </div>
  );
}
