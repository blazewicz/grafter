import {
  ChevronRight,
  FolderGit2,
  LoaderCircle,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { BranchMark } from '../ui/BrandMarks';

export function AppTitlebar({
  projectName,
  branchName,
  busy,
  onRefresh,
  onOpenSettings,
}: {
  projectName: string;
  branchName: string | undefined;
  busy: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
}): React.JSX.Element {
  return (
    <header className="titlebar">
      <div className="drag-region" />
      <div className="app-mark">
        <BranchMark /> <span>Grafter</span>
      </div>
      <div className="title-context">
        <FolderGit2 size={14} />
        <span className="title-project">{projectName}</span>
        {branchName && (
          <>
            <ChevronRight size={13} />
            <span className="title-branch">{branchName}</span>
          </>
        )}
      </div>
      <div className="title-actions no-drag">
        {busy && <LoaderCircle className="spin" size={14} />}
        <button
          className="icon-button"
          aria-label="Refresh repositories"
          onClick={onRefresh}
        >
          <RefreshCw size={15} />
        </button>
        <button
          className="icon-button"
          aria-label="Open settings"
          onClick={onOpenSettings}
        >
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
