import { useEffect, useRef } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import './Dropzone.css';

interface Props {
  onFolder: (dir: string) => void;
  loaded: string | null;
}

export function Dropzone({ onFolder, loaded }: Props) {
  const hoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      const paths = 'paths' in event.payload ? event.payload.paths : [];
      const el = hoverRef.current;
      if (type === 'enter' || type === 'over') el?.classList.add('drag');
      else el?.classList.remove('drag');
      if (type === 'drop' && paths && paths.length > 0) {
        onFolder(paths[0]);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [onFolder]);

  const pick = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === 'string') onFolder(dir);
  };

  return (
    <div className="dropzone" ref={hoverRef} onClick={pick}>
      <p><strong>{loaded ? 'Folder loaded:' : 'Drop a folder here'}</strong></p>
      <p className="muted">{loaded ?? 'or click to browse'}</p>
      <p className="muted">Videos + subtitles inside will be auto-detected.</p>
    </div>
  );
}
