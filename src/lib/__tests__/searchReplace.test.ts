import { describe, it, expect } from 'vitest';
import { compileMatcher, isValidFileName, evaluateSearchReplace, type SearchReplaceOpts } from '../searchReplace';

const o = (patch: Partial<SearchReplaceOpts> = {}): SearchReplaceOpts => ({
  search: 'S3', replace: 'S4', useRegex: false, caseSensitive: false, applyTo: 'both', ...patch,
});

describe('compileMatcher', () => {
  it('replaces every occurrence (global)', () => {
    const m = compileMatcher(o({ search: 'ab', replace: 'X' }));
    expect(m.kind).toBe('ok');
    if (m.kind === 'ok') expect(m.apply('ab ab ab')).toBe('X X X');
  });
  it('is case-insensitive by default', () => {
    const m = compileMatcher(o({ search: 'a', replace: 'X' }));
    if (m.kind === 'ok') expect(m.apply('Aa')).toBe('XX');
  });
  it('respects caseSensitive', () => {
    const m = compileMatcher(o({ search: 'a', replace: 'X', caseSensitive: true }));
    if (m.kind === 'ok') expect(m.apply('Aa')).toBe('AX');
  });
  it('escapes literal special chars', () => {
    const m = compileMatcher(o({ search: '.', replace: '_' }));
    if (m.kind === 'ok') expect(m.apply('a.b.c')).toBe('a_b_c');
  });
  it('uses regex with capture groups when useRegex', () => {
    const m = compileMatcher(o({ search: 'S(\\d)', replace: 'S0$1', useRegex: true }));
    if (m.kind === 'ok') expect(m.apply('Show S3')).toBe('Show S03');
  });
  it('returns error on invalid regex', () => {
    expect(compileMatcher(o({ search: '(', useRegex: true })).kind).toBe('error');
  });
  it('returns error on empty search', () => {
    expect(compileMatcher(o({ search: '' })).kind).toBe('error');
  });
});

describe('isValidFileName', () => {
  it('rejects empty / reserved / illegal', () => {
    expect(isValidFileName('')).toBe(false);
    expect(isValidFileName('   ')).toBe(false);
    expect(isValidFileName('.')).toBe(false);
    expect(isValidFileName('..')).toBe(false);
    expect(isValidFileName('a<b')).toBe(false);
    expect(isValidFileName('a/b')).toBe(false);
    expect(isValidFileName('a:b')).toBe(false);
    expect(isValidFileName('good.mkv')).toBe(true);
  });
  it('allows spaces and hyphens (common in real names)', () => {
    expect(isValidFileName('S4 - 01.mkv')).toBe(true);
    expect(isValidFileName('Show Name [Group].ass')).toBe(true);
  });
});

describe('evaluateSearchReplace', () => {
  const files = (names: string[]) => names.map((n) => ({ name: n, path: `/root/${n}` }));

  it('matches and builds rename ops on the full name', () => {
    const r = evaluateSearchReplace(files(['S3 - 01.mkv', 'thumbs.jpg']), o({ search: 'S3', replace: 'S4' }));
    expect(r.matched).toBe(1);
    expect(r.unmatched).toBe(1);
    expect(r.ops[0]).toEqual({ src: '/root/S3 - 01.mkv', dest: '/root/S4 - 01.mkv' });
    expect(r.rows[0].renamed).toBe('S4 - 01.mkv');
    expect(r.rows[0].state).toBe('matched');
    expect(r.rows[1].state).toBe('unmatched');
  });

  it("applyTo 'name' preserves the extension", () => {
    const r = evaluateSearchReplace(files(['S3.mkv']), o({ search: 'S3', replace: 'S4', applyTo: 'name' }));
    expect(r.rows[0].renamed).toBe('S4.mkv');
  });

  it("applyTo 'ext' preserves the stem", () => {
    const r = evaluateSearchReplace(files(['show.MKV']), o({ search: 'mkv', replace: 'mp4', applyTo: 'ext' }));
    expect(r.rows[0].renamed).toBe('show.mp4');
  });

  it("applyTo 'ext' is a no-op when there is no extension", () => {
    const r = evaluateSearchReplace(files(['README']), o({ search: 'X', replace: 'Y', applyTo: 'ext' }));
    expect(r.rows[0].state).toBe('unmatched');
    expect(r.ops).toHaveLength(0);
  });

  it('regex with capture group in replacement', () => {
    const r = evaluateSearchReplace(files(['Major S3 - 01.mkv']), o({ search: 'S(\\d+) - (\\d+)', replace: 'S0$1E$2', useRegex: true }));
    expect(r.rows[0].renamed).toBe('Major S03E01.mkv');
  });

  it('drops matches that produce an illegal name', () => {
    const r = evaluateSearchReplace(files(['ok.mkv']), o({ search: 'ok', replace: 'a/b' }));
    expect(r.matched).toBe(0);
    expect(r.dropped).toBe(1);
    expect(r.ops).toHaveLength(0);
  });

  it('flags conflicts when two files collapse to the same dest', () => {
    const r = evaluateSearchReplace(files(['a1.txt', 'a2.txt']), o({ search: 'a[12]', replace: 'x', useRegex: true }));
    expect(r.conflicts).toBe(1);
    expect(r.rows.every((row) => row.state === 'conflict')).toBe(true);
    expect(r.ops).toHaveLength(2);
  });

  it('returns error + all unmatched on invalid regex', () => {
    const r = evaluateSearchReplace(files(['a.txt', 'b.txt']), o({ search: '(', useRegex: true }));
    expect(r.error).toBeTruthy();
    expect(r.matched).toBe(0);
    expect(r.unmatched).toBe(2);
    expect(r.ops).toHaveLength(0);
  });
});
