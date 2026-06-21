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
