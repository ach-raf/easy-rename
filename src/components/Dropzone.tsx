import { useEffect, useRef } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';

interface Props {
  onFolder: (dir: string) => void;
  loaded: string | null;
}

export function Dropzone({ onFolder, loaded }: Props) {
  const hoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The native drag/drop listener only exists under the Tauri runtime. Skip it
    // in a plain browser (e.g. `vite dev` preview) so the component still renders
    // instead of throwing on the missing `__TAURI_INTERNALS__` global.
    if (!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return;
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
      <div className="dz-icon">{loaded ? '📂' : '🗂️'}</div>
      <p className="dz-title">{loaded ? 'Folder loaded — drop another to switch' : 'Drop a folder here'}</p>
      {loaded ? (
        <p><span className="dz-path" title={loaded}>{loaded}</span></p>
      ) : (
        <p className="muted">or click to browse · videos + subtitles are auto-detected</p>
      )}
    </div>
  );
}
