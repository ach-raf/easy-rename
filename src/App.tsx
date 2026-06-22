import { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Dropzone } from './components/Dropzone';
import { PatternPanel } from './components/PatternPanel';
import { PairList } from './components/PairList';
import { StrayList } from './components/StrayList';
import { listFiles, renamePairs, undoRenames, loadPresets, savePresets, type RenameOp, type RenameReport, type Preset } from './api';
import { classify, extOf } from './lib/classify';
import { buildPairs, detectBestPattern, applyReassign, candidatePatterns, REGEX_PRESETS, type MediaFile, type Row } from './lib/match';
import { buildRenamePlan } from './lib/renamePlan';
import { RenamePanel } from './components/RenamePanel';
import './app.css';

// Two-pane desktop shell kicks in at this width. JS-driven (not pure CSS) so
// the narrow layout can keep its original top-to-bottom order while the wide
// layout moves the rename panel into the sticky rail.
const WIDE_BREAKPOINT = '(min-width: 1100px)';
function usePrefersWide(query: string = WIDE_BREAKPOINT): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setWide(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return wide;
}

export default function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [subs, setSubs] = useState<MediaFile[]>([]);
  // Per-side patterns: videos and subtitles can be parsed by different regexes.
  // While `linked` is true the video pattern is the source of truth and is
  // copied to the subtitle side; unlinked, each side is edited independently.
  const [videoPattern, setVideoPattern] = useState('(\\d+)');
  const [subPattern, setSubPattern] = useState('(\\d+)');
  const [linked, setLinked] = useState(true);
  const [shift, setShift] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [onConflict, setOnConflict] = useState<'skip' | 'overwrite'>('skip');
  const [report, setReport] = useState<RenameReport | null>(null);
  const [lastApplied, setLastApplied] = useState<RenameOp[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  // Saved regex presets. Seeded with the built-ins so the first paint isn't
  // empty, then reconciled with whatever is on disk (regex_presets.json in the
  // app config dir) once load resolves.
  const [presets, setPresets] = useState<Preset[]>(REGEX_PRESETS);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const wide = usePrefersWide();

  const ops = useMemo(
    () => buildRenamePlan(rows.filter((r) => r.sub).map((r) => ({ video: r.video, sub: r.sub! }))),
    [rows],
  );

  const unmatchedSubs = useMemo(() => {
    const used = new Set(rows.filter((r) => r.sub).map((r) => r.sub!.id));
    return subs.filter((s) => !used.has(s.id));
  }, [rows, subs]);

  const linkedCount = useMemo(() => rows.filter((r) => r.sub).length, [rows]);

  // De-duped + capped candidate list for auto-detect. detectBestPattern is
  // O(n^2) in candidates, so a big saved-presets list must not flow in raw.
  const candidates = useMemo(() => candidatePatterns(presets), [presets]);

  // Load saved presets once on mount; keep the built-in seed if load is empty
  // (first run) or fails (e.g. corrupt file → treat as empty).
  useEffect(() => {
    let cancelled = false;
    loadPresets()
      .then((loaded) => {
        if (!cancelled && loaded.length > 0) setPresets(loaded);
      })
      .catch(() => { /* keep seed defaults */ });
    return () => { cancelled = true; };
  }, []);

  // Persist the full list to disk whenever it changes. Fire-and-forget; a write
  // failure surfaces as the global apiError like the rename commands do.
  const persist = useCallback(async (next: Preset[]) => {
    try {
      await savePresets(next);
    } catch (e) {
      setApiError(String(e));
    }
  }, []);

  const savePreset = useCallback((label: string) => {
    const name = label.trim();
    if (!name) return;
    setPresets((prev) => {
      // Replacing an existing name (case-insensitive) overwrites it in place;
      // otherwise the new preset is appended.
      const rest = prev.filter((p) => p.label.toLowerCase() !== name.toLowerCase());
      const next = [...rest, { label: name, pattern: videoPattern }];
      void persist(next);
      return next;
    });
  }, [videoPattern, persist]);

  const deletePreset = useCallback((label: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.label !== label);
      void persist(next);
      return next;
    });
  }, [persist]);

  const resetPresets = useCallback(() => {
    setPresets(REGEX_PRESETS);
    void persist(REGEX_PRESETS);
  }, [persist]);

  // Assign `sub` to the video `videoId` (or unlink). The pure swap/assign logic
  // lives in applyReassign (tested); the dropdown and drag both route through it.
  const reassign = useCallback((videoId: string, sub: MediaFile | null) => {
    setRows((prev) => applyReassign(prev, videoId, sub));
  }, []);

  // Rebuild rows from files + per-side patterns + shift. Manual edits are
  // discarded on re-match. Takes the arrays as args so it can run from onFolder
  // with the freshly-built locals (state updates are async).
  const recompute = (vids: MediaFile[], subz: MediaFile[], vPat: string, sPat: string, sh: number) => {
    const matched = new Map(buildPairs(vids, subz, vPat, sPat, sh).pairs.map((p) => [p.video.id, p.sub]));
    setRows(vids.map((v) => ({ video: v, sub: matched.get(v.id) ?? null })));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const toVideoId = (e.over?.data.current as { videoId?: string } | undefined)?.videoId;
    const dragged = (e.active.data.current as { sub?: MediaFile } | undefined)?.sub;
    if (!toVideoId || !dragged) return;
    reassign(toVideoId, dragged);
  };

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
    // Joint auto-detect: the best pattern per side can live in a different index
    // space and combine to zero pairs, so we pick the (video, sub) pair that
    // yields the most pairs rather than optimizing each side on its own.
    const detected = detectBestPattern(vids, subz, candidates);
    const same = detected.videoPattern === detected.subPattern;
    setVideoPattern(detected.videoPattern);
    setSubPattern(detected.subPattern);
    setLinked(same);
    setFolder(dir);
    setVideos(vids);
    setSubs(subz);
    recompute(vids, subz, detected.videoPattern, detected.subPattern, shift);
  }, [shift, candidates]);

  const onAutoDetect = () => {
    const best = detectBestPattern(videos, subs, candidates);
    const same = best.videoPattern === best.subPattern;
    setVideoPattern(best.videoPattern);
    setSubPattern(best.subPattern);
    setLinked(same);
    recompute(videos, subs, best.videoPattern, best.subPattern, shift);
  };

  // While linked, editing the video pattern copies it to the subtitle side.
  // Toggling the link ON copies video → subtitle; toggling it OFF just unlocks
  // independent editing (no value change). Selecting/editing a pattern also
  // re-matches immediately so the bottom "Link each video to a subtitle" rows
  // (and their dropdowns) update without a separate Re-match click. Manual
  // links are discarded, same as the Re-match button.
  const changeVideoPattern = (p: string) => {
    setVideoPattern(p);
    const nextSubPat = linked ? p : subPattern;
    if (linked) setSubPattern(p);
    recompute(videos, subs, p, nextSubPat, shift);
  };
  const changeSubPattern = (p: string) => {
    if (linked) return;
    setSubPattern(p);
    recompute(videos, subs, videoPattern, p, shift);
  };
  const toggleLinked = () => {
    if (linked) {
      setLinked(false);
    } else {
      setSubPattern(videoPattern);
      setLinked(true);
    }
  };

  // Each section is built once and composed differently per layout, so the
  // narrow column keeps today's order (rename last) while the wide shell moves
  // rename into the sticky rail. No handler/prop wiring is duplicated.
  const headerEl = (
    <header>
      <h1>Easy Rename</h1>
      <p className="subtitle">Match subtitles to videos by episode number, then rename in one click.</p>
    </header>
  );
  const dropzoneEl = <Dropzone onFolder={onFolder} loaded={folder} />;

  if (!folder) {
    return (
      <div className="app">
        <div className="app-empty">
          {headerEl}
          {dropzoneEl}
        </div>
      </div>
    );
  }

  const countsEl = (
    <p className="counts"><strong>{videos.length}</strong> videos · <strong>{subs.length}</strong> subtitles</p>
  );
  const regexEl = (
    <PatternPanel {...{
      videoPattern,
      subPattern,
      linked,
      onVideoPattern: changeVideoPattern,
      onSubPattern: changeSubPattern,
      onToggleLinked: toggleLinked,
      shift,
      setShift,
      presets,
      onSavePreset: savePreset,
      onDeletePreset: deletePreset,
      onResetPresets: resetPresets,
    }} />
  );
  const presetsEl = (
    <div className="regex-row">
      <div className="presets">
        <button onClick={() => recompute(videos, subs, videoPattern, subPattern, shift)}>Re-match</button>
        <button onClick={onAutoDetect}>Auto-detect pattern</button>
      </div>
    </div>
  );
  const previewsEl = null;
  const pairsEl = (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="layout">
        <div className="card">
          <h3>Link each video to a subtitle ({linkedCount}/{rows.length})</h3>
          <p className="hint">Use the dropdown on each row to choose its subtitle — picking one that's already used swaps them. You can also drag from the Unmatched panel.</p>
          <PairList rows={rows} allSubs={subs} pattern={videoPattern} folder={folder} onReassign={reassign} />
        </div>
        <StrayList subs={unmatchedSubs} folder={folder} />
      </div>
    </DndContext>
  );
  const renameEl = (
    <RenamePanel
      ops={ops}
      folder={folder}
      onConflict={onConflict}
      setOnConflict={setOnConflict}
      onRun={onRun}
      onUndo={onUndo}
      busy={busy}
      canUndo={lastApplied !== null}
      report={report}
      apiError={apiError}
    />
  );

  return (
    <div className="app">
      {wide ? (
        <div className="shell">
          <aside className="rail">
            {headerEl}
            {dropzoneEl}
            {countsEl}
            {regexEl}
            {presetsEl}
            {renameEl}
          </aside>
          <main className="content">
            {previewsEl}
            {pairsEl}
          </main>
        </div>
      ) : (
        <div className="app-narrow">
          {headerEl}
          {dropzoneEl}
          {countsEl}
          {regexEl}
          {presetsEl}
          {previewsEl}
          {pairsEl}
          {renameEl}
        </div>
      )}
    </div>
  );
}
