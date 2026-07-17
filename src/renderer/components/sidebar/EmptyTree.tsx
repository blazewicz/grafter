import { FolderGit2, Plus } from 'lucide-react';
import controls from '../../styles/controls.module.css';
import styles from './sidebar.module.css';

export function EmptyTree({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className={styles.emptyTree}>
      <FolderGit2 size={23} />
      <span>No projects yet</span>
      <p>Add the main clone of a Git repository.</p>
      <button className={`${controls.button} ${controls.subtle}`} onClick={onAdd}>
        <Plus size={13} /> Add project
      </button>
    </div>
  );
}
