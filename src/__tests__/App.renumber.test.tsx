import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { renderInApp } from '../test/utils';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
  Channel: class { onmessage: ((m: unknown) => void) | null = null; },
}));
vi.mock('@tauri-apps/api/core', () => ({ Channel: mocks.Channel, invoke: (...args: unknown[]) => mocks.invoke(...args) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...args: unknown[]) => mocks.open(...args) }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: () => Promise.resolve(() => {}) }) }));

function entry(name: string, dir = 'F:/Anime') {
  return { name, path: `${dir}/${name}`, is_dir: false, size: 0 };
}

describe('App — Renumber mode', () => {
  beforeEach(() => { mocks.invoke.mockReset(); mocks.open.mockReset(); });

  it('renders panel + preview and wires ops through Rename (seeded block)', async () => {
    mocks.open.mockResolvedValue('F:/Anime');
    mocks.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'load_presets') return [];
      if (cmd === 'load_last_rename') return null;
      if (cmd === 'list_files') return [entry('Naruto.001.mkv'), entry('Naruto.013.mkv')];
      return undefined;
    });

    renderInApp(<App />);
    fireEvent.click(await screen.findByText('Drop a folder here'));

    // Switch to Renumber. (The mode buttons are role="radio" inside a radiogroup,
    // so query by that role — not "button" — to match the actual accessible role.)
    fireEvent.click(await screen.findByRole('radio', { name: /^Renumber$/ }));

    // Panel + preview rendered.
    expect(await screen.findByText('Absolute-number pattern')).toBeTruthy();
    expect(screen.getByText('Renumber preview')).toBeTruthy();

    // Default pattern (\d+) + seeded block {season1, 1..13, startEp1} → both files renamed.
    expect(await screen.findByRole('button', { name: /rename 2 files/i })).toBeTruthy();
  });

  it('ejects season picks after a rename so the preview does not re-propose', async () => {
    // Regression: post-rename the live files carry the SxxEyy tokens, so
    // leaving the from/to picks in place made the preview suggest renaming
    // them again (and again each pass). The button must go quiet after apply.
    let listCount = 0;
    mocks.open.mockResolvedValue('F:/Anime');
    mocks.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'load_presets') return [];
      if (cmd === 'load_last_rename') return null;
      if (cmd === 'list_files') {
        listCount += 1;
        // Post-rename the files are renumbered; the pattern still matches them.
        return listCount === 1
          ? [entry('Naruto.001.mkv'), entry('Naruto.013.mkv')]
          : [entry('Naruto.S01E01.mkv'), entry('Naruto.S01E13.mkv')];
      }
      if (cmd === 'rename_pairs') {
        return {
          applied: [
            { src: 'F:/Anime/Naruto.001.mkv', dest: 'F:/Anime/Naruto.S01E01.mkv' },
            { src: 'F:/Anime/Naruto.013.mkv', dest: 'F:/Anime/Naruto.S01E13.mkv' },
          ],
          skipped: [],
          errors: [],
        };
      }
      return undefined;
    });

    renderInApp(<App />);
    fireEvent.click(await screen.findByText('Drop a folder here'));
    fireEvent.click(await screen.findByRole('radio', { name: /^Renumber$/ }));

    const renameBtn = await screen.findByRole('button', { name: /rename 2 files/i });
    fireEvent.click(renameBtn);

    // After apply the picks are ejected: no block matches → 0 ops → button is
    // disabled and labelled "Rename 0 files" (not lit for a second pass).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /rename 0 files/i })).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: /rename 0 files/i })).toBeDisabled();
  });
});
