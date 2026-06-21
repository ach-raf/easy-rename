import { useCallback, useMemo, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Dropzone } from './components/Dropzone';
import { RegexBar, IndexPreview } from './components/RegexBar';
import { PairList } from './components/PairList';
import { UnmatchedList } from './components/UnmatchedList';
import { listFiles, renamePairs, undoRenames, type RenameOp, type RenameReport } from './api';
import { classify, extOf } from './lib/classify';
import { buildPairs, detectBestPattern, REGEX_PRESETS, type MediaFile } from './lib/match';
import { buildRenamePlan } from './lib/renamePlan';
import { RenamePanel } from './components/RenamePanel';
import './app.css';

type Row = { video: MediaFile; sub: MediaFile | null };

const PRESET_PATTERNS = REGEX_PRESETS.map((p) => p.pattern);

export default function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [subs, setSubs] = useState<MediaFile[]>([]);
  const [pattern, setPattern] = useState('(\\d+)');
  const [shift, setShift] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [onConflict, setOnConflict] = useState<'skip' | 'overwrite'>('skip');
  const [report, setReport] = useState<RenameReport | null>(null);
  const [lastApplied, setLastApplied] = useState<RenameOp[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const ops = useMemo(
    () => buildRenamePlan(rows.filter((r) => r.sub).map((r) => ({ video: r.video, sub: r.sub! }))),
    [rows],
  );

  const onRun = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await renamePairs(ops, onConflict);
      setReport(r);
      setLastApplied(r.applied);
      setApiError(null);
    } catch (e) {
      setApiError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const onUndo = async () => {
    if (busy || !lastApplied) return;
    setBusy(true);
    try {
      const r = await undoRenames(lastApplied);
      setReport(r);
      setLastApplied(null);
      setApiError(null);
    } catch (e) {
      setApiError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const unmatchedSubs = useMemo(() => {
    const used = new Set(rows.filter((r) => r.sub).map((r) => r.sub!.id));
    return subs.filter((s) => !used.has(s.id));
  }, [rows, subs]);

  const matchedRows = useMemo(() => rows.filter((r) => r.sub), [rows]);
  const unmatchedVideos = useMemo(() => rows.filter((r) => !r.sub), [rows]);

  // Rebuild rows from files + pattern + shift. Manual drag edits are discarded
  // on re-match. Takes the arrays as args so it can run from onFolder with the
  // freshly-built locals (state updates are async).
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
      const displaced = target.sub;
      for (const r of next) if (r.sub?.id === dragged.id) r.sub = displaced;
      target.sub = dragged;
      return next;
    });
  };

  const clearSub = (videoId: string) =>
    setRows((prev) => prev.map((r) => (r.video.id === videoId ? { ...r, sub: null } : r)));

  const onFolder = useCallback(async (dir: string) => {
    setLastApplied(null);
    setReport(null);
    setApiError(null);
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
    // Auto-detect the pattern that yields the most pairs so it works out of the
    // box on real filenames (where `(\d+)` often grabs a year/resolution).
    const detected = detectBestPattern(vids, subz, PRESET_PATTERNS);
    setPattern(detected);
    setFolder(dir);
    setVideos(vids);
    setSubs(subz);
    recompute(vids, subz, detected, shift);
  }, [shift]);

  const onAutoDetect = () => {
    const best = detectBestPattern(videos, subs, PRESET_PATTERNS);
    setPattern(best);
    recompute(videos, subs, best, shift);
  };

  return (
    <div className="app">
      <header>
        <h1>Easy Rename</h1>
        <p className="subtitle">Match subtitles to videos by episode number, then rename in one click.</p>
      </header>

      <Dropzone onFolder={onFolder} loaded={folder} />

      {folder && (
        <>
          <p className="counts"><strong>{videos.length}</strong> videos · <strong>{subs.length}</strong> subtitles</p>

          <RegexBar pattern={pattern} setPattern={setPattern} shift={shift} setShift={setShift} />

          <div className="regex-row">
            <div className="presets">
              <button onClick={() => recompute(videos, subs, pattern, shift)}>Re-match</button>
              <button onClick={onAutoDetect}>Auto-detect pattern</button>
            </div>
          </div>

          <div className="previews">
            <div className="card preview-wrap">
              <h3>Videos</h3>
              <IndexPreview files={videos} pattern={pattern} />
            </div>
            <div className="card preview-wrap">
              <h3>Subtitles</h3>
              <IndexPreview files={subs} pattern={pattern} />
            </div>
          </div>

          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="layout">
              <div className="card">
                <h3>Matched pairs ({matchedRows.length})</h3>
                <PairList
                  pairs={matchedRows.map((r) => ({ video: r.video, sub: r.sub! }))}
                  pattern={pattern}
                  onClear={clearSub}
                />
                {unmatchedVideos.length > 0 && (
                  <>
                    <h3 style={{ marginTop: 18 }}>Unmatched videos ({unmatchedVideos.length})</h3>
                    <ul className="unmatched-videos">
                      {unmatchedVideos.map((r) => <li key={r.video.id} title={r.video.name}>{r.video.name}</li>)}
                    </ul>
                  </>
                )}
              </div>
              <UnmatchedList subs={unmatchedSubs} />
            </div>
          </DndContext>

          <RenamePanel
            ops={ops}
            onConflict={onConflict}
            setOnConflict={setOnConflict}
            onRun={onRun}
            onUndo={onUndo}
            busy={busy}
            canUndo={lastApplied !== null}
            report={report}
            apiError={apiError}
          />
        </>
      )}
    </div>
  );
}
