import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mocks.invoke(...args) }));
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

    render(<App />);
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
});
