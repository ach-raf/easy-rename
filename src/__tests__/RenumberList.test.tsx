import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RenumberList } from '../components/RenumberList';
import type { RenumberRow } from '../lib/renumber';

const row = (r: Partial<RenumberRow>): RenumberRow => ({
  path: `/f/${r.original ?? 'x'}`, original: 'Naruto.091.mkv', renamed: null,
  abs: null, state: 'matched', ...r,
});

describe('RenumberList', () => {
  it('renders the Abs column, original, and renamed name for matched rows', () => {
    render(<RenumberList rows={[row({ original: 'Naruto.091.mkv', renamed: 'Naruto.S03E08.mkv', abs: 91, state: 'matched' })]} />);
    expect(screen.getByText('Naruto.091.mkv')).toBeTruthy();
    expect(screen.getByText('Naruto.S03E08.mkv')).toBeTruthy();
    expect(screen.getByText('91')).toBeTruthy();          // abs cell
    expect(screen.getByText('Renumber preview')).toBeTruthy();
  });

  it('renders the reason text for unmatched rows', () => {
    render(<RenumberList rows={[row({ original: 'Naruto.014.mkv', abs: 14, state: 'unmatched', reason: 'out-of-range' })]} />);
    expect(screen.getByText('— out of range')).toBeTruthy();
  });

  it('shows — when no absolute number was found', () => {
    render(<RenumberList rows={[row({ original: 'thumbs.jpg', abs: null, state: 'unmatched', reason: 'no-number' })]} />);
    expect(screen.getByText('— no number found')).toBeTruthy();
  });
});
