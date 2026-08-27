// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../src/renderer/grafter-api';
import { DiffWindowApp } from '../../../src/renderer/diff-window/DiffWindowApp';
import type { AppSnapshot } from '../../../src/shared/contracts';
import {
  branchDiffSessionFactory,
  commitDiffSessionFactory,
  settingsFactory,
} from '../../factories';
import {
  getFileSection,
  installDiffViewerObservers,
  type IntersectionObserverHarness,
} from '../diff/diff-viewer-test-harness';
import { buildDiffViewerScenario } from '../../scenarios/diff/diff-viewer';

const scenario = buildDiffViewerScenario();
const textualHunk = scenario.patches.textual.hunks[0];
if (!textualHunk) throw new Error('Expected the scenario to include a textual hunk.');

let intersectionObservers: IntersectionObserverHarness | undefined;

const session = commitDiffSessionFactory.build();

function diffSnapshot(): AppSnapshot {
  return {
    kind: 'diff',
    homeDirectory: '/Users/developer',
    systemLocale: 'en-US',
    settings: settingsFactory.build(),
    toolPreferences: { editor: 'vscode', terminal: 'terminal' },
  };
}

function stubDiffWindowApi(options?: { initError?: Error }): void {
  vi.spyOn(api, 'getDiffWindowInit').mockImplementation(() =>
    options?.initError ? Promise.reject(options.initError) : Promise.resolve({ session }),
  );
  const snapshot = diffSnapshot();
  vi.spyOn(api, 'getSnapshot').mockResolvedValue(snapshot);
  vi.spyOn(api, 'onSnapshotUpdate').mockReturnValue(() => undefined);
}

describe('DiffWindowApp', () => {
  beforeEach(() => {
    intersectionObservers = installDiffViewerObservers();
  });

  afterEach(() => {
    cleanup();
    intersectionObservers?.reset();
    intersectionObservers = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the bootstrapped diff session as the window surface', async () => {
    stubDiffWindowApi();

    render(<DiffWindowApp />);

    const surface = await screen.findByRole('region', {
      name: `Changes in commit ${session.commit.hash}`,
    });
    expect(surface).toBeVisible();
    // Closing is owned by the macOS traffic lights, not an in-page control.
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('explains a failed bootstrap instead of rendering an empty window', async () => {
    stubDiffWindowApi({ initError: new Error('No pending diff initialization.') });

    render(<DiffWindowApp />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to open this diff.');
    });
    expect(screen.queryByRole('region', { name: /Changes in commit/ })).toBeNull();
  });

  it('requests closing its own window with Escape', async () => {
    stubDiffWindowApi();
    const closeDiffWindow = vi.spyOn(api, 'closeDiffWindow').mockResolvedValue(undefined);

    render(<DiffWindowApp />);
    await screen.findByRole('region', { name: /Changes in commit/ });
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(closeDiffWindow).toHaveBeenCalledOnce();
    });
  });

  it('reloads patches from scratch when the toolbar replaces the session', async () => {
    const user = userEvent.setup();
    // A rebased comparison whose single file keeps the positional file id of
    // the first session's content, like two real git sessions do.
    const rebasedSession = branchDiffSessionFactory.build({
      id: 'rebased-diff-session',
      projectId: scenario.projectId,
      branch: scenario.branches.alternativeSource,
      targetBranch: scenario.branches.target,
      baseSha: scenario.branchSession.baseSha,
      headSha: scenario.branchSession.headSha,
      githubRepository: scenario.githubRepository,
      stats: { files: 1, additions: 2, deletions: 1 },
      files: [scenario.files.renamed],
    });
    vi.spyOn(api, 'getDiffWindowInit').mockResolvedValue({
      session: scenario.branchSession,
    });
    vi.spyOn(api, 'getSnapshot').mockResolvedValue(diffSnapshot());
    vi.spyOn(api, 'onSnapshotUpdate').mockReturnValue(() => undefined);
    vi.spyOn(api, 'listBranches').mockResolvedValue(scenario.branches.available);
    const openBranchDiff = vi
      .spyOn(api, 'openBranchDiff')
      .mockResolvedValue(rebasedSession);
    const getDiffFile = vi
      .spyOn(api, 'getDiffFile')
      .mockReturnValue(Promise.resolve(scenario.patches.textual));

    render(<DiffWindowApp />);
    await screen.findByRole('region', {
      name: `Committed changes from ${scenario.branches.source} against ${scenario.branches.target}`,
    });

    act(() =>
      intersectionObservers?.notify(getFileSection(scenario.files.renamed), true),
    );
    await waitFor(() =>
      expect(getDiffFile).toHaveBeenCalledWith({
        sessionId: scenario.branchSession.id,
        fileId: scenario.files.renamed.id,
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Choose source branch' }));
    await user.click(
      await screen.findByRole('button', { name: scenario.branches.alternativeSource }),
    );
    expect(openBranchDiff).toHaveBeenCalledOnce();
    expect(openBranchDiff).toHaveBeenCalledWith({
      sourceBranch: scenario.branches.alternativeSource,
      targetBranch: scenario.branches.target,
    });

    await screen.findByRole('region', {
      name: `Committed changes from ${scenario.branches.alternativeSource} against ${scenario.branches.target}`,
    });

    // The viewer restarts per session: positional file ids repeat across git
    // sessions, so the stale patch cache and request ledger must not survive.
    act(() =>
      intersectionObservers?.notify(getFileSection(scenario.files.renamed), true),
    );
    await waitFor(() =>
      expect(getDiffFile).toHaveBeenCalledWith({
        sessionId: rebasedSession.id,
        fileId: scenario.files.renamed.id,
      }),
    );
    expect(getDiffFile).toHaveBeenCalledTimes(2);
  });
});
