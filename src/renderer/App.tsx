import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppSnapshot, ApprovalRequest, CommandContext } from '../shared/contracts';
import { AuditPanel } from './components/audit/AuditPanel';
import { useCommandLogs } from './components/audit/useCommandLogs';
import { MainView } from './components/details/MainView';
import { useWorktreeInspection } from './components/details/useWorktreeInspection';
import { ApprovalDialog } from './components/dialogs/ApprovalDialog';
import { SettingsDialog } from './components/dialogs/SettingsDialog';
import { ErrorToast } from './components/feedback/ErrorToast';
import { AppTitlebar } from './components/shell/AppTitlebar';
import { Splash } from './components/shell/Splash';
import { ProjectSidebar } from './components/sidebar/ProjectSidebar';
import { api, friendlyError } from './grafter-api';
import styles from './App.module.css';

type DialogName = 'settings' | null;

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [approval, setApproval] = useState<ApprovalRequest>();
  const [dialog, setDialog] = useState<DialogName>(null);
  const [logsOpen, setLogsOpen] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const selectedProject = snapshot?.projects.find((project) => project.id === selectedId);
  const selectedWorktree = snapshot?.projects
    .flatMap((project) => project.worktrees)
    .find((worktree) => worktree.id === selectedId);
  const activeProject =
    selectedProject ??
    snapshot?.projects.find((project) => project.id === selectedWorktree?.projectId);
  const selectedProjectId = selectedProject?.id;
  const selectedWorktreeId = selectedWorktree?.id;
  const selectedWorktreeProjectId = selectedWorktree?.projectId;
  const selectedContext = useMemo<CommandContext | undefined>(() => {
    if (selectedWorktreeId && selectedWorktreeProjectId) {
      return {
        kind: 'worktree',
        projectId: selectedWorktreeProjectId,
        worktreeId: selectedWorktreeId,
      };
    }
    if (selectedProjectId) return { kind: 'project', projectId: selectedProjectId };
    return undefined;
  }, [selectedProjectId, selectedWorktreeId, selectedWorktreeProjectId]);
  const { commands, contextKey: selectedContextKey } = useCommandLogs(
    selectedContext,
    setError,
  );
  const { details, status: worktreeStatus } = useWorktreeInspection(
    selectedWorktreeId,
    setError,
  );
  const projectWorktrees = details
    ? (snapshot?.projects.find((project) => project.id === details.projectId)
        ?.worktrees ?? [details])
    : [];

  const applySnapshot = useCallback((next: AppSnapshot): void => {
    setSnapshot(next);
    setExpanded((current) => {
      if (current.size) return current;
      return new Set(next.projects.map((project) => project.id));
    });
    setSelectedId((current) => {
      const available = new Set([
        ...next.projects.map((project) => project.id),
        ...next.projects.flatMap((project) =>
          project.worktrees.map((worktree) => worktree.id),
        ),
      ]);
      if (current && available.has(current)) return current;
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
    return () => {
      active = false;
    };
  }, [applySnapshot]);

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
    <div className={styles.appShell}>
      <AppTitlebar
        projectName={activeProject?.name ?? snapshot.projects[0]?.name ?? 'Worktrees'}
        branchName={selectedWorktree?.branch}
        busy={busy}
        onRefresh={() => void run(() => api.refresh(), applySnapshot)}
        onOpenSettings={() => setDialog('settings')}
      />

      <div className={styles.workspace}>
        <ProjectSidebar
          projects={snapshot.projects}
          selectedId={selectedId}
          expanded={expanded}
          onSelect={setSelectedId}
          onToggleProject={toggleProject}
          onExpandProject={(projectId) =>
            setExpanded((current) => new Set(current).add(projectId))
          }
          onChooseProject={chooseProject}
          onCreated={(projectId, next, request) => {
            applySnapshot(next.snapshot);
            const created = next.snapshot.projects
              .find((project) => project.id === projectId)
              ?.worktrees.find((worktree) => worktree.path === request.path);
            if (created) setSelectedId(created.id);
            if (next.setupApproval) setApproval(next.setupApproval);
          }}
          onRemoveProject={(projectId) =>
            void run(() => api.removeProject(projectId), applySnapshot)
          }
          onRemoveWorktree={(worktree) =>
            void run(() => api.prepareRemoveWorktree(worktree.id), setApproval)
          }
          onOpenSettings={() => setDialog('settings')}
          onError={setError}
        />

        <MainView
          selectedProject={selectedProject}
          selectedWorktree={selectedWorktree}
          details={details}
          projectWorktrees={projectWorktrees}
          status={worktreeStatus}
          onAdd={chooseProject}
          onError={setError}
        />
      </div>

      <AuditPanel
        key={selectedContextKey ?? 'no-command-context'}
        open={logsOpen}
        commands={commands}
        contextLabel={selectedWorktree?.branch ?? selectedProject?.name}
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
      {error && <ErrorToast message={error} onDismiss={() => setError(undefined)} />}
    </div>
  );
}
