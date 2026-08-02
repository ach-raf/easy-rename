/**
 * Typed persistence for user config (presets, last-used Search&Replace inputs).
 *
 * Backed by the official `@tauri-apps/plugin-store`, which persists a single
 * JSON file (`easy-rename.json`) in the app data dir with atomic, auto-debounced
 * writes (default 100ms). This replaces the bespoke `regex_presets.json` +
 * `last_rename.json` Rust commands — one mature primitive instead of two
 * hand-rolled ones.
 *
 * Outside the Tauri runtime (e.g. `vite dev` in a plain browser, or unit tests)
 * every method is a no-op / returns its seed, so callers don't need to guard
 * `__TAURI_INTERNALS__` themselves.
 */
import { load, type Store } from '@tauri-apps/plugin-store';
import type { LastRenameState, LastRenumberState, Preset } from '../api';

const STORE_FILE = 'easy-rename.json';
const KEY_PRESETS = 'presets';
const KEY_LAST_RENAME = 'last-rename';
const KEY_LAST_RENUMBER = 'last-renumber';

const isTauri = (): boolean =>
  typeof window !== 'undefined' &&
  !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

let storePromise: Promise<Store | null> | null = null;

/** Load the store once and memoize. Resolves to `null` outside Tauri. */
async function getStore(): Promise<Store | null> {
  if (!isTauri()) return null;
  if (!storePromise) {
    // autoSave: 100ms (plugin default) debounces rapid successive writes,
    // e.g. when the user types in the Search & Replace inputs.
    storePromise = load(STORE_FILE, { autoSave: 100 });
  }
  return storePromise;
}

export const store = {
  async getPresets(): Promise<Preset[] | undefined> {
    const s = await getStore();
    return s ? await s.get<Preset[]>(KEY_PRESETS) : undefined;
  },
  async setPresets(presets: Preset[]): Promise<void> {
    const s = await getStore();
    if (s) await s.set(KEY_PRESETS, presets);
  },

  async getLastRename(): Promise<LastRenameState | undefined> {
    const s = await getStore();
    return s ? await s.get<LastRenameState>(KEY_LAST_RENAME) : undefined;
  },
  async setLastRename(state: LastRenameState): Promise<void> {
    const s = await getStore();
    if (s) await s.set(KEY_LAST_RENAME, state);
  },

  async getLastRenumber(): Promise<LastRenumberState | undefined> {
    const s = await getStore();
    return s ? await s.get<LastRenumberState>(KEY_LAST_RENUMBER) : undefined;
  },
  async setLastRenumber(state: LastRenumberState): Promise<void> {
    const s = await getStore();
    if (s) await s.set(KEY_LAST_RENUMBER, state);
  },
};
