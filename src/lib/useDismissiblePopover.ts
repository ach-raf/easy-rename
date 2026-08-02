/**
 * Anchor-positioned popover that dismisses on outside-click / Esc / scroll /
 * resize. Extracted from the near-verbatim duplication that used to live in
 * `SubPicker`, `RenumberFileTrigger`, and `PairsKebab`.
 *
 * The hook owns:
 *  - the trigger + popover refs and the `open` state;
 *  - positioning the portal under the trigger (via `useLayoutEffect` measured
 *    against the trigger's bounding rect);
 *  - the dismiss listeners (mousedown outside the trigger/pop, Esc, page scroll
 *    or resize — but NOT internal scroll of the popover's own list);
 *  - optional autofocus of a child input on open (the `setTimeout(…,0)` the
 *    callers used to work around createPortal focus timing).
 *
 * `onClose` lets a caller run extra teardown (e.g. clearing a search query)
 * whenever the popover closes, from any cause.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface PopoverPos {
  top: number;
  left: number;
  width: number;
}

export interface UseDismissiblePopoverOptions {
  /** Minimum popover width. Defaults to the trigger width but never below this. */
  minWidth?: number;
  /** Ref to an input inside the popover to focus when it opens. Optional. */
  autoFocusRef?: React.RefObject<HTMLInputElement | null>;
  /** Called whenever the popover closes (outside click, Esc, scroll, resize). */
  onClose?: () => void;
  /** Dismiss on window scroll. Default true. Set false if the popover is fixed
   *  and shouldn't track page scroll. */
  dismissOnScroll?: boolean;
  /** Dismiss on window resize. Default true. */
  dismissOnResize?: boolean;
}

export interface UseDismissiblePopoverResult {
  open: boolean;
  setOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  /** Toggle open; closes (running onClose) if currently open. */
  toggle: () => void;
  /** Imperatively close (runs onClose). */
  close: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  popRef: React.RefObject<HTMLDivElement | null>;
  pos: PopoverPos;
}

export function useDismissiblePopover(
  opts: UseDismissiblePopoverOptions = {},
): UseDismissiblePopoverResult {
  const { minWidth = 240, autoFocusRef, onClose, dismissOnScroll = true, dismissOnResize = true } = opts;
  const [open, setOpenState] = useState(false);
  const [pos, setPos] = useState<PopoverPos>({ top: 0, left: 0, width: minWidth });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest onClose without re-subscribing the listeners each render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback(() => {
    setOpenState(false);
    onCloseRef.current?.();
  }, []);

  const toggle = useCallback(() => {
    setOpenState((o) => {
      if (o) onCloseRef.current?.();
      return !o;
    });
  }, []);

  // Position under the trigger + autofocus, re-run when `open` flips on.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, minWidth) });
    // The setTimeout(…,0) works around createPortal: the input isn't in the DOM
    // at the moment the layout effect runs, so focus is deferred one tick.
    if (autoFocusRef) {
      const t = setTimeout(() => autoFocusRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open, minWidth, autoFocusRef]);

  // Dismiss listeners: outside click, Esc, page scroll (but not the popover's
  // own internal list scroll), and resize.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    // A scroll event fires on the element that scrolled. If that element lives
    // inside the popover, this is the user scrolling the list — ignore it.
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && (popRef.current?.contains(t) || triggerRef.current?.contains(t))) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    if (dismissOnScroll) window.addEventListener('scroll', onScroll, true);
    if (dismissOnResize) window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      if (dismissOnScroll) window.removeEventListener('scroll', onScroll, true);
      if (dismissOnResize) window.removeEventListener('resize', close);
    };
  }, [open, close, dismissOnScroll, dismissOnResize]);

  return { open, setOpen: setOpenState, toggle, close, triggerRef, popRef, pos };
}
