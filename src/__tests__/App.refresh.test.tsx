import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { renderInApp } from '../test/utils';

// Tauri modules are mocked at hoist time so App (and Dropzone) never touch the
// real runtime. `mocks.invoke` / `mocks.open` are configured per-test below.
// The core mock also needs a `Channel` stub (api.ts imports it for progress
// streaming); it's defined inline here because vi.mock factories are hoisted
// above regular imports.
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
  Channel: class {
    onmessage: ((m: unknown) => void) | null = null;
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  Channel: mocks.Channel,
  invoke: (...args: unknown[]) => mocks.invoke(...args),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mocks.open(...args),
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: () => Promise.resolve(() => {}) }),
}));

function entry(name: string, dir = 'F:/Shows') {
  return { name, path: `${dir}/${name}`, is_dir: false, size: 0 };
}

describe('App — live refresh after rename', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.open.mockReset();
  });

  it('re-reads the folder after a rename so previews reflect live state', async () => {
    let listCount = 0;
    mocks.open.mockResolvedValue('F:/Shows');
    mocks.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'load_presets') return [];
      if (cmd === 'load_last_rename') return null;
      if (cmd === 'list_files') {
        listCount += 1;
        // Pre-rename listing: subtitle keeps its original name. After the rename
        // it takes the video's stem, so the second listing reflects that.
        return listCount === 1
          ? [entry('Show 01.mkv'), entry('ep01.srt')]
          : [entry('Show 01.mkv'), entry('Show 01.srt')];
      }
      if (cmd === 'rename_pairs') {
        return {
          applied: [{ src: 'F:/Shows/ep01.srt', dest: 'F:/Shows/Show 01.srt' }],
          skipped: [],
          errors: [],
        };
      }
      return undefined;
    });

    renderInApp(<App />);

    // Open the folder via the empty-state dropzone (click → mocked `open`).
    const dz = await screen.findByText('Drop a folder here');
    fireEvent.click(dz);

    // Subtitle with its original name is rendered; folder read exactly once.
    await screen.findAllByText('ep01.srt');
    expect(listCount).toBe(1);

    // Run the rename.
    const renameBtn = await screen.findByRole('button', { name: /rename 1 file/i });
    fireEvent.click(renameBtn);

    // ROOT-CAUSE assertion: the folder MUST be re-read after the rename so the
    // preview stops showing the pre-rename snapshot.
    await waitFor(() => expect(listCount).toBe(2));

    // And the live (post-rename) subtitle name now appears in the UI.
    await screen.findAllByText('Show 01.srt');
  });

  it('re-reads the folder after an undo', async () => {
    let listCount = 0;
    mocks.open.mockResolvedValue('F:/Shows');
    mocks.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'load_presets') return [];
      if (cmd === 'load_last_rename') return null;
      if (cmd === 'list_files') {
        listCount += 1;
        return listCount <= 1
          ? [entry('Show 01.mkv'), entry('ep01.srt')] // pre-rename
          : [entry('Show 01.mkv'), entry('Show 01.srt')]; // post-rename
      }
      if (cmd === 'rename_pairs') {
        return {
          applied: [{ src: 'F:/Shows/ep01.srt', dest: 'F:/Shows/Show 01.srt' }],
          skipped: [],
          errors: [],
        };
      }
      if (cmd === 'undo') {
        return {
          applied: [{ src: 'F:/Shows/Show 01.srt', dest: 'F:/Shows/ep01.srt' }],
          skipped: [],
          errors: [],
        };
      }
      return undefined;
    });

    renderInApp(<App />);

    fireEvent.click(await screen.findByText('Drop a folder here'));
    await screen.findAllByText('ep01.srt');

    fireEvent.click(await screen.findByRole('button', { name: /rename 1 file/i }));
    await waitFor(() => expect(listCount).toBe(2));

    // Now undo — folder must be read a third time so the view reflects reality.
    fireEvent.click(await screen.findByRole('button', { name: /undo last/i }));
    await waitFor(() => expect(listCount).toBe(3));
  });
});
