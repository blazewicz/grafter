import { FolderOpen } from 'lucide-react';
import { BranchMark } from '../ui/BrandMarks';

export function Welcome({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="welcome">
      <div className="welcome-mark">
        <BranchMark />
      </div>
      <h1>Grow work without the clutter.</h1>
      <p>
        Add a Git project to create, inspect, and prune worktrees with every command in
        plain sight.
      </p>
      <button className="button primary" onClick={onAdd}>
        <FolderOpen size={14} /> Add a Git project
      </button>
    </div>
  );
}
