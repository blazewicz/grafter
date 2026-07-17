import { FolderOpen } from 'lucide-react';
import controls from '../../styles/controls.module.css';
import { BranchMark } from '../ui/BrandMarks';
import styles from './details.module.css';

export function Welcome({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className={styles.welcome}>
      <div className={styles.welcomeMark}>
        <BranchMark />
      </div>
      <h1>Grow work without the clutter.</h1>
      <p>
        Add a Git project to create, inspect, and prune worktrees with every command in
        plain sight.
      </p>
      <button className={`${controls.button} ${controls.primary}`} onClick={onAdd}>
        <FolderOpen size={14} /> Add a Git project
      </button>
    </div>
  );
}
