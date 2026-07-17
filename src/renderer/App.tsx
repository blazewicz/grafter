import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Circle,
  Code2,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCompareArrows,
  GitPullRequest,
  LoaderCircle,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSnapshot,
  ApprovalRequest,
  CommandRecord,
  GrafterApi,
  ProjectTreeItem,
  ToolName,
  Worktree,
  WorktreeDetails,
  WorktreeStatus,
} from '../shared/contracts';
import { previewApi } from './preview-api';

const api: GrafterApi = window.grafter ?? previewApi;
const worktreeStatusRefreshMs = 15_000;
type DialogName = 'settings' | null;

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '');
}

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [details, setDetails] = useState<WorktreeDetails>();
  const [worktreeStatusResult, setWorktreeStatusResult] = useState<{
    worktreeId: string;
    status: WorktreeStatus;
  }>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string>();
  const [approval, setApproval] = useState<ApprovalRequest>();
  const [dialog, setDialog] = useState<DialogName>(null);
  const [logsOpen, setLogsOpen] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const worktreeStatus =
    worktreeStatusResult && worktreeStatusResult.worktreeId === selectedId
      ? worktreeStatusResult.status
      : undefined;

  const applySnapshot = useCallback((next: AppSnapshot): void => {
    setSnapshot(next);
    setExpanded((current) => {
      if (current.size) return current;
      return new Set(next.projects.map((project) => project.id));
    });
    setSelectedId((current) => {
      if (current) return current;
      return (
        next.projects.flatMap((project) => project.worktrees)[1]?.id ??
        next.projects.flatMap((project) => project.worktrees)[0]?.id
      );
    });
  }, []);

  const run = useCallback(
    async <T,>(
      action: () => Promise<T>,
      onSuccess?: (result: T) => void,
    ): Promise<void> => {
      setBusy(true);
      setError(undefined);
      try {
        const result = await action();
        onSuccess?.(result);
      } catch (caught) {
        setError(friendlyError(caught));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void api
      .getSnapshot()
      .then((next) => {
        if (active) applySnapshot(next);
      })
      .catch((caught: unknown) => {
        if (active) setError(friendlyError(caught));
      });
    const unsubscribe = api.onCommandUpdate((record) => {
      if (!active) return;
      setSnapshot((current) =>
        current
          ? {
              ...current,
              commands: [
                record,
                ...current.commands.filter((item) => item.id !== record.id),
              ],
            }
          : current,
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [applySnapshot]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void api
      .getWorktreeDetails(selectedId)
      .then((next) => {
        if (active) setDetails(next);
      })
      .catch((caught: unknown) => {
        if (active) setError(friendlyError(caught));
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;

    let active = true;
    let refreshInFlight = false;
    let reportedError = false;
    let timeoutId: number | undefined;

    const clearScheduledRefresh = (): void => {
      if (timeoutId === undefined) return;
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    };

    const scheduleRefresh = (): void => {
      clearScheduledRefresh();
      if (!active || document.visibilityState !== 'visible') return;
      timeoutId = window.setTimeout(() => {
        void refreshStatus();
      }, worktreeStatusRefreshMs);
    };

    const refreshStatus = async (): Promise<void> => {
      if (!active || refreshInFlight || document.visibilityState !== 'visible') return;
      refreshInFlight = true;
      try {
        const next = await api.getWorktreeStatus(selectedId);
        if (active) setWorktreeStatusResult({ worktreeId: selectedId, status: next });
      } catch (caught) {
        if (active) {
          setWorktreeStatusResult((current) =>
            current?.worktreeId === selectedId ? undefined : current,
          );
          if (!reportedError) {
            reportedError = true;
            setError(friendlyError(caught));
          }
        }
      } finally {
        refreshInFlight = false;
        scheduleRefresh();
      }
    };

    const onVisibilityChange = (): void => {
      clearScheduledRefresh();
      if (document.visibilityState === 'visible') void refreshStatus();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void refreshStatus();

    return () => {
      active = false;
      clearScheduledRefresh();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [selectedId]);

  const chooseProject = (): void => {
    void run(
      () => api.chooseProject(),
      (next) => {
        if (next) applySnapshot(next);
      },
    );
  };

  const toggleProject = (projectId: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  if (!snapshot) return <Splash />;

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="drag-region" />
        <div className="app-mark">
          <BranchMark /> <span>Grafter</span>
        </div>
        <div className="title-context">
          <FolderGit2 size={14} />
          <span className="title-project">
            {details?.projectName ?? snapshot.projects[0]?.name ?? 'Worktrees'}
          </span>
          {details && (
            <>
              <ChevronRight size={13} />
              <span className="title-branch">{details.branch}</span>
            </>
          )}
        </div>
        <div className="title-actions no-drag">
          {busy && <LoaderCircle className="spin" size={14} />}
          <button
            className="icon-button"
            aria-label="Refresh repositories"
            onClick={() => void run(() => api.refresh(), applySnapshot)}
          >
            <RefreshCw size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Open settings"
            onClick={() => setDialog('settings')}
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <span>Projects</span>
            <button
              className="icon-button"
              aria-label="Add Git project"
              title="Add Git project"
              onClick={chooseProject}
            >
              <FolderOpen size={16} />
              <Plus className="corner-plus" size={9} />
            </button>
          </div>
          <div className="project-tree">
            {snapshot.projects.map((project) => (
              <ProjectNode
                key={project.id}
                project={project}
                expanded={expanded.has(project.id)}
                selectedId={selectedId}
                adding={addingTo === project.id}
                onToggle={() => toggleProject(project.id)}
                onSelect={setSelectedId}
                onAdd={() => {
                  setAddingTo(project.id);
                  setExpanded((current) => new Set(current).add(project.id));
                }}
                onCancelAdd={() => setAddingTo(undefined)}
                onCreated={(next, request) => {
                  applySnapshot(next.snapshot);
                  setAddingTo(undefined);
                  const created = next.snapshot.projects
                    .find((item) => item.id === project.id)
                    ?.worktrees.find((item) => item.path === request.path);
                  if (created) setSelectedId(created.id);
                  if (next.setupApproval) setApproval(next.setupApproval);
                }}
                onRemoveProject={() =>
                  void run(() => api.removeProject(project.id), applySnapshot)
                }
                onRemoveWorktree={(worktree) =>
                  void run(() => api.prepareRemoveWorktree(worktree.id), setApproval)
                }
                onError={(message) => setError(message)}
              />
            ))}
            {!snapshot.projects.length && <EmptyTree onAdd={chooseProject} />}
          </div>
          <button className="sidebar-settings" onClick={() => setDialog('settings')}>
            <SettingsIcon size={15} /> Settings
          </button>
        </aside>

        <main className="main-view">
          {details && details.id === selectedId ? (
            <Details details={details} status={worktreeStatus} />
          ) : selectedId ? (
            <DetailsLoading />
          ) : (
            <Welcome onAdd={chooseProject} />
          )}
        </main>
      </div>

      <AuditPanel
        open={logsOpen}
        commands={snapshot.commands}
        onToggle={() => setLogsOpen((value) => !value)}
      />

      {approval && (
        <ApprovalDialog
          request={approval}
          busy={busy}
          onReject={() =>
            void run(
              () => api.rejectCommand(approval.approvalId),
              (next) => {
                applySnapshot(next);
                setApproval(undefined);
              },
            )
          }
          onApprove={() =>
            void run(
              () => api.approveCommand(approval.approvalId),
              (next) => {
                applySnapshot(next);
                setApproval(undefined);
              },
            )
          }
        />
      )}
      {dialog === 'settings' && (
        <SettingsDialog
          snapshot={snapshot}
          onClose={() => setDialog(null)}
          onSave={(settings) =>
            void run(
              () => api.updateSettings(settings),
              (next) => {
                applySnapshot(next);
                setDialog(null);
              },
            )
          }
          onProjectSetup={(projectId, script) =>
            void run(() => api.updateProjectSetup(projectId, script), applySnapshot)
          }
        />
      )}
      {error && (
        <div className="toast">
          <AlertTriangle size={15} />
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError(undefined)}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectNode(props: {
  project: ProjectTreeItem;
  expanded: boolean;
  selectedId: string | undefined;
  adding: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onCancelAdd: () => void;
  onCreated: (
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onRemoveProject: () => void;
  onRemoveWorktree: (worktree: Worktree) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className="project-node"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <div className="tree-row project-row">
        <button className="tree-label" onClick={props.onToggle}>
          {props.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <FolderGit2 size={15} />
          <span>{props.project.name}</span>
        </button>
        <div className="row-actions">
          <button
            aria-label={`Add worktree to ${props.project.name}`}
            title="New worktree"
            onClick={props.onAdd}
          >
            <Plus size={14} />
          </button>
          <button
            aria-label={`More options for ${props.project.name}`}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
        {menuOpen && (
          <div className="context-menu">
            <button
              onClick={() => {
                setMenuOpen(false);
                props.onRemoveProject();
              }}
            >
              <Trash2 size={13} /> Remove project
            </button>
          </div>
        )}
      </div>
      {props.expanded && (
        <div className="tree-children">
          {props.project.worktrees.map((worktree) => (
            <div
              className={`tree-row worktree-row ${props.selectedId === worktree.id ? 'selected' : ''}`}
              key={worktree.id}
            >
              <button className="tree-label" onClick={() => props.onSelect(worktree.id)}>
                <GitBranch size={13} />
                <span>{worktree.branch}</span>
                {worktree.isMain && <span className="main-pill">main clone</span>}
              </button>
              {!worktree.isMain && (
                <div className="row-actions">
                  <button
                    aria-label={`Remove ${worktree.branch} worktree`}
                    title="Remove worktree"
                    onClick={() => props.onRemoveWorktree(worktree)}
                  >
                    <Minus size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {props.adding && (
            <NewWorktreeForm
              project={props.project}
              onCancel={props.onCancelAdd}
              onCreated={props.onCreated}
              onError={props.onError}
            />
          )}
        </div>
      )}
    </div>
  );
}

function NewWorktreeForm(props: {
  project: ProjectTreeItem;
  onCancel: () => void;
  onCreated: (
    result: Awaited<ReturnType<GrafterApi['createWorktree']>>,
    request: { path: string },
  ) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const { project, onError } = props;
  const [branches, setBranches] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState('');
  const [worktreePath, setWorktreePath] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    void api
      .listBranches(project.id)
      .then(setBranches)
      .catch((error: unknown) => onError(friendlyError(error)));
  }, [project.id, onError]);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return branches.filter((branch) => branch.toLowerCase().includes(needle)).slice(0, 7);
  }, [branches, query]);

  const choose = (branch: string): void => {
    setChosen(branch);
    setQuery(branch);
    void api
      .suggestWorktreePath(props.project.id, branch)
      .then(setWorktreePath)
      .catch((error: unknown) => props.onError(friendlyError(error)));
  };

  const create = async (): Promise<void> => {
    if (!chosen || !worktreePath) return;
    setCreating(true);
    try {
      const result = await api.createWorktree({
        projectId: props.project.id,
        branch: chosen,
        path: worktreePath,
      });
      props.onCreated(result, { path: worktreePath });
    } catch (error) {
      props.onError(friendlyError(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="new-worktree-card">
      <div className="input-with-icon">
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
      <div className="branch-results">
        {filtered.map((branch) => (
          <button
            key={branch}
            onClick={() => choose(branch)}
            className={chosen === branch ? 'chosen' : ''}
          >
            <GitBranch size={12} />
            <span>{branch}</span>
            {chosen === branch && <Check size={12} />}
          </button>
        ))}
        {!filtered.length && <div className="no-results">No matching branches</div>}
      </div>
      {chosen && (
        <label className="path-input">
          <span>Path</span>
          <input
            value={worktreePath}
            onChange={(event) => setWorktreePath(event.target.value)}
          />
        </label>
      )}
      <div className="form-actions">
        <button className="button ghost" onClick={props.onCancel}>
          Cancel
        </button>
        <button
          className="button primary"
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

function Details({
  details,
  status,
}: {
  details: WorktreeDetails;
  status: WorktreeStatus | undefined;
}): React.JSX.Element {
  return (
    <div className="details-wrap">
      <div className="details-eyebrow">
        <FolderGit2 size={14} /> {details.projectName}
      </div>
      <div className="details-title-row">
        <div>
          <h1>{details.branch}</h1>
          <p>{details.isMain ? 'Main working tree' : 'Linked worktree'}</p>
        </div>
        <span
          className={`clean-badge ${status ?? 'checking'}`}
          aria-live="polite"
          title={
            status === 'clean'
              ? 'No local changes'
              : status === 'dirty'
                ? 'Uncommitted local changes are present'
                : 'Checking for local changes'
          }
        >
          <Circle size={7} fill="currentColor" /> {status ?? 'checking'}
        </span>
      </div>
      <section className="path-card">
        <div>
          <span className="section-label">LOCAL PATH</span>
          <code>{details.path}</code>
        </div>
        <button
          title="Show in file manager"
          aria-label="Show worktree in file manager"
          onClick={() => void api.revealPath(details.path)}
        >
          <FolderOpen size={16} />
        </button>
      </section>
      <div className="section-heading">
        <div>
          <GitCompareArrows size={16} />
          <span>
            Changes against <strong>{details.targetBranch}</strong>
          </span>
        </div>
        <span className="commit-id">{details.head.slice(0, 8)}</span>
      </div>
      <section className="stats-grid">
        <div>
          <span>FILES CHANGED</span>
          <strong>{details.diff.files}</strong>
        </div>
        <div className="positive">
          <span>ADDITIONS</span>
          <strong>+{details.diff.additions}</strong>
        </div>
        <div className="negative">
          <span>DELETIONS</span>
          <strong>−{details.diff.deletions}</strong>
        </div>
      </section>
      {details.pullRequest ? (
        <section className="pr-card">
          <div className="pr-icon">
            <GitPullRequest size={20} />
          </div>
          <div className="pr-content">
            <div className="pr-meta">
              <span className="open-pill">{details.pullRequest.state}</span>
              <span>Pull request #{details.pullRequest.number}</span>
            </div>
            <strong>{details.pullRequest.title}</strong>
            <span>Base branch: {details.pullRequest.baseBranch}</span>
          </div>
          <button
            aria-label="Open pull request"
            onClick={() => void api.openExternal(details.pullRequest!.url)}
          >
            <ArrowUpRight size={17} />
          </button>
        </section>
      ) : (
        <section className="quiet-card">
          <GitBranch size={17} />
          <div>
            <strong>No pull request found</strong>
            <span>Grafter checked this branch using the GitHub CLI.</span>
          </div>
        </section>
      )}
      <section className="about-card">
        <ShieldCheck size={18} />
        <div>
          <strong>Every command stays visible</strong>
          <p>
            Git and GitHub operations for this worktree appear in the audit panel below.
            Scripts and destructive actions always wait for your approval.
          </p>
        </div>
      </section>
    </div>
  );
}

function AuditPanel({
  open,
  commands,
  onToggle,
}: {
  open: boolean;
  commands: CommandRecord[];
  onToggle: () => void;
}): React.JSX.Element {
  const [tool, setTool] = useState<ToolName>('git');
  const filtered = commands.filter((command) => command.tool === tool);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = filtered.find((command) => command.id === selectedId) ?? filtered[0];
  return (
    <section className={`audit-panel ${open ? 'open' : ''}`}>
      <div className="audit-header">
        <button className="audit-title" onClick={onToggle}>
          {open ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
          <TerminalSquare size={15} />
          <span>Command audit</span>
          <span className="audit-count">{commands.length}</span>
        </button>
        <div className="audit-tools">
          <select
            aria-label="Select command tool"
            value={tool}
            onChange={(event) => {
              setTool(event.target.value as ToolName);
              setSelectedId(undefined);
            }}
          >
            <option value="git">Git</option>
            <option value="github">GitHub CLI</option>
            <option value="shell">Setup scripts</option>
          </select>
        </div>
      </div>
      {open && (
        <div className="audit-body">
          <div className="command-list">
            {filtered.map((command) => (
              <button
                key={command.id}
                className={selected?.id === command.id ? 'active' : ''}
                onClick={() => setSelectedId(command.id)}
              >
                <StatusIcon status={command.status} />
                <div>
                  <span>{command.purpose}</span>
                  <code>{command.displayCommand}</code>
                </div>
                <time>
                  {new Date(command.startedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </button>
            ))}
            {!filtered.length && (
              <div className="no-commands">No {tool} commands yet.</div>
            )}
          </div>
          <div className="command-output">
            {selected ? (
              <>
                <div className="terminal-command">
                  <span>$</span> {selected.displayCommand}
                </div>
                <pre>
                  {selected.output.map((line) => line.text).join('') ||
                    (selected.status === 'running'
                      ? 'Running…'
                      : 'Command completed without output.')}
                </pre>
              </>
            ) : (
              <div className="terminal-empty">
                <Code2 size={18} />
                Command output will appear here
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ApprovalDialog({
  request,
  busy,
  onReject,
  onApprove,
}: {
  request: ApprovalRequest;
  busy: boolean;
  onReject: () => void;
  onApprove: () => void;
}): React.JSX.Element {
  return (
    <div className="modal-backdrop">
      <div
        className="modal approval-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
      >
        <div className="modal-icon warning">
          <AlertTriangle size={20} />
        </div>
        <div className="modal-heading">
          <span>APPROVAL REQUIRED</span>
          <h2 id="approval-title">Review command</h2>
          <p>{request.warning}</p>
        </div>
        <div className="approval-command">
          <div>
            <span>COMMAND</span>
            <code>{request.command.displayCommand}</code>
          </div>
          <div>
            <span>WORKING DIRECTORY</span>
            <code>{request.command.cwd}</code>
          </div>
        </div>
        <div className="approval-note">
          <ShieldCheck size={16} />
          <span>
            Approval applies only to this exact command. Any change requires a new review.
          </span>
        </div>
        <div className="modal-actions">
          <button className="button ghost" disabled={busy} onClick={onReject}>
            Don’t run
          </button>
          <button className="button danger" disabled={busy} onClick={onApprove}>
            {busy ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}{' '}
            Approve & run
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsDialog({
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

function StatusIcon({ status }: { status: CommandRecord['status'] }): React.JSX.Element {
  if (status === 'succeeded') return <Check className="status-ok" size={13} />;
  if (status === 'running')
    return <LoaderCircle className="spin status-running" size={13} />;
  if (status === 'awaiting-approval')
    return <ShieldCheck className="status-waiting" size={13} />;
  return <X className="status-error" size={13} />;
}

function BranchMark(): React.JSX.Element {
  return (
    <svg width="18" height="19" viewBox="0 0 18 19" fill="none" aria-hidden="true">
      <path
        d="M4 3v9.4c0 2 1.1 3.1 3 3.1h2.2c2 0 3-1.1 3-3.1V7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="4" cy="3" r="2" fill="currentColor" />
      <circle cx="12.2" cy="5.5" r="2" fill="currentColor" />
      <circle cx="4" cy="15.5" r="2" fill="currentColor" />
    </svg>
  );
}
function Splash(): React.JSX.Element {
  return (
    <div className="splash">
      <BranchMark />
      <span>Grafter</span>
    </div>
  );
}
function DetailsLoading(): React.JSX.Element {
  return (
    <div className="details-loading">
      <LoaderCircle className="spin" size={20} />
      <span>Inspecting worktree…</span>
    </div>
  );
}
function EmptyTree({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="empty-tree">
      <FolderGit2 size={23} />
      <span>No projects yet</span>
      <p>Add the main clone of a Git repository.</p>
      <button className="button subtle" onClick={onAdd}>
        <Plus size={13} /> Add project
      </button>
    </div>
  );
}
function Welcome({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="welcome">
      <div className="welcome-mark">
        <BranchMark />
      </div>
      <h1>Grow work without the clutter.</h1>
      <p>
        Add a Git project to create, inspect, and prune worktrees with every command in
        plain sight.
      </p>
      <button className="button primary" onClick={onAdd}>
        <FolderOpen size={14} /> Add a Git project
      </button>
    </div>
  );
}
