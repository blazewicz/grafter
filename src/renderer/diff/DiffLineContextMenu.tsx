import { Code2, Copy, ExternalLink, FileText, Hash, Link2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  type ContextMenuPosition,
} from './ContextMenu';
import {
  diffLineReference,
  type DiffLineRange,
  type DiffLineTarget,
} from './diff-line-context';

export interface DiffLineContextMenuState extends ContextMenuPosition {
  copyText: string;
  fileId: string;
  lineId: string;
  range: DiffLineRange;
  target: DiffLineTarget;
  githubUrl?: string;
  editorAvailable: boolean;
}

export function DiffLineContextMenu({
  state,
  onClose,
  onCopy,
  onOpenEditor,
  onOpenGitHub,
}: {
  state: DiffLineContextMenuState;
  onClose: () => void;
  onCopy: (text: string) => void;
  onOpenEditor: () => void;
  onOpenGitHub: () => void;
}): React.JSX.Element {
  const run = (action: () => void): void => {
    onClose();
    action();
  };

  return (
    <ContextMenu position={state} ariaLabel="Diff line actions" onClose={onClose}>
      <ContextMenuItem
        icon={<Copy size={14} />}
        label="Copy"
        onClick={() => run(() => onCopy(state.copyText))}
      />
      <ContextMenuItem
        icon={<FileText size={14} />}
        label="Copy Relative Path"
        onClick={() => run(() => onCopy(state.target.path))}
      />
      <ContextMenuItem
        icon={<Hash size={14} />}
        label="Copy Line Reference"
        onClick={() => run(() => onCopy(diffLineReference(state.target, state.range)))}
      />
      {(state.editorAvailable || state.githubUrl) && <ContextMenuSeparator />}
      {state.editorAvailable && (
        <ContextMenuItem
          icon={<Code2 size={14} />}
          label="Open in VS Code at Line"
          onClick={() => run(onOpenEditor)}
        />
      )}
      {state.githubUrl && (
        <>
          <ContextMenuItem
            icon={<ExternalLink size={14} />}
            label="Open on GitHub"
            onClick={() => run(onOpenGitHub)}
          />
          <ContextMenuItem
            icon={<Link2 size={14} />}
            label="Copy GitHub Permalink"
            onClick={() => run(() => onCopy(state.githubUrl ?? ''))}
          />
        </>
      )}
    </ContextMenu>
  );
}
