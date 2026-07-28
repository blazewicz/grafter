// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditPanel } from '../../../src/renderer/audit/AuditPanel';
import { api } from '../../../src/renderer/grafter-api';
import type { CommandRecord, ToolName } from '../../../src/shared/contracts';
import { commandRecordFactory, settingsFactory } from '../../factories';
import { buildAuditPanelScenario } from '../../scenarios/audit/audit-panel';
import { deferred } from '../../support/deferred';

const scenario = buildAuditPanelScenario();
const settings = settingsFactory.build();

interface RenderAuditPanelOptions {
  open?: boolean;
  commands?: CommandRecord[];
  latestActivity?: CommandRecord;
  onToggle?: () => void;
  onError?: (message: string) => void;
}

function auditPanel(options: RenderAuditPanelOptions = {}): React.JSX.Element {
  return (
    <AuditPanel
      open={options.open ?? true}
      commands={options.commands ?? scenario.commands}
      latestActivity={options.latestActivity}
      settings={settings}
      systemLocale="en-US"
      onToggle={options.onToggle ?? (() => undefined)}
      onError={options.onError ?? (() => undefined)}
    />
  );
}

function renderAuditPanel(options: RenderAuditPanelOptions = {}): RenderResult {
  return render(auditPanel(options));
}

function commandHistory(): HTMLElement {
  return screen.getByRole('region', { name: 'Command history' });
}

function commandOutput(): HTMLElement {
  return screen.getByRole('region', { name: 'Command output' });
}

function historyButton(command: CommandRecord): HTMLButtonElement {
  return within(commandHistory()).getByRole('button', {
    name: `${command.purpose} ${command.displayCommand} ${command.startedAt.slice(11, 16)}`,
  });
}

describe('AuditPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('follows the latest command quietly by default', () => {
    renderAuditPanel();

    expect(screen.getByRole('button', { name: 'Collapse command log' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Hide read-only' })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Select command tool' })).toHaveValue(
      'all',
    );
    expect(historyButton(scenario.latestGit)).toBeVisible();
    expect(commandOutput()).toHaveTextContent(scenario.expectedOutput.latestGit.trim());
    expect(commandOutput()).toHaveTextContent('Succeeded in 12.34 ms');
    expect(screen.queryByRole('button', { name: 'Follow latest' })).toBeNull();
  });

  it.each([
    { open: true, label: 'Collapse command log' },
    { open: false, label: 'Expand command log' },
  ])('publishes the $label action', async ({ open, label }) => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderAuditPanel({ open, onToggle });

    const toggle = screen.getByRole('button', { name: label });
    expect(toggle).toBeVisible();
    await user.click(toggle);

    expect(onToggle).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith();
    if (open) {
      expect(commandHistory()).toBeVisible();
    } else {
      expect(screen.queryByRole('region', { name: 'Command history' })).toBeNull();
      expect(screen.queryByRole('combobox', { name: 'Select command tool' })).toBeNull();
    }
  });

  it('selects an older command and resumes following the latest on request', async () => {
    const user = userEvent.setup();
    renderAuditPanel();

    const olderCommand = historyButton(scenario.olderGit);
    expect(olderCommand).toBeVisible();
    await user.click(olderCommand);

    expect(commandOutput()).toHaveTextContent(scenario.expectedOutput.olderGit.trim());
    expect(commandOutput()).not.toHaveTextContent(
      scenario.expectedOutput.latestGit.trim(),
    );
    const followLatest = screen.getByRole('button', { name: 'Follow latest' });
    expect(followLatest).toBeVisible();
    await user.click(followLatest);

    expect(commandOutput()).toHaveTextContent(scenario.expectedOutput.latestGit.trim());
    expect(screen.queryByRole('button', { name: 'Follow latest' })).toBeNull();
  });

  it.each([
    {
      label: 'Git',
      tool: 'git',
      expectedCommands: [scenario.latestGit, scenario.olderGit],
      expectedOutput: scenario.expectedOutput.latestGit,
    },
    {
      label: 'GitHub CLI',
      tool: 'github',
      expectedCommands: [scenario.github],
      expectedOutput: scenario.expectedOutput.github,
    },
    {
      label: 'Setup scripts',
      tool: 'shell',
      expectedCommands: [scenario.shell],
      expectedOutput: scenario.expectedOutput.shell,
    },
  ] satisfies {
    label: string;
    tool: ToolName;
    expectedCommands: CommandRecord[];
    expectedOutput: string;
  }[])(
    'filters the command history to $label and returns to follow mode',
    async ({ tool, expectedCommands, expectedOutput }) => {
      const user = userEvent.setup();
      renderAuditPanel();
      await user.click(historyButton(scenario.olderGit));
      expect(screen.getByRole('button', { name: 'Follow latest' })).toBeVisible();

      const toolFilter = screen.getByRole('combobox', {
        name: 'Select command tool',
      });
      await user.selectOptions(toolFilter, tool);

      expect(toolFilter).toHaveValue(tool);
      for (const command of expectedCommands) {
        expect(historyButton(command)).toBeVisible();
      }
      const hidden = scenario.commands.filter((command) => command.tool !== tool);
      for (const command of hidden) {
        expect(within(commandHistory()).queryByText(command.purpose)).toBeNull();
      }
      expect(commandOutput()).toHaveTextContent(expectedOutput.trim());
      expect(screen.queryByRole('button', { name: 'Follow latest' })).toBeNull();
    },
  );

  it('hides read-only commands and follows the latest remaining command', async () => {
    const user = userEvent.setup();
    renderAuditPanel();
    await user.click(historyButton(scenario.olderGit));

    const hideReadOnly = screen.getByRole('checkbox', { name: 'Hide read-only' });
    await user.click(hideReadOnly);

    expect(hideReadOnly).toBeChecked();
    expect(historyButton(scenario.shell)).toBeVisible();
    expect(within(commandHistory()).queryByText(scenario.latestGit.purpose)).toBeNull();
    expect(within(commandHistory()).queryByText(scenario.github.purpose)).toBeNull();
    expect(within(commandHistory()).queryByText(scenario.olderGit.purpose)).toBeNull();
    expect(commandOutput()).toHaveTextContent(scenario.expectedOutput.shell.trim());
    expect(screen.queryByRole('button', { name: 'Follow latest' })).toBeNull();
  });

  it('shows list and output empty states when no command matches', async () => {
    const user = userEvent.setup();
    renderAuditPanel({ commands: [scenario.latestGit] });

    await user.click(screen.getByRole('checkbox', { name: 'Hide read-only' }));

    expect(screen.getByText('No matching commands.')).toBeVisible();
    expect(screen.getByText('Command output will appear here')).toBeVisible();
  });

  it('groups repeated read-only invocations and renders every call newest first', () => {
    renderAuditPanel({ commands: scenario.repeatedReadOnly.commands });

    expect(within(commandHistory()).getByLabelText('2 calls')).toBeVisible();
    expect(within(commandHistory()).getAllByRole('button')).toHaveLength(1);
    const latestOutput = within(commandOutput()).getByText(
      scenario.expectedOutput.repeatedLatest.trim(),
    );
    const olderOutput = within(commandOutput()).getByText(
      scenario.expectedOutput.repeatedOlder.trim(),
    );
    expect(latestOutput).toAppearBefore(olderOutput);
    expect(
      within(commandOutput()).getAllByRole('button', { name: 'Copy full command' }),
    ).toHaveLength(2);
  });

  it.each([
    {
      status: 'running' as const,
      statusLabel: 'Running',
      output: 'Running…',
    },
    {
      status: 'succeeded' as const,
      statusLabel: 'Succeeded',
      output: 'Command completed without output.',
    },
  ])('shows the $status output fallback', ({ status, statusLabel, output }) => {
    const command = commandRecordFactory.build({ status, output: [] });
    renderAuditPanel({ commands: [command] });

    expect(within(commandOutput()).getByText(statusLabel)).toBeVisible();
    expect(within(commandOutput()).getByText(output)).toBeVisible();
  });

  it('copies the full command and resets its success announcement', async () => {
    const user = userEvent.setup();
    const copyResult = deferred<void>();
    const copyText = vi.spyOn(api, 'copyText').mockReturnValue(copyResult.promise);
    renderAuditPanel();

    await user.click(
      within(commandOutput()).getByRole('button', { name: 'Copy full command' }),
    );

    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(scenario.latestGit.displayCommand);
    vi.useFakeTimers();
    await act(async () => {
      copyResult.resolve(undefined);
      await copyResult.promise;
    });
    expect(
      within(commandOutput()).getByRole('button', { name: 'Command copied' }),
    ).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(
      within(commandOutput()).getByRole('button', { name: 'Copy full command' }),
    ).toBeVisible();
  });

  it('clears pending copy feedback when unmounted', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'copyText').mockResolvedValue(undefined);
    const { unmount } = renderAuditPanel();

    fireEvent.click(
      within(commandOutput()).getByRole('button', { name: 'Copy full command' }),
    );
    await act(async () => Promise.resolve());

    expect(
      within(commandOutput()).getByRole('button', { name: 'Command copied' }),
    ).toBeVisible();
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a friendly command-copy failure', async () => {
    const user = userEvent.setup();
    const copyText = vi
      .spyOn(api, 'copyText')
      .mockRejectedValue(
        new Error("Error invoking remote method 'grafter:copy-text': Error: failed"),
      );
    const onError = vi.fn();
    renderAuditPanel({ onError });

    await user.click(
      within(commandOutput()).getByRole('button', { name: 'Copy full command' }),
    );

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledWith('failed');
    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(scenario.latestGit.displayCommand);
  });

  it('announces collapsed command activity and the running-command count', () => {
    vi.useFakeTimers();
    const latest = commandRecordFactory.build({
      status: 'running',
      startedAt: '2026-07-20T12:08:00.000',
    });
    const older = commandRecordFactory.build({
      status: 'running',
      startedAt: '2026-07-20T12:07:00.000',
    });
    renderAuditPanel({
      open: false,
      commands: [latest, older],
      latestActivity: latest,
    });

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(screen.getByText(latest.purpose)).toBeVisible();
    expect(screen.getByTitle(`Command log · ${latest.purpose}`)).toBeVisible();
    expect(screen.getByLabelText('2 commands running')).toHaveTextContent('2');
  });

  it('holds completed collapsed activity through its exit transition', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:10:00.000'));
    const completed = commandRecordFactory.build({
      startedAt: '2026-07-20T12:09:00.000',
    });
    renderAuditPanel({
      open: false,
      commands: [completed],
      latestActivity: completed,
    });

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByText(completed.purpose)).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText(completed.purpose)).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(899);
    });
    expect(screen.getByText(completed.purpose)).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText(completed.purpose)).toBeNull();
  });

  it('reports unseen commands while scrolled away and returns to the latest', async () => {
    const user = userEvent.setup();
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(400);
    const { rerender } = renderAuditPanel();
    const history = commandHistory();
    history.scrollTop = 100;
    fireEvent.scroll(history);
    const latestActivity = commandRecordFactory.build({
      id: `${scenario.latestGit.id}-new-activity`,
      context: scenario.latestGit.context,
      args: ['log', '--oneline'],
      startedAt: '2026-07-20T12:05:00.000',
    });
    scrollHeight.mockReturnValue(500);

    rerender(
      auditPanel({
        commands: [latestActivity, ...scenario.commands],
        latestActivity,
      }),
    );

    const newCommands = screen.getByRole('button', { name: '1 new command' });
    expect(newCommands).toBeVisible();
    expect(history.scrollTop).toBe(200);
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
    });
    await user.click(newCommands);

    expect(screen.queryByRole('button', { name: '1 new command' })).toBeNull();
    expect(history.scrollTop).toBe(0);
  });
});
