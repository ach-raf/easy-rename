import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => mocks.invoke(...a) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...a: unknown[]) => mocks.open(...a) }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: () => Promise.resolve(() => {}) }) }));

function entry(name: string, dir = 'F:/Shows') {
  return { name, path: `${dir}/${name}`, is_dir: false, size: 0 };
}
function setup() {
  mocks.open.mockResolvedValue('F:/Shows');
  mocks.invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'load_presets') return [];
    if (cmd === 'load_last_rename') return null;
    if (cmd === 'list_files') return [entry('Show.E01.mkv'), entry('Show.E02.mkv'), entry('subs.E01.srt'), entry('subs.E02.srt')];
    return undefined;
  });
}
async function openFolder() {
  const view = render(<App />);
  fireEvent.click(await screen.findByText('Drop a folder here'));
  await screen.findAllByText('subs.E01.srt');
  return view.container;
}

// A SubPicker trigger shows the linked subtitle's name inside a `.sp-label`
// span, or "Assign subtitle…" when empty. Querying by text scoped to that
// span excludes the Stray list chips (which also render the sub name as a
// draggable role="button"), so the assertion targets the row's link state.
const subInRow = (container: HTMLElement, re: RegExp) =>
  Array.from(container.querySelectorAll('.sp-label')).filter((el) => re.test(el.textContent ?? ''));

describe('App — pair-list QoL', () => {
  beforeEach(() => { mocks.invoke.mockReset(); mocks.open.mockReset(); });

  it('Unassign all clears every subtitle link', async () => {
    setup();
    const container = await openFolder();
    expect(subInRow(container, /subs\.e01\.srt/i).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: /bulk actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /unassign all/i }));
    await waitFor(() => {
      // Every SubPicker trigger now reads "Assign subtitle…" — i.e. no row is
      // linked. (Unassigned subs still appear by name in the Stray list, so we
      // assert against the `.sp-label` spans rather than global text absence.)
      expect(subInRow(container, /assign subtitle/i).length).toBeGreaterThanOrEqual(1);
      expect(subInRow(container, /subs\.e01\.srt/i).length).toBe(0);
    });
  });

  it('Auto-assign all is a no-op when everything is already matched', async () => {
    setup();
    const container = await openFolder();
    const before = subInRow(container, /subs\.e01\.srt/i).length;
    fireEvent.click(screen.getByRole('button', { name: /bulk actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /auto-assign all/i }));
    await waitFor(() => expect(subInRow(container, /subs\.e01\.srt/i).length).toBe(before));
  });

  it('Auto-assign all fills rows that were unassigned', async () => {
    setup();
    const container = await openFolder();
    fireEvent.click(screen.getByRole('button', { name: /bulk actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /unassign all/i }));
    await waitFor(() => expect(subInRow(container, /subs\.e01\.srt/i).length).toBe(0));
    fireEvent.click(screen.getByRole('button', { name: /bulk actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /auto-assign all/i }));
    await waitFor(() => expect(subInRow(container, /subs\.e01\.srt/i).length).toBeGreaterThanOrEqual(1));
  });
});
