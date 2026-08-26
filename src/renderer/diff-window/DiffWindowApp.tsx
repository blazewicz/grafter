import { useCallback, useEffect, useState } from 'react';
import type {
  AppSnapshot,
  DiffSession,
  Settings,
  ToolPickerGroup,
} from '../../shared/contracts';
import { DiffViewer } from '../diff/DiffViewer';
import { api, friendlyError } from '../grafter-api';
import { Splash } from '../shell/Splash';
import styles from './DiffWindowApp.module.css';

interface WindowEnvironment {
  homeDirectory: string;
  systemLocale: string;
  settings: Settings;
  toolPreferences: Record<ToolPickerGroup, string>;
}

/**
 * Root component of the dedicated diff window surface. The initial diff
 * session is pulled once from the main process; afterwards the window owns
 * rendering while snapshot pushes keep shared state such as settings fresh.
 */
export function DiffWindowApp(): React.JSX.Element {
  const [session, setSession] = useState<DiffSession>();
  const [environment, setEnvironment] = useState<WindowEnvironment>();
  const [error, setError] = useState<string>();
  const [initializationFailed, setInitializationFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void api
      .getDiffWindowInit()
      .then((init) => {
        if (active) setSession(init.session);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(friendlyError(caught));
          setInitializationFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let receivedUpdate = false;
    const applyEnvironment = (snapshot: AppSnapshot): void => {
      if (!active || snapshot.kind === 'loading') return;
      receivedUpdate = true;
      setEnvironment({
        homeDirectory: snapshot.homeDirectory,
        systemLocale: snapshot.systemLocale,
        settings: snapshot.settings,
        toolPreferences: snapshot.toolPreferences,
      });
    };
    const unsubscribe = api.onSnapshotUpdate(applyEnvironment);
    void api
      .getSnapshot()
      .then((next) => {
        if (active && !receivedUpdate) applyEnvironment(next);
      })
      .catch((caught: unknown) => {
        if (active) setError(friendlyError(caught));
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const dismissError = useCallback(() => setError(undefined), []);
  const closeWindow = useCallback(() => {
    void api
      .closeDiffWindow()
      .catch((caught: unknown) => setError(friendlyError(caught)));
  }, []);

  if (error && (initializationFailed || !session)) {
    return (
      <div className={styles.failed} role="alert">
        <strong>Unable to open this diff.</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (!session || !environment) {
    return (
      <div className={styles.boot}>
        <Splash />
        {error && (
          <span className={styles.bootError} role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <DiffViewer
        // Diff file ids are positional and repeat across sessions, so patch
        // caches and viewer state must never outlive one session.
        key={session.id}
        session={session}
        onSessionChange={setSession}
        onClose={closeWindow}
        onError={setError}
        settings={environment.settings}
        systemLocale={environment.systemLocale}
        toolPreferences={environment.toolPreferences}
        onSetToolPreference={(group, tool) =>
          void api
            .setToolPreference(group, tool)
            .catch((caught: unknown) => setError(friendlyError(caught)))
        }
      />
      {error && (
        <div className={styles.errorBar} role="alert">
          <span>{error}</span>
          <button type="button" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
