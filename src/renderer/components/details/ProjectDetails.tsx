import { FolderGit2 } from 'lucide-react';
import type { ProjectTreeItem } from '../../../shared/contracts';
import { WorktreeSummary } from './WorktreeSummary';

export function ProjectDetails({
  project,
}: {
  project: ProjectTreeItem;
}): React.JSX.Element {
  return (
    <div className="details-wrap">
      <div className="details-eyebrow">
        <FolderGit2 size={14} /> Git project
      </div>
      <div className="details-title-row">
        <div>
          <h1>{project.name}</h1>
          <p>
            {project.worktrees.length}{' '}
            {project.worktrees.length === 1 ? 'worktree' : 'worktrees'}
          </p>
        </div>
      </div>
      <section className="path-card">
        <div className="path-copy">
          <span className="section-label">MAIN CLONE</span>
          <code>{project.path}</code>
        </div>
      </section>
      <WorktreeSummary worktrees={project.worktrees} />
    </div>
  );
}
