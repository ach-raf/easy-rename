import { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { extractIndex } from '../lib/match';
import { splitRelative } from '../lib/path';
import { FilePath } from './FilePath';
import { Icon } from './icons';
import { SubPicker } from './SubPicker';
import { VirtualList } from './VirtualList';
import { useDismissiblePopover } from '../lib/useDismissiblePopover';
import type { MediaFile, Row } from '../lib/match';

interface Props {
  rows: Row[];
  allSubs: MediaFile[];
  pattern: string;
  folder: string;
  onReassign: (videoId: string, sub: MediaFile | null) => void;
  onAutoAssignAll: () => void;
  onUnassignAll: () => void;
  onToggleLock: (videoId: string) => void;
}

function PairsKebab({ onAutoAssignAll, onUnassignAll }: { onAutoAssignAll: () => void; onUnassignAll: () => void }) {
  // The kebab is a non-portal dropdown anchored in the header. It uses the
  // shared dismiss hook (outside-click + Esc) but skips scroll/resize dismissal
  // — the menu is small and staying open during list scroll is fine. No anchor
  // positioning is needed (it's in normal flow, not a portal), so `pos` is
  // unused; `triggerRef` + `popRef` drive the outside-click check.
  const { open, toggle, setOpen, triggerRef, popRef } = useDismissiblePopover({ dismissOnScroll: false, dismissOnResize: false });
  return (
    <span className="pairs-actions">
      <button ref={triggerRef} type="button" className="pairs-kebab" aria-expanded={open} aria-haspopup="true"
        aria-label="Bulk actions" title="Bulk actions" onClick={toggle}>
        <Icon name="more" />
      </button>
      {open ? (
        <div ref={popRef} className="pairs-menu">
          <button type="button" className="pairs-menu-item"
            onClick={() => { onAutoAssignAll(); setOpen(false); }}>
            <Icon name="sparkles" /> Auto-assign all
          </button>
          <div className="pairs-menu-hint">Fill empty rows with the best-guess match.</div>
          <div className="pairs-menu-sep" />
          <button type="button" className="pairs-menu-item danger"
            onClick={() => { onUnassignAll(); setOpen(false); }}>
            <Icon name="eraser" /> Unassign all
          </button>
          <div className="pairs-menu-hint">Clear every link — locked rows unlock too.</div>
        </div>
      ) : null}
    </span>
  );
}

function RowItem({ row, allRows, allSubs, pattern, folder, onReassign, onToggleLock }: {
  row: Row;
  allRows: Row[];
  allSubs: MediaFile[];
  pattern: string;
  folder: string;
  onReassign: (videoId: string, sub: MediaFile | null) => void;
  onToggleLock: (videoId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'row:' + row.video.id, data: { videoId: row.video.id } });
  const idx = extractIndex(row.video.name, pattern);
  const matched = !!row.sub;
  const vRel = splitRelative(row.video.path, folder);
  const hiddenElsewhere = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) if (r.video.id !== row.video.id && r.sub) set.add(r.sub.id);
    return set;
  }, [allRows, row.video.id]);
  return (
    <div ref={setNodeRef} className={'pair-row' + (matched ? ' matched' : '') + (row.locked ? ' locked' : '') + (isOver ? ' over' : '')}>
      <div className={'idx' + (idx === null ? ' warn' : '')}>{idx === null ? '—' : idx}</div>
      <div className="cell video">
        <Icon name="video" />
        <FilePath dir={vRel.dir} base={vRel.base} abs={row.video.path} />
      </div>
      <div className="arrow"><Icon name="arrow" size={14} /></div>
      <div className="cell sub-cell">
        <SubPicker
          current={row.sub}
          allSubs={allSubs}
          hiddenSubIds={hiddenElsewhere}
          locked={row.locked}
          onSelect={(sub) => onReassign(row.video.id, sub)}
          onUnlink={() => onReassign(row.video.id, null)}
          onToggleLock={() => onToggleLock(row.video.id)}
        />
      </div>
      <div className="row-state"><span className={'dot ' + (matched ? 'success' : 'warn')} /></div>
    </div>
  );
}

export function PairList({ rows, allSubs, pattern, folder, onReassign, onAutoAssignAll, onUnassignAll, onToggleLock }: Props) {
  return (
    <div className="pairs">
      <div className="pairs-head">
        <h2 className="pairs-title">Match subtitles to videos</h2>
        <PairsKebab onAutoAssignAll={onAutoAssignAll} onUnassignAll={onUnassignAll} />
      </div>
      <div className="pairs-grid-head"><div>#</div><div>Video</div><div></div><div>Subtitle</div><div></div></div>
      <VirtualList items={rows} getKey={(r) => r.video.id}>
        {(r) => (
          <RowItem row={r} allRows={rows} allSubs={allSubs} pattern={pattern}
            folder={folder} onReassign={onReassign} onToggleLock={onToggleLock} />
        )}
      </VirtualList>
    </div>
  );
}
