import { FolderGit2, Plus } from 'lucide-react';

export function EmptyTree({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="empty-tree">
      <FolderGit2 size={23} />
      <span>No projects yet</span>
      <p>Add the main clone of a Git repository.</p>
      <button className="button subtle" onClick={onAdd}>
        <Plus size={13} /> Add project
      </button>
    </div>
  );
}
