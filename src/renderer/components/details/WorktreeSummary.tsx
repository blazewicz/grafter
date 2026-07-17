import { FolderGit2, GitBranch } from 'lucide-react';
import type { Worktree } from '../../../shared/contracts';

export function WorktreeSummary({
  worktrees,
  selectedId,
}: {
  worktrees: Worktree[];
  selectedId?: string;
}): React.JSX.Element {
  return (
    <>
      <div className="section-heading">
        <div>
          <FolderGit2 size={16} />
          <span>Project worktrees</span>
        </div>
        <span className="worktree-count">
          {worktrees.length} {worktrees.length === 1 ? 'worktree' : 'worktrees'}
        </span>
      </div>
      <section className="worktree-summary" aria-label="Project worktrees">
        {worktrees.map((worktree) => (
          <div
            className={`worktree-summary-row ${worktree.id === selectedId ? 'current' : ''}`}
            key={worktree.id}
          >
            <div className="worktree-summary-path">
              <span>{worktree.isMain ? 'Main working tree' : 'Linked worktree'}</span>
              <code title={worktree.path}>{worktree.path}</code>
            </div>
            <div className="worktree-summary-branch">
              <GitBranch size={13} />
              <span>{worktree.branch}</span>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
