import { describe, it, expect } from 'vitest';
import { extractIndex, buildPairs, MediaFile } from '../match';

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
