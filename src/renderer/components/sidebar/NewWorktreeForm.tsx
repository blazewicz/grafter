import { Check, GitBranch, LoaderCircle, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GrafterApi, ProjectTreeItem } from '../../../shared/contracts';
import { api, friendlyError } from '../../grafter-api';
import controls from '../../styles/controls.module.css';
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
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState('');
  const [worktreePath, setWorktreePath] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    void api
      .listBranches(project.id)
      .then(setBranches)
      .catch((error: unknown) => onErrorRef.current(friendlyError(error)));
  }, [project.id]);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return branches.filter((branch) => branch.toLowerCase().includes(needle)).slice(0, 7);
  }, [branches, query]);

  const choose = (branch: string): void => {
    setChosen(branch);
    setQuery(branch);
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
      <div className={styles.inputWithIcon}>
        <Search size={13} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setChosen('');
          }}
          placeholder="Filter branches…"
        />
      </div>
      <div className={styles.branchResults}>
        {filtered.map((branch) => (
          <button
            key={branch}
            onClick={() => choose(branch)}
            className={chosen === branch ? styles.chosen : ''}
          >
            <GitBranch size={12} />
            <span>{branch}</span>
            {chosen === branch && <Check size={12} />}
          </button>
        ))}
        {!filtered.length && <div className={styles.noResults}>No matching branches</div>}
      </div>
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
