import { useDraggable } from '@dnd-kit/core';
import { splitRelative } from '../lib/path';
import { FilePath } from './FilePath';
import type { MediaFile } from '../lib/match';

function SubCard({ sub, folder }: { sub: MediaFile; folder: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'sub:' + sub.id,
    data: { sub },
  });
  const { dir, base } = splitRelative(sub.path, folder);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={'sub-card' + (isDragging ? ' dragging' : '')}
      title={sub.path}
    >
      <FilePath dir={dir} base={base} abs={sub.path} />
    </div>
  );
}

export function UnmatchedList({ subs, folder }: { subs: MediaFile[]; folder: string }) {
  return (
    <div className="card unmatched">
      <h3>Unmatched subtitles ({subs.length})</h3>
      {subs.length === 0 && <p className="muted">None — drag onto a video row to assign.</p>}
      {subs.map((sub) => <SubCard key={sub.id} sub={sub} folder={folder} />)}
    </div>
  );
}
