import { useEffect, useRef, useState } from 'react';
import type {
  CommandContext,
  CommandLogScope,
  CommandRecord,
} from '../../shared/contracts';
import { commandContextKey } from '../../shared/command-context';
import { combineCommandRecords, mergeCommandRecord } from '../command-audit';
import { api, friendlyError } from '../grafter-api';
import { CommandUpdateBuffer } from './CommandUpdateBuffer';

export function useCommandLogs(
  selectedScope: CommandLogScope | undefined,
  repositoryId: string | undefined,
  onError: (message: string) => void,
): {
  commands: CommandRecord[];
  contextKey: string | undefined;
  latestActivity: CommandRecord | undefined;
} {
  const [commandLogs, setCommandLogs] = useState<Record<string, CommandRecord[]>>({});
  const [latestActivity, setLatestActivity] = useState<CommandRecord>();
  const selectedContext = commandContextForScope(selectedScope, repositoryId);
  const contextKey = selectedContext ? commandContextKey(selectedContext) : undefined;
  const contextKeyRef = useRef(contextKey);

  useEffect(() => {
    let active = true;
    const updates = new CommandUpdateBuffer(
      (record) => {
        if (!active) return;
        const updatedContextKey = commandContextKey(record.context);
        setCommandLogs((current) => ({
          ...current,
          [updatedContextKey]: mergeCommandRecord(
            current[updatedContextKey] ?? [],
            record,
          ),
        }));
        if (contextKeyRef.current === updatedContextKey) setLatestActivity(record);
      },
      {
        schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
        cancel: (handle) => window.clearTimeout(handle),
      },
    );
    const unsubscribe = api.onCommandUpdate((record) => {
      if (!active) return;
      updates.enqueue(record);
    });
    return () => {
      active = false;
      unsubscribe();
      updates.dispose();
    };
  }, []);

  useEffect(() => {
    contextKeyRef.current = contextKey;
    const timeoutId = window.setTimeout(() => setLatestActivity(undefined), 0);
    return () => window.clearTimeout(timeoutId);
  }, [contextKey]);

  useEffect(() => {
    if (!selectedScope || !contextKey) return;

    let active = true;
    void api
      .getCommandLog(selectedScope)
      .then((commands) => {
        if (!active) return;
        setCommandLogs((current) => ({
          ...current,
          [contextKey]: combineCommandRecords(commands, current[contextKey] ?? []),
        }));
      })
      .catch((caught: unknown) => {
        if (active) onError(friendlyError(caught));
      });
    return () => {
      active = false;
    };
  }, [contextKey, onError, selectedScope]);

  return {
    commands: contextKey ? (commandLogs[contextKey] ?? []) : [],
    contextKey,
    latestActivity:
      latestActivity &&
      contextKey &&
      commandContextKey(latestActivity.context) === contextKey
        ? latestActivity
        : undefined,
  };
}

function commandContextForScope(
  scope: CommandLogScope | undefined,
  repositoryId: string | undefined,
): CommandContext | undefined {
  if (!scope || !repositoryId) return undefined;
  return scope.kind === 'repository'
    ? { kind: 'project', projectId: repositoryId }
    : { kind: 'worktree', projectId: repositoryId, worktreeId: scope.worktreeId };
}
