import type { RenameOp } from '../api';
import { extOf, stemOf } from './classify';
import { extractIndex } from './match';
import { dirname, joinPath } from './renamePlan';
import { isValidFileName } from './searchReplace';

export interface SeasonBlock {
  season: number;
  fromAbs: number;   // inclusive lower bound; 0 = unset
  toAbs: number;     // inclusive upper bound; 0 = unset
  startEp: number;   // episode number that fromAbs maps to
}

export interface RenumberOpts {
  pattern: string;
  seasons: SeasonBlock[];
  pad: number;
}

export type RenumberReason = 'no-number' | 'out-of-range' | 'invalid' | 'no-change';

export interface RenumberRow {
  path: string;
  original: string;
  renamed: string | null;
  abs: number | null;
  state: 'matched' | 'unmatched' | 'conflict';
  reason?: RenumberReason;
}

export interface RenumberResult {
  rows: RenumberRow[];
  ops: RenameOp[];
  matched: number;
  unmatched: number;
  conflicts: number;
  dropped: number;
  error?: string;
}

/** Zero-pad to the given width (clamped ≥ 1). */
function padNum(n: number, width: number): string {
  return String(n).padStart(Math.max(1, width), '0');
}

/** First block whose [fromAbs..toAbs] contains `abs`. A 0 sentinel or inverted
 *  range is treated as empty. First match (array order) wins on overlap. */
function blockFor(abs: number, seasons: SeasonBlock[]): SeasonBlock | undefined {
  return seasons.find(
    (s) => s.fromAbs > 0 && s.toAbs >= s.fromAbs && abs >= s.fromAbs && abs <= s.toAbs,
  );
}

export function evaluateRenumber(
  files: { name: string; path: string }[],
  opts: RenumberOpts,
): RenumberResult {
  if (opts.pattern === '') {
    return {
      rows: files.map((f) => ({ path: f.path, original: f.name, renamed: null, abs: null, state: 'unmatched' as const, reason: 'no-number' as const })),
      ops: [], matched: 0, unmatched: files.length, conflicts: 0, dropped: 0, error: 'Search is empty',
    };
  }
  let re: RegExp;
  try {
    re = new RegExp(opts.pattern, 'i');
  } catch (e) {
    const msg = `Invalid regex: ${e instanceof Error ? e.message : String(e)}`;
    return {
      rows: files.map((f) => ({ path: f.path, original: f.name, renamed: null, abs: null, state: 'unmatched' as const, reason: 'no-number' as const })),
      ops: [], matched: 0, unmatched: files.length, conflicts: 0, dropped: 0, error: msg,
    };
  }

  const rows: RenumberRow[] = [];
  const ops: RenameOp[] = [];
  let matched = 0, unmatched = 0, dropped = 0;

  for (const f of files) {
    const abs = extractIndex(f.name, opts.pattern);
    if (abs === null) {
      rows.push({ path: f.path, original: f.name, renamed: null, abs: null, state: 'unmatched', reason: 'no-number' });
      unmatched++;
      continue;
    }
    const blk = blockFor(abs, opts.seasons);
    if (!blk) {
      rows.push({ path: f.path, original: f.name, renamed: null, abs, state: 'unmatched', reason: 'out-of-range' });
      unmatched++;
      continue;
    }
    const ep = blk.startEp + (abs - blk.fromAbs);
    const token = `S${padNum(blk.season, opts.pad)}E${padNum(ep, opts.pad)}`;
    const stem = stemOf(f.name);
    const ext = extOf(f.name);
    const next = stem.replace(re, () => token) + (ext ? '.' + ext : '');
    if (next === f.name) {
      // Defensive guard: unreachable on valid input (SxxEyy token cannot equal original)
      rows.push({ path: f.path, original: f.name, renamed: null, abs, state: 'unmatched', reason: 'no-change' });
      unmatched++;
      continue;
    }
    if (!isValidFileName(next)) {
      // Defensive guard: unreachable on valid input (SxxEyy token always legal)
      rows.push({ path: f.path, original: f.name, renamed: null, abs, state: 'unmatched', reason: 'invalid' });
      unmatched++; dropped++;
      continue;
    }
    rows.push({ path: f.path, original: f.name, renamed: next, abs, state: 'matched' });
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

  return { rows, ops, matched, unmatched, conflicts: conflictDests.size, dropped };
}

/** One starting block spanning the detected min..max absolute (season 1, startEp 1),
 *  or a single empty block to fill in. Called on folder open. */
export function seedSeasons(files: { name: string; path: string }[], pattern: string): SeasonBlock[] {
  const abs = files
    .map((f) => extractIndex(f.name, pattern))
    .filter((n): n is number => n !== null);
  if (abs.length >= 2) {
    return [{ season: 1, fromAbs: Math.min(...abs), toAbs: Math.max(...abs), startEp: 1 }];
  }
  return [{ season: 1, fromAbs: 0, toAbs: 0, startEp: 1 }];
}
