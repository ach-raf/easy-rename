import { describe, it, expect } from 'vitest';
import { extractIndex, buildPairs, detectBestPattern, MediaFile } from '../match';

const v = (name: string): MediaFile => ({ id: name, name, path: 'C:/d/' + name, ext: name.split('.').pop()!.toLowerCase(), kind: 'video' });
const s = (name: string): MediaFile => ({ id: name, name, path: 'C:/d/' + name, ext: name.split('.').pop()!.toLowerCase(), kind: 'subtitle' });

describe('extractIndex', () => {
  it('uses first capture group', () => {
    expect(extractIndex('ep01.srt', '(\\d+)')).toBe(1);
    expect(extractIndex('ep1.mkv', '(\\d+)')).toBe(1);
  });
  it('targets episode in SxxExx', () => {
    expect(extractIndex('Show.S01E02.mkv', 'S\\d+E(\\d+)')).toBe(2);
  });
  it('returns null when no match', () => {
    expect(extractIndex('trailer.srt', 'E(\\d+)')).toBeNull();
  });
  it('returns null for invalid regex', () => {
    expect(extractIndex('ep01.srt', '(')).toBeNull();
  });
});

describe('buildPairs', () => {
  const videos = [v('ep1.mkv'), v('ep2.mkv'), v('ep3.mkv')];
  const subs = [s('ep01.srt'), s('ep02.srt'), s('ep03.ass')];

  it('pairs by index', () => {
    const r = buildPairs(videos, subs, '(\\d+)');
    expect(r.pairs).toHaveLength(3);
    expect(r.pairs[0].video.name).toBe('ep1.mkv');
    expect(r.pairs[0].sub.name).toBe('ep01.srt');
    expect(r.unmatchedVideos).toHaveLength(0);
    expect(r.unmatchedSubs).toHaveLength(0);
  });

  it('shift fixes off-by-one', () => {
    const shiftedSubs = [s('ep02.srt'), s('ep03.srt'), s('ep04.srt')]; // subs are +1
    const r = buildPairs(videos, shiftedSubs, '(\\d+)', -1);
    expect(r.pairs).toHaveLength(3);
    expect(r.pairs[0].sub.name).toBe('ep02.srt'); // ep1.mkv <- ep02.srt after shift
  });

  it('reports unmatched', () => {
    const r = buildPairs(videos, [s('ep01.srt')], '(\\d+)');
    expect(r.pairs).toHaveLength(1);
    expect(r.unmatchedVideos).toHaveLength(2);
    expect(r.unmatchedSubs).toHaveLength(0);
  });
});

describe('detectBestPattern', () => {
  it('prefers a pattern that yields unique pairs over one that collides on a year', () => {
    // Mirrors real anime/show naming: `(\d+)` grabs the year 2004 -> all collide.
    const videos = [v('Major (2004) - S01E01 - 027 - He Returns.mkv'), v('Major (2004) - S01E02 - 028 - Two.mkv')];
    const subs = [s('Major (2004) - S01E01 - 027 - He Returns.ass'), s('Major (2004) - S01E02 - 028 - Two.ass')];
    const best = detectBestPattern(videos, subs, ['(\\d+)', 'S\\d+E(\\d+)', '-\\s*(\\d+)\\s*-']);
    // (\\d+) -> 1 pair (all index 2004); S##E## and dashes -> 2 pairs; tie keeps earliest = S##E##
    expect(best).toBe('S\\d+E(\\d+)');
    expect(buildPairs(videos, subs, best).pairs).toHaveLength(2);
  });

  it('falls back to the first candidate when none match better', () => {
    const videos = [v('trailer.mkv')];
    const subs = [s('trailer.srt')];
    const best = detectBestPattern(videos, subs, ['(\\d+)', 'E(\\d+)']);
    expect(best).toBe('(\\d+)');
  });

  it('returns a default when given no candidates', () => {
    expect(detectBestPattern([v('a.mkv')], [s('a.srt')], [])).toBe('(\\d+)');
  });
});
