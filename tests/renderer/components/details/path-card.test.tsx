// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PathCard } from '../../../../src/renderer/components/details/PathCard';
import { api } from '../../../../src/renderer/grafter-api';
import type {
  Worktree,
  WorktreeStatus,
  EditorTool,
} from '../../../../src/shared/contracts';
import { buildWorktreeProjectScenario } from '../../../scenarios/details/worktree-project';

const pathScenario = buildWorktreeProjectScenario({
  project: {
    id: 'project',
    name: 'repo',
    path: '/home/kasia/git/repo',
  },
  mainWorktree: { head: '1234567' },
  details: {
    id: 'project:feature',
    displayName: 'feature',
    path: '/home/kasia/git/repo.worktrees/feature',
    branch: 'feature/change',
    head: '1234567',
  },
  snapshot: { homeDirectory: '/home/kasia/' },
});
const { mainWorktree, details: worktree } = pathScenario;

function renderPathCard(
  nextWorktree: Worktree = worktree,
  status?: WorktreeStatus,
  onCopy: (text: string) => void = () => undefined,
): void {
  render(
    <PathCard
      homeDirectory="/home/kasia/"
      projectWorktrees={[mainWorktree, nextWorktree]}
      worktree={nextWorktree}
      status={status}
      copiedText={undefined}
      onCopy={onCopy}
      onError={() => undefined}
    />,
  );
}

describe('PathCard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    {
      path: '/home/kasia/git/repo.worktrees/feature',
      expectedDisplayedPath: '../repo.worktrees/feature',
    },
    {
      path: '/home/kasia/worktrees/123456/repo',
      expectedDisplayedPath: '~/worktrees/123456/repo',
    },
    {
      path: '/home/marek/repo.worktrees/feature',
      expectedDisplayedPath: '/home/marek/repo.worktrees/feature',
    },
  ])('shows $path as $expectedDisplayedPath', ({ path, expectedDisplayedPath }) => {
    renderPathCard({ ...worktree, path });

    expect(screen.getByText(expectedDisplayedPath, { selector: 'code' })).toBeVisible();
  });

  it('renders copy button that copies the worktree path', async () => {
    const user = userEvent.setup();
    const copyText = vi.fn();
    renderPathCard(worktree, undefined, copyText);

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
    renderPathCard(worktree, status);

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
});
