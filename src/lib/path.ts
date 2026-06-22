const splitSegs = (p: string): string[] => p.split(/[\\/]+/).filter(Boolean);

/**
 * Split an absolute file path into the portion relative to `folder`.
 * Returns `{ dir, base }`: `dir` is the subfolder portion (empty when the file
 * sits directly in the loaded folder) and `base` is the filename with extension.
 * Handles mixed `/` and `\` separators — paths arrive OS-native from the backend
 * and the loaded folder may use either separator.
 */
export function splitRelative(path: string, folder: string): { dir: string; base: string } {
  const pathSegs = splitSegs(path);
  const folderSegs = splitSegs(folder);
  let i = 0;
  while (i < folderSegs.length && i < pathSegs.length && pathSegs[i] === folderSegs[i]) i++;
  const rel = pathSegs.slice(i);
  if (rel.length === 0) {
    // Defensive: path produced no trailing segment — fall back to its last part.
    return { dir: '', base: pathSegs[pathSegs.length - 1] ?? '' };
  }
  const base = rel[rel.length - 1];
  const dir = rel.slice(0, -1).join('/');
  return { dir, base };
}
