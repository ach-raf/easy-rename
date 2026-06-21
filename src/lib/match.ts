export type FileKind = 'video' | 'subtitle' | 'other';

export interface MediaFile {
  id: string;
  name: string;
  path: string;
  ext: string;
  kind: FileKind;
}

export interface Pair {
  video: MediaFile;
  sub: MediaFile;
}

/** One row per video in the UI. `sub` is null until a subtitle is assigned. */
export interface Row {
  video: MediaFile;
  sub: MediaFile | null;
}

export interface MatchResult {
  pairs: Pair[];
  unmatchedVideos: MediaFile[];
  unmatchedSubs: MediaFile[];
}

export function extractIndex(fileName: string, pattern: string, group = 1): number | null {
  if (!pattern) return null;
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    return null;
  }
  const stem = fileName.lastIndexOf('.') > 0 ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
  const m = re.exec(stem);
  if (!m) return null;
  const token = m.length > 1 ? m[group] : m[0];
  if (token === undefined) return null;
  const digits = String(token).match(/\d+/);
  if (!digits) return null;
  const n = parseInt(digits[0], 10);
  return Number.isNaN(n) ? null : n;
}

export function buildPairs(
  videos: MediaFile[],
  subs: MediaFile[],
  pattern: string,
  shift = 0,
): MatchResult {
  const videoByIdx = new Map<number, MediaFile>();
  for (const vid of videos) {
    const idx = extractIndex(vid.name, pattern);
    if (idx !== null && !videoByIdx.has(idx)) videoByIdx.set(idx, vid);
  }

  const usedVideos = new Set<string>();
  const usedSubs = new Set<string>();
  const pairs: Pair[] = [];

  for (const sub of subs) {
    const raw = extractIndex(sub.name, pattern);
    if (raw === null) continue;
    const target = raw + shift;
    const vid = videoByIdx.get(target);
    if (vid && !usedVideos.has(vid.id)) {
      pairs.push({ video: vid, sub });
      usedVideos.add(vid.id);
      usedSubs.add(sub.id);
    }
  }

  pairs.sort(
    (a, b) =>
      (extractIndex(a.video.name, pattern) ?? 0) - (extractIndex(b.video.name, pattern) ?? 0),
  );

  return {
    pairs,
    unmatchedVideos: videos.filter((vid) => !usedVideos.has(vid.id)),
    unmatchedSubs: subs.filter((sub) => !usedSubs.has(sub.id)),
  };
}

/** Preset patterns offered in the UI; also the candidates used by auto-detect.
 *  Each must have exactly one capturing group denoting the episode index. */
export const REGEX_PRESETS: { label: string; pattern: string }[] = [
  { label: 'Any number', pattern: '(\\d+)' },
  { label: 'S##E##', pattern: 'S\\d+E(\\d+)' },
  { label: 'After E', pattern: 'E(\\d+)' },
  { label: '# in - dashes -', pattern: '-\\s*(\\d+)\\s*-' },
  { label: 'After - ', pattern: '-\\s*(\\d+)' },
];

/**
 * Pick the candidate pattern that produces the most matched pairs for the given
 * files. Solves the common failure where `(\d+)` grabs a year/resolution and
 * every file collides — for `Show (2004) - S01E01`, `S\d+E(\d+)` wins because it
 * yields N unique pairs vs 1 for `(\d+)`. Ties keep the earliest candidate.
 */
export function detectBestPattern(
  videos: MediaFile[],
  subs: MediaFile[],
  candidates: string[],
): string {
  if (candidates.length === 0) return '(\\d+)';
  let best = candidates[0];
  let bestScore = -1;
  for (const c of candidates) {
    const score = buildPairs(videos, subs, c).pairs.length;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Link `sub` to the video `videoId` (or unlink when `sub` is null). If that
 * subtitle was already linked to another row, the two rows swap subtitles; if
 * the target row already had one, the displaced subtitle takes the dragged
 * subtitle's old slot (or returns to the unmatched pool when the dragged sub
 * came from outside the rows). Pure + tested — the UI (dropdown and drag) both
 * route through this so the behavior is identical either way.
 */
export function applyReassign(rows: Row[], videoId: string, sub: MediaFile | null): Row[] {
  if (!rows.some((r) => r.video.id === videoId)) return rows;
  const next = rows.map((r) => ({ ...r }));
  const target = next.find((r) => r.video.id === videoId)!;
  const displaced = target.sub;
  if (sub) {
    for (const r of next) if (r.sub?.id === sub.id) r.sub = displaced;
    target.sub = sub;
  } else {
    target.sub = null;
  }
  return next;
}
