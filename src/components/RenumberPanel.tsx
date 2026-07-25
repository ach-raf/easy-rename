import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { extractIndex } from '../lib/match';
import type { RenumberOpts, RenumberResult, SeasonBlock } from '../lib/renumber';

interface PanelProps {
  opts: RenumberOpts;
  files: { name: string; path: string }[];
  onChange: (next: RenumberOpts) => void;
  summary: RenumberResult;
}

const CHIPS = ['(\\d+)', '(\\d{3})', 'E(\\d+)'];

/** Searchable file picker that writes the chosen file's absolute number. Mirrors SubPicker's portal pattern. */
function RenumberFileTrigger({ value, placeholder, files, pattern, onPick }: {
  value: number;
  placeholder: string;
  files: { name: string; path: string }[];
  pattern: string;
  onPick: (abs: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 260 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 260) });
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const close = () => { setOpen(false); setQuery(''); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    // Close when the PAGE (or another scroll container) scrolls out from under
    // the anchor — but NOT when the user scrolls the picker's own list. Scroll
    // events fire on the scrollable element (e.target); if that element lives
    // inside the popover, this is an internal scroll and must be ignored.
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && (popRef.current?.contains(t) || triggerRef.current?.contains(t))) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const current = value > 0 ? files.find((f) => extractIndex(f.name, pattern) === value) : undefined;
  const q = query.trim().toLowerCase();
  const list = files
    .map((f) => ({ f, abs: extractIndex(f.name, pattern) }))
    .filter((x) => x.abs !== null && (!q || x.f.name.toLowerCase().includes(q)));

  return (
    <>
      <button
        ref={triggerRef} type="button"
        className={'rn-file' + (value > 0 ? '' : ' empty')}
        aria-haspopup="listbox" aria-expanded={open}
        aria-label={value > 0 ? undefined : placeholder}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="nm">{current ? current.name : placeholder}</span>
        {value > 0 ? <span className="abs">abs {value}</span> : null}
        <Icon name="chevron" size={13} className="caret" />
      </button>

      {open ? createPortal(
        <div ref={popRef} className="picker-pop" role="listbox"
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width }}>
          <div className="picker-search">
            <Icon name="search" size={14} />
            <input ref={searchRef} type="text" placeholder="Search files…" value={query}
              onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="picker-list">
            {list.map(({ f, abs }) => (
              <div key={f.path} className={'picker-opt' + (value === abs ? ' cur' : '')}
                role="option" aria-selected={value === abs} title={f.name}
                onClick={() => { onPick(abs as number); close(); }}>
                <Icon name="file" size={15} />
                <span className="nm">{f.name}</span>
                <span className="rn-opt-abs">abs {abs}</span>
              </div>
            ))}
            {list.length === 0 ? <div className="picker-empty">No files with a number</div> : null}
          </div>
        </div>, document.body) : null}
    </>
  );
}

function SeasonRow({ block, index, files, pattern, pad, onChange, onRemove }: {
  block: SeasonBlock;
  index: number;
  files: { name: string; path: string }[];
  pattern: string;
  pad: number;
  onChange: (patch: Partial<SeasonBlock>) => void;
  onRemove: () => void;
}) {
  const pw = Math.max(1, pad);
  const padN = (n: number) => String(n).padStart(pw, '0');
  const ep = (abs: number) => block.startEp + (abs - block.fromAbs);
  const fromTok = block.fromAbs > 0 ? `S${padN(block.season)}E${padN(ep(block.fromAbs))}` : '—';
  const toTok = block.toAbs > 0 ? `S${padN(block.season)}E${padN(ep(block.toAbs))}` : '—';

  return (
    <div className="rn-season">
      <div className="rn-season-head">
        <span className="tag"><Icon name="layers" size={14} />Season</span>
        <input className="rn-season-num" type="number" min={0} value={block.season}
          aria-label={`Season number for block ${index + 1}`}
          onChange={(e) => onChange({ season: parseInt(e.target.value || '0', 10) })} />
        <button type="button" className="rn-del" aria-label={`Remove season ${index + 1}`} onClick={onRemove}>
          <Icon name="trash" size={15} />
        </button>
      </div>

      <div className="rn-line">
        <span className="k">First file (from)</span>
        <RenumberFileTrigger value={block.fromAbs} placeholder="Pick first file" files={files} pattern={pattern}
          onPick={(abs) => onChange({ fromAbs: abs })} />
      </div>
      <div className="rn-line">
        <span className="k">Last file (to)</span>
        <RenumberFileTrigger value={block.toAbs} placeholder="Pick last file" files={files} pattern={pattern}
          onPick={(abs) => onChange({ toAbs: abs })} />
      </div>

      <div className="rn-line">
        <span className="k">Episode at first file</span>
        <div className="rn-ep">
          <input className="text-input rn-num-input" type="number" min={0} value={block.startEp}
            aria-label={`Episode at first file for block ${index + 1}`}
            onChange={(e) => onChange({ startEp: parseInt(e.target.value || '0', 10) })} />
          <p className="hint">→ first file becomes <b>episode {padN(block.startEp)}</b> (season {padN(block.season)})</p>
        </div>
      </div>

      <div className="rn-endpoints">
        abs <span className="tok">{block.fromAbs > 0 ? block.fromAbs : '—'}</span> = <span className="tok">{fromTok}</span>
        <span className="sep">·</span>
        abs <span className="tok">{block.toAbs > 0 ? block.toAbs : '—'}</span> = <span className="tok">{toTok}</span>
      </div>
    </div>
  );
}

export function RenumberPanel({ opts, files, onChange, summary }: PanelProps) {
  const set = (patch: Partial<RenumberOpts>) => onChange({ ...opts, ...patch });
  const setBlock = (i: number, patch: Partial<SeasonBlock>) =>
    set({ seasons: opts.seasons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });
  const addSeason = () =>
    set({ seasons: [...opts.seasons, { season: opts.seasons.length + 1, fromAbs: 0, toAbs: 0, startEp: 1 }] });
  const removeSeason = (i: number) =>
    set({ seasons: opts.seasons.filter((_, idx) => idx !== i) });

  const withAbs = files.filter((f) => extractIndex(f.name, opts.pattern) !== null).length;

  return (
    <div className="depth-card rail-section rn-controls">
      <h3>Renumber · absolute → SxxEyy</h3>

      <div className="field">
        <label>Absolute-number pattern</label>
        <div className="rn-pattern">
          <Icon name="hash" size={15} className="lead-icon" />
          <input className="text-input" value={opts.pattern} spellCheck={false}
            aria-label="Absolute-number pattern"
            onChange={(e) => set({ pattern: e.target.value })} />
        </div>
        <p className="rn-mini">One capturing group · extracts the absolute number from <span className="num">{withAbs}</span> files.</p>
        <div className="presets">
          {CHIPS.map((c) => (
            <span key={c} className="preset">
              <button type="button" className={'apply' + (opts.pattern === c ? ' active' : '')}
                onClick={() => set({ pattern: c })}>{c}</button>
            </span>
          ))}
        </div>
      </div>

      <div className="rn-seasons-label"><span>Seasons</span></div>
      <div className="rn-seasons">
        {opts.seasons.map((b, i) => (
          <SeasonRow key={i} block={b} index={i} files={files} pattern={opts.pattern} pad={opts.pad}
            onChange={(patch) => setBlock(i, patch)} onRemove={() => removeSeason(i)} />
        ))}
        <button type="button" className="rn-add" onClick={addSeason}>
          <Icon name="plus" size={15} />Add season
        </button>
      </div>

      <div className="field">
        <label>Zero-pad width</label>
        <div className="rn-pad">
          <input className="text-input rn-num-input" type="number" min={1} max={6} value={opts.pad}
            aria-label="Zero-pad width"
            onChange={(e) => set({ pad: Math.max(1, parseInt(e.target.value || '1', 10)) })} />
          <p className="hint">Season &amp; episode padded (e.g. <span className="mono">S01E01</span>).</p>
        </div>
      </div>

      <div className="summary-row">
        <span className="badge badge-success">{summary.matched} matched</span>
        <span className="badge badge-neutral">{summary.unmatched} unmatched</span>
        <span className="badge badge-info">{summary.conflicts} conflicts</span>
      </div>
      {summary.error ? <p className="api-error">{summary.error}</p> : null}
      <p className="hint" style={{ margin: 0 }}>Files outside every season's range are left untouched.</p>
    </div>
  );
}
