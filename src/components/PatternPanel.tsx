import { useState } from 'react';
import { extractIndex } from '../lib/match';
import type { MediaFile } from '../lib/match';
import type { Preset } from '../api';
import { Icon } from './icons';

interface Props {
  videoPattern: string;
  subPattern: string;
  linked: boolean;
  onVideoPattern: (p: string) => void;
  onSubPattern: (p: string) => void;
  onToggleLinked: () => void;
  shift: number;
  setShift: (n: number) => void;
  presets: Preset[];
  onSavePreset: (label: string) => void;
  onDeletePreset: (label: string) => void;
  onResetPresets: () => void;
  previewFiles?: MediaFile[];
  onAutoDetect?: () => void;
  onReMatch?: () => void;
}

function PresetRow({ presets, active, onApply, onDelete }: {
  presets: Preset[]; active: string; onApply: (p: string) => void; onDelete: (label: string) => void;
}) {
  return (
    <>
      {presets.map((p) => (
        <span className="preset" key={p.label}>
          <button type="button" className={'apply' + (p.pattern === active ? ' active' : '')} title={p.pattern} onClick={() => onApply(p.pattern)}>{p.pattern}</button>
          <button type="button" className="del" title="Delete preset" aria-label={`Delete preset ${p.label}`} onClick={() => onDelete(p.label)}>×</button>
        </span>
      ))}
    </>
  );
}

export function PatternPanel(props: Props) {
  const {
    videoPattern, subPattern, linked, onVideoPattern, onSubPattern, onToggleLinked,
    shift, setShift, presets, onSavePreset, onDeletePreset, onResetPresets,
    previewFiles, onAutoDetect, onReMatch,
  } = props;

  const [open, setOpen] = useState(false);
  const [savingName, setSavingName] = useState<string | null>(null);

  const confirmSave = () => {
    if (savingName && savingName.trim()) onSavePreset(savingName.trim());
    setSavingName(null);
  };

  const samples = (previewFiles ?? []).slice(0, 5);

  return (
    <div className="depth-card rail-section">
      <button
        type="button"
        className={'rail-hero-row pattern-pill' + (open ? ' active' : '')}
        style={{ padding: 0, border: 'none', background: open ? 'var(--accent-soft)' : 'none', boxShadow: 'none', width: '100%' }}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <h3 style={{ margin: 0 }}>Pattern</h3>
        <span className="badge badge-info" style={{ fontFamily: 'var(--mono)' }}>{videoPattern || '—'}</span>
        <span style={{ marginLeft: 'auto' }}><Icon name="chevron" size={16} className={open ? 'caret' : ''} /></span>
      </button>

      {open ? (
        <div className="pattern-panel open" style={{ marginTop: 12 }}>
          <div className="pattern-grid">
            <div className="field">
              <label>Video pattern</label>
              <input className="text-input" value={videoPattern} spellCheck={false}
                onChange={(e) => onVideoPattern(e.target.value)} placeholder={'e.g. S\\d+E(\\d+)'} />
              <div className="presets">
                <PresetRow presets={presets} active={videoPattern} onApply={onVideoPattern} onDelete={onDeletePreset} />
                {savingName === null ? (
                  <button type="button" className="depth-button-ghost preset-add" onClick={() => setSavingName('')}>
                    <Icon name="plus" size={13} /> Save
                  </button>
                ) : (
                  <input
                    className="text-input" autoFocus placeholder="preset name" value={savingName}
                    style={{ width: 120 }}
                    onChange={(e) => setSavingName(e.target.value)}
                    onBlur={confirmSave}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmSave(); if (e.key === 'Escape') setSavingName(null); }}
                  />
                )}
                <button type="button" className="depth-button-ghost" onClick={onResetPresets} title="Restore default presets">Reset</button>
              </div>
            </div>

            <div className="field">
              <div className={'sub-lock' + (linked ? ' locked' : '')}>
                <label>Subtitle pattern{linked ? ' · linked' : ''}</label>
                <input className="text-input" value={linked ? videoPattern : subPattern} disabled={linked} spellCheck={false}
                  onChange={(e) => onSubPattern(e.target.value)} placeholder={'e.g. E\\d+'} />
              </div>
              <label className="link-toggle">
                <input type="checkbox" checked={linked} onChange={onToggleLinked} />
                <span className="switch" />
                Same pattern for subtitles
              </label>
              {!linked ? (
                <div className="presets">
                  <PresetRow presets={presets} active={subPattern} onApply={onSubPattern} onDelete={onDeletePreset} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="field" style={{ maxWidth: 120 }}>
              <label>Shift</label>
              <input className="text-input" style={{ textAlign: 'center' }} type="number" value={shift}
                onChange={(e) => setShift(Number(e.target.value) || 0)} />
            </div>
            {onAutoDetect ? <button type="button" className="depth-button" onClick={onAutoDetect}><Icon name="sparkles" size={15} /> Auto-detect</button> : null}
            {onReMatch ? <button type="button" className="depth-button" onClick={onReMatch}><Icon name="refresh" size={15} /> Re-match</button> : null}
          </div>

          {samples.length > 0 ? (
            <div className="extract-preview depth-inset">
              {samples.map((f) => {
                const idx = extractIndex(f.name, videoPattern);
                return (
                  <div className="extract-row" key={f.id}>
                    <span className={'extract-idx' + (idx === null ? ' miss' : '')}>{idx === null ? '—' : idx}</span>
                    <span className="name">{f.name}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
