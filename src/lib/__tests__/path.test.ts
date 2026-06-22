import { describe, it, expect } from 'vitest';
import { splitRelative } from '../path';

describe('splitRelative', () => {
  it('strips the folder prefix and returns dir + base', () => {
    expect(splitRelative('C:/Shows/S01/ep05.mkv', 'C:/Shows')).toEqual({ dir: 'S01', base: 'ep05.mkv' });
  });

  it('returns empty dir when the file is directly in the folder', () => {
    expect(splitRelative('C:/Shows/ep05.mkv', 'C:/Shows')).toEqual({ dir: '', base: 'ep05.mkv' });
  });

  it('normalizes mixed separators (backslash + forward slash)', () => {
    expect(splitRelative('C:\\Shows\\S01\\ep05.mkv', 'C:/Shows')).toEqual({ dir: 'S01', base: 'ep05.mkv' });
  });

  it('handles a trailing separator on the folder', () => {
    expect(splitRelative('C:/Shows/S01/ep05.mkv', 'C:/Shows/')).toEqual({ dir: 'S01', base: 'ep05.mkv' });
  });

  it('still returns a base when the path is outside the folder', () => {
    const r = splitRelative('D:/Other/ep05.mkv', 'C:/Shows');
    expect(r.base).toBe('ep05.mkv');
    expect(r.dir).toBe('D:/Other'); // falls back to the full path minus the filename
  });

  it('handles nested subfolders', () => {
    expect(splitRelative('C:/Shows/Show Name/Season 01/ep05.mkv', 'C:/Shows')).toEqual({
      dir: 'Show Name/Season 01',
      base: 'ep05.mkv',
    });
  });
});
