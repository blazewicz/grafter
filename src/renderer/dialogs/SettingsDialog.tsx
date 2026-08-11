import { X } from 'lucide-react';
import { useState } from 'react';
import type {
  DateFormatPreference,
  Project,
  Settings,
  TimeFormatPreference,
} from '../../shared/contracts';
import controls from '../styles/controls.module.css';
import styles from './dialogs.module.css';

function RepositorySetupOverride({
  repository,
  script,
  onChange,
  onSave,
}: {
  repository: Project;
  script: string;
  onChange: (script: string) => void;
  onSave: (script: string) => void;
}): React.JSX.Element {
  const inputId = `repository-setup-${repository.id}`;

  return (
    <div>
      <label htmlFor={inputId}>
        <span className={controls.fieldLabel}>{repository.name}</span>
      </label>
      <div className={styles.inlineSave}>
        <input
          id={inputId}
          placeholder="e.g. npm install"
          value={script}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className={`${controls.button} ${controls.ghost}`}
          aria-label={`Save setup override for ${repository.name}`}
          onClick={() => onSave(script)}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function SettingsDialog({
  settings,
  repository,
  onClose,
  onSave,
  onRepositorySetup,
}: {
  settings: Settings;
  repository: Project;
  onClose: () => void;
  onSave: (settings: Settings) => void;
  onRepositorySetup: (script: string) => void;
}): React.JSX.Element {
  const [pathTemplate, setPathTemplate] = useState(settings.defaultWorktreePath);
  const [dateFormat, setDateFormat] = useState(settings.dateFormat);
  const [timeFormat, setTimeFormat] = useState(settings.timeFormat);
  const [setupScript, setSetupScript] = useState(repository.setupScript ?? '');

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
            Relative paths are resolved from the repository’s main worktree. Use{' '}
            <code>&lt;repo_name&gt;</code> as a placeholder.
          </p>
          <label>
            <span className={controls.fieldLabel}>Default path</span>
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
              <span className={controls.fieldLabel}>Date format</span>
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
              <span className={controls.fieldLabel}>Clock</span>
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
          <RepositorySetupOverride
            repository={repository}
            script={setupScript}
            onChange={setSetupScript}
            onSave={onRepositorySetup}
          />
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
