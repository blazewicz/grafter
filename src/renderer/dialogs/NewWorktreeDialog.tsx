import { ChevronDown, LoaderCircle, Plus } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import type { GrafterApi, Project } from '../../shared/contracts';
import { api, friendlyError } from '../grafter-api';
import { BranchPicker } from '../branches/BranchPicker';
import controls from '../styles/controls.module.css';
import dialogStyles from '../dialogs/dialogs.module.css';

export function NewWorktreeDialog({
  project,
  onCancel,
  onCreated,
  onError,
}: {
  project: Project;
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
  const [pickerOpen, setPickerOpen] = useState(true);
  const pickerWrapRef = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const branchMenuId = useId();

  const onErrorEvent = useEffectEvent(onError);

  useEffect(() => {
    if (chosen) pathInputRef.current?.focus();
  }, [chosen]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onCancel]);

  useEffect(() => {
    if (!pickerOpen || !chosen) return;
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!pickerWrapRef.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [pickerOpen, chosen]);

  useEffect(() => {
    void api
      .listBranches()
      .then(setBranches)
      .catch((error: unknown) => onErrorEvent(friendlyError(error)))
      .finally(() => setLoadingBranches(false));
  }, [project.id]);

  const choose = (branch: string): void => {
    setChosen(branch);
    setPickerOpen(false);
    void api
      .suggestWorktreePath(branch)
      .then(setWorktreePath)
      .catch((error: unknown) => onError(friendlyError(error)));
  };

  const create = async (): Promise<void> => {
    if (!chosen || !worktreePath) return;
    setCreating(true);
    try {
      const result = await api.createWorktree({
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
    <div className={dialogStyles.modalBackdrop} onClick={onCancel}>
      <div
        className={`${dialogStyles.modal} ${dialogStyles.newWorktreeModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-worktree-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={dialogStyles.modalHeading}>
          <span>WORKTREES</span>
          <h2 id="new-worktree-title">New worktree</h2>
        </div>
        <div className={dialogStyles.branchPickerField}>
          <span className={controls.fieldLabel}>Branch</span>
          <div
            className={dialogStyles.branchPickerWrap}
            ref={pickerWrapRef}
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || !pickerOpen || !chosen) return;
              event.preventDefault();
              event.stopPropagation();
              setPickerOpen(false);
            }}
          >
            <button
              className={dialogStyles.branchTrigger}
              type="button"
              aria-label="Choose branch"
              aria-haspopup="menu"
              aria-expanded={pickerOpen}
              aria-controls={branchMenuId}
              onClick={() => {
                if (!chosen) return;
                setPickerOpen((open) => !open);
              }}
            >
              {chosen ? <code>{chosen}</code> : <span>Select a branch</span>}
              <ChevronDown size={13} />
            </button>
            {pickerOpen && (
              <div
                id={branchMenuId}
                className={dialogStyles.branchMenu}
                role="menu"
                aria-label="Branches"
              >
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
              </div>
            )}
          </div>
        </div>
        {chosen && (
          <label className={`${dialogStyles.pathInput} ${dialogStyles.newWorktreePath}`}>
            <span className={controls.fieldLabel}>Path</span>
            <input
              ref={pathInputRef}
              value={worktreePath}
              onChange={(event) => setWorktreePath(event.target.value)}
            />
          </label>
        )}
        <div className={dialogStyles.modalActions}>
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
    </div>
  );
}
