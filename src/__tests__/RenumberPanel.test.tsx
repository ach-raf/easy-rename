import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RenumberPanel } from '../components/RenumberPanel';
import type { RenumberOpts, RenumberResult } from '../lib/renumber';

const files = ['Naruto.001.mkv', 'Naruto.013.mkv', 'Naruto.091.mkv', 'Naruto.131.mkv']
  .map((n) => ({ name: n, path: `/f/${n}` }));

const opts: RenumberOpts = {
  pattern: '(\\d{3})',
  seasons: [{ season: 3, fromAbs: 91, toAbs: 131, startEp: 8 }],
  pad: 2,
};
const summary: RenumberResult = { rows: [], ops: [], matched: 0, unmatched: 0, conflicts: 0, dropped: 0 };

describe('RenumberPanel', () => {
  it('edits the pattern via input and quick-apply chips', () => {
    const onChange = vi.fn();
    render(<RenumberPanel opts={opts} files={files} onChange={onChange} summary={summary} />);
    fireEvent.change(screen.getByLabelText('Absolute-number pattern'), { target: { value: '(\\d+)' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pattern: '(\\d+)' }));
  });

  it('shows the endpoint preview for a configured season', () => {
    render(<RenumberPanel opts={opts} files={files} onChange={() => {}} summary={summary} />);
    expect(screen.getByText('91')).toBeTruthy();
    expect(screen.getByText('S03E08')).toBeTruthy();   // from-token
    expect(screen.getByText('S03E48')).toBeTruthy();   // to-token
  });

  it('Add season appends an empty block', () => {
    const onChange = vi.fn();
    render(<RenumberPanel opts={opts} files={files} onChange={onChange} summary={summary} />);
    fireEvent.click(screen.getByRole('button', { name: /add season/i }));
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RenumberOpts;
    expect(last.seasons).toHaveLength(2);
    expect(last.seasons[1]).toMatchObject({ fromAbs: 0, toAbs: 0, startEp: 1 });
  });

  it('Remove season removes the block', () => {
    const onChange = vi.fn();
    render(<RenumberPanel opts={opts} files={files} onChange={onChange} summary={summary} />);
    fireEvent.click(screen.getByLabelText('Remove season 1'));
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RenumberOpts;
    expect(last.seasons).toHaveLength(0);
  });

  it('editing Ep at first file updates startEp', () => {
    const onChange = vi.fn();
    render(<RenumberPanel opts={opts} files={files} onChange={onChange} summary={summary} />);
    fireEvent.change(screen.getByLabelText('Episode at first file for block 1'), { target: { value: '7' } });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RenumberOpts;
    expect(last.seasons[0].startEp).toBe(7);
  });

  it('picking a file in the From trigger sets fromAbs', () => {
    const onChange = vi.fn();
    // Empty block → From trigger is unset and shows the "Pick first file" placeholder.
    const empty: RenumberOpts = { ...opts, seasons: [{ season: 1, fromAbs: 0, toAbs: 0, startEp: 1 }] };
    render(<RenumberPanel opts={empty} files={files} onChange={onChange} summary={summary} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick first file' }));
    // Popover lists files with a number; click the abs-91 file.
    fireEvent.click(screen.getByText('Naruto.091.mkv'));
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RenumberOpts;
    expect(last.seasons[0].fromAbs).toBe(91);
  });

  it('scrolling inside the file-picker list does NOT close the popover', () => {
    const onChange = vi.fn();
    const empty: RenumberOpts = { ...opts, seasons: [{ season: 1, fromAbs: 0, toAbs: 0, startEp: 1 }] };
    render(<RenumberPanel opts={empty} files={files} onChange={onChange} summary={summary} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick first file' }));
    // Popover is open.
    expect(screen.getByPlaceholderText('Search files…')).toBeTruthy();
    const list = document.querySelector('.picker-list') as HTMLElement;
    expect(list).toBeTruthy();
    // Scrolling the picker's own list must NOT close it (the bug: capture-phase
    // window scroll listener fired for the inner scrollable list too).
    fireEvent.scroll(list);
    expect(screen.getByPlaceholderText('Search files…')).toBeTruthy();
  });
});
