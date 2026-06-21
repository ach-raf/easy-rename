import { describe, it, expect } from 'vitest';
import { buildRenamePlan, dirname, joinPath } from '../renamePlan';
import { Pair } from '../match';

const pair = (videoName: string, subName: string): Pair => ({
  video: { id: videoName, name: videoName, path: 'C:/shows/' + videoName, ext: 'mkv', kind: 'video' },
  sub: { id: subName, name: subName, path: 'C:/shows/' + subName, ext: subName.split('.').pop()!, kind: 'subtitle' },
});

describe('dirname / joinPath', () => {
  it('handles forward and back slashes', () => {
    expect(dirname('C:/shows/ep1.mkv')).toBe('C:/shows');
    expect(dirname('C:\\shows\\ep1.mkv')).toBe('C:/shows');
  });
  it('joins without double slash', () => {
    expect(joinPath('C:/shows', 'ep1.srt')).toBe('C:/shows/ep1.srt');
  });
});

describe('buildRenamePlan', () => {
  it('sub takes video basename + sub extension, in video dir', () => {
    const ops = buildRenamePlan([pair('Show.S01E01.mkv', 'ep01.srt')]);
    expect(ops).toEqual([{ src: 'C:/shows/ep01.srt', dest: 'C:/shows/Show.S01E01.srt' }]);
  });
  it('keeps .ass extension', () => {
    const ops = buildRenamePlan([pair('Show.S01E02.mkv', 'ep02.ass')]);
    expect(ops[0].dest).toBe('C:/shows/Show.S01E02.ass');
  });
});
