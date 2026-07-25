// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorktreeDetailsView } from '../../../../src/renderer/components/details/WorktreeDetailsView';
import { api } from '../../../../src/renderer/grafter-api';
import type { Settings } from '../../../../src/shared/contracts';
import { settingsFactory } from '../../../factories';
import { buildWorktreeProjectScenario } from '../../../scenarios/details/worktree-project';
import { deferred } from '../../../support/deferred';

const detailsScenario = buildWorktreeProjectScenario({
  project: {
    id: 'project',
    name: 'repo',
    path: '/home/kasia/git/repo',
  },
  mainWorktree: { head: '7654321' },
  details: {
    id: 'project:feature',
    displayName: 'feature',
    path: '/home/kasia/git/repo.worktrees/feature',
    branch: 'feature/change',
    head: '1234567',
    automaticBaseBranch: 'main',
  },
  snapshot: { homeDirectory: '/home/kasia/' },
});
const { mainWorktree, details } = detailsScenario;
const settings: Pick<Settings, 'dateFormat' | 'timeFormat'> = settingsFactory.build({
  dateFormat: 'year-month-day',
  timeFormat: '24-hour',
});

function renderWorktreeDetailsView(
  onError: (message: string) => void = () => undefined,
): void {
  render(
    <WorktreeDetailsView
      homeDirectory="/home/kasia/"
      settings={settings}
      systemLocale="en-GB"
      details={details}
      projectWorktrees={[mainWorktree, details]}
      status="clean"
      onSnapshot={() => undefined}
      onOpenDiff={() => undefined}
      onOpenCommitDiff={() => undefined}
      onError={onError}
    />,
  );
}

describe('WorktreeDetailsView', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('composes the path, branch, and branch changes cards in order', () => {
    renderWorktreeDetailsView();

    const pathCardLabel = screen.getByText('WORKTREE PATH');
    const branchCard = screen.getByLabelText('Checked-out branch');
    const branchChangesCard = screen.getByLabelText('Branch changes');

    expect(pathCardLabel).toBeVisible();
    expect(branchCard).toBeVisible();
    expect(branchChangesCard).toBeVisible();
    expect(pathCardLabel).toAppearBefore(branchCard);
    expect(branchCard).toAppearBefore(branchChangesCard);
  });

  it('copies text and clears the copied feedback after its display period', async () => {
    const user = userEvent.setup();
    const copyResult = deferred<void>();
    const copyText = vi.spyOn(api, 'copyText').mockReturnValue(copyResult.promise);
    renderWorktreeDetailsView();

    const copyButton = screen.getByRole('button', { name: 'Copy worktree path' });
    expect(copyButton).toBeVisible();
    await user.click(copyButton);

    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(details.path);
    vi.useFakeTimers();
    await act(async () => {
      copyResult.resolve(undefined);
      await copyResult.promise;
    });
    expect(screen.getByRole('button', { name: 'Worktree path copied' })).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(screen.getByRole('button', { name: 'Copy worktree path' })).toBeVisible();
  });

  it('reports a clipboard failure', async () => {
    const user = userEvent.setup();
    const copyText = vi
      .spyOn(api, 'copyText')
      .mockRejectedValue(
        new Error("Error invoking remote method 'grafter:copy-text': Error: failed"),
      );
    const onError = vi.fn();
    renderWorktreeDetailsView(onError);

    await user.click(screen.getByRole('button', { name: 'Copy worktree path' }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(onError).toHaveBeenCalledWith('failed');
    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText).toHaveBeenCalledWith(details.path);
  });
});
