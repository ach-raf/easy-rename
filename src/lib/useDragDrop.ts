/**
 * Subscribe to the Tauri webview's native drag/drop events.
 *
 * Wraps `getCurrentWebview().onDragDropEvent` so callers don't have to hand-
 * write the `useEffect` + cleanup + `__TAURI_INTERNALS__` guard that the
 * Dropzone used to inline.
 *
 * The handler is read through `useEffectEvent`, so the effect subscribes ONCE
 * (empty deps) and always invokes the latest `onDrop` without tearing down and
 * re-attaching the native listener whenever the parent's callbacks change
 * identity. Before this, the listener was re-registered on every render where
 * `onFolder` changed — with a brief window between unlisten-resolve and
 * re-attach where drops could be silently lost.
 *
 * Outside the Tauri runtime (plain browser, jsdom) this is a no-op.
 */
import { useEffect, useEffectEvent } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

export interface UseDragDropHandlers {
  /** Called with the first dropped path when the user drops files/folders. */
  onDrop: (path: string) => void;
  /** Called on `enter`/`over` (drag hovering the window) — e.g. to add a
   *  highlight class. Optional. */
  onHover?: (active: boolean) => void;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

export function useDragDrop({ onDrop, onHover }: UseDragDropHandlers): void {
  // Always read the latest handlers inside the effect without making them deps.
  const onDropEvent = useEffectEvent(onDrop);
  const onHoverEvent = useEffectEvent(onHover ?? (() => {}));

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    // onDragDropEvent resolves to an unlisten fn; capture it for cleanup.
    getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      const paths = 'paths' in event.payload ? event.payload.paths : [];
      if (type === 'enter' || type === 'over') onHoverEvent(true);
      else onHoverEvent(false);
      if (type === 'drop' && paths && paths.length > 0) onDropEvent(paths[0]);
    }).then((fn) => {
      if (cancelled) fn();   // effect already cleaned up before resolve
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onDropEvent, onHoverEvent]);
}
