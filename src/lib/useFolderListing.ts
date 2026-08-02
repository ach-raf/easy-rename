/**
 * Folder listing as a TanStack Query.
 *
 * Replaces the hand-rolled `listFiles` + 3×`setState` + `cancelled` flag +
 * race-prone reload in App.tsx. The query is keyed on the folder path, so:
 *  - switching folders cancels any in-flight read for the previous folder
 *    (no stale resolution can land second and overwrite the fresh one);
 *  - `qc.invalidateQueries({ queryKey: ['files'] })` after a rename/undo
 *    refetches declaratively — no manual `reloadFiles()` plumbing;
 *  - `isPending` / `isError` / `error` come for free.
 *
 * `select: classifyEntries` derives the {vids, subz, all} buckets in the query
 * cache, so consumers get already-classified + sorted data and the raw listing
 * is memoized upstream (re-classification only happens when the listing changes).
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { listFiles, type FileEntry } from '../api';
import { classify, extOf } from './classify';
import type { MediaFile } from './match';

export interface ClassifiedListing {
  vids: MediaFile[];
  subz: MediaFile[];
  all: { name: string; path: string }[];
}

/** The stable query key for a folder listing. Exported so mutations can
 *  invalidate it by partial key (`['files']`) without knowing the folder. */
export const folderListingKey = (folder: string) => ['files', folder] as const;

function classifyEntries(entries: FileEntry[]): ClassifiedListing {
  const vids: MediaFile[] = [];
  const subz: MediaFile[] = [];
  const all: { name: string; path: string }[] = [];
  for (const e of entries) {
    if (e.is_dir) continue;
    all.push({ name: e.name, path: e.path });
    const kind = classify(e.name);
    if (kind === 'other') continue;
    const mf: MediaFile = { id: e.path, name: e.name, path: e.path, ext: extOf(e.name), kind };
    if (kind === 'video') vids.push(mf); else subz.push(mf);
  }
  const byName = (a: MediaFile | { name: string }, b: MediaFile | { name: string }) =>
    a.name.localeCompare(b.name, undefined, { numeric: true });
  vids.sort(byName);
  subz.sort(byName);
  all.sort(byName);
  return { vids, subz, all };
}

export type FolderListingQuery = UseQueryResult<ClassifiedListing, Error> & {
  /** The query key for this folder, for targeted invalidation. */
  queryKey: ReturnType<typeof folderListingKey>;
};

export function useFolderListing(folder: string | null): FolderListingQuery {
  const query = useQuery({
    queryKey: folder ? folderListingKey(folder) : ['files', null],
    queryFn: () => listFiles(folder!, true),
    enabled: folder !== null,
    select: classifyEntries,
  });
  return query as FolderListingQuery;
}
