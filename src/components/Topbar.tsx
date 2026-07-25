import { Dropzone } from './Dropzone';
import { Icon } from './icons';
import { ThemeControls } from './ThemeControls';

export type Mode = 'match' | 'searchReplace' | 'renumber';

interface Props {
  onFolder: (dir: string) => void;
  folder: string | null;
  mode?: Mode;
  onModeChange?: (mode: Mode) => void;
}

export function Topbar({ onFolder, folder, mode, onModeChange }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo"><Icon name="logo" size={17} /></span>
        Easy Rename
      </div>
      <Dropzone onFolder={onFolder} loaded={folder} />
      {mode && onModeChange ? (
        <div className="segmented mode-switch" role="radiogroup" aria-label="Rename mode">
          <span className="seg-label">Mode</span>
          <button
            type="button" role="radio" aria-checked={mode === 'match'}
            className={'seg' + (mode === 'match' ? ' active' : '')}
            onClick={() => onModeChange('match')}
          >Match Subtitles</button>
          <button
            type="button" role="radio" aria-checked={mode === 'searchReplace'}
            className={'seg' + (mode === 'searchReplace' ? ' active' : '')}
            onClick={() => onModeChange('searchReplace')}
          >Search &amp; Replace</button>
          <button
            type="button" role="radio" aria-checked={mode === 'renumber'}
            className={'seg' + (mode === 'renumber' ? ' active' : '')}
            onClick={() => onModeChange('renumber')}
          >Renumber</button>
        </div>
      ) : null}
      <ThemeControls />
    </header>
  );
}
