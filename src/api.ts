import { invoke } from '@tauri-apps/api/core';

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

export const listFiles = (dir: string, recursive = true) =>
  invoke<FileEntry[]>('list_files', { dir, recursive });

/** Folder passed on the command line at launch (`easyrename.exe <folder>`), or null. */
export const getLaunchFolder = () => invoke<string | null>('get_launch_folder');

export const renamePairs = (ops: RenameOp[], onConflict: 'skip' | 'overwrite') =>
  invoke<RenameReport>('rename_pairs', { ops, onConflict });

export const undoRenames = (ops: RenameOp[]) =>
  invoke<RenameReport>('undo', { ops });

export const loadPresets = () => invoke<Preset[]>('load_presets');

export const savePresets = (presets: Preset[]) =>
  invoke<void>('save_presets', { presets });

export type RenameMode = 'match' | 'searchReplace';

/** Flat camelCase mirror of the Rust `LastRename` struct. */
export interface LastRenameState {
  mode: RenameMode;
  search: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  applyTo: 'both' | 'name' | 'ext';
}

export const loadLastRename = () => invoke<LastRenameState | null>('load_last_rename');

export const saveLastRename = (state: LastRenameState) =>
  invoke<void>('save_last_rename', { state });
