import { ChevronRight, Folder } from 'lucide-react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import type { DiffFileSummary } from '../../../shared/contracts';
import type { DiffTreeNode } from './diff-tree';
import { DiffFileStatusIcon } from './DiffFileStatusIcon';
import styles from './DiffViewer.module.css';

export function DiffFileTree({
  nodes,
  depth = 0,
  expanded,
  forceExpanded,
  activeFileId,
  contextFileId,
  onToggle,
  onSelect,
  onContextMenu,
}: {
  nodes: DiffTreeNode[];
  depth?: number;
  expanded: Set<string>;
  forceExpanded: boolean;
  activeFileId: string | undefined;
  contextFileId: string | undefined;
  onToggle: (path: string) => void;
  onSelect: (fileId: string) => void;
  onContextMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    file: DiffFileSummary,
  ) => void;
}): React.JSX.Element {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === 'directory') {
          const open = forceExpanded || expanded.has(node.path);
          return (
            <div key={`directory:${node.path}`}>
              <button
                className={styles.treeRow}
                style={{ '--tree-depth': depth } as CSSProperties}
                aria-expanded={open}
                onClick={() => onToggle(node.path)}
              >
                <ChevronRight className={styles.treeChevron} data-open={open} size={12} />
                <Folder size={13} />
                <span>{node.name}</span>
              </button>
              {open && (
                <DiffFileTree
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  forceExpanded={forceExpanded}
                  activeFileId={activeFileId}
                  contextFileId={contextFileId}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onContextMenu={onContextMenu}
                />
              )}
            </div>
          );
        }

        return (
          <button
            key={node.file.id}
            className={styles.treeRow}
            style={{ '--tree-depth': depth } as CSSProperties}
            data-active={node.file.id === activeFileId}
            data-context-menu-anchor={node.file.id === contextFileId}
            data-status={node.file.status}
            aria-current={node.file.id === activeFileId ? 'true' : undefined}
            title={node.file.path}
            onClick={() => onSelect(node.file.id)}
            onContextMenu={(event) => onContextMenu(event, node.file)}
          >
            <span className={styles.treeSpacer} />
            <DiffFileStatusIcon status={node.file.status} size={13} />
            <span>{node.name}</span>
          </button>
        );
      })}
    </>
  );
}
