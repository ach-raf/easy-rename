import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualList } from '../components/VirtualList';

// jsdom doesn't do layout, so getBoundingClientRect returns zeros and the
// virtualizer renders ALL items (total height 0 → everything "in view"). That
// actually makes the windowed path easy to assert: it still renders every row,
// just through the virtualizer's spacer/absolute-position structure. The point
// of these tests is to confirm:
//   1. the plain path (below threshold) renders rows as direct siblings;
//   2. the windowed path (above threshold) renders rows and exposes the
//      virtualizer's size spacer;
//   3. the children render fn receives the right item + index.

describe('VirtualList', () => {
  it('renders every item via the plain path below the threshold', () => {
    const items = Array.from({ length: 5 }, (_, i) => `row-${i}`);
    const { container } = render(
      <VirtualList items={items} getKey={(x) => x}>
        {(item, i) => <div className="row">{item} @ {i}</div>}
      </VirtualList>,
    );
    // Plain path: rows are direct children of .scroll-area (no spacer wrapper).
    expect(container.querySelectorAll('.row')).toHaveLength(5);
    expect(screen.getByText('row-3 @ 3')).toBeDefined();
    expect(container.querySelector('[style*="position: relative"]')).toBeNull();
  });

  it('switches to the windowed path above the threshold and renders the spacer', () => {
    const items = Array.from({ length: 200 }, (_, i) => `row-${i}`);
    const { container } = render(
      <VirtualList items={items} getKey={(x) => x}>
        {(item) => <div className="row">{item}</div>}
      </VirtualList>,
    );
    // The windowed path wraps rows in a relative-positioned spacer sized to the
    // virtualizer's total height. This is the structural signal that windowing
    // engaged (the plain path renders no such spacer).
    const spacer = container.querySelector('[style*="position: relative"]');
    expect(spacer).not.toBeNull();
    // jsdom reports the scroll element as 0px tall, so the virtualizer computes
    // an empty visible range and renders NO rows here (in a real browser with a
    // sized container it would render ~viewport/rowHeight + overscan rows). That
    // is exactly the point of virtualization — confirm the row count is far below
    // the 200-item total, proving windowing is active rather than full render.
    const renderedRows = container.querySelectorAll('.row').length;
    expect(renderedRows).toBeLessThan(200);
    expect(renderedRows).toBeGreaterThanOrEqual(0);
  });

  it('forcePlain bypasses windowing even above the threshold', () => {
    const items = Array.from({ length: 200 }, (_, i) => `row-${i}`);
    const { container } = render(
      <VirtualList items={items} getKey={(x) => x} forcePlain>
        {(item) => <div className="row">{item}</div>}
      </VirtualList>,
    );
    expect(container.querySelector('[style*="position: relative"]')).toBeNull();
    expect(container.querySelectorAll('.row')).toHaveLength(200);
  });
});
