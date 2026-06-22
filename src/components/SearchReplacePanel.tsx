import { Icon } from './icons';
import type { ApplyTo, SearchReplaceOpts, SearchReplaceResult } from '../lib/searchReplace';

interface Props {
  opts: SearchReplaceOpts;
  onChange: (next: SearchReplaceOpts) => void;
  summary: SearchReplaceResult;
}

const APPLY_TO: { value: ApplyTo; label: string }[] = [
  { value: 'both', label: 'Filename + extension' },
  { value: 'name', label: 'Filename only' },
  { value: 'ext', label: 'Extension only' },
];

export function SearchReplacePanel({ opts, onChange, summary }: Props) {
  const set = (patch: Partial<SearchReplaceOpts>) => onChange({ ...opts, ...patch });

  return (
    <div className="depth-card rail-section sr-controls">
      <h3>Search &amp; Replace</h3>

      <div className="sr-fields">
        <div className="field">
          <label>Search for</label>
          <div className="sr-input-wrap">
            <Icon name="search" size={15} className="lead-icon" />
            <input
              className="text-input"
              value={opts.search}
              onChange={(e) => set({ search: e.target.value })}
              placeholder="Text or regex"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="field">
          <label>Replace with</label>
          <input
            className="text-input"
            value={opts.replace}
            onChange={(e) => set({ replace: e.target.value })}
            placeholder="Replacement"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="sr-toggles">
        <label className="link-toggle">
          <input type="checkbox" checked={opts.useRegex} onChange={(e) => set({ useRegex: e.target.checked })} />
          <span className="switch" />Use regular expressions
        </label>
        <label className="link-toggle">
          <input type="checkbox" checked={opts.caseSensitive} onChange={(e) => set({ caseSensitive: e.target.checked })} />
          <span className="switch" />Case sensitive
        </label>
      </div>

      <div className="field">
        <label>Apply to</label>
        <select className="sub-select" value={opts.applyTo} onChange={(e) => set({ applyTo: e.target.value as ApplyTo })}>
          {APPLY_TO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="summary-row">
        <span className="badge badge-success">{summary.matched} matched</span>
        <span className="badge badge-neutral">{summary.unmatched} unmatched</span>
        <span className="badge badge-info">{summary.conflicts} conflicts</span>
      </div>

      {summary.error ? <p className="api-error">{summary.error}</p> : null}
      <p className="hint">Auto-saved — restored on next launch.</p>
    </div>
  );
}
