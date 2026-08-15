import { FolderOpen } from 'lucide-react';
import type { Project } from '../../shared/contracts';
import styles from './sidebar.module.css';

export function RepositoryIdentity({
  repository,
  selected,
  onSelect,
}: {
  repository: Project;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <div className={`${styles.repositoryIdentity} ${selected ? styles.selected : ''}`}>
      <button
        className={styles.repositoryIdentityButton}
        aria-label={`${repository.name} repository details`}
        aria-current={selected ? 'page' : undefined}
        title={`Open ${repository.name} repository details`}
        onClick={onSelect}
      >
        <FolderOpen size={16} />
        <span>{repository.name}</span>
      </button>
    </div>
  );
}
