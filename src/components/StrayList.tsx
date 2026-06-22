import { useDraggable } from '@dnd-kit/core';
import { splitRelative } from '../lib/path';
import { FilePath } from './FilePath';
import { Icon } from './icons';
import type { MediaFile } from '../lib/match';

function StrayChip({ sub, folder }: { sub: MediaFile; folder: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: 'sub:' + sub.id, data: { sub } });
  const { dir, base } = splitRelative(sub.path, folder);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={'sub-chip' + (isDragging ? ' dragging' : '')}
      title={sub.path}
    >
      <Icon name="captions" />
      <FilePath dir={dir} base={base} abs={sub.path} />
      <Icon name="grip" size={15} className="grip" />
    </div>
  );
}

export function StrayList({ subs, folder }: { subs: MediaFile[]; folder: string }) {
  return (
    <div className="depth-card rail-section">
      <div className="rail-hero-row">
        <h3 style={{ margin: 0 }}>Stray subtitles</h3>
        <span className="badge badge-neutral">{subs.length}</span>
      </div>
      <p className="hint" style={{ margin: '8px 0 0' }}>{subs.length === 0 ? 'None — every subtitle is linked.' : 'Drag onto a video row, or pick it from that row\'s menu.'}</p>
      <div className="unmatched-list" style={{ padding: '10px 0 0' }}>
        {subs.map((sub) => <StrayChip key={sub.id} sub={sub} folder={folder} />)}
      </div>
    </div>
  );
}
