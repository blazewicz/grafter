import { X } from 'lucide-react';
import { useState } from 'react';
import type { AppSnapshot } from '../../../shared/contracts';

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
    <div className="modal-backdrop">
      <div
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-title">
          <div>
            <span>PREFERENCES</span>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button className="icon-button" aria-label="Close settings" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="settings-section">
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
        <div className="settings-section">
          <h3>Local setup overrides</h3>
          <p>
            These stay in Grafter’s app data and override a repository’s{' '}
            <code>.grafter.json</code>.
          </p>
          {snapshot.projects.length ? (
            snapshot.projects.map((project) => (
              <label key={project.id}>
                <span>{project.name}</span>
                <div className="inline-save">
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
                    className="button ghost"
                    onClick={() => onProjectSetup(project.id, scripts[project.id] ?? '')}
                  >
                    Save
                  </button>
                </div>
              </label>
            ))
          ) : (
            <div className="settings-empty">
              Add a project to configure its setup command.
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => onSave({ defaultWorktreePath: pathTemplate })}
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
