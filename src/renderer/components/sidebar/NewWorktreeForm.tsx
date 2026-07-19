import { LoaderCircle, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GrafterApi, ProjectTreeItem } from '../../../shared/contracts';
import { api, friendlyError } from '../../grafter-api';
import controls from '../../styles/controls.module.css';
import { BranchPicker } from '../branches/BranchPicker';
import styles from './sidebar.module.css';

export function NewWorktreeForm({
  project,
  onCancel,
  onCreated,
  onError,
}: {
  project: ProjectTreeItem;
  onCancel: () => void;
  onCreated: (
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [branches, setBranches] = useState<string[]>([]);
  const [chosen, setChosen] = useState('');
  const [worktreePath, setWorktreePath] = useState('');
  const [creating, setCreating] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    void api
      .listBranches(project.id)
      .then(setBranches)
      .catch((error: unknown) => onErrorRef.current(friendlyError(error)))
      .finally(() => setLoadingBranches(false));
  }, [project.id]);

  const choose = (branch: string): void => {
    setChosen(branch);
    void api
      .suggestWorktreePath(project.id, branch)
      .then(setWorktreePath)
      .catch((error: unknown) => onError(friendlyError(error)));
  };

  const create = async (): Promise<void> => {
    if (!chosen || !worktreePath) return;
    setCreating(true);
    try {
      const result = await api.createWorktree({
        projectId: project.id,
        branch: chosen,
        path: worktreePath,
      });
      onCreated(result, { path: worktreePath });
    } catch (error) {
      onError(friendlyError(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.newWorktreeCard}>
      <BranchPicker
        branches={branches}
        worktrees={project.worktrees}
        selectedBranch={chosen}
        loading={loadingBranches}
        onQueryChange={() => {
          setChosen('');
          setWorktreePath('');
        }}
        onSelect={choose}
      />
      {chosen && (
        <label className={styles.pathInput}>
          <span>Path</span>
          <input
            value={worktreePath}
            onChange={(event) => setWorktreePath(event.target.value)}
          />
        </label>
      )}
      <div className={styles.formActions}>
        <button className={`${controls.button} ${controls.ghost}`} onClick={onCancel}>
          Cancel
        </button>
        <button
          className={`${controls.button} ${controls.primary}`}
          disabled={!chosen || creating}
          onClick={() => void create()}
        >
          {creating ? <LoaderCircle className="spin" size={13} /> : <Plus size={13} />}{' '}
          Create
        </button>
      </div>
    </div>
  );
}
