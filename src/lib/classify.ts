export type FileKind = 'video' | 'subtitle' | 'other';

export const VIDEO_EXTS = new Set<string>([
  'mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v',
  'mpg', 'mpeg', 'ts', 'm2ts', '3gp', 'ogv',
]);

export const SUB_EXTS = new Set<string>([
  'srt', 'ass', 'ssa', 'vtt', 'sub', 'smi', 'sami', 'idx',
]);

export function extOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i < 0 || i === fileName.length - 1) return '';
  return fileName.slice(i + 1).toLowerCase();
}

export function stemOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i > 0 ? fileName.slice(0, i) : fileName;
}

export function classify(fileName: string): FileKind {
  const ext = extOf(fileName);
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (SUB_EXTS.has(ext)) return 'subtitle';
  return 'other';
}
