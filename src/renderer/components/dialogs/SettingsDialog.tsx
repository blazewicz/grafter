import { X } from 'lucide-react';
import { useState } from 'react';
import type {
  AppSnapshot,
  DateFormatPreference,
  TimeFormatPreference,
} from '../../../shared/contracts';
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
  const [dateFormat, setDateFormat] = useState(snapshot.settings.dateFormat);
  const [timeFormat, setTimeFormat] = useState(snapshot.settings.timeFormat);
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
          <h3>Date and time</h3>
          <p>
            System default follows your operating system’s regional preferences. If they
            cannot be detected, Grafter uses DD/MM/YYYY and a 24-hour clock.
          </p>
          <div className={styles.settingsGrid}>
            <label>
              <span>Date format</span>
              <select
                value={dateFormat}
                onChange={(event) =>
                  setDateFormat(event.target.value as DateFormatPreference)
                }
              >
                <option value="system">System default</option>
                <option value="day-month-year">DD/MM/YYYY</option>
                <option value="month-day-year">MM/DD/YYYY</option>
                <option value="year-month-day">YYYY-MM-DD</option>
              </select>
            </label>
            <label>
              <span>Clock</span>
              <select
                value={timeFormat}
                onChange={(event) =>
                  setTimeFormat(event.target.value as TimeFormatPreference)
                }
              >
                <option value="system">System default</option>
                <option value="24-hour">24-hour</option>
                <option value="12-hour">12-hour</option>
              </select>
            </label>
          </div>
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
            onClick={() =>
              onSave({
                defaultWorktreePath: pathTemplate,
                dateFormat,
                timeFormat,
              })
            }
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
