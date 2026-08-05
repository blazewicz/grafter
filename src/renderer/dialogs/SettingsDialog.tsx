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

function ProjectSetupOverride({
  project,
  script,
  onChange,
  onSave,
}: {
  project: Project;
  script: string;
  onChange: (projectId: string, script: string) => void;
  onSave: (projectId: string, script: string) => void;
}): React.JSX.Element {
  const inputId = `project-setup-${project.id}`;

  return (
    <div>
      <label htmlFor={inputId}>
        <span>{project.name}</span>
      </label>
      <div className={styles.inlineSave}>
        <input
          id={inputId}
          placeholder="e.g. npm install"
          value={script}
          onChange={(event) => onChange(project.id, event.target.value)}
        />
        <button
          className={`${controls.button} ${controls.ghost}`}
          aria-label={`Save setup override for ${project.name}`}
          onClick={() => onSave(project.id, script)}
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
  onProjectSetup,
}: {
  settings: Settings;
  repository: Project;
  onClose: () => void;
  onSave: (settings: Settings) => void;
  onProjectSetup: (projectId: string, script: string) => void;
}): React.JSX.Element {
  const [pathTemplate, setPathTemplate] = useState(settings.defaultWorktreePath);
  const [dateFormat, setDateFormat] = useState(settings.dateFormat);
  const [timeFormat, setTimeFormat] = useState(settings.timeFormat);
  const [scripts, setScripts] = useState<Record<string, string>>(() => ({
    [repository.id]: repository.setupScript ?? '',
  }));

  function handleProjectScriptChange(projectId: string, script: string): void {
    setScripts((current) => ({
      ...current,
      [projectId]: script,
    }));
  }

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
          <ProjectSetupOverride
            project={repository}
            script={scripts[repository.id] ?? ''}
            onChange={handleProjectScriptChange}
            onSave={onProjectSetup}
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
