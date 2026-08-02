import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import App from '../App';
import { renderInApp } from '../test/utils';

// Persistence regression coverage. The App talks to the persisted store via
// `src/lib/store`, which is itself a no-op outside the Tauri runtime. To exercise
// the hydrate path (and confirm the renumber tab is restored on launch) we mock
// the store module directly with an in-memory backing object we can seed.
const mem = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
  Channel: class { onmessage: ((m: unknown) => void) | null = null; },
  // In-memory store backing; reset per test in beforeEach.
  db: new Map<string, unknown>(),
}));
vi.mock('@tauri-apps/api/core', () => ({ Channel: mem.Channel, invoke: (...args: unknown[]) => mem.invoke(...args) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...args: unknown[]) => mem.open(...args) }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: () => Promise.resolve(() => {}) }) }));
vi.mock('../lib/store', () => ({
  store: {
    getPresets: async () => mem.db.get('presets'),
    setPresets: async (p: unknown) => { mem.db.set('presets', p); },
    getLastRename: async () => mem.db.get('last-rename'),
    setLastRename: async (s: unknown) => { mem.db.set('last-rename', s); },
    getLastRenumber: async () => mem.db.get('last-renumber'),
    setLastRenumber: async (s: unknown) => { mem.db.set('last-renumber', s); },
  },
}));

function entry(name: string, dir = 'F:/Anime') {
  return { name, path: `${dir}/${name}`, is_dir: false, size: 0 };
}

describe('App — cross-launch persistence', () => {
  beforeEach(() => {
    mem.invoke.mockReset();
    mem.open.mockReset();
    mem.db.clear();
  });

  it('reopens on the Renumber tab and restores the pattern + pad', async () => {
    // Seed the persisted store as if last session ended on the Renumber tab with
    // a custom absolute-number pattern and a 3-digit pad. Regression: the
    // autosave effect used to early-return on `mode === 'renumber'`, so the tab
    // itself was never persisted and the app always reopened on the prior tab.
    mem.db.set('last-rename', {
      mode: 'renumber',
      search: '', replace: '', useRegex: false, caseSensitive: false, applyTo: 'both',
    });
    mem.db.set('last-renumber', { pattern: '(\\d{3})', pad: 3 });

    mem.open.mockResolvedValue('F:/Anime');
    mem.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'list_files') return [entry('Show.001.mkv'), entry('Show.012.mkv')];
      return undefined;
    });

    renderInApp(<App />);
    fireEvent.click(await screen.findByText('Drop a folder here'));

    // Renumber tab is active without the user clicking anything.
    expect(await screen.findByText('Absolute-number pattern')).toBeTruthy();

    // Restored pattern + pad (not the defaults (\d+) / 2).
    const patternInput = screen.getByLabelText('Absolute-number pattern') as HTMLInputElement;
    expect(patternInput.value).toBe('(\\d{3})');
    const padInput = screen.getByLabelText('Zero-pad width') as HTMLInputElement;
    expect(padInput.value).toBe('3');
  });

  it('does NOT restore season ranges (session-only, folder-specific)', async () => {
    // Seasons are tied to a folder's file numbers; we deliberately don't persist
    // them. Only a single seeded block (re-seeded on folder open) should be
    // present, regardless of any persisted pattern/pad.
    mem.db.set('last-rename', {
      mode: 'renumber',
      search: '', replace: '', useRegex: false, caseSensitive: false, applyTo: 'both',
    });
    mem.db.set('last-renumber', { pattern: '(\\d+)', pad: 2 });

    mem.open.mockResolvedValue('F:/Anime');
    mem.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'list_files') return [entry('Show.001.mkv'), entry('Show.012.mkv')];
      return undefined;
    });

    renderInApp(<App />);
    fireEvent.click(await screen.findByText('Drop a folder here'));
    await screen.findByText('Absolute-number pattern');

    // Exactly one seeded season block (the min..max auto-seed), never more.
    expect(screen.getAllByLabelText(/Season number for block/)).toHaveLength(1);
  });
});
