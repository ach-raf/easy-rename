import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import type { MediaFile } from '../lib/match';

interface Props {
  current: MediaFile | null;
  allSubs: MediaFile[];
  hiddenSubIds: Set<string>;
  locked: boolean;
  onSelect: (sub: MediaFile) => void;
  onUnlink: () => void;
  onToggleLock: () => void;
}

export function SubPicker({ current, allSubs, hiddenSubIds, locked, onSelect, onUnlink, onToggleLock }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240 });

  // Anchor the portal under the trigger whenever it opens.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) });
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Close on outside click, Esc, or any scroll/resize.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const close = () => { setOpen(false); setQuery(''); setShowHidden(false); };
  const pick = (sub: MediaFile) => { onSelect(sub); close(); };

  const q = query.trim().toLowerCase();
  const visible = allSubs.filter((x) => !hiddenSubIds.has(x.id) && (!q || x.name.toLowerCase().includes(q)));
  const hiddenList = showHidden ? allSubs.filter((x) => hiddenSubIds.has(x.id) && (!q || x.name.toLowerCase().includes(q))) : [];
  const hiddenCount = allSubs.filter((x) => hiddenSubIds.has(x.id)).length;

  return (
    <span className={'sub-picker ' + (current ? 'is-assigned' : 'is-empty')} data-open={open ? 'true' : 'false'}>
      <button
        ref={triggerRef} type="button" className="sp-trigger"
        aria-haspopup="listbox" aria-expanded={open}
        title={current?.name ?? 'Assign subtitle…'}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {current ? <Icon name="captions" /> : null}
        <span className="sp-label">{current ? current.name : 'Assign subtitle…'}</span>
        <Icon name="chevron" className="sp-caret" />
      </button>

      {current ? (
        <span className="sp-actions">
          <button type="button" className={'sp-iconbtn lock-btn' + (locked ? ' on' : '')}
            aria-label={locked ? 'Locked — survives re-match' : 'Lock this override'}
            title={locked ? 'Locked — survives re-match' : 'Lock this override'}
            onClick={onToggleLock}>
            <Icon name={locked ? 'lock' : 'unlock'} />
          </button>
          <button type="button" className="sp-iconbtn sp-x" aria-label="Unlink" title="Unlink"
            onClick={() => { onUnlink(); close(); }}>
            <Icon name="x" />
          </button>
        </span>
      ) : null}

      {open ? createPortal(
        <div ref={popRef} className="picker-pop" role="listbox"
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width }}>
          <div className="picker-search">
            <Icon name="search" />
            <input ref={searchRef} type="text" placeholder="Search subtitles…" value={query}
              onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="picker-list">
            {visible.map((sub) => (
              <div key={sub.id} className={'picker-opt' + (current?.id === sub.id ? ' cur' : '')}
                role="option" aria-selected={current?.id === sub.id} title={sub.name} onClick={() => pick(sub)}>
                <Icon name="captions" /><span className="nm">{sub.name}</span>
                {current?.id === sub.id ? <Icon name="check" /> : null}
              </div>
            ))}
            {visible.length === 0 && hiddenList.length === 0 ? <div className="picker-empty">No matches</div> : null}
            {hiddenList.map((sub) => (
              <div key={sub.id} className="picker-opt hidden-opt" role="option"
                title={sub.name + ' (assigned elsewhere — picking swaps rows)'} onClick={() => pick(sub)}>
                <Icon name="captions" /><span className="nm">{sub.name}</span>
              </div>
            ))}
          </div>
          {hiddenCount > 0 ? (
            <div className="picker-foot">
              <span>✓ {hiddenCount} already assigned — hidden</span>
              <button type="button" className="pill-toggle" onClick={() => setShowHidden((v) => !v)}>{showHidden ? 'Hide' : 'Show'}</button>
            </div>
          ) : null}
        </div>, document.body) : null}
    </span>
  );
}
