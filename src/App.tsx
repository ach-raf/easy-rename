import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Dropzone } from './components/Dropzone';
import { Topbar } from './components/Topbar';
import { PatternPanel } from './components/PatternPanel';
import { PairList } from './components/PairList';
import { StrayList } from './components/StrayList';
import { listFiles, renamePairs, undoRenames, loadPresets, savePresets, loadLastRename, saveLastRename, getLaunchFolder, type FileEntry, type RenameOp, type RenameReport, type Preset } from './api';
import { classify, extOf } from './lib/classify';
import { buildPairs, detectBestPattern, applyReassign, candidatePatterns, REGEX_PRESETS, mergeLocked, fillEmpty, unassignAll, type MediaFile, type Row } from './lib/match';
import { buildRenamePlan } from './lib/renamePlan';
import { evaluateSearchReplace, type SearchReplaceOpts } from './lib/searchReplace';
import { evaluateRenumber, seedSeasons, type RenumberOpts } from './lib/renumber';
import { RenamePanel } from './components/RenamePanel';
import { SearchReplacePanel } from './components/SearchReplacePanel';
import { SearchReplaceList } from './components/SearchReplaceList';
import { RenumberPanel } from './components/RenumberPanel';
import { RenumberList } from './components/RenumberList';
import './app.css';

// Read + classify + sort a flat file listing into the three buckets the UI
// consumes. Shared by the initial folder open (which then auto-detects a
// pattern) and the post-rename refresh (which keeps the current pattern).
function classifyEntries(entries: FileEntry[]) {
  const vids: MediaFile[] = [];
  const subz: MediaFile[] = [];
  const all: { name: string; path: string }[] = [];
  for (const e of entries) {
    if (e.is_dir) continue;
    all.push({ name: e.name, path: e.path });
    const kind = classify(e.name);
    if (kind === 'other') continue;
    const mf: MediaFile = { id: e.path, name: e.name, path: e.path, ext: extOf(e.name), kind };
    if (kind === 'video') vids.push(mf); else subz.push(mf);
  }
  vids.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  subz.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  all.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { vids, subz, all };
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
  const [mode, setMode] = useState<'match' | 'searchReplace' | 'renumber'>('match');
  const [srOpts, setSrOpts] = useState<SearchReplaceOpts>({
    search: '', replace: '', useRegex: false, caseSensitive: false, applyTo: 'both',
  });
  const [renumberOpts, setRenumberOpts] = useState<RenumberOpts>({ pattern: '(\\d+)', seasons: [], pad: 2 });
  const [allFiles, setAllFiles] = useState<{ name: string; path: string }[]>([]);

  const hydratedRef = useRef(false);
  const srTouchedRef = useRef(false);
  const didInitRef = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const matchOps = useMemo(
    () => buildRenamePlan(rows.filter((r) => r.sub).map((r) => ({ video: r.video, sub: r.sub! }))),
    [rows],
  );
  const srResult = useMemo(() => evaluateSearchReplace(allFiles, srOpts), [allFiles, srOpts]);
  const renumberResult = useMemo(() => evaluateRenumber(allFiles, renumberOpts), [allFiles, renumberOpts]);
  const ops = mode === 'renumber' ? renumberResult.ops : mode === 'searchReplace' ? srResult.ops : matchOps;

  const unmatchedSubs = useMemo(() => {
    const used = new Set(rows.filter((r) => r.sub).map((r) => r.sub!.id));
    return subs.filter((s) => !used.has(s.id));
  }, [rows, subs]);

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

  // Restore last-used Search & Replace inputs + mode on launch.
  useEffect(() => {
    let cancelled = false;
    loadLastRename()
      .then((s) => {
        if (cancelled || !s || srTouchedRef.current) return;
        setMode(s.mode);
        setSrOpts({ search: s.search, replace: s.replace, useRegex: s.useRegex, caseSensitive: s.caseSensitive, applyTo: s.applyTo });
      })
      .catch(() => { /* first run or unreadable — keep defaults */ })
      .finally(() => { if (!cancelled) hydratedRef.current = true; });
    return () => { cancelled = true; };
  }, []);

  // Debounced-save the SR inputs + mode whenever they change (after hydration).
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (mode === 'renumber') return;          // renumber setup is not persisted (MVP)
    const id = setTimeout(() => {
      saveLastRename({ mode, ...srOpts }).catch((e) => setApiError(String(e)));
    }, 400);
    return () => clearTimeout(id);
  }, [mode, srOpts]);

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

  const onAutoAssignAll = useCallback(() => {
    const fresh = buildPairs(videos, subs, videoPattern, subPattern, shift).pairs;
    setRows((prev) => fillEmpty(prev, fresh));
  }, [videos, subs, videoPattern, subPattern, shift]);

  const onUnassignAll = useCallback(() => {
    setRows((prev) => unassignAll(prev));
  }, []);

  const onToggleLock = useCallback((videoId: string) => {
    setRows((prev) => prev.map((r) => (r.video.id === videoId ? { ...r, locked: !r.locked } : r)));
  }, []);

  // Rebuild rows from files + per-side patterns + shift. `prevRows` carries
  // manual overrides to preserve: a fresh folder open passes [] (no carry-over);
  // every other caller (pattern edit, re-match, auto-detect, post-rename reload)
  // passes the current rows so 🔒 locks survive. mergeLocked overlays the
  // overrides on top of the fresh auto-match.
  const recompute = (vids: MediaFile[], subz: MediaFile[], vPat: string, sPat: string, sh: number, prevRows: Row[]) => {
    const freshByVideo = new Map(buildPairs(vids, subz, vPat, sPat, sh).pairs.map((p) => [p.video.id, p.sub]));
    setRows(mergeLocked(prevRows, vids, subz, freshByVideo));
  };

  // Re-read the folder from disk and recompute matches with the CURRENT pattern
  // settings. Called after a rename/undo so every preview (PairList, S&R preview,
  // rename counts) reflects the live filesystem instead of the pre-action
  // snapshot. Pattern/shift/linked are preserved — Auto-Detect is a separate
  // action if the user wants a fresh guess.
  const reloadFiles = async (dir: string) => {
    const { vids, subz, all } = classifyEntries(await listFiles(dir, true));
    setAllFiles(all);
    setVideos(vids);
    setSubs(subz);
    recompute(vids, subz, videoPattern, subPattern, shift, rows);
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
      if (folder) await reloadFiles(folder);
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
      if (folder) await reloadFiles(folder);
    } catch (e) {
      setApiError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSrChange = useCallback((next: SearchReplaceOpts) => {
    srTouchedRef.current = true;
    setSrOpts(next);
  }, []);

  const onFolder = useCallback(async (dir: string) => {
    setLastApplied(null);
    setReport(null);
    setApiError(null);
    const { vids, subz, all } = classifyEntries(await listFiles(dir, true));
    setAllFiles(all);
    setRenumberOpts((prev) => ({ ...prev, seasons: seedSeasons(all, prev.pattern) }));
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
    recompute(vids, subz, detected.videoPattern, detected.subPattern, shift, []);
  }, [shift, candidates]);

  // Open the folder passed on the command line at launch, if any
  // (`easyrename.exe F:\Shows\...`). Runs once: the ref guards against re-firing
  // when `onFolder`'s identity changes after presets load. A load failure (e.g.
  // permission denied) surfaces via apiError and leaves the empty dropzone.
  useEffect(() => {
    if (didInitRef.current) return;
    // No-op outside the Tauri runtime (e.g. `vite dev` browser preview).
    if (!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return;
    didInitRef.current = true;
    void (async () => {
      try {
        const dir = await getLaunchFolder();
        if (dir) await onFolder(dir);
      } catch (e) {
        setApiError(String(e));
      }
    })();
  }, [onFolder]);

  const onAutoDetect = () => {
    const best = detectBestPattern(videos, subs, candidates);
    const same = best.videoPattern === best.subPattern;
    setVideoPattern(best.videoPattern);
    setSubPattern(best.subPattern);
    setLinked(same);
    recompute(videos, subs, best.videoPattern, best.subPattern, shift, rows);
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
    recompute(videos, subs, p, nextSubPat, shift, rows);
  };
  const changeSubPattern = (p: string) => {
    if (linked) return;
    setSubPattern(p);
    recompute(videos, subs, videoPattern, p, shift, rows);
  };
  const toggleLinked = () => {
    if (linked) {
      setLinked(false);
    } else {
      setSubPattern(videoPattern);
      setLinked(true);
    }
  };

  // Empty state: big dropzone centered on the canvas. No rail yet.
  if (!folder) {
    return (
      <div className="app">
        <div className="app-empty">
          <header>
            <h1>Easy Rename</h1>
            <p className="subtitle">Match subtitles to videos by episode number, then rename in one click.</p>
          </header>
          <Dropzone onFolder={onFolder} loaded={folder} />
        </div>
      </div>
    );
  }

  // Command rail: full-width Topbar (brand + folder chip + theme), the PairList
  // work area, and a right rail with RenamePanel (hero), PatternPanel, StrayList.
  const regexEl = (
    <PatternPanel
      videoPattern={videoPattern} subPattern={subPattern} linked={linked}
      onVideoPattern={changeVideoPattern} onSubPattern={changeSubPattern}
      onToggleLinked={toggleLinked} shift={shift} setShift={setShift}
      presets={presets} onSavePreset={savePreset} onDeletePreset={deletePreset}
      onResetPresets={resetPresets}
      previewFiles={videos.slice(0, 5)}
      onAutoDetect={onAutoDetect}
      onReMatch={() => recompute(videos, subs, videoPattern, subPattern, shift, rows)}
    />
  );

  if (mode === 'renumber') {
    return (
      <div className="app layout-sr">
        <Topbar onFolder={onFolder} folder={folder} mode={mode} onModeChange={setMode} />
        <aside className="left-panel">
          <RenumberPanel opts={renumberOpts} files={allFiles} onChange={setRenumberOpts} summary={renumberResult} />
          <RenamePanel
            ops={ops} folder={folder} onConflict={onConflict} setOnConflict={setOnConflict}
            onRun={onRun} onUndo={onUndo} busy={busy} canUndo={lastApplied !== null}
            report={report} apiError={apiError} totalVideos={allFiles.length}
            conflicts={renumberResult.conflicts}
          />
        </aside>
        <main className="work">
          <RenumberList rows={renumberResult.rows} />
        </main>
      </div>
    );
  }

  if (mode === 'searchReplace') {
    return (
      <div className="app layout-sr">
        <Topbar onFolder={onFolder} folder={folder} mode={mode} onModeChange={setMode} />
        <aside className="left-panel">
          <SearchReplacePanel opts={srOpts} onChange={handleSrChange} summary={srResult} />
          <RenamePanel
            ops={ops} folder={folder} onConflict={onConflict} setOnConflict={setOnConflict}
            onRun={onRun} onUndo={onUndo} busy={busy} canUndo={lastApplied !== null}
            report={report} apiError={apiError} totalVideos={allFiles.length}
            conflicts={srResult.conflicts}
          />
        </aside>
        <main className="work">
          <SearchReplaceList rows={srResult.rows} />
        </main>
      </div>
    );
  }

  return (
    <div className="app layout-rail">
      <Topbar onFolder={onFolder} folder={folder} mode={mode} onModeChange={setMode} />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <main className="work">
          <div className="pairs depth-card">
            <PairList rows={rows} allSubs={subs} pattern={videoPattern} folder={folder}
                    onReassign={reassign} onAutoAssignAll={onAutoAssignAll}
                    onUnassignAll={onUnassignAll} onToggleLock={onToggleLock} />
          </div>
        </main>
        <aside className="rail">
          <RenamePanel
            ops={ops} folder={folder} onConflict={onConflict} setOnConflict={setOnConflict}
            onRun={onRun} onUndo={onUndo} busy={busy} canUndo={lastApplied !== null}
            report={report} apiError={apiError} totalVideos={rows.length}
          />
          {regexEl}
          <StrayList subs={unmatchedSubs} folder={folder} />
        </aside>
      </DndContext>
    </div>
  );
}
