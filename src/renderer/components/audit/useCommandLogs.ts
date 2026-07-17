import { useEffect, useState } from 'react';
import type { CommandContext, CommandRecord } from '../../../shared/contracts';
import { commandContextKey } from '../../../shared/command-context';
import { combineCommandRecords, mergeCommandRecord } from '../../command-audit';
import { api, friendlyError } from '../../grafter-api';

export function useCommandLogs(
  selectedContext: CommandContext | undefined,
  onError: (message: string) => void,
): {
  commands: CommandRecord[];
  contextKey: string | undefined;
} {
  const [commandLogs, setCommandLogs] = useState<Record<string, CommandRecord[]>>({});
  const contextKey = selectedContext ? commandContextKey(selectedContext) : undefined;

  useEffect(() => {
    let active = true;
    const unsubscribe = api.onCommandUpdate((record) => {
      if (!active) return;
      const updatedContextKey = commandContextKey(record.context);
      setCommandLogs((current) => ({
        ...current,
        [updatedContextKey]: mergeCommandRecord(current[updatedContextKey] ?? [], record),
      }));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!selectedContext || !contextKey) return;

    let active = true;
    void api
      .getCommandLog(selectedContext)
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
  }, [contextKey, onError, selectedContext]);

  return {
    commands: contextKey ? (commandLogs[contextKey] ?? []) : [],
    contextKey,
  };
}
