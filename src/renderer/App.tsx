import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AppSnapshot, CommandContext } from '../shared/contracts';
import { AuditPanel } from './audit/AuditPanel';
import { useCommandLogs } from './audit/useCommandLogs';
import { MainView } from './details/MainView';
import { useWorktreeInspection } from './details/useWorktreeInspection';
import { DiffViewer } from './diff/DiffViewer';
import { ApprovalDialog } from './dialogs/ApprovalDialog';
import { SettingsDialog } from './dialogs/SettingsDialog';
import { useCommandApproval } from './dialogs/useCommandApproval';
import { ErrorToast } from './feedback/ErrorToast';
import { AppTitlebar } from './shell/AppTitlebar';
import { Splash } from './shell/Splash';
import { useNavigationHistory } from './shell/useNavigationHistory';
import { defaultSidebarWidth, Sidebar } from './sidebar/Sidebar';
import { useProjectWorktreeRefresh } from './sidebar/useProjectWorktreeRefresh';
import { useDiffViewer } from './diff/useDiffViewer';
import { api, friendlyError } from './grafter-api';
import { Welcome } from './welcome/Welcome';
import {
  currentRepository,
  scopeRepositoryWindowSnapshot,
} from './repository-window-snapshot';
import styles from './App.module.css';

type DialogName = 'settings' | null;

interface AppShellStyle extends CSSProperties {
  '--sidebar-width': string;
}

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(defaultSidebarWidth);
  const appliedWorktreeSelectionRequest = useRef<string | undefined>(undefined);
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

  const repository = currentRepository(snapshot);
  const selectedRepository = repository?.id === selectedId ? repository : undefined;
  const selectedWorktree = repository?.worktrees.find(
    (worktree) => worktree.id === selectedId,
  );
  const selectedRepositoryId = selectedRepository?.id;
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
    if (selectedRepositoryId) {
      return { kind: 'project', projectId: selectedRepositoryId };
    }
    return undefined;
  }, [selectedRepositoryId, selectedWorktreeId, selectedWorktreeProjectId]);
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
  const repositoryWorktrees =
    details && details.projectId === repository?.id ? repository.worktrees : [];

  const applySnapshot = useCallback(
    (next: AppSnapshot): void => {
      const scoped = scopeRepositoryWindowSnapshot(next);
      const nextRepository = currentRepository(scoped);
      setSnapshot(scoped);
      const worktrees = nextRepository?.worktrees ?? [];
      reconcileNavigation(
        nextRepository
          ? [nextRepository.id, ...worktrees.map((worktree) => worktree.id)]
          : [],
        scoped.selectedWorktreeId ?? worktrees[1]?.id ?? worktrees[0]?.id,
      );
      if (
        scoped.selectedWorktreeId &&
        scoped.worktreeSelectionRequestId !== undefined &&
        `${scoped.selectedWorktreeId}:${scoped.worktreeSelectionRequestId}` !==
          appliedWorktreeSelectionRequest.current
      ) {
        appliedWorktreeSelectionRequest.current = `${scoped.selectedWorktreeId}:${scoped.worktreeSelectionRequestId}`;
        navigate(scoped.selectedWorktreeId);
      }
    },
    [navigate, reconcileNavigation],
  );

  useProjectWorktreeRefresh(repository?.id, applySnapshot, setError);

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

  const openRecentRepository = (repositoryId: string): void => {
    void run(() => api.openRecentRepository(repositoryId), applySnapshot);
  };

  const {
    diffSession,
    diffOpening,
    openDiff,
    openCommitDiff,
    closeDiff,
    replaceDiffSession,
  } = useDiffViewer(api, setError);

  const { approval, approvalRunning, enqueueApproval, resolveApproval } =
    useCommandApproval(api, run, applySnapshot);

  if (!snapshot) return <Splash />;

  if (!repository) {
    return (
      <>
        <Welcome
          homeDirectory={snapshot.homeDirectory}
          recentRepositories={snapshot.recentRepositories}
          busy={busy}
          onOpenRepository={chooseProject}
          onOpenRecentRepository={openRecentRepository}
        />
        {error && <ErrorToast message={error} onDismiss={() => setError(undefined)} />}
      </>
    );
  }

  return (
    <div className={styles.appShell} style={appShellStyle}>
      <AppTitlebar
        repositoryName={repository.name}
        worktree={selectedWorktree}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={goBack}
        onForward={goForward}
        onSelectRepository={() => navigate(repository.id)}
        busy={busy}
        onRefresh={() => void run(() => api.refresh(), applySnapshot)}
      />

      <div className={styles.workspace}>
        <Sidebar
          homeDirectory={snapshot.homeDirectory}
          repository={repository}
          width={sidebarWidth}
          selectedId={selectedId}
          onSelect={navigate}
          onChooseProject={chooseProject}
          onCreated={(next, request) => {
            applySnapshot(next.snapshot);
            const created = currentRepository(
              scopeRepositoryWindowSnapshot(next.snapshot),
            )?.worktrees.find((worktree) => worktree.path === request.path);
            if (created) navigate(created.id);
            if (next.setupApproval) enqueueApproval(next.setupApproval);
          }}
          onRemoveWorktree={(worktree) =>
            void run(() => api.prepareRemoveWorktree(worktree.id), enqueueApproval)
          }
          onOpenSettings={() => setDialog('settings')}
          onError={setError}
          onResize={setSidebarWidth}
        />

        <MainView
          homeDirectory={snapshot.homeDirectory}
          settings={snapshot.settings}
          systemLocale={snapshot.systemLocale}
          selectedProject={selectedRepository}
          selectedWorktree={selectedWorktree}
          details={details}
          projectWorktrees={repositoryWorktrees}
          status={worktreeStatus}
          onSnapshot={applySnapshot}
          onAdd={chooseProject}
          onSelectWorktree={navigate}
          diffOpening={diffOpening}
          onOpenDiff={openDiff}
          onOpenCommitDiff={openCommitDiff}
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
        onToggle={() => setLogsOpen((value) => !value)}
        onError={setError}
      />

      {approval && (
        <ApprovalDialog
          homeDirectory={snapshot.homeDirectory}
          request={approval}
          running={approvalRunning}
          onReject={() => resolveApproval('reject')}
          onApprove={() => resolveApproval('approve')}
        />
      )}
      {dialog === 'settings' && (
        <SettingsDialog
          settings={snapshot.settings}
          repository={repository}
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
        <DiffViewer
          key={diffSession.id}
          session={diffSession}
          onSessionChange={replaceDiffSession}
          onClose={closeDiff}
          onError={setError}
          settings={snapshot.settings}
          systemLocale={snapshot.systemLocale}
        />
      )}
      {error && <ErrorToast message={error} onDismiss={() => setError(undefined)} />}
    </div>
  );
}
