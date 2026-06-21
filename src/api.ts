import { invoke } from '@tauri-apps/api/core';

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface RenameOp { src: string; dest: string; }
export interface RenameReport {
  applied: RenameOp[];
  skipped: RenameOp[];
  errors: string[];
}

export const listFiles = (dir: string, recursive = true) =>
  invoke<FileEntry[]>('list_files', { dir, recursive });

export const renamePairs = (ops: RenameOp[], onConflict: 'skip' | 'overwrite') =>
  invoke<RenameReport>('rename_pairs', { ops, onConflict });

export const undoRenames = (ops: RenameOp[]) =>
  invoke<RenameReport>('undo', { ops });
