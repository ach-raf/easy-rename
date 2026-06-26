import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubPicker } from '../components/SubPicker';
import type { MediaFile } from '../lib/match';

const s = (name: string): MediaFile => ({ id: name, name, path: 'C:/d/' + name, ext: 'srt', kind: 'subtitle' });
const ALL = [s('a.srt'), s('b.srt'), s('c.srt')];

function renderPicker(props: Partial<Parameters<typeof SubPicker>[0]> = {}) {
  const handlers = { onSelect: vi.fn(), onUnlink: vi.fn(), onToggleLock: vi.fn() };
  return render(
    <SubPicker
      current={s('a.srt')} allSubs={ALL} hiddenSubIds={new Set(['b.srt'])} locked={false}
      {...handlers} {...props} />,
  );
}

describe('SubPicker', () => {
  it('hides subs assigned elsewhere and shows the hidden count', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'a.srt' })); // open trigger
    expect(screen.queryByText('b.srt')).toBeNull();     // hidden
    expect(screen.queryByText('c.srt')).toBeTruthy();   // free
    expect(screen.getByText(/1 already assigned/i)).toBeTruthy();
  });

  it('filters options by typing', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'a.srt' }));
    fireEvent.change(screen.getByPlaceholderText(/search subtitles/i), { target: { value: 'c.srt' } });
    expect(screen.queryByText('c.srt')).toBeTruthy();
    expect(screen.queryAllByText('a.srt')).toHaveLength(1); // only the trigger now
  });

  it('reveals hidden subs on Show', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'a.srt' }));
    fireEvent.click(screen.getByRole('button', { name: /^show$/i }));
    expect(screen.queryByText('b.srt')).toBeTruthy();
  });

  it('calls onUnlink when ✕ is clicked', () => {
    const handlers = { onSelect: vi.fn(), onUnlink: vi.fn(), onToggleLock: vi.fn() };
    render(<SubPicker current={s('a.srt')} allSubs={ALL} hiddenSubIds={new Set()} locked={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: /unlink/i }));
    expect(handlers.onUnlink).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleLock when the lock is clicked', () => {
    const handlers = { onSelect: vi.fn(), onUnlink: vi.fn(), onToggleLock: vi.fn() };
    render(<SubPicker current={s('a.srt')} allSubs={ALL} hiddenSubIds={new Set()} locked={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: /lock/i }));
    expect(handlers.onToggleLock).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect when a visible option is chosen', () => {
    const handlers = { onSelect: vi.fn(), onUnlink: vi.fn(), onToggleLock: vi.fn() };
    render(<SubPicker current={s('a.srt')} allSubs={ALL} hiddenSubIds={new Set()} locked={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'a.srt' }));
    fireEvent.click(screen.getByText('c.srt'));
    expect(handlers.onSelect).toHaveBeenCalledWith(s('c.srt'));
  });

  it('renders the empty affordance when current is null', () => {
    renderPicker({ current: null });
    expect(screen.getByRole('button', { name: /assign subtitle/i })).toBeTruthy();
  });
});
