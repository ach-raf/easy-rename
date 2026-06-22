import { Dropzone } from './Dropzone';
import { Icon } from './icons';
import { ThemeControls } from './ThemeControls';

export function Topbar({ onFolder, folder }: { onFolder: (dir: string) => void; folder: string | null }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo"><Icon name="logo" size={17} /></span>
        Easy Rename
      </div>
      <Dropzone onFolder={onFolder} loaded={folder} />
      <ThemeControls />
    </header>
  );
}
