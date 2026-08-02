import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useQuery } from '@tanstack/react-query';
import { Dropzone } from './components/Dropzone';
import { Topbar } from './components/Topbar';
import { PatternPanel } from './components/PatternPanel';
import { PairList } from './components/PairList';
import { StrayList } from './components/StrayList';
import {
  getLaunchFolder,
  type RenameOp,
} from './api';
import {
  buildPairs,
  detectBestPattern,
  applyReassign,
  candidatePatterns,
  mergeLocked,
  fillEmpty,
  unassignAll,
  type MediaFile,
  type Row,
} from './lib/match';
import { buildRenamePlan } from './lib/renamePlan';
import { evaluateSearchReplace, type SearchReplaceOpts } from './lib/searchReplace';
import { evaluateRenumber, seedSeasons, type RenumberOpts } from './lib/renumber';
import { RenamePanel } from './components/RenamePanel';
import { SearchReplacePanel } from './components/SearchReplacePanel';
import { SearchReplaceList } from './components/SearchReplaceList';
import { RenumberPanel } from './components/RenumberPanel';
import { RenumberList } from './components/RenumberList';
import { useFolderListing } from './lib/useFolderListing';
import { useRenameActions } from './lib/useRenameActions';
import { usePresets, usePresetMutations } from './lib/usePresets';
import { store } from './lib/store';
import type { LastRenameState, LastRenumberState, RenameMode } from './api';
import './app.css';

export default function App() {
  // ── Folder + file listing (TanStack Query) ──────────────────────────────
  // `folder` is the one piece of genuinely local UI state: the directory the
  // user picked. Everything else about the listing is derived by the query.
  const [folder, setFolder] = useState<string | null>(null);
  const listing = useFolderListing(folder);
  const videos = listing.data?.vids ?? [];
  const subs = listing.data?.subz ?? [];
  const allFiles = listing.data?.all ?? [];

  // ── Per-side regex patterns + shift ─────────────────────────────────────
  // While `linked` is true the video pattern is the source of truth and is
  // copied to the subtitle side; unlinked, each side is edited independently.
  const [videoPattern, setVideoPattern] = useState('(\\d+)');
  const [subPattern, setSubPattern] = useState('(\\d+)');
  const [linked, setLinked] = useState(true);
  const [shift, setShift] = useState(0);

  // ── Match rows ──────────────────────────────────────────────────────────
  // `rows` holds the current assignment + lock state. The auto-match driven by
  // pattern/shift is applied via the single narrowly-scoped effect below
  // (preserving locks through `mergeLocked`); manual user actions (reassign,
  // auto-assign-all, lock toggle, auto-detect, folder-open) call `setRows`
  // directly. This replaces the 8 scattered imperative `recompute(...)` calls.
  const [rows, setRows] = useState<Row[]>([]);

  const [onConflict, setOnConflict] = useState<'skip' | 'overwrite'>('skip');

  // ── Mode + Search&Replace inputs (persisted) ────────────────────────────
  const [mode, setMode] = useState<RenameMode>('match');
  const [srOpts, setSrOpts] = useState<SearchReplaceOpts>({
    search: '', replace: '', useRegex: false, caseSensitive: false, applyTo: 'both',
  });
  const [renumberOpts, setRenumberOpts] = useState<RenumberOpts>({ pattern: '(\\d+)', seasons: [], pad: 2 });

  // ── Presets (TanStack Query) ────────────────────────────────────────────
  const { presets } = usePresets();
  const presetMut = usePresetMutations();

  // `srTouchedRef` / `rnTouchedRef` distinguish "user edited this panel" (don't
  // clobber with the restored persisted value when it lands) from "still on
  // defaults". The query below hydrates once; after that, the autosave effects
  // own persistence.
  const srTouchedRef = useRef(false);
  const rnTouchedRef = useRef(false);

  // Restore last-used Search & Replace inputs + mode on launch. Replaces the
  // hand-rolled `loadLastRename` effect + `hydratedRef` gate. The query is
  // single-shot (staleTime: Infinity) — it runs once and the autosave effect
  // below takes over writing.
  const lastRenameQuery = useQuery({
    queryKey: ['lastRename'],
    queryFn: async () => (await store.getLastRename()) ?? null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const lastRenumberQuery = useQuery({
    queryKey: ['lastRenumber'],
    queryFn: async () => (await store.getLastRenumber()) ?? null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const hydrated = lastRenameQuery.isFetched && lastRenumberQuery.isFetched;

  // Apply the persisted SR value exactly once, only if the user hasn't touched
  // SR in the meantime (their in-session edits win over the stale persisted
  // copy). Always restores the mode so the app reopens on the last panel.
  useEffect(() => {
    if (!hydrated || srTouchedRef.current) return;
    const s = lastRenameQuery.data;
    if (!s) return;
    setMode(s.mode);
    setSrOpts({
      search: s.search, replace: s.replace, useRegex: s.useRegex,
      caseSensitive: s.caseSensitive, applyTo: s.applyTo,
    });
  }, [hydrated, lastRenameQuery.data]);

  // Apply the persisted Renumber pattern + pad exactly once, only if the user
  // hasn't touched Renumber in the meantime. Season blocks are NOT restored —
  // they're tied to a specific folder's file numbers and are re-seeded per
  // folder open; restoring them across launches could silently match different
  // files.
  useEffect(() => {
    if (!hydrated || rnTouchedRef.current) return;
    const r = lastRenumberQuery.data;
    if (!r) return;
    setRenumberOpts((prev) => ({ ...prev, pattern: r.pattern, pad: r.pad }));
  }, [hydrated, lastRenumberQuery.data]);

  // Debounced autosave of SR inputs + mode. Uses the store plugin's own 100ms
  // write debounce (in store.setLastRename → Store.set), so this effect just
  // fires on each change; the plugin batches rapid typing. The mode is saved in
  // every mode (including renumber) so the app reopens on the last panel — the
  // previous `mode === 'renumber'` early-return meant the renumber tab was
  // never persisted.
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      const state: LastRenameState = { mode, ...srOpts };
      void store.setLastRename(state);
    }, 400);
    return () => clearTimeout(id);
  }, [hydrated, mode, srOpts]);

  // Debounced autosave of the Renumber pattern + pad (seasons are session-only,
  // tied to the open folder). Shares the same debounced-write story as above.
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      const state: LastRenumberState = { pattern: renumberOpts.pattern, pad: renumberOpts.pad };
      void store.setLastRenumber(state);
    }, 400);
    return () => clearTimeout(id);
  }, [hydrated, renumberOpts.pattern, renumberOpts.pad]);

  // ── Rename/undo mutations ───────────────────────────────────────────────
  // Progress callback streams per-file events from the Rust command via a
  // Channel<ProgressEvent>; surfaced to the panel for a live bar on big batches.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const actions = useRenameActions({
    folder,
    onProgress: useCallback((e) => setProgress({ done: e.done, total: e.total }), []),
  });

  // After a successful rename: renumber is a one-shot batch — once applied the
  // live files already carry the SxxEyy tokens, so leaving the season picks in
  // place would re-propose renaming them (each pass growing the token). Eject
  // the picks (from/to → 0) so no block matches until the user sets a fresh
  // range, but keep the scaffolding so the file picker still labels files.
  useEffect(() => {
    if (!actions.runMutation.isSuccess) return;
    if (mode !== 'renumber') return;
    const applied = actions.report?.applied ?? [];
    if (applied.length === 0) return;
    setRenumberOpts((prev) => ({
      ...prev,
      seasons: prev.seasons.map((b) => ({ ...b, fromAbs: 0, toAbs: 0 })),
    }));
  }, [actions.runMutation.isSuccess, actions.report, mode]);

  // Clear the progress indicator once a run settles.
  useEffect(() => {
    if (!actions.runMutation.isPending && !actions.undoMutation.isPending) {
      setProgress(null);
    }
  }, [actions.runMutation.isPending, actions.undoMutation.isPending]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // ── Derived previews ────────────────────────────────────────────────────
  const matchOps = useMemo(
    () => buildRenamePlan(rows.filter((r) => r.sub).map((r) => ({ video: r.video, sub: r.sub! }))),
    [rows],
  );
  const srResult = useMemo(() => evaluateSearchReplace(allFiles, srOpts), [allFiles, srOpts]);
  const renumberResult = useMemo(() => evaluateRenumber(allFiles, renumberOpts), [allFiles, renumberOpts]);
  const ops: RenameOp[] = mode === 'renumber' ? renumberResult.ops : mode === 'searchReplace' ? srResult.ops : matchOps;

  const unmatchedSubs = useMemo(() => {
    const used = new Set(rows.filter((r) => r.sub).map((r) => r.sub!.id));
    return subs.filter((s) => !used.has(s.id));
  }, [rows, subs]);

  // De-duped + capped candidate list for auto-detect. detectBestPattern is
  // O(n^2) in candidates, so a big saved-presets list must not flow in raw.
  const candidates = useMemo(() => candidatePatterns(presets), [presets]);

  // ── Auto-match: recompute rows whenever the pattern/shift inputs change ─
  // The single replacement for the imperative `recompute(...)` calls that used
  // to be scattered through pattern edit / auto-detect / re-match handlers.
  // `mergeLocked` preserves manual 🔒 overrides across the rebuild. Runs only
  // when we actually have videos to match.
  useEffect(() => {
    if (videos.length === 0) return;
    const freshByVideo = new Map(
      buildPairs(videos, subs, videoPattern, subPattern, shift).pairs.map((p) => [p.video.id, p.sub]),
    );
    setRows((prev) => mergeLocked(prev, videos, subs, freshByVideo));
    // videos/subs/videoPattern/subPattern/shift are the only true inputs; rows
    // is intentionally excluded (it's both read for locks and written).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, subs, videoPattern, subPattern, shift]);

  // ── Manual row mutations ────────────────────────────────────────────────
  const reassign = useCallback((videoId: string, sub: MediaFile | null) => {
    setRows((prev) => applyReassign(prev, videoId, sub));
  }, []);

  const onAutoAssignAll = useCallback(() => {
    const fresh = buildPairs(videos, subs, videoPattern, subPattern, shift).pairs;
    setRows((prev) => fillEmpty(prev, fresh));
  }, [videos, subs, videoPattern, subPattern, shift]);

  const onUnassignAll = useCallback(() => setRows(unassignAll), []);

  const onToggleLock = useCallback((videoId: string) => {
    setRows((prev) => prev.map((r) => (r.video.id === videoId ? { ...r, locked: !r.locked } : r)));
  }, []);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    const toVideoId = (e.over?.data.current as { videoId?: string } | undefined)?.videoId;
    const dragged = (e.active.data.current as { sub?: MediaFile } | undefined)?.sub;
    if (!toVideoId || !dragged) return;
    reassign(toVideoId, dragged);
  }, [reassign]);

  const onRun = useCallback(() => actions.run(ops, onConflict), [actions, ops, onConflict]);

  const handleSrChange = useCallback((next: SearchReplaceOpts) => {
    srTouchedRef.current = true;
    setSrOpts(next);
  }, []);

  const handleRenumberChange = useCallback((next: RenumberOpts) => {
    rnTouchedRef.current = true;
    setRenumberOpts(next);
  }, []);

  // ── Open a folder: classify is handled by the query; we set up patterns ─
  const onFolder = useCallback((dir: string) => {
    setFolder(dir);
    // The query will fetch + classify; once it lands, the auto-match effect
    // rebuilds rows. But joint auto-detect needs the classified vids/subz, so
    // we read them from the just-resolved listing via the queryClient.
    // Simpler: kick a direct classify-free detect after the listing resolves.
    // We do that in a separate effect keyed on a "just opened" ref below.
    actions.reset();
    setRenumberOpts((prev) => ({ ...prev, seasons: [] })); // re-seed when files land
    folderOpenRef.current = dir; // signal the detect effect
  }, [actions]);

  const folderOpenRef = useRef<string | null>(null);

  // Joint auto-detect on folder open: the best pattern per side can live in a
  // different index space and combine to zero pairs, so we pick the (video, sub)
  // pair that yields the most pairs rather than optimizing each side alone.
  // Runs once per folder open, after the listing for that folder resolves.
  useEffect(() => {
    const opened = folderOpenRef.current;
    if (!opened || listing.data?.vids == null) return;
    folderOpenRef.current = null;
    const { vids, subz, all } = listing.data;
    const detected = detectBestPattern(vids, subz, candidates);
    setVideoPattern(detected.videoPattern);
    setSubPattern(detected.subPattern);
    setLinked(detected.videoPattern === detected.subPattern);
    setRenumberOpts((prev) => ({ ...prev, seasons: seedSeasons(all, prev.pattern) }));
    // The auto-match effect will rebuild rows from these patterns.
  }, [listing.data, candidates]);

  // ── Launch folder from CLI (`easyrename.exe <folder>`) ──────────────────
  // Read once on mount. The query is single-shot; outside Tauri it's null.
  const launchQuery = useQuery({
    queryKey: ['launchFolder'],
    queryFn: getLaunchFolder,
    staleTime: Infinity,
    gcTime: Infinity,
    // No-op outside the Tauri runtime (vite dev browser preview).
    enabled: typeof window !== 'undefined' &&
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  });
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    const dir = launchQuery.data;
    if (!dir) return;
    didInitRef.current = true;
    onFolder(dir);
  }, [launchQuery.data, onFolder]);

  // ── Pattern editing (linked → copies video→sub) ─────────────────────────
  const onAutoDetect = useCallback(() => {
    const best = detectBestPattern(videos, subs, candidates);
    setVideoPattern(best.videoPattern);
    setSubPattern(best.subPattern);
    setLinked(best.videoPattern === best.subPattern);
  }, [videos, subs, candidates]);

  const changeVideoPattern = useCallback((p: string) => {
    setVideoPattern(p);
    if (linked) setSubPattern(p);
  }, [linked]);
  const changeSubPattern = useCallback((p: string) => {
    if (linked) return;
    setSubPattern(p);
  }, [linked]);
  const toggleLinked = useCallback(() => {
    setLinked((l) => {
      if (l) return false;          // unlink: just unlock independent editing
      setSubPattern(videoPattern); // link ON: copy video → sub
      return true;
    });
  }, [videoPattern]);

  const savePreset = useCallback((label: string) => presetMut.save(label, videoPattern), [presetMut, videoPattern]);

  // ── Render ──────────────────────────────────────────────────────────────
  const apiError = actions.error?.message ?? presetMut.error?.message ?? null;

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

  const regexEl = (
    <PatternPanel
      videoPattern={videoPattern} subPattern={subPattern} linked={linked}
      onVideoPattern={changeVideoPattern} onSubPattern={changeSubPattern}
      onToggleLinked={toggleLinked} shift={shift} setShift={setShift}
      presets={presets} onSavePreset={savePreset} onDeletePreset={presetMut.remove}
      onResetPresets={presetMut.reset}
      previewFiles={videos.slice(0, 5)}
      onAutoDetect={onAutoDetect}
    />
  );

  const renamePanelProps = {
    ops, folder, onConflict, setOnConflict,
    onRun, onUndo: actions.undo, busy: actions.busy, canUndo: actions.lastApplied !== null,
    report: actions.report, apiError, progress,
  };

  // All three modes stay mounted; <Activity mode="hidden"> takes the inactive
  // ones off-screen (display:none) while preserving their DOM + component state
  // (SubPicker open state, scroll position, DnD registrations) so switching
  // modes no longer resets the panel the user just left. Effects in hidden
  // panels are torn down, so a hidden mode does no background work.
  return (
    <>
      <Activity mode={mode === 'match' ? 'visible' : 'hidden'}>
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
              <RenamePanel {...renamePanelProps} totalVideos={rows.length} />
              {regexEl}
              <StrayList subs={unmatchedSubs} folder={folder} />
            </aside>
          </DndContext>
        </div>
      </Activity>

      <Activity mode={mode === 'searchReplace' ? 'visible' : 'hidden'}>
        <div className="app layout-sr">
          <Topbar onFolder={onFolder} folder={folder} mode={mode} onModeChange={setMode} />
          <aside className="left-panel">
            <SearchReplacePanel opts={srOpts} onChange={handleSrChange} summary={srResult} />
            <RenamePanel {...renamePanelProps} totalVideos={allFiles.length} conflicts={srResult.conflicts} />
          </aside>
          <main className="work">
            <SearchReplaceList rows={srResult.rows} />
          </main>
        </div>
      </Activity>

      <Activity mode={mode === 'renumber' ? 'visible' : 'hidden'}>
        <div className="app layout-sr">
          <Topbar onFolder={onFolder} folder={folder} mode={mode} onModeChange={setMode} />
          <aside className="left-panel">
            <RenumberPanel opts={renumberOpts} files={allFiles} onChange={handleRenumberChange} summary={renumberResult} />
            <RenamePanel {...renamePanelProps} totalVideos={allFiles.length} conflicts={renumberResult.conflicts} />
          </aside>
          <main className="work">
            <RenumberList rows={renumberResult.rows} />
          </main>
        </div>
      </Activity>
    </>
  );
}
