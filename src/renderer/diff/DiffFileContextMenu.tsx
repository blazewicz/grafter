import { Code2, ExternalLink, FileText, Link2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  type ContextMenuPosition,
} from './ContextMenu';

export interface DiffFileContextMenuState extends ContextMenuPosition {
  fileId: string;
  path: string;
  githubUrl?: string;
  editorAvailable: boolean;
}

export function DiffFileContextMenu({
  state,
  onClose,
  onCopy,
  onOpenEditor,
  onOpenGitHub,
}: {
  state: DiffFileContextMenuState;
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
    <ContextMenu position={state} ariaLabel="Diff file actions" onClose={onClose}>
      <ContextMenuItem
        icon={<FileText size={14} />}
        label="Copy Relative Path"
        onClick={() => run(() => onCopy(state.path))}
      />
      {(state.editorAvailable || state.githubUrl) && <ContextMenuSeparator />}
      {state.editorAvailable && (
        <ContextMenuItem
          icon={<Code2 size={14} />}
          label="Open in VS Code"
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
