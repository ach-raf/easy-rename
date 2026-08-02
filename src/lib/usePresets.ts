/**
 * Regex presets as a TanStack Query + mutation, persisted via the store plugin.
 *
 * Replaces the mount effect + `cancelled` flag + `persist()` fire-and-forget
 * save in App.tsx. The query seeds with `REGEX_PRESETS` so the first paint is
 * never empty, then reconciles with whatever is persisted on disk. Every
 * save/delete/reset routes through the same mutation, which keeps the cache and
 * disk in sync and surfaces save errors on the mutation itself.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { Preset } from '../api';
import { store } from './store';
import { REGEX_PRESETS } from './match';

export const PRESETS_KEY = ['presets'] as const;

export type PresetsQuery = UseQueryResult<Preset[], Error>;

/** Read presets, seeded with built-ins so the rail isn't empty on first paint. */
export function usePresets(): PresetsQuery & { presets: Preset[] } {
  const q = useQuery({
    queryKey: PRESETS_KEY,
    queryFn: async () => (await store.getPresets()) ?? REGEX_PRESETS,
    initialData: REGEX_PRESETS,
    staleTime: Infinity, // user config; only changes via our own mutations
  });
  return { ...q, presets: q.data ?? REGEX_PRESETS };
}

/** Mutate presets and persist. Returns helpers matching the old App callbacks. */
export function usePresetMutations() {
  const qc = useQueryClient();

  /** Optimistically update the cache, persist to disk, roll back on error. */
  const mutate = useMutation({
    mutationFn: async (next: Preset[]) => {
      await store.setPresets(next);
      return next;
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: PRESETS_KEY });
      const prev = qc.getQueryData<Preset[]>(PRESETS_KEY);
      qc.setQueryData<Preset[]>(PRESETS_KEY, next);
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(PRESETS_KEY, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: PRESETS_KEY });
    },
  });

  return {
    save: (label: string, pattern: string) => {
      const name = label.trim();
      if (!name) return;
      const prev = qc.getQueryData<Preset[]>(PRESETS_KEY) ?? REGEX_PRESETS;
      // Replacing an existing name (case-insensitive) overwrites in place;
      // otherwise the new preset is appended.
      const rest = prev.filter((p) => p.label.toLowerCase() !== name.toLowerCase());
      mutate.mutate([...rest, { label: name, pattern }]);
    },
    remove: (label: string) => {
      const prev = qc.getQueryData<Preset[]>(PRESETS_KEY) ?? REGEX_PRESETS;
      mutate.mutate(prev.filter((p) => p.label !== label));
    },
    reset: () => mutate.mutate(REGEX_PRESETS),
    error: mutate.error,
  };
}
