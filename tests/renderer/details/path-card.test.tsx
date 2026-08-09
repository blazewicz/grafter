// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PathCard } from '../../../src/renderer/details/PathCard';
import { api } from '../../../src/renderer/grafter-api';
import type {
  WorktreeStatus,
  EditorTool,
  TerminalTool,
  ToolPickerGroup,
} from '../../../src/shared/contracts';
import {
  buildPathDisplayScenario,
  buildPathDisplayScenarios,
  type PathDisplayScenario,
} from '../../scenarios/details/path-display';

const pathScenario = buildPathDisplayScenario('sibling-of-main');
const pathScenarios = buildPathDisplayScenarios();
const worktree = pathScenario.details;
const defaultToolPreferences = { editor: 'vscode', terminal: 'terminal' };

function PathCardHarness({
  scenario = pathScenario,
  status,
  toolPreferences: initialToolPreferences = defaultToolPreferences,
  onSetToolPreference,
  onCopy = () => undefined,
}: {
  scenario?: PathDisplayScenario | undefined;
  status?: WorktreeStatus | undefined;
  toolPreferences?: Record<ToolPickerGroup, string> | undefined;
  onSetToolPreference?: ((group: ToolPickerGroup, tool: string) => void) | undefined;
  onCopy?: ((text: string) => void) | undefined;
}): React.JSX.Element {
  const [toolPreferences, setToolPreferences] = useState(initialToolPreferences);

  return (
    <PathCard
      homeDirectory={scenario.homeDirectory}
      projectWorktrees={scenario.project.worktrees}
      worktree={scenario.details}
      status={status}
      copiedText={undefined}
      toolPreferences={toolPreferences}
      onSetToolPreference={(group, tool) => {
        onSetToolPreference?.(group, tool);
        setToolPreferences((current) => ({ ...current, [group]: tool }));
      }}
      onCopy={onCopy}
      onError={() => undefined}
    />
  );
}

function renderPathCard(
  scenario: PathDisplayScenario = pathScenario,
  status?: WorktreeStatus,
  onCopy: (text: string) => void = () => undefined,
  toolPreferences?: Record<ToolPickerGroup, string>,
  onSetToolPreference?: (group: ToolPickerGroup, tool: string) => void,
): void {
  render(
    <PathCardHarness
      scenario={scenario}
      status={status}
      toolPreferences={toolPreferences}
      onSetToolPreference={onSetToolPreference}
      onCopy={onCopy}
    />,
  );
}

describe('PathCard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(pathScenarios)(
    'shows the $label topology as $expectedPathCardPath',
    (scenario) => {
      renderPathCard(scenario);

      expect(
        screen.getByText(scenario.expectedPathCardPath, { selector: 'code' }),
      ).toBeVisible();
    },
  );

  it('renders copy button that copies the worktree path', async () => {
    const user = userEvent.setup();
    const copyText = vi.fn();
    renderPathCard(pathScenario, undefined, copyText);

    expect(screen.getByRole('button', { name: 'Copy worktree path' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Copy worktree path' }));

    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(worktree.path);
  });

  it.each([
    {
      status: 'clean' as const,
      label: 'clean',
      title: 'No local changes',
    },
    {
      status: 'dirty' as const,
      label: 'dirty',
      title: 'Uncommitted local changes are present',
    },
    {
      status: undefined,
      label: 'checking',
      title: 'Checking for local changes',
    },
  ])('renders the $label workspace status pill', ({ status, label, title }) => {
    renderPathCard(pathScenario, status);

    expect(screen.getByTitle(title)).toHaveTextContent(label);
  });

  it('renders open-worktree-directory button that opens the worktree directory', async () => {
    const user = userEvent.setup();
    const openWorktreeDirectory = vi
      .spyOn(api, 'openWorktreeDirectory')
      .mockResolvedValue(undefined);
    renderPathCard();

    expect(screen.getByRole('button', { name: 'Open worktree directory' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open worktree directory' }));

    expect(openWorktreeDirectory).toHaveBeenCalledOnce();
    expect(openWorktreeDirectory).toHaveBeenCalledWith(worktree.id);
  });

  it('renders open-worktree-in-terminal button that opens the worktree in the current terminal', async () => {
    const user = userEvent.setup();
    const openWorktreeInTerminal = vi
      .spyOn(api, 'openWorktreeInTerminal')
      .mockResolvedValue(undefined);
    renderPathCard();

    expect(
      screen.getByRole('button', { name: 'Open worktree in Terminal' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open worktree in Terminal' }));

    expect(openWorktreeInTerminal).toHaveBeenCalledOnce();
    expect(openWorktreeInTerminal).toHaveBeenCalledWith(worktree.id, 'terminal');
  });

  it.each([
    { name: 'Terminal', terminal: 'terminal' },
    { name: 'iTerm2', terminal: 'iterm2' },
  ] satisfies { name: string; terminal: TerminalTool }[])(
    'renders terminal picker with $name as an option and opens it when selected and sets as the current terminal',
    async ({ name, terminal }) => {
      const user = userEvent.setup();
      const openWorktreeInTerminal = vi
        .spyOn(api, 'openWorktreeInTerminal')
        .mockResolvedValue(undefined);
      renderPathCard();

      expect(screen.getByRole('button', { name: 'Choose terminal' })).toBeVisible();
      const terminalPickerButton = screen.getByRole('button', {
        name: 'Choose terminal',
      });
      await user.click(terminalPickerButton);

      expect(terminalPickerButton).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menu')).toBeVisible();

      await user.click(screen.getByRole('menuitem', { name }));

      expect(openWorktreeInTerminal).toHaveBeenCalledOnce();
      expect(openWorktreeInTerminal).toHaveBeenCalledWith(worktree.id, terminal);

      expect(
        screen.getByRole('button', { name: `Open worktree in ${name}` }),
      ).toBeVisible();
    },
  );

  it('renders open-worktree-in-editor button that opens the worktree in the current editor', async () => {
    const user = userEvent.setup();
    const openWorktreeInEditor = vi
      .spyOn(api, 'openWorktreeInEditor')
      .mockResolvedValue(undefined);
    renderPathCard();

    expect(
      screen.getByRole('button', { name: 'Open worktree in Visual Studio Code' }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Open worktree in Visual Studio Code' }),
    );

    expect(openWorktreeInEditor).toHaveBeenCalledOnce();
    expect(openWorktreeInEditor).toHaveBeenCalledWith(worktree.id, 'vscode');
  });

  it.each([
    { name: 'Visual Studio Code', editor: 'vscode' },
    // Reserved for future options.
  ] satisfies { name: string; editor: EditorTool }[])(
    'renders editor picker with $name as an option and opens it when selected and sets as the current editor',
    async ({ name, editor }) => {
      const user = userEvent.setup();
      const openWorktreeInEditor = vi
        .spyOn(api, 'openWorktreeInEditor')
        .mockResolvedValue(undefined);
      renderPathCard();

      expect(screen.getByRole('button', { name: 'Choose IDE' })).toBeVisible();
      const editorPickerButton = screen.getByRole('button', { name: 'Choose IDE' });
      await user.click(editorPickerButton);

      expect(editorPickerButton).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menu')).toBeVisible();

      await user.click(screen.getByRole('menuitem', { name }));

      expect(openWorktreeInEditor).toHaveBeenCalledOnce();
      expect(openWorktreeInEditor).toHaveBeenCalledWith(worktree.id, editor);

      expect(
        screen.getByRole('button', { name: `Open worktree in ${name}` }),
      ).toBeVisible();
    },
  );

  it('persists a tool preference and reflects it as the current terminal', async () => {
    const user = userEvent.setup();
    const openWorktreeInTerminal = vi
      .spyOn(api, 'openWorktreeInTerminal')
      .mockResolvedValue(undefined);
    const onSetToolPreference = vi.fn();
    renderPathCard(
      pathScenario,
      undefined,
      () => undefined,
      defaultToolPreferences,
      onSetToolPreference,
    );

    await user.click(screen.getByRole('button', { name: 'Choose terminal' }));
    await user.click(screen.getByRole('menuitem', { name: 'iTerm2' }));

    expect(onSetToolPreference).toHaveBeenCalledWith('terminal', 'iterm2');
    expect(openWorktreeInTerminal).toHaveBeenCalledWith(worktree.id, 'iterm2');
    expect(screen.getByRole('button', { name: 'Open worktree in iTerm2' })).toBeVisible();
  });

  it('renders the persisted terminal as the current tool', () => {
    renderPathCard(pathScenario, undefined, () => undefined, {
      editor: 'vscode',
      terminal: 'iterm2',
    });

    expect(screen.getByRole('button', { name: 'Open worktree in iTerm2' })).toBeVisible();
  });

  it.each([
    { chooseLabel: 'Choose terminal', launchMethod: 'openWorktreeInTerminal' },
    { chooseLabel: 'Choose IDE', launchMethod: 'openWorktreeInEditor' },
  ] as const)(
    'closes the $chooseLabel menu with Escape without launching',
    async ({ chooseLabel, launchMethod }) => {
      const user = userEvent.setup();
      const launch = vi.spyOn(api, launchMethod).mockResolvedValue(undefined);
      renderPathCard();

      const pickerButton = screen.getByRole('button', { name: chooseLabel });
      await user.click(pickerButton);

      expect(pickerButton).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menu')).toBeVisible();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('menu')).toBeNull();
      expect(pickerButton).toHaveAttribute('aria-expanded', 'false');
      expect(launch).not.toHaveBeenCalled();
    },
  );
});
