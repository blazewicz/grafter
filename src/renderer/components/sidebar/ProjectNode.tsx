import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  GitBranch,
  Minus,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  buildBranchHierarchy,
  type BranchHierarchyNode,
} from '../../../shared/branch-hierarchy';
import type { GrafterApi, ProjectTreeItem, Worktree } from '../../../shared/contracts';
import { NewWorktreeForm } from './NewWorktreeForm';
import styles from './sidebar.module.css';

export function ProjectNode({
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
  const [menuOpen, setMenuOpen] = useState(false);
  const branchHierarchy = useMemo(
    () => buildBranchHierarchy(project.worktrees),
    [project.worktrees],
  );

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeMenu = (): void => setMenuOpen(false);
    document.addEventListener('click', closeMenu);

    return () => document.removeEventListener('click', closeMenu);
  }, [menuOpen]);

  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
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
        <button className={styles.treeLabel} onClick={() => onSelect(project.id)}>
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
            aria-label={`More options for ${project.name}`}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((value) => !value);
            }}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
        {menuOpen && (
          <div className={styles.contextMenu}>
            <button
              onClick={() => {
                setMenuOpen(false);
                onRemoveProject();
              }}
            >
              <Trash2 size={13} /> Remove project
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <div>
          <div className={styles.branchList}>
            <BranchRows
              nodes={branchHierarchy}
              selectedId={selectedId}
              onSelect={onSelect}
              onRemoveWorktree={onRemoveWorktree}
            />
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

function BranchRows({
  nodes,
  selectedId,
  onSelect,
  onRemoveWorktree,
}: {
  nodes: BranchHierarchyNode[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onRemoveWorktree: (worktree: Worktree) => void;
}): React.JSX.Element {
  return (
    <>
      {nodes.map((node) => (
        <div className={styles.branchNode} key={node.id}>
          {node.worktree ? (
            <div
              className={`${styles.treeRow} ${styles.branchRow} ${
                selectedId === node.worktree.id ? styles.selected : ''
              }`}
            >
              <button
                className={styles.treeLabel}
                onClick={() => {
                  if (node.worktree) onSelect(node.worktree.id);
                }}
              >
                <GitBranch size={13} />
                <span className={styles.branchName} title={node.branch}>
                  {node.branch}
                </span>
                <span className={styles.worktreePill} title={node.worktree.path}>
                  {node.worktree.name}
                </span>
              </button>
              {!node.worktree.isMain && (
                <div className={styles.rowActions}>
                  <button
                    aria-label={`Remove ${node.branch} worktree`}
                    title="Remove worktree"
                    onClick={() => {
                      if (node.worktree) onRemoveWorktree(node.worktree);
                    }}
                  >
                    <Minus size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={`${styles.treeRow} ${styles.branchRow} ${styles.ghostRow}`}>
              <div className={styles.ghostLabel}>
                <GitBranch size={13} />
                <span className={styles.branchName} title={node.branch}>
                  {node.branch}
                </span>
                <span className={styles.ghostPill}>no workspace</span>
              </div>
            </div>
          )}
          {node.children.length > 0 && (
            <div className={styles.branchChildren}>
              <BranchRows
                nodes={node.children}
                selectedId={selectedId}
                onSelect={onSelect}
                onRemoveWorktree={onRemoveWorktree}
              />
            </div>
          )}
        </div>
      ))}
    </>
  );
}
