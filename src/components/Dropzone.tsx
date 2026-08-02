import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Icon } from './icons';
import { useDragDrop } from '../lib/useDragDrop';

interface Props {
  onFolder: (dir: string) => void;
  loaded: string | null;
}

export function Dropzone({ onFolder, loaded }: Props) {
  // Drag-hover highlight is now driven by the useDragDrop hook instead of a
  // raw onDragDropEvent subscription + manual classList mutation. State (not a
  // ref) so React owns the class toggle and there's no imperative DOM write.
  const [dragging, setDragging] = useState(false);
  useDragDrop({
    onDrop: (path) => onFolder(path),
    onHover: setDragging,
  });

  const pick = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === 'string') onFolder(dir);
  };

  return (
    <div
      className={'dropzone' + (dragging ? ' drag' : '')}
      onClick={pick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
    >
      <span className="dz-icon"><Icon name="folder" /></span>
      {loaded ? (
        <p><span className="dz-path" title={loaded}>{loaded}</span></p>
      ) : (
        <>
          <p className="dz-title">Drop a folder here</p>
          <p className="muted">or click to browse · videos + subtitles are auto-detected</p>
        </>
      )}
    </div>
  );
}
