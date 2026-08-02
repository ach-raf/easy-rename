import { invoke, Channel } from '@tauri-apps/api/core';

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface RenameOp { src: string; dest: string; }

export interface Preset { label: string; pattern: string; }
export interface RenameReport {
  applied: RenameOp[];
  skipped: RenameOp[];
  errors: string[];
}

/** Per-file progress streamed from the `rename_pairs` Rust command via a
 *  `Channel<ProgressEvent>`. `done/total` drives a progress bar; `current` is
 *  the source path just handled (handy for a live status line). */
export interface ProgressEvent {
  done: number;
  total: number;
  current: string;
}

/**
 * Typed wrapper around `invoke`. Rust commands reject with whatever the command
 * returned from `Err(...)` — commonly a `String`, but not guaranteed. This
 * normalizes every rejection to a real `Error` subclass so callers (and
 * TanStack Query's `error` field) get a consistent `.message` instead of having
 * to hand-write `String(e)` at each catch site.
 */
export class TauriError extends Error {
  constructor(public readonly raw: unknown) {
    super(typeof raw === 'string' ? raw : JSON.stringify(raw));
    this.name = 'TauriError';
  }
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new TauriError(e);
  }
}

export const listFiles = (dir: string, recursive = true) =>
  tauriInvoke<FileEntry[]>('list_files', { dir, recursive });

/** Folder passed on the command line at launch (`easyrename.exe <folder>`), or null. */
export const getLaunchFolder = () => tauriInvoke<string | null>('get_launch_folder');

/**
 * Run a batch of renames. `onProgress`, when given, is wired to a Tauri IPC
 * `Channel` so the Rust side can stream `ProgressEvent`s back per file — the
 * UI can render a live bar without polling. Omit it for fire-and-forget calls.
 */
export function renamePairs(
  ops: RenameOp[],
  onConflict: 'skip' | 'overwrite',
  onProgress?: (e: ProgressEvent) => void,
): Promise<RenameReport> {
  const args: Record<string, unknown> = { ops, onConflict };
  if (onProgress) {
    const ch = new Channel<ProgressEvent>();
    ch.onmessage = onProgress;
    args.onProgress = ch;
  }
  return tauriInvoke<RenameReport>('rename_pairs', args);
}

export const undoRenames = (ops: RenameOp[]) =>
  tauriInvoke<RenameReport>('undo', { ops });

export type RenameMode = 'match' | 'searchReplace' | 'renumber';

/**
 * The persisted last-used Search & Replace inputs + active mode. Stored via
 * the store plugin (`easy-rename.json`) under the `last-rename` key; this is
 * the TS shape mirrored from the SearchReplaceOpts. (No longer a Rust command
 * — see `src/lib/store.ts`.)
 */
export interface LastRenameState {
  mode: RenameMode;
  search: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  applyTo: 'both' | 'name' | 'ext';
}

/**
 * The persisted last-used Renumber inputs. Stored via the store plugin under
 * the `last-renumber` key. Only the pattern + zero-pad width are persisted —
 * season blocks are tied to a specific folder's file numbers and stay
 * session-only (re-seeded per folder open), so restoring them across launches
 * could silently match different files.
 */
export interface LastRenumberState {
  pattern: string;
  pad: number;
}
