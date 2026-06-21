import { describe, it, expect } from 'vitest';
import { classify, extOf, stemOf } from '../classify';

describe('extOf', () => {
  it('returns lowercased extension without dot', () => {
    expect(extOf('ep01.SRT')).toBe('srt');
    expect(extOf('video.MKV')).toBe('mkv');
  });
  it('returns empty for no extension', () => {
    expect(extOf('README')).toBe('');
  });
});

describe('stemOf', () => {
  it('returns name without final extension', () => {
    expect(stemOf('Show.S01E01.mkv')).toBe('Show.S01E01');
    expect(stemOf('ep01.srt')).toBe('ep01');
  });
});

describe('classify', () => {
  it('classifies videos', () => {
    expect(classify('a.mkv')).toBe('video');
    expect(classify('a.mp4')).toBe('video');
  });
  it('classifies subtitles', () => {
    expect(classify('a.srt')).toBe('subtitle');
    expect(classify('a.ass')).toBe('subtitle');
    expect(classify('a.vtt')).toBe('subtitle');
  });
  it('classifies unknown as other', () => {
    expect(classify('a.txt')).toBe('other');
  });
});
