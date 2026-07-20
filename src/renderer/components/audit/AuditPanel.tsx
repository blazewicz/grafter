import {
  ArrowUp,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Code2,
  Copy,
  LoaderCircle,
  ShieldCheck,
  TerminalSquare,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CommandRecord, Settings } from '../../../shared/contracts';
import {
  commandStatusLabel,
  filterAuditCommandGroups,
  groupConsecutiveReadOnlyCommands,
  summarizeRunningCommands,
} from '../../command-audit';
import type { AuditToolFilter } from '../../command-audit';
import { formatDateTime, formatTime } from '../../date-time';
import { api, friendlyError } from '../../grafter-api';
import { useCommandActivityDisplay } from './useCommandActivityDisplay';
import styles from './AuditPanel.module.css';

const scrollFollowMs = 600;

type AuditSelection = { mode: 'follow' } | { mode: 'manual'; commandGroupId: string };

export function AuditPanel({
  open,
  commands,
  latestActivity,
  settings,
  systemLocale,
  contextLabel,
  onToggle,
  onError,
}: {
  open: boolean;
  commands: CommandRecord[];
  latestActivity: CommandRecord | undefined;
  settings: Settings;
  systemLocale: string;
  contextLabel: string | undefined;
  onToggle: () => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const [copiedCommandId, setCopiedCommandId] = useState<string>();
  const [tool, setTool] = useState<AuditToolFilter>('all');
  const [hideReadOnly, setHideReadOnly] = useState(false);
  const [selection, setSelection] = useState<AuditSelection>({ mode: 'follow' });
  const filtered = filterAuditCommandGroups(
    groupConsecutiveReadOnlyCommands(commands),
    tool,
    hideReadOnly,
  );
  const filteredIds = filtered.map((group) => group.id).join('\0');
  const manuallySelected =
    selection.mode === 'manual'
      ? filtered.find((group) => group.id === selection.commandGroupId)
      : undefined;
  const followingLatest = selection.mode === 'follow' || manuallySelected === undefined;
  const selected = manuallySelected ?? filtered[0];
  const running = summarizeRunningCommands(commands);
  const displayedActivity = useCommandActivityDisplay(latestActivity);
  const baseTitle = contextLabel ? `Command log · ${contextLabel}` : 'Command log';
  const title =
    !open && displayedActivity.command
      ? `${baseTitle} · ${displayedActivity.command.purpose}`
      : baseTitle;
  const commandListRef = useRef<HTMLDivElement>(null);
  const commandOutputRef = useRef<HTMLDivElement>(null);
  const listLayoutRef = useRef<ScrollLayout | undefined>(undefined);
  const outputLayoutRef = useRef<ScrollLayout | undefined>(undefined);
  const handledActivityIdRef = useRef<string | undefined>(undefined);
  const listScrollAnimationRef = useRef<number | undefined>(undefined);
  const outputScrollAnimationRef = useRef<number | undefined>(undefined);
  const [unseenCommandCount, setUnseenCommandCount] = useState(0);

  useLayoutEffect(() => {
    const list = commandListRef.current;
    if (!list) return;
    const previous = listLayoutRef.current;
    const activityId = latestActivity?.id;
    const isNewActivity =
      activityId !== undefined && activityId !== handledActivityIdRef.current;

    if (isNewActivity) {
      handledActivityIdRef.current = activityId;
      const firstGroup = filtered[0];
      const insertedFirstGroup =
        previous !== undefined &&
        firstGroup !== undefined &&
        firstGroup.calls.some((command) => command.id === activityId) &&
        !previous.itemIds.has(firstGroup.id);

      if (insertedFirstGroup) {
        const heightDelta = Math.max(0, list.scrollHeight - previous.scrollHeight);
        const wasAtTop = previous.scrollTop <= 2;
        list.scrollTop = previous.scrollTop + heightDelta;
        if (wasAtTop) {
          animateScrollToTop(list, listScrollAnimationRef);
        } else {
          setUnseenCommandCount((count) => count + 1);
        }
      }
    }

    listLayoutRef.current = {
      scrollHeight: list.scrollHeight,
      scrollTop: list.scrollTop,
      itemIds: new Set(filtered.map((group) => group.id)),
      firstItemId: filtered[0]?.id,
    };
  }, [filtered, filteredIds, latestActivity]);

  const firstSelectedCallId = selected?.calls[0]?.id;
  useLayoutEffect(() => {
    const output = commandOutputRef.current;
    if (!output) return;
    const previous = outputLayoutRef.current;
    const callWasPrepended =
      previous !== undefined &&
      selected?.id === previous.firstItemId &&
      firstSelectedCallId !== undefined &&
      !previous.itemIds.has(firstSelectedCallId);

    if (callWasPrepended) {
      const heightDelta = Math.max(0, output.scrollHeight - previous.scrollHeight);
      output.scrollTop = previous.scrollTop + heightDelta;
      if (previous.scrollTop <= 2) {
        animateScrollToTop(output, outputScrollAnimationRef);
      }
    }

    outputLayoutRef.current = {
      scrollHeight: output.scrollHeight,
      scrollTop: output.scrollTop,
      itemIds: new Set(selected?.calls.map((command) => command.id) ?? []),
      firstItemId: selected?.id,
    };
  }, [firstSelectedCallId, selected]);

  useEffect(
    () => () => {
      cancelScrollAnimation(listScrollAnimationRef);
      cancelScrollAnimation(outputScrollAnimationRef);
    },
    [],
  );

  const copyCommand = (command: CommandRecord): void => {
    void api
      .copyText(command.displayCommand)
      .then(() => {
        setCopiedCommandId(command.id);
        window.setTimeout(
          () =>
            setCopiedCommandId((currentId) =>
              currentId === command.id ? undefined : currentId,
            ),
          1600,
        );
      })
      .catch((caught: unknown) => onError(friendlyError(caught)));
  };

  return (
    <section className={styles.auditPanel}>
      <div className={styles.auditHeader}>
        <button
          className={styles.auditTitle}
          aria-label={open ? 'Collapse command log' : 'Expand command log'}
          onClick={onToggle}
        >
          {open ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
          <TerminalSquare size={15} />
          <span className={styles.auditTitleText} title={title}>
            {baseTitle}
          </span>
          {!open && displayedActivity.command && (
            <span
              className={`${styles.auditActivity} ${
                displayedActivity.visible ? styles.visible : styles.exiting
              }`}
              aria-live="polite"
            >
              <span aria-hidden="true">·</span>
              <span>{displayedActivity.command.purpose}</span>
            </span>
          )}
          {!open && displayedActivity.command && running.count > 1 && (
            <span
              className={styles.auditRunningCount}
              aria-label={`${running.count} commands running`}
            >
              {running.count}
            </span>
          )}
        </button>
        {open && (
          <div className={styles.auditTools}>
            <label className={styles.auditReadonlyFilter}>
              <input
                type="checkbox"
                checked={hideReadOnly}
                onChange={(event) => {
                  setHideReadOnly(event.target.checked);
                  setSelection({ mode: 'follow' });
                }}
              />
              <span>Hide read-only</span>
            </label>
            <select
              aria-label="Select command tool"
              value={tool}
              onChange={(event) => {
                setTool(event.target.value as AuditToolFilter);
                setSelection({ mode: 'follow' });
              }}
            >
              <option value="all">All</option>
              <option value="git">Git</option>
              <option value="github">GitHub CLI</option>
              <option value="shell">Setup scripts</option>
            </select>
          </div>
        )}
      </div>
      {open && (
        <div className={styles.auditBody}>
          <div className={styles.commandListPane}>
            <div
              ref={commandListRef}
              className={styles.commandList}
              onScroll={(event) => {
                if (listLayoutRef.current) {
                  listLayoutRef.current.scrollTop = event.currentTarget.scrollTop;
                }
                if (event.currentTarget.scrollTop <= 2) setUnseenCommandCount(0);
              }}
            >
              {filtered.map((group) => (
                <button
                  key={group.id}
                  className={selected?.id === group.id ? styles.active : ''}
                  onClick={() =>
                    setSelection({ mode: 'manual', commandGroupId: group.id })
                  }
                >
                  <StatusIcon status={group.latest.status} />
                  <div>
                    <div className={styles.commandListTitle}>
                      <span>{group.latest.purpose}</span>
                      {group.calls.length > 1 && (
                        <span
                          className={styles.commandCallCount}
                          aria-label={`${group.calls.length} calls`}
                        >
                          ×{group.calls.length}
                        </span>
                      )}
                    </div>
                    <code>{group.latest.displayCommand}</code>
                  </div>
                  <time dateTime={group.latest.startedAt}>
                    {formatTime(
                      group.latest.startedAt,
                      settings.timeFormat,
                      false,
                      systemLocale,
                    )}
                  </time>
                </button>
              ))}
              {!filtered.length && (
                <div className={styles.noCommands}>No matching commands.</div>
              )}
            </div>
            {!followingLatest ? (
              <button
                type="button"
                className={styles.followLatest}
                onClick={() => {
                  setSelection({ mode: 'follow' });
                  setUnseenCommandCount(0);
                  const list = commandListRef.current;
                  if (list) animateScrollToTop(list, listScrollAnimationRef);
                }}
              >
                <ArrowUp size={11} />
                <span>Follow latest</span>
                {unseenCommandCount > 0 && (
                  <span
                    className={styles.followLatestCount}
                    aria-label={`${unseenCommandCount} new ${
                      unseenCommandCount === 1 ? 'command' : 'commands'
                    }`}
                  >
                    {unseenCommandCount}
                  </span>
                )}
              </button>
            ) : unseenCommandCount > 0 ? (
              <button
                type="button"
                className={styles.newCommands}
                onClick={() => {
                  setUnseenCommandCount(0);
                  const list = commandListRef.current;
                  if (list) animateScrollToTop(list, listScrollAnimationRef);
                }}
              >
                {unseenCommandCount} new{' '}
                {unseenCommandCount === 1 ? 'command' : 'commands'}
              </button>
            ) : null}
          </div>
          <div
            ref={commandOutputRef}
            className={styles.commandOutput}
            onScroll={(event) => {
              if (outputLayoutRef.current) {
                outputLayoutRef.current.scrollTop = event.currentTarget.scrollTop;
              }
            }}
          >
            {selected ? (
              selected.calls.map((command) => (
                <section className={styles.commandInvocation} key={command.id}>
                  <div className={styles.commandInvocationMeta}>
                    <time dateTime={command.startedAt}>
                      {formatDateTime(command.startedAt, settings, systemLocale)}
                    </time>
                    <span>{commandStatusLabel(command)}</span>
                  </div>
                  <div className={styles.terminalCommand}>
                    <span>$</span>
                    <span className={styles.commandText}>{command.displayCommand}</span>
                    <button
                      type="button"
                      className={styles.copyCommandButton}
                      aria-label={
                        copiedCommandId === command.id
                          ? 'Command copied'
                          : 'Copy full command'
                      }
                      title={
                        copiedCommandId === command.id
                          ? 'Command copied'
                          : 'Copy full command'
                      }
                      onClick={() => copyCommand(command)}
                    >
                      {copiedCommandId === command.id ? (
                        <Check size={16} />
                      ) : (
                        <Copy size={17} />
                      )}
                    </button>
                  </div>
                  <pre>
                    {command.output.map((line) => line.text).join('') ||
                      (command.status === 'running'
                        ? 'Running…'
                        : 'Command completed without output.')}
                  </pre>
                </section>
              ))
            ) : (
              <div className={styles.terminalEmpty}>
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

function StatusIcon({ status }: { status: CommandRecord['status'] }): React.JSX.Element {
  if (status === 'succeeded') return <Check className={styles.statusOk} size={13} />;
  if (status === 'running')
    return <LoaderCircle className={`spin ${styles.statusRunning}`} size={13} />;
  if (status === 'awaiting-approval')
    return <ShieldCheck className={styles.statusWaiting} size={13} />;
  return <X className={styles.statusError} size={13} />;
}

interface ScrollLayout {
  scrollHeight: number;
  scrollTop: number;
  itemIds: Set<string>;
  firstItemId: string | undefined;
}

function animateScrollToTop(
  element: HTMLElement,
  animationRef: React.MutableRefObject<number | undefined>,
): void {
  cancelScrollAnimation(animationRef);
  const start = element.scrollTop;
  if (start <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.scrollTop = 0;
    return;
  }

  let startedAt: number | undefined;
  const step = (now: number): void => {
    startedAt ??= now;
    const progress = Math.min(1, (now - startedAt) / scrollFollowMs);
    element.scrollTop = start * Math.pow(1 - progress, 3);
    if (progress < 1) {
      animationRef.current = window.requestAnimationFrame(step);
    } else {
      animationRef.current = undefined;
    }
  };
  animationRef.current = window.requestAnimationFrame(step);
}

function cancelScrollAnimation(
  animationRef: React.MutableRefObject<number | undefined>,
): void {
  if (animationRef.current === undefined) return;
  window.cancelAnimationFrame(animationRef.current);
  animationRef.current = undefined;
}
