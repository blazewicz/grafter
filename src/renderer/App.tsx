import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  AppSnapshot,
  ApprovalRequest,
  CommandContext,
  DiffSession,
} from '../shared/contracts';
import { AuditPanel } from './components/audit/AuditPanel';
import { useCommandLogs } from './components/audit/useCommandLogs';
import { MainView } from './components/details/MainView';
import { useWorktreeInspection } from './components/details/useWorktreeInspection';
import { DiffViewer } from './components/diff/DiffViewer';
import { ApprovalDialog } from './components/dialogs/ApprovalDialog';
import { ProjectRemovalDialog } from './components/dialogs/ProjectRemovalDialog';
import { SettingsDialog } from './components/dialogs/SettingsDialog';
import { ErrorToast } from './components/feedback/ErrorToast';
import { AppTitlebar } from './components/shell/AppTitlebar';
import { Splash } from './components/shell/Splash';
import { useNavigationHistory } from './components/shell/useNavigationHistory';
import { defaultSidebarWidth, ProjectSidebar } from './components/sidebar/ProjectSidebar';
import { useProjectWorktreeRefresh } from './components/sidebar/useProjectWorktreeRefresh';
import { api, friendlyError } from './grafter-api';
import styles from './App.module.css';

type DialogName = 'settings' | null;

interface AppShellStyle extends CSSProperties {
  '--sidebar-width': string;
}

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [approval, setApproval] = useState<ApprovalRequest>();
  const [projectRemovalId, setProjectRemovalId] = useState<string>();
  const [dialog, setDialog] = useState<DialogName>(null);
  const [logsOpen, setLogsOpen] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(defaultSidebarWidth);
  const [diffSession, setDiffSession] = useState<DiffSession>();
  const [diffOpening, setDiffOpening] = useState(false);
  const {
    selectedId,
    canGoBack,
    canGoForward,
    navigate,
    goBack,
    goForward,
    reconcile: reconcileNavigation,
  } = useNavigationHistory();
  const appShellStyle: AppShellStyle = {
    '--sidebar-width': `${sidebarWidth}px`,
  };

  const selectedProject = snapshot?.projects.find((project) => project.id === selectedId);
  const projectPendingRemoval = snapshot?.projects.find(
    (project) => project.id === projectRemovalId,
  );
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
  const {
    commands,
    contextKey: selectedContextKey,
    latestActivity,
  } = useCommandLogs(selectedContext, setError);
  const { details, status: worktreeStatus } = useWorktreeInspection(
    selectedWorktreeId,
    selectedWorktree?.branch,
    selectedWorktree?.head,
    setError,
  );
  const projectWorktrees = details
    ? (snapshot?.projects.find((project) => project.id === details.projectId)
        ?.worktrees ?? [details])
    : [];

  const applySnapshot = useCallback(
    (next: AppSnapshot): void => {
      setSnapshot(next);
      setExpanded((current) => {
        if (current.size) return current;
        return new Set(next.projects.map((project) => project.id));
      });
      const worktrees = next.projects.flatMap((project) => project.worktrees);
      reconcileNavigation(
        [
          ...next.projects.map((project) => project.id),
          ...worktrees.map((worktree) => worktree.id),
        ],
        worktrees[1]?.id ?? worktrees[0]?.id,
      );
    },
    [reconcileNavigation],
  );

  useProjectWorktreeRefresh(activeProject?.id, applySnapshot, setError);

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
    let receivedSnapshotUpdate = false;
    const unsubscribe = api.onSnapshotUpdate((next) => {
      if (active) {
        receivedSnapshotUpdate = true;
        applySnapshot(next);
      }
    });
    void api
      .getSnapshot()
      .then((next) => {
        if (active && !receivedSnapshotUpdate) applySnapshot(next);
      })
      .catch((caught: unknown) => {
        if (active) setError(friendlyError(caught));
      });
    return () => {
      active = false;
      unsubscribe();
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

  const openDiff = (worktreeId: string): void => {
    setDiffOpening(true);
    setError(undefined);
    void api
      .openDiff(worktreeId)
      .then(setDiffSession)
      .catch((caught: unknown) => setError(friendlyError(caught)))
      .finally(() => setDiffOpening(false));
  };

  const closeDiff = (): void => {
    const sessionId = diffSession?.id;
    setDiffSession(undefined);
    if (!sessionId) return;
    void api
      .closeDiff(sessionId)
      .catch((caught: unknown) => setError(friendlyError(caught)));
  };

  const resolveApproval = (decision: 'approve' | 'reject'): void => {
    if (!approval) return;
    const approvalId = approval.approvalId;

    // Approval IDs are single-use. Release the dialog before invoking the main
    // process so an expired token or failed command cannot leave a stale modal
    // blocking the interface.
    setApproval(undefined);
    void run(
      () =>
        decision === 'approve'
          ? api.approveCommand(approvalId)
          : api.rejectCommand(approvalId),
      applySnapshot,
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
    <div className={styles.appShell} style={appShellStyle}>
      <AppTitlebar
        projectName={activeProject?.name ?? snapshot.projects[0]?.name ?? 'Worktrees'}
        worktree={selectedWorktree}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={goBack}
        onForward={goForward}
        onSelectProject={activeProject ? () => navigate(activeProject.id) : undefined}
        busy={busy}
        onRefresh={() => void run(() => api.refresh(), applySnapshot)}
      />

      <div className={styles.workspace}>
        <ProjectSidebar
          homeDirectory={snapshot.homeDirectory}
          projects={snapshot.projects}
          width={sidebarWidth}
          selectedId={selectedId}
          expanded={expanded}
          onSelect={navigate}
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
            if (created) navigate(created.id);
            if (next.setupApproval) setApproval(next.setupApproval);
          }}
          onRemoveProject={setProjectRemovalId}
          onRemoveWorktree={(worktree) =>
            void run(() => api.prepareRemoveWorktree(worktree.id), setApproval)
          }
          onOpenSettings={() => setDialog('settings')}
          onError={setError}
          onResize={setSidebarWidth}
        />

        <MainView
          homeDirectory={snapshot.homeDirectory}
          settings={snapshot.settings}
          systemLocale={snapshot.systemLocale}
          selectedProject={selectedProject}
          selectedWorktree={selectedWorktree}
          details={details}
          projectWorktrees={projectWorktrees}
          status={worktreeStatus}
          onSnapshot={applySnapshot}
          onAdd={chooseProject}
          onSelectProject={navigate}
          onSelectWorktree={navigate}
          diffOpening={diffOpening}
          onOpenDiff={openDiff}
          onError={setError}
        />
      </div>

      <AuditPanel
        key={selectedContextKey ?? 'no-command-context'}
        open={logsOpen}
        commands={commands}
        latestActivity={latestActivity}
        settings={snapshot.settings}
        systemLocale={snapshot.systemLocale}
        contextLabel={selectedWorktree?.displayName ?? selectedProject?.name}
        onToggle={() => setLogsOpen((value) => !value)}
        onError={setError}
      />

      {approval && (
        <ApprovalDialog
          homeDirectory={snapshot.homeDirectory}
          request={approval}
          busy={busy}
          onReject={() => resolveApproval('reject')}
          onApprove={() => resolveApproval('approve')}
        />
      )}
      {projectPendingRemoval && (
        <ProjectRemovalDialog
          projectName={projectPendingRemoval.name}
          busy={busy}
          onCancel={() => setProjectRemovalId(undefined)}
          onConfirm={() =>
            void run(
              () => api.removeProject(projectPendingRemoval.id),
              (next) => {
                applySnapshot(next);
                setProjectRemovalId(undefined);
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
      {diffSession && (
        <DiffViewer session={diffSession} onClose={closeDiff} onError={setError} />
      )}
      {error && <ErrorToast message={error} onDismiss={() => setError(undefined)} />}
    </div>
  );
}
