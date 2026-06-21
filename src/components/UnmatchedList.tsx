import { useDraggable } from '@dnd-kit/core';
import type { MediaFile } from '../lib/match';

function SubCard({ sub }: { sub: MediaFile }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'sub:' + sub.id,
    data: { sub },
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={'sub-card' + (isDragging ? ' dragging' : '')}>
      {sub.name}
    </div>
  );
}

export function UnmatchedList({ subs }: { subs: MediaFile[] }) {
  return (
    <div className="unmatched">
      <h3>Unmatched subtitles ({subs.length})</h3>
      {subs.length === 0 && <p className="muted">None — drag subs onto a video row to assign.</p>}
      {subs.map((s) => <SubCard key={s.id} sub={s} />)}
    </div>
  );
}
