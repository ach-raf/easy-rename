import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PairList } from '../components/PairList';
import type { MediaFile, Row } from '../lib/match';

const v = (name: string): MediaFile => ({ id: name, name, path: 'C:/d/' + name, ext: 'mkv', kind: 'video' });
const s = (name: string): MediaFile => ({ id: name, name, path: 'C:/d/' + name, ext: 'srt', kind: 'subtitle' });

const rows: Row[] = [
  { video: v('ep1.mkv'), sub: s('ep01.srt'), locked: true },
  { video: v('ep2.mkv'), sub: null, locked: false },
];
const allSubs = [s('ep01.srt'), s('ep02.srt')];

function renderList() {
  const handlers = { onReassign: vi.fn(), onAutoAssignAll: vi.fn(), onUnassignAll: vi.fn(), onToggleLock: vi.fn() };
  render(<PairList rows={rows} allSubs={allSubs} pattern="(\\d+)" folder="C:/d" {...handlers} />);
  return handlers;
}

describe('PairList', () => {
  it('renders a SubPicker per row (assigned + empty)', () => {
    renderList();
    expect(screen.getByText('ep01.srt')).toBeTruthy();              // assigned trigger label
    expect(screen.getByRole('button', { name: /assign subtitle/i })).toBeTruthy(); // empty trigger
  });

  it('hides a subtitle used on another row from the empty row picker', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /assign subtitle/i })); // open ep2's picker
    expect(screen.getByText(/1 already assigned/i)).toBeTruthy();
    expect(screen.queryAllByText('ep01.srt')).toHaveLength(1); // only ep1's closed trigger
  });

  it('invokes onUnassignAll from the kebab menu', () => {
    const h = renderList();
    fireEvent.click(screen.getByRole('button', { name: /bulk actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /unassign all/i }));
    expect(h.onUnassignAll).toHaveBeenCalledTimes(1);
  });

  it('invokes onAutoAssignAll from the kebab menu', () => {
    const h = renderList();
    fireEvent.click(screen.getByRole('button', { name: /bulk actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /auto-assign all/i }));
    expect(h.onAutoAssignAll).toHaveBeenCalledTimes(1);
  });
});
