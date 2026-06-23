import type { RenameOp } from '../api';
import { stemOf, extOf } from './classify';
import { dirname, joinPath } from './renamePlan';

export type ApplyTo = 'both' | 'name' | 'ext';

export interface SearchReplaceOpts {
  search: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  applyTo: ApplyTo;
}

export type MatcherResult =
  | { kind: 'ok'; apply: (input: string) => string }
  | { kind: 'error'; message: string };

export interface PreviewRow {
  path: string;
  original: string;
  renamed: string | null;
  state: 'matched' | 'unmatched' | 'conflict';
}

export interface SearchReplaceResult {
  rows: PreviewRow[];
  ops: RenameOp[];
  matched: number;
  unmatched: number;
  conflicts: number;
  dropped: number;
  error?: string;
}

/** Escape regex-special characters so a literal search can reuse the RegExp path. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Compile the search/replace into a single global matcher. Always global —
 *  there is no "first match only" mode. Invalid regex → error result. */
export function compileMatcher(opts: SearchReplaceOpts): MatcherResult {
  if (opts.search === '') return { kind: 'error', message: 'Search is empty' };
  const flags = 'g' + (opts.caseSensitive ? '' : 'i');
  const source = opts.useRegex ? opts.search : escapeRegex(opts.search);
  try {
    const re = new RegExp(source, flags);
    return { kind: 'ok', apply: (input: string) => input.replace(re, opts.replace) };
  } catch (e) {
    return { kind: 'error', message: `Invalid regex: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Windows-reserved filename characters. (Plain array + charCodeAt avoids any
// regex-escape pitfalls; spaces and hyphens are NOT here — real names like
// `S4 - 01.mkv` must pass validation.)
const ILLEGAL_CHARS = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

// Windows reserved device-name stems (case-insensitive). e.g. CON, PRN, AUX,
// NUL, COM1-9, LPT1-9 — bare or with any extension (CON.txt, com1.mkv).
const DEVICE_NAMES = new Set(['CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']);

/** A rename target must be a real, non-reserved, legal Windows filename. */
export function isValidFileName(name: string): boolean {
  if (!name || name.trim() === '') return false;
  if (name === '.' || name === '..') return false;
  if (ILLEGAL_CHARS.some((c) => name.includes(c))) return false;
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) < 0x20) return false; // block control chars (NUL, newline, etc.)
  }
  if (/[.\s]$/.test(name)) return false;                              // trailing dot or space
  if (DEVICE_NAMES.has(stemOf(name).toUpperCase())) return false;     // e.g. CON.txt, PRN, com1.mkv
  return true;
}

/** Apply the matcher to the chosen scope and reassemble the full filename. */
function applyScoped(fileName: string, opts: SearchReplaceOpts, apply: (s: string) => string): string {
  const ext = extOf(fileName);
  const stem = stemOf(fileName);
  if (opts.applyTo === 'name') return apply(stem) + (ext ? '.' + ext : '');
  if (opts.applyTo === 'ext') return ext ? stem + '.' + apply(ext) : fileName;
  return apply(fileName);
}

/** One pass: preview rows + rename ops + counts. Source of truth for both the
 *  preview list (`.rows`) and the rename engine (`.ops`). */
export function evaluateSearchReplace(files: { name: string; path: string }[], opts: SearchReplaceOpts): SearchReplaceResult {
  const matcher = compileMatcher(opts);
  if (matcher.kind === 'error') {
    return {
      rows: files.map((f) => ({ path: f.path, original: f.name, renamed: null, state: 'unmatched' as const })),
      ops: [], matched: 0, unmatched: files.length, conflicts: 0, dropped: 0, error: matcher.message,
    };
  }
  const apply = matcher.apply;
  const rows: PreviewRow[] = [];
  const ops: RenameOp[] = [];
  let matched = 0, unmatched = 0, dropped = 0;

  for (const f of files) {
    const next = applyScoped(f.name, opts, apply);
    if (next === f.name) {
      rows.push({ path: f.path, original: f.name, renamed: null, state: 'unmatched' });
      unmatched++;
      continue;
    }
    if (!isValidFileName(next)) {
      rows.push({ path: f.path, original: f.name, renamed: null, state: 'unmatched' });
      unmatched++;
      dropped++;
      continue;
    }
    rows.push({ path: f.path, original: f.name, renamed: next, state: 'matched' });
    ops.push({ src: f.path, dest: joinPath(dirname(f.path), next) });
    matched++;
  }

  // Conflict detection: multiple ops targeting the same dest path.
  const byDest = new Map<string, number>();
  for (const op of ops) byDest.set(op.dest, (byDest.get(op.dest) ?? 0) + 1);
  const conflictDests = new Set<string>();
  for (const [dest, n] of byDest) if (n > 1) conflictDests.add(dest);
  if (conflictDests.size > 0) {
    for (const r of rows) {
      if (r.renamed && conflictDests.has(joinPath(dirname(r.path), r.renamed))) r.state = 'conflict';
    }
  }
  const conflicts = conflictDests.size;

  return { rows, ops, matched, unmatched, conflicts, dropped };
}
