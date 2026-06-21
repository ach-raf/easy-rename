import { useCallback, useMemo, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Dropzone } from './components/Dropzone';
import { RegexBar, IndexPreview } from './components/RegexBar';
import { PairList } from './components/PairList';
import { UnmatchedList } from './components/UnmatchedList';
import { listFiles } from './api';
import { classify, extOf } from './lib/classify';
import { buildPairs, type MediaFile } from './lib/match';
import './app.css';
import './components/PairList.css';

type Row = { video: MediaFile; sub: MediaFile | null };

export default function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [subs, setSubs] = useState<MediaFile[]>([]);
  const [pattern, setPattern] = useState('(\\d+)');
  const [shift, setShift] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const unmatchedSubs = useMemo(() => {
    const used = new Set(rows.filter((r) => r.sub).map((r) => r.sub!.id));
    return subs.filter((s) => !used.has(s.id));
  }, [rows, subs]);

  // Rebuild rows from files + pattern + shift. Manual drag edits are discarded
  // on re-match (acceptable for v1; noted in the plan). Takes the arrays as args
  // so it can be called from onFolder with freshly-built locals (state is async).
  const recompute = (vids: MediaFile[], subz: MediaFile[], pat: string, sh: number) => {
    const matched = new Map(buildPairs(vids, subz, pat, sh).pairs.map((p) => [p.video.id, p.sub]));
    setRows(vids.map((v) => ({ video: v, sub: matched.get(v.id) ?? null })));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const toVideoId = (e.over?.data.current as { videoId?: string } | undefined)?.videoId;
    const dragged = (e.active.data.current as { sub?: MediaFile } | undefined)?.sub;
    if (!toVideoId || !dragged) return;
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r }));
      const target = next.find((r) => r.video.id === toVideoId);
      if (!target) return prev;
      const displaced = target.sub;                          // what the target row held before
      for (const r of next) if (r.sub?.id === dragged.id) r.sub = displaced;  // pull from old row
      target.sub = dragged;
      return next;
    });
  };

  const clearSub = (videoId: string) =>
    setRows((prev) => prev.map((r) => (r.video.id === videoId ? { ...r, sub: null } : r)));

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
    recompute(vids, subz, pattern, shift);
  }, [pattern, shift]);

  return (
    <div className="app">
      <header><h1>Easy Rename</h1></header>
      <Dropzone onFolder={onFolder} loaded={folder} />
      <p className="muted">Videos: {videos.length} · Subtitles: {subs.length}</p>
      {folder && (
        <>
          <RegexBar pattern={pattern} setPattern={setPattern} shift={shift} setShift={setShift} />
          <button onClick={() => recompute(videos, subs, pattern, shift)}>Re-match</button>
          <div className="previews">
            <div><h3>Videos</h3><IndexPreview files={videos} pattern={pattern} /></div>
            <div><h3>Subtitles</h3><IndexPreview files={subs} pattern={pattern} /></div>
          </div>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="layout">
              <div>
                <h3>Matched pairs</h3>
                <PairList
                  pairs={rows.filter((r) => r.sub).map((r) => ({ video: r.video, sub: r.sub! }))}
                  onClear={clearSub}
                />
                <h3>Unmatched videos ({rows.filter((r) => !r.sub).length})</h3>
                <ul className="muted">
                  {rows.filter((r) => !r.sub).map((r) => <li key={r.video.id}>{r.video.name}</li>)}
                </ul>
              </div>
              <UnmatchedList subs={unmatchedSubs} />
            </div>
          </DndContext>
        </>
      )}
    </div>
  );
}
