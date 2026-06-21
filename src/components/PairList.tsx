import { useDroppable, useDraggable } from '@dnd-kit/core';
import type { Pair } from '../lib/match';
import './PairList.css';

function Row({ pair, onClear }: { pair: Pair; onClear: (videoId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'row:' + pair.video.id, data: { videoId: pair.video.id } });
  const drag = useDraggable({ id: 'rowsub:' + pair.video.id, data: { videoId: pair.video.id, sub: pair.sub } });
  return (
    <tr ref={setNodeRef} className={isOver ? 'over' : ''}>
      <td>{pair.video.name}</td>
      <td>
        <span ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} className="sub-chip">
          {pair.sub.name}
        </span>
        <button className="x" title="Unassign" onClick={() => onClear(pair.video.id)}>✕</button>
      </td>
    </tr>
  );
}

export function PairList({ pairs, onClear }: { pairs: Pair[]; onClear: (videoId: string) => void }) {
  return (
    <table className="pairs">
      <thead><tr><th>Video</th><th>Subtitle</th></tr></thead>
      <tbody>
        {pairs.map((p) => <Row key={p.video.id} pair={p} onClear={onClear} />)}
      </tbody>
    </table>
  );
}
