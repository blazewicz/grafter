import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AppSnapshot, CommandLogScope, ToolPickerGroup } from '../shared/contracts';
import { AuditPanel } from './audit/AuditPanel';
import { useCommandLogs } from './audit/useCommandLogs';
import { MainView } from './details/MainView';
import { useWorktreeInspection } from './details/useWorktreeInspection';
import { DiffViewer } from './diff/DiffViewer';
import { ApprovalDialog } from './dialogs/ApprovalDialog';
import { SettingsDialog } from './dialogs/SettingsDialog';
import { useCommandApproval } from './dialogs/useCommandApproval';
import { NewWorktreeDialog } from './dialogs/NewWorktreeDialog';
import { ErrorToast } from './feedback/ErrorToast';
import { AppTitlebar } from './shell/AppTitlebar';
import { Splash } from './shell/Splash';
import { useNavigationHistory } from './shell/useNavigationHistory';
import { defaultSidebarWidth, Sidebar } from './sidebar/Sidebar';
import { useRepositoryRefresh } from './sidebar/useRepositoryRefresh';
import { useDiffViewer } from './diff/useDiffViewer';
import { api, friendlyError } from './grafter-api';
import { Welcome } from './welcome/Welcome';
import { useHotKey } from './useHotKey';
import styles from './App.module.css';

type DialogName = 'settings' | 'new-worktree' | null;

interface AppShellStyle extends CSSProperties {
  '--sidebar-width': string;
}

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AppSnapshot>({ kind: 'loading' });
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

  const repository = snapshot.kind === 'repository' ? snapshot.repository : undefined;
  const selectedRepository = repository?.id === selectedId ? repository : undefined;
  const selectedWorktree = repository?.worktrees.find(
    (worktree) => worktree.id === selectedId,
  );
  const selectedRepositoryId = selectedRepository?.id;
  const selectedWorktreeId = selectedWorktree?.id;
  const selectedScope = useMemo<CommandLogScope | undefined>(() => {
    if (selectedWorktreeId) return { kind: 'worktree', worktreeId: selectedWorktreeId };
    if (selectedRepositoryId) {
      return { kind: 'repository' };
    }
    return undefined;
  }, [selectedRepositoryId, selectedWorktreeId]);
  const {
    commands,
    contextKey: selectedContextKey,
    latestActivity,
  } = useCommandLogs(selectedScope, repository?.id, setError);
  const { details } = useWorktreeInspection(
    selectedWorktreeId,
    selectedWorktree?.branch,
    selectedWorktree?.head,
    setError,
  );
  const repositoryWorktrees =
    details && details.projectId === repository?.id ? repository.worktrees : [];

  const applySnapshot = useCallback(
    (next: AppSnapshot): void => {
      setSnapshot(next);
      switch (next.kind) {
        case 'loading':
        case 'welcome':
          appliedWorktreeSelectionRequest.current = undefined;
          reconcileNavigation([], undefined);
          return;
        case 'repository': {
          const worktrees = next.repository.worktrees;
          reconcileNavigation(
            [next.repository.id, ...worktrees.map((worktree) => worktree.id)],
            next.selectedWorktreeId ?? worktrees[1]?.id ?? worktrees[0]?.id,
          );
          if (
            next.selectedWorktreeId &&
            next.worktreeSelectionRequestId !== undefined &&
            `${next.selectedWorktreeId}:${next.worktreeSelectionRequestId}` !==
              appliedWorktreeSelectionRequest.current
          ) {
            appliedWorktreeSelectionRequest.current = `${next.selectedWorktreeId}:${next.worktreeSelectionRequestId}`;
            navigate(next.selectedWorktreeId);
          }
          return;
        }
        default:
          return assertNever(next);
      }
    },
    [navigate, reconcileNavigation],
  );

  useRepositoryRefresh(snapshot.kind === 'repository', applySnapshot, setError);

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

  const chooseRepository = (): void => {
    void run(
      () => api.chooseRepository(),
      (next) => {
        if (next) applySnapshot(next);
      },
    );
  };

  const openRecentRepository = (repositoryId: string): void => {
    void run(() => api.openRecentRepository(repositoryId), applySnapshot);
  };

  const setToolPreference = (group: ToolPickerGroup, tool: string): void => {
    void run(() => api.setToolPreference(group, tool), applySnapshot);
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

  useHotKey('n', () => {
    if (snapshot.kind === 'repository') setDialog('new-worktree');
  });

  if (snapshot.kind === 'loading') return <Splash />;

  if (snapshot.kind === 'welcome') {
    return (
      <>
        <Welcome
          homeDirectory={snapshot.homeDirectory}
          recentRepositories={snapshot.recentRepositories}
          busy={busy}
          onOpenRepository={chooseRepository}
          onOpenRecentRepository={openRecentRepository}
        />
        {error && <ErrorToast message={error} onDismiss={() => setError(undefined)} />}
      </>
    );
  }

  const activeRepository = snapshot.repository;

  return (
    <div className={styles.appShell} style={appShellStyle}>
      <AppTitlebar
        repositoryName={activeRepository.name}
        worktree={selectedWorktree}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={goBack}
        onForward={goForward}
        onSelectRepository={() => navigate(activeRepository.id)}
        busy={busy}
        onRefresh={() => void run(() => api.refresh(), applySnapshot)}
      />

      <div className={styles.workspace}>
        <Sidebar
          homeDirectory={snapshot.homeDirectory}
          repository={activeRepository}
          width={sidebarWidth}
          selectedId={selectedId}
          onSelect={navigate}
          onAddWorktree={() => setDialog('new-worktree')}
          onRemoveWorktree={(worktree) =>
            void run(() => api.prepareRemoveWorktree(worktree.id), enqueueApproval)
          }
          onOpenSettings={() => setDialog('settings')}
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
          toolPreferences={snapshot.toolPreferences}
          onSetToolPreference={setToolPreference}
          onSnapshot={applySnapshot}
          onAdd={chooseRepository}
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
          repository={activeRepository}
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
          onRepositorySetup={(script) =>
            void run(() => api.updateRepositorySetup(script), applySnapshot)
          }
        />
      )}

      {dialog === 'new-worktree' && (
        <NewWorktreeDialog
          project={activeRepository}
          onCancel={() => setDialog(null)}
          onCreated={(next, request) => {
            setDialog(null);
            applySnapshot(next.snapshot);
            const created =
              next.snapshot.kind === 'repository'
                ? next.snapshot.repository.worktrees.find(
                    (worktree) => worktree.path === request.path,
                  )
                : undefined;
            if (created) navigate(created.id);
            if (next.setupApproval) enqueueApproval(next.setupApproval);
          }}
          onError={setError}
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
          toolPreferences={snapshot.toolPreferences}
          onSetToolPreference={setToolPreference}
        />
      )}

      {error && <ErrorToast message={error} onDismiss={() => setError(undefined)} />}
    </div>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled window snapshot: ${String(value)}`);
}
