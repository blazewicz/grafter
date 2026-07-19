import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  FolderRoot,
  GitBranch,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo } from 'react';
import type { GrafterApi, ProjectTreeItem, Worktree } from '../../../shared/contracts';
import { displayWorktreePath } from '../../../shared/path-display';
import { buildWorktreeList } from '../../../shared/worktree-list';
import { NewWorktreeForm } from './NewWorktreeForm';
import { SidebarTooltip } from './SidebarTooltip';
import styles from './sidebar.module.css';

export function ProjectNode({
  homeDirectory,
  project,
  expanded,
  selectedId,
  adding,
  onToggle,
  onSelect,
  onAdd,
  onCancelAdd,
  onCreated,
  onRemoveProject,
  onRemoveWorktree,
  onError,
}: {
  homeDirectory: string;
  project: ProjectTreeItem;
  expanded: boolean;
  selectedId: string | undefined;
  adding: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onCancelAdd: () => void;
  onCreated: (
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onRemoveProject: () => void;
  onRemoveWorktree: (worktree: Worktree) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const worktreeItems = useMemo(
    () => buildWorktreeList(project.worktrees),
    [project.worktrees],
  );

  return (
    <div>
      <div
        className={`${styles.treeRow} ${styles.projectRow} ${
          selectedId === project.id ? styles.selected : ''
        }`}
      >
        <button
          className={styles.treeToggle}
          aria-label={expanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
          onClick={onToggle}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          className={styles.treeLabel}
          onClick={() => onSelect(project.id)}
          onPointerUp={releasePointerFocus}
        >
          <FolderGit2 size={15} />
          <span>{project.name}</span>
        </button>
        <div className={styles.rowActions}>
          <button
            aria-label={`Add worktree to ${project.name}`}
            title="New worktree"
            onClick={onAdd}
          >
            <Plus size={14} />
          </button>
          <button
            className={styles.dangerAction}
            aria-label={`Remove ${project.name} project`}
            title="Remove project"
            onClick={onRemoveProject}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {expanded && (
        <div>
          <div className={styles.branchList}>
            {worktreeItems.map(({ worktree, displayName }) => (
              <WorktreeRow
                key={worktree.id}
                homeDirectory={homeDirectory}
                mainClonePath={project.path}
                worktree={worktree}
                displayName={displayName}
                selected={selectedId === worktree.id}
                onSelect={onSelect}
                onRemoveWorktree={onRemoveWorktree}
              />
            ))}
          </div>
          {adding && (
            <NewWorktreeForm
              project={project}
              onCancel={onCancelAdd}
              onCreated={onCreated}
              onError={onError}
            />
          )}
        </div>
      )}
    </div>
  );
}

function WorktreeRow({
  homeDirectory,
  mainClonePath,
  worktree,
  displayName,
  selected,
  onSelect,
  onRemoveWorktree,
}: {
  homeDirectory: string;
  mainClonePath: string;
  worktree: Worktree;
  displayName: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onRemoveWorktree: (worktree: Worktree) => void;
}): React.JSX.Element {
  const displayedPath = displayWorktreePath(worktree.path, mainClonePath, homeDirectory);

  return (
    <div
      className={`${styles.treeRow} ${styles.branchRow} ${
        worktree.isMain ? styles.mainWorktreeRow : ''
      } ${selected ? styles.selected : ''}`}
    >
      <button
        className={styles.treeLabel}
        aria-label={
          worktree.isMain
            ? `Main worktree, checked out branch ${worktree.branch}`
            : `${displayName}, checked out branch ${worktree.branch}`
        }
        onClick={() => onSelect(worktree.id)}
        onPointerUp={releasePointerFocus}
      >
        {worktree.isMain ? <FolderRoot size={13} /> : <GitBranch size={13} />}
        <SidebarTooltip
          className={styles.worktreeNameWrap}
          label={displayName}
          labelClassName={styles.worktreeName}
          tooltip={worktree.isMain ? `Main worktree · ${displayedPath}` : displayedPath}
          data-worktree-path={worktree.path}
        />
        {(!worktree.isMain || worktree.branch !== 'main') && (
          <BranchName branch={worktree.branch} />
        )}
      </button>
      {!worktree.isMain && (
        <div className={styles.rowActions}>
          <button
            className={styles.dangerAction}
            aria-label={`Remove ${displayName} worktree`}
            title="Remove worktree"
            onClick={() => onRemoveWorktree(worktree)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function releasePointerFocus(event: React.PointerEvent<HTMLButtonElement>): void {
  event.currentTarget.blur();
}

function BranchName({ branch }: { branch: string }): React.JSX.Element {
  return (
    <SidebarTooltip
      className={styles.branchNameWrap}
      label={branch}
      labelClassName={styles.branchName}
      onlyWhenTruncated
      tooltip={branch}
      data-branch-name={branch}
    />
  );
}
