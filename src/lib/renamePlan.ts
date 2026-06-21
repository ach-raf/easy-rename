import { Pair } from './match';
import { stemOf } from './classify';

export interface RenameOp {
  src: string;
  dest: string;
}

export function dirname(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  return i >= 0 ? norm.slice(0, i) : '';
}

export function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  const d = dir.replace(/[\\/]+$/, '');
  return d + '/' + name;
}

export function buildRenamePlan(pairs: Pair[]): RenameOp[] {
  return pairs.map(({ video, sub }) => {
    const dir = dirname(video.path);
    const newName = stemOf(video.name) + '.' + sub.ext;
    return { src: sub.path, dest: joinPath(dir, newName) };
  });
}
