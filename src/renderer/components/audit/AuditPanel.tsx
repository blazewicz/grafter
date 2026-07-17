import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Code2,
  LoaderCircle,
  ShieldCheck,
  TerminalSquare,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { CommandRecord, ToolName } from '../../../shared/contracts';
import {
  filterAuditCommandGroups,
  groupConsecutiveReadOnlyCommands,
  summarizeRunningCommands,
} from '../../command-audit';
import { useRunningCommandDisplay } from './useRunningCommandDisplay';
import styles from './AuditPanel.module.css';

export function AuditPanel({
  open,
  commands,
  contextLabel,
  onToggle,
}: {
  open: boolean;
  commands: CommandRecord[];
  contextLabel: string | undefined;
  onToggle: () => void;
}): React.JSX.Element {
  const [tool, setTool] = useState<ToolName>('git');
  const [hideReadOnly, setHideReadOnly] = useState(false);
  const filtered = filterAuditCommandGroups(
    groupConsecutiveReadOnlyCommands(commands),
    tool,
    hideReadOnly,
  );
  const [selectedId, setSelectedId] = useState<string>();
  const selected = filtered.find((group) => group.id === selectedId) ?? filtered[0];
  const running = summarizeRunningCommands(commands);
  const displayedRunningCommand = useRunningCommandDisplay(running.latest);
  const title =
    !open && displayedRunningCommand
      ? displayedRunningCommand.purpose
      : contextLabel
        ? `Command log · ${contextLabel}`
        : 'Command log';

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
          <span className={styles.auditTitleText} aria-live="polite" title={title}>
            {title}
          </span>
          {!open && displayedRunningCommand && running.count > 1 && (
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
                onChange={(event) => setHideReadOnly(event.target.checked)}
              />
              <span>Hide read-only</span>
            </label>
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
        )}
      </div>
      {open && (
        <div className={styles.auditBody}>
          <div className={styles.commandList}>
            {filtered.map((group) => (
              <button
                key={group.id}
                className={selected?.id === group.id ? styles.active : ''}
                onClick={() => setSelectedId(group.id)}
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
                <time>
                  {new Date(group.latest.startedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </button>
            ))}
            {!filtered.length && (
              <div className={styles.noCommands}>No matching commands.</div>
            )}
          </div>
          <div className={styles.commandOutput}>
            {selected ? (
              selected.calls.map((command) => (
                <section className={styles.commandInvocation} key={command.id}>
                  <div className={styles.commandInvocationMeta}>
                    <time>{new Date(command.startedAt).toLocaleString()}</time>
                    <span>{statusLabel(command.status)}</span>
                  </div>
                  <div className={styles.terminalCommand}>
                    <span>$</span> {command.displayCommand}
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

function statusLabel(status: CommandRecord['status']): string {
  if (status === 'awaiting-approval') return 'Awaiting approval';
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
