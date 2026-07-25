import { describe, it, expect } from 'vitest';
import { evaluateRenumber, seedSeasons, type RenumberOpts, type SeasonBlock } from '../renumber';

const files = (names: string[]) => names.map((n) => ({ name: n, path: `/root/${n}` }));
const block = (b: Partial<SeasonBlock> = {}): SeasonBlock =>
  ({ season: 1, fromAbs: 1, toAbs: 13, startEp: 1, ...b });
const opts = (patch: Partial<RenumberOpts> = {}): RenumberOpts =>
  ({ pattern: '(\\d{3})', seasons: [block({ season: 3, fromAbs: 91, toAbs: 131, startEp: 8 })], pad: 2, ...patch });

describe('evaluateRenumber', () => {
  it('shifts the absolute number and preserves prefix + suffix + ext', () => {
    const r = evaluateRenumber(files(['Naruto.091.1080p.BD.x264.mkv']), opts());
    expect(r.matched).toBe(1);
    expect(r.rows[0].renamed).toBe('Naruto.S03E08.1080p.BD.x264.mkv');
    expect(r.rows[0].abs).toBe(91);
    expect(r.ops[0]).toEqual({ src: '/root/Naruto.091.1080p.BD.x264.mkv', dest: '/root/Naruto.S03E08.1080p.BD.x264.mkv' });
  });

  it('routes each file to its season across multiple blocks in one pass', () => {
    const r = evaluateRenumber(
      files(['Naruto.001.mkv', 'Naruto.013.mkv', 'Naruto.091.mkv', 'Naruto.131.mkv']),
      opts({ seasons: [
        block({ season: 1, fromAbs: 1, toAbs: 13, startEp: 1 }),
        block({ season: 3, fromAbs: 91, toAbs: 131, startEp: 8 }),
      ] }),
    );
    expect(r.matched).toBe(4);
    expect(r.rows.map((x) => x.renamed)).toEqual([
      'Naruto.S01E01.mkv', 'Naruto.S01E13.mkv', 'Naruto.S03E08.mkv', 'Naruto.S03E48.mkv',
    ]);
  });

  it('leaves out-of-range files untouched (no op)', () => {
    const r = evaluateRenumber(files(['Naruto.014.mkv']), opts());
    expect(r.unmatched).toBe(1);
    expect(r.rows[0].reason).toBe('out-of-range');
    expect(r.rows[0].abs).toBe(14);
    expect(r.ops).toHaveLength(0);
  });

  it('reports no-number files as unmatched', () => {
    const r = evaluateRenumber(files(['thumbnails.jpg']), opts());
    expect(r.rows[0].reason).toBe('no-number');
    expect(r.rows[0].abs).toBeNull();
  });

  it('returns an error + all unmatched when the pattern is empty', () => {
    const r = evaluateRenumber(files(['Naruto.091.mkv']), opts({ pattern: '' }));
    expect(r.error).toBe('Search is empty');
    expect(r.matched).toBe(0);
    expect(r.unmatched).toBe(1);
  });

  it('returns an error + all unmatched on invalid regex', () => {
    const r = evaluateRenumber(files(['Naruto.091.mkv']), opts({ pattern: '(' }));
    expect(r.error).toMatch(/Invalid regex/);
    expect(r.ops).toHaveLength(0);
  });

  it('flags a conflict when two files collapse to the same dest', () => {
    // 'Show.005' and 'Show.05' both extract abs 5 → both rename to Show.S01E05.mkv.
    const r = evaluateRenumber(
      files(['Show.005.mkv', 'Show.05.mkv']),
      opts({ pattern: '(\\d+)', seasons: [block({ season: 1, fromAbs: 1, toAbs: 99, startEp: 1 })] }),
    );
    expect(r.matched).toBe(2);
    expect(r.conflicts).toBe(1);
    expect(r.rows.every((row) => row.state === 'conflict')).toBe(true);
    expect(r.ops).toHaveLength(2);
  });

  // NOTE: the `invalid` (dropped) and `no-change` branches in evaluateRenumber are
  // defensive guards per spec §9. On valid input the replace-token output (S..E..)
  // plus the preserved prefix/suffix cannot yield an illegal or unchanged name, so
  // they are not reachable by a non-contrived unit test. Keep them as guards and
  // document that with a one-line code comment in renumber.ts.

  it('honours a custom zero-pad width', () => {
    const r = evaluateRenumber(files(['Naruto.091.mkv']), opts({ pad: 3 }));
    expect(r.rows[0].renamed).toBe('Naruto.S003E008.mkv');
  });

  it('replaces only the first match when the number appears twice', () => {
    const r = evaluateRenumber(files(['Show.091.091.mkv']), opts());
    expect(r.rows[0].renamed).toBe('Show.S03E08.091.mkv');
  });

  it('consumes surrounding literals when the group is anchored (E(\\d+))', () => {
    const r = evaluateRenumber(files(['Show.E091.mkv']), opts({ pattern: 'E(\\d+)' }));
    expect(r.rows[0].renamed).toBe('Show.S03E08.mkv');
  });

  it('treats an unset (0) or inverted range as empty', () => {
    const r = evaluateRenumber(
      files(['Naruto.091.mkv']),
      opts({ seasons: [block({ season: 3, fromAbs: 0, toAbs: 131, startEp: 8 })] }),
    );
    expect(r.matched).toBe(0);
    expect(r.rows[0].reason).toBe('out-of-range');
  });
});

describe('seedSeasons', () => {
  it('spans min..max when ≥2 files have a number', () => {
    expect(seedSeasons(files(['Naruto.002.mkv', 'Naruto.013.mkv']), '(\\d+)'))
      .toEqual([{ season: 1, fromAbs: 2, toAbs: 13, startEp: 1 }]);
  });
  it('returns one empty block when fewer than 2 numbers', () => {
    expect(seedSeasons(files(['thumbs.jpg']), '(\\d+)'))
      .toEqual([{ season: 1, fromAbs: 0, toAbs: 0, startEp: 1 }]);
  });
});
