import { useState, useCallback } from 'react';
import { Dropzone } from './components/Dropzone';
import { RegexBar, IndexPreview } from './components/RegexBar';
import { listFiles } from './api';
import { classify, extOf } from './lib/classify';
import type { MediaFile } from './lib/match';
import './app.css';

export default function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [subs, setSubs] = useState<MediaFile[]>([]);
  const [pattern, setPattern] = useState('(\\d+)');
  const [shift, setShift] = useState(0);

  const onFolder = useCallback(async (dir: string) => {
    const entries = await listFiles(dir, true);
    const vids: MediaFile[] = [];
    const subz: MediaFile[] = [];
    for (const e of entries) {
      if (e.is_dir) continue;
      const kind = classify(e.name);
      if (kind === 'other') continue;
      const mf: MediaFile = { id: e.path, name: e.name, path: e.path, ext: extOf(e.name), kind };
      if (kind === 'video') vids.push(mf); else subz.push(mf);
    }
    vids.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    subz.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setFolder(dir);
    setVideos(vids);
    setSubs(subz);
  }, []);

  return (
    <div className="app">
      <header><h1>Easy Rename</h1></header>
      <Dropzone onFolder={onFolder} loaded={folder} />
      <p className="muted">Videos: {videos.length} · Subtitles: {subs.length}</p>
      {folder && (
        <>
          <RegexBar pattern={pattern} setPattern={setPattern} shift={shift} setShift={setShift} />
          <div className="previews">
            <div><h3>Videos</h3><IndexPreview files={videos} pattern={pattern} /></div>
            <div><h3>Subtitles</h3><IndexPreview files={subs} pattern={pattern} /></div>
          </div>
        </>
      )}
    </div>
  );
}
