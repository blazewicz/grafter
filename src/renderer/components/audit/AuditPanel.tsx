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
import { filterAuditCommands, summarizeRunningCommands } from '../../command-audit';
import { useRunningCommandDisplay } from './useRunningCommandDisplay';

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
  const filtered = filterAuditCommands(commands, tool, hideReadOnly);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = filtered.find((command) => command.id === selectedId) ?? filtered[0];
  const running = summarizeRunningCommands(commands);
  const displayedRunningCommand = useRunningCommandDisplay(running.latest);
  const title =
    !open && displayedRunningCommand
      ? displayedRunningCommand.purpose
      : contextLabel
        ? `Command log · ${contextLabel}`
        : 'Command log';

  return (
    <section className={`audit-panel ${open ? 'open' : ''}`}>
      <div className="audit-header">
        <button
          className="audit-title"
          aria-label={open ? 'Collapse command log' : 'Expand command log'}
          onClick={onToggle}
        >
          {open ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
          <TerminalSquare size={15} />
          <span className="audit-title-text" aria-live="polite" title={title}>
            {title}
          </span>
          {!open && displayedRunningCommand && running.count > 1 && (
            <span
              className="audit-running-count"
              aria-label={`${running.count} commands running`}
            >
              {running.count}
            </span>
          )}
        </button>
        {open && (
          <div className="audit-tools">
            <label className="audit-readonly-filter">
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
            {!filtered.length && <div className="no-commands">No matching commands.</div>}
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

function StatusIcon({ status }: { status: CommandRecord['status'] }): React.JSX.Element {
  if (status === 'succeeded') return <Check className="status-ok" size={13} />;
  if (status === 'running')
    return <LoaderCircle className="spin status-running" size={13} />;
  if (status === 'awaiting-approval')
    return <ShieldCheck className="status-waiting" size={13} />;
  return <X className="status-error" size={13} />;
}
