/**
 * Rename + undo as TanStack mutations.
 *
 * Replaces the two near-identical `try/catch/finally` blocks + hand-rolled
 * `busy` boolean + manual `reloadFiles()` in App.tsx. Each mutation:
 *  - is inherently re-entrancy-safe (`isPending` gate), so the `if (busy) return`
 *    guard disappears;
 *  - streams per-file progress from the Rust command via a `Channel<ProgressEvent>`
 *    (the `onProgress` callback), so the UI can render a live bar on big batches;
 *  - invalidates the folder listing in `onSettled`, refetching declaratively;
 *  - surfaces its own typed `error` (a `TauriError`), replacing the global
 *    `String(e)` error sink.
 *
 * `report` / `lastApplied` are lifted out of React state and into mutation
 * results: the last successful run's `RenameReport` is `runMutation.data`, and
 * `lastApplied` (the ops needed to undo) is held in a small piece of state
 * updated on success.
 */
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import {
  renamePairs,
  undoRenames,
  type ProgressEvent,
  type RenameOp,
  type RenameReport,
} from '../api';
import { folderListingKey } from './useFolderListing';

interface UseRenameActionsArgs {
  folder: string | null;
  onProgress?: (e: ProgressEvent) => void;
}

export interface UseRenameActionsResult {
  /** The most recent run's report (rename or undo), or null before any run. */
  report: RenameReport | null;
  /** The ops applied by the last successful rename — the input needed to undo. */
  lastApplied: RenameOp[] | null;
  /** True while either a rename or an undo is in flight. */
  busy: boolean;
  /** The first available error from either mutation (null if neither errored). */
  error: Error | null;
  runMutation: UseMutationResult<RenameReport, Error, { ops: RenameOp[]; onConflict: 'skip' | 'overwrite' }>;
  undoMutation: UseMutationResult<RenameReport, Error, RenameOp[]>;
  run: (ops: RenameOp[], onConflict: 'skip' | 'overwrite') => void;
  undo: () => void;
  /** Clear report/error after the user dismisses them. */
  reset: () => void;
}

export function useRenameActions({ folder, onProgress }: UseRenameActionsArgs): UseRenameActionsResult {
  const qc = useQueryClient();
  const [report, setReport] = useState<RenameReport | null>(null);
  const [lastApplied, setLastApplied] = useState<RenameOp[] | null>(null);

  // Invalidate the current folder's listing so every preview refetches the live
  // filesystem. Keyed on `folder`; a no-op when no folder is open.
  const invalidateFolder = useCallback(() => {
    if (folder) qc.invalidateQueries({ queryKey: folderListingKey(folder) });
  }, [qc, folder]);

  const runMutation = useMutation({
    mutationFn: ({ ops, onConflict }: { ops: RenameOp[]; onConflict: 'skip' | 'overwrite' }) =>
      renamePairs(ops, onConflict, onProgress),
    onSuccess: (r) => {
      setReport(r);
      setLastApplied(r.applied);
    },
    // Invalidate in onSettled (runs on both success and error) so the listing
    // always resyncs with the filesystem — on success to show the new names,
    // on error to recover truth if a partial batch landed before the failure.
    onSettled: () => void invalidateFolder(),
  });

  const undoMutation = useMutation({
    mutationFn: (ops: RenameOp[]) => undoRenames(ops),
    onSuccess: (r) => {
      setReport(r);
      setLastApplied(null);
    },
    onSettled: () => void invalidateFolder(),
  });

  const run = useCallback(
    (ops: RenameOp[], onConflict: 'skip' | 'overwrite') =>
      runMutation.mutate({ ops, onConflict }),
    [runMutation],
  );
  const undo = useCallback(() => {
    if (lastApplied) undoMutation.mutate(lastApplied);
  }, [undoMutation, lastApplied]);

  const reset = useCallback(() => {
    setReport(null);
    runMutation.reset();
    undoMutation.reset();
  }, [runMutation, undoMutation]);

  return {
    report,
    lastApplied,
    busy: runMutation.isPending || undoMutation.isPending,
    error: runMutation.error ?? undoMutation.error,
    runMutation,
    undoMutation,
    run,
    undo,
    reset,
  };
}
