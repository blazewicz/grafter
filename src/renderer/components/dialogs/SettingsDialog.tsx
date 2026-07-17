import { X } from 'lucide-react';
import { useState } from 'react';
import type { AppSnapshot } from '../../../shared/contracts';
import controls from '../../styles/controls.module.css';
import styles from './dialogs.module.css';

export function SettingsDialog({
  snapshot,
  onClose,
  onSave,
  onProjectSetup,
}: {
  snapshot: AppSnapshot;
  onClose: () => void;
  onSave: (settings: AppSnapshot['settings']) => void;
  onProjectSetup: (projectId: string, script: string) => void;
}): React.JSX.Element {
  const [pathTemplate, setPathTemplate] = useState(snapshot.settings.defaultWorktreePath);
  const [scripts, setScripts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      snapshot.projects.map((project) => [project.id, project.setupScript ?? '']),
    ),
  );

  return (
    <div className={styles.modalBackdrop}>
      <div
        className={`${styles.modal} ${styles.settingsModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className={styles.settingsTitle}>
          <div>
            <span>PREFERENCES</span>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button
            className={controls.iconButton}
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className={styles.settingsSection}>
          <h3>Worktree location</h3>
          <p>
            Relative paths are resolved from the main clone. Use{' '}
            <code>&lt;repo_name&gt;</code> as a placeholder.
          </p>
          <label>
            <span>Default path</span>
            <input
              value={pathTemplate}
              onChange={(event) => setPathTemplate(event.target.value)}
            />
          </label>
        </div>
        <div className={styles.settingsSection}>
          <h3>Local setup overrides</h3>
          <p>
            These stay in Grafter’s app data and override a repository’s{' '}
            <code>.grafter.json</code>.
          </p>
          {snapshot.projects.length ? (
            snapshot.projects.map((project) => (
              <label key={project.id}>
                <span>{project.name}</span>
                <div className={styles.inlineSave}>
                  <input
                    placeholder="e.g. npm install"
                    value={scripts[project.id] ?? ''}
                    onChange={(event) =>
                      setScripts((current) => ({
                        ...current,
                        [project.id]: event.target.value,
                      }))
                    }
                  />
                  <button
                    className={`${controls.button} ${controls.ghost}`}
                    onClick={() => onProjectSetup(project.id, scripts[project.id] ?? '')}
                  >
                    Save
                  </button>
                </div>
              </label>
            ))
          ) : (
            <div className={styles.settingsEmpty}>
              Add a project to configure its setup command.
            </div>
          )}
        </div>
        <div className={styles.modalActions}>
          <button className={`${controls.button} ${controls.ghost}`} onClick={onClose}>
            Cancel
          </button>
          <button
            className={`${controls.button} ${controls.primary}`}
            onClick={() => onSave({ defaultWorktreePath: pathTemplate })}
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
