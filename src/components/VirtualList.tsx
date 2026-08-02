/**
 * Windowed list for large folders.
 *
 * The three preview lists (PairList, SearchReplaceList, RenumberList) can hold
 * hundreds/thousands of files in an archival library, and rendering every row
 * to the DOM made the UI janky past a few hundred. This wrapper uses
 * `@tanstack/react-virtual` to render only the ~visible slice (plus a small
 * overscan), regardless of list length.
 *
 * Below `THRESHOLD` rows we skip virtualization and render the plain children —
 * virtualization's absolute-positioning overhead isn't worth it for small lists,
 * and the non-virtual path keeps dnd-kit hit-testing trivially simple.
 *
 * Row height is estimated (constant) then measured dynamically per-row via
 * `measureElement`, so wrapping filenames still get the right height.
 */
import { Fragment, useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/** Above this count, switch from plain render to windowing. */
export const VIRTUALIZE_THRESHOLD = 80;
/** Estimated row height. Real height is measured per-row via measureElement. */
const ESTIMATED_ROW_HEIGHT = 40;

interface VirtualListProps<T> {
  items: T[];
  /** Render a single row. Receives the item and its absolute index. */
  children: (item: T, index: number) => ReactNode;
  /** Key extractor for stable React keys across reorders. */
  getKey: (item: T, index: number) => string | number;
  /** Extra className on the scroll container. */
  className?: string;
  /** Render every row directly (no windowing). Used below the threshold. */
  forcePlain?: boolean;
}

export function VirtualList<T>({
  items,
  children,
  getKey,
  className,
  forcePlain = false,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualize = !forcePlain && items.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
    enabled: virtualize,
  });

  if (!virtualize) {
    // Small list: render plainly. A keyed Fragment (not a wrapper div) so the
    // row elements stay direct siblings of each other inside `.scroll-area` —
    // this preserves the CSS `.row + .row { margin-top }` adjacency rule and
    // adds zero extra DOM vs. the pre-virtualization markup.
    return (
      <div ref={scrollRef} className={'scroll-area' + (className ? ' ' + className : '')}>
        {items.map((item, i) => (
          <Fragment key={getKey(item, i)}>{children(item, i)}</Fragment>
        ))}
      </div>
    );
  }

  // Windowed: one absolutely-positioned spacer sized to the total height, with
  // only the visible rows rendered inside it. `measureElement` corrects the
  // estimate for wrapping rows.
  return (
    <div ref={scrollRef} className={'scroll-area' + (className ? ' ' + className : '')}
      style={{ contain: 'strict' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const item = items[vi.index];
          return (
            <div
              key={getKey(item, vi.index)}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}
            >
              {children(item, vi.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
