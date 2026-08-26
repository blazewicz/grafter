import { describe, expect, it, vi } from 'vitest';
import { ApplicationRuntime } from '../../src/main/application-runtime';
import type { RepositoryLocation } from '../../src/main/services/repository-locator';
import { RepositoryService } from '../../src/main/services/repository-service';
import { StateStore } from '../../src/main/store';
import type { AppSnapshot } from '../../src/shared/contracts';
import { ipc } from '../../src/shared/ipc';
import { WindowManager } from '../../src/main/window-manager';
import type { WindowSessionService } from '../../src/main/window-session-services';
import { WindowSessionRegistry } from '../../src/main/window-sessions';
import { FakeSender, FakeWindow } from './support/fake-window';
import { StubCommandRunner } from './support/stub-command-runner';

const commitSha = 'a'.repeat(40);
const parentSha = 'b'.repeat(40);
const projectId = 'repository-1';

/** A non-main feature worktree and the main worktree it compares against. */
const featureOne = {
  id: `${projectId}:/repositories/alpha`,
  branch: 'feature/one',
};
const featureTwo = {
  id: `${projectId}:/repositories/alpha-two`,
  branch: 'feature/two',
};
function shaFor(seed: string): string {
  const encoded = [...seed]
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
  return encoded.padEnd(40, '0').slice(0, 40);
}

interface DiffHarness {
  manager: WindowManager<FakeSender, FakeWindow>;
  sessions: WindowSessionRegistry<FakeSender, FakeWindow, WindowSessionService>;
  windows: FakeWindow[];
  loadedKinds: ('app' | 'diff')[];
  runner: StubCommandRunner;
  repositoryServices: RepositoryService[];
  setLoader(load: (kind: 'app' | 'diff') => Promise<void>): void;
}

function repositoryLocation(name: string): RepositoryLocation {
  const mainWorktreePath = `/repositories/${name}`;
  return {
    name,
    commonDirectoryPath: `${mainWorktreePath}/.git`,
    mainWorktreePath,
    selectedWorktreePath: mainWorktreePath,
  };
}

function worktreeOutput(location: RepositoryLocation): string {
  return [
    `worktree ${location.mainWorktreePath}`,
    `HEAD ${shaFor(featureOne.branch)}`,
    `branch refs/heads/${featureOne.branch}`,
    '',
    `worktree /repositories/alpha-two`,
    `HEAD ${shaFor(featureTwo.branch)}`,
    `branch refs/heads/${featureTwo.branch}`,
    '',
  ].join('\n');
}

function gitStub(locations: Map<string, RepositoryLocation>) {
  return (spec: {
    tool: string;
    args: readonly string[];
    cwd: string;
  }): { stdout?: string; exitCode?: number } => {
    if (spec.tool === 'git' && spec.args[0] === 'worktree') {
      const location = [...locations.values()].find(
        (candidate) => candidate.mainWorktreePath === spec.cwd,
      );
      if (!location) throw new Error(`Unexpected repository: ${spec.cwd}`);
      return { stdout: worktreeOutput(location) };
    }
    if (spec.tool === 'git' && spec.args[0] === 'remote' && spec.args[1] === '-v') {
      return { stdout: '' };
    }
    if (
      spec.tool === 'git' &&
      spec.args[0] === 'symbolic-ref' &&
      spec.args[1] === '--short'
    ) {
      // The remote HEAD becomes the automatic comparison target branch.
      return { stdout: 'origin/main\n' };
    }
    if (
      spec.tool === 'git' &&
      spec.args[0] === 'rev-parse' &&
      spec.args[1] === '--verify' &&
      typeof spec.args[2] === 'string'
    ) {
      const reference = spec.args[2].replace(/\^\{commit\}$/, '');
      // Full object ids resolve to themselves; branch names get stable ids.
      if (/^[0-9a-f]{40}$/.test(reference)) return { stdout: `${reference}\n` };
      return { stdout: `${shaFor(reference.replace('refs/heads/', ''))}\n` };
    }
    if (spec.tool === 'git' && spec.args[0] === 'merge-base') {
      return { stdout: `${parentSha}\n` };
    }
    if (spec.tool === 'git' && spec.args[0] === 'show') {
      return { stdout: `${parentSha}\n` };
    }
    if (spec.tool === 'git' && spec.args[0] === 'log' && spec.args[1] === '-1') {
      const resolvedSha = spec.args.at(-1) ?? commitSha;
      return {
        stdout: [
          resolvedSha,
          'Ada Lovelace',
          'ada@example.com',
          '2026-02-01T10:00:00Z',
          'Add analysis engine',
          '',
          '\x00',
          '4\t2\tsrc/engine.ts',
        ].join('\n'),
      };
    }
    if (spec.tool === 'git' && spec.args[0] === 'diff') {
      if (spec.args[1] === '--name-status') {
        return { stdout: `M\x00src/engine.ts\x00` };
      }
      return { stdout: `4\t2\tsrc/engine.ts\x00` };
    }
    if (spec.tool === 'github') return { exitCode: 1 };
    throw new Error(`Unexpected command: ${spec.tool} ${spec.args.join(' ')}`);
  };
}

function createHarness(repositoryName = 'alpha'): DiffHarness {
  const locations = new Map<string, RepositoryLocation>();
  const location = repositoryLocation(repositoryName);
  locations.set(location.mainWorktreePath, location);

  const store = new StateStore('/unused', { persist: () => Promise.resolve() });
  const runner = new StubCommandRunner(gitStub(locations));
  const runtime = new ApplicationRuntime({ commandRunner: runner });
  const sessions = new WindowSessionRegistry<
    FakeSender,
    FakeWindow,
    WindowSessionService
  >();
  const windows: FakeWindow[] = [];
  const loadedKinds: ('app' | 'diff')[] = [];
  const repositoryServices: RepositoryService[] = [];
  let load: (kind: 'app' | 'diff') => Promise<void> = () => Promise.resolve();
  const manager = new WindowManager({
    store,
    runtime,
    sessions,
    createWindow: () => {
      const window = new FakeWindow();
      windows.push(window);
      return window;
    },
    loadWindow: (_window, kind) => {
      loadedKinds.push(kind);
      return load(kind);
    },
    homeDirectory: '/Users/developer',
    systemLocale: 'en-GB',
    locator: {
      locate: (selectedPath) => {
        const match = locations.get(selectedPath);
        return match
          ? Promise.resolve(match)
          : Promise.reject(new Error(`Missing repository: ${selectedPath}`));
      },
    },
    createRepositoryId: () => projectId,
    createRepositoryService: (project, canonicalRepositoryKey) => {
      const service = new RepositoryService(
        project,
        canonicalRepositoryKey,
        store,
        runtime,
      );
      repositoryServices.push(service);
      return service;
    },
  });
  return {
    manager,
    sessions,
    windows,
    loadedKinds,
    runner,
    repositoryServices,
    setLoader: (next) => {
      load = next;
    },
  };
}

async function openRepository(harness: DiffHarness): Promise<FakeWindow> {
  const welcome = await harness.manager.ensureWelcomeWindow();
  await harness.manager.openRepository(welcome.webContents, '/repositories/alpha');
  // The welcome window is converted in place; the first entry is the repo window.
  const repo = harness.windows[0];
  if (!repo) throw new Error('Expected a repository window.');
  return repo;
}

describe('WindowManager diff windows', () => {
  it('opens a commit diff in a dedicated diff-kind window and hands over its session', async () => {
    const harness = createHarness();
    const repoWindow = await openRepository(harness);

    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: commitSha,
    });

    expect(harness.windows).toHaveLength(2);
    expect(harness.loadedKinds).toEqual(['app', 'diff']);
    const diffWindow = harness.windows[1];
    if (!diffWindow) throw new Error('Expected a diff window.');
    expect(diffWindow.focusCalls).toBeGreaterThan(0);

    const init = harness.manager.diffWindowInit(diffWindow.webContents);
    expect(init?.kind).toBe('commit');
    expect(init?.headSha).toBe(commitSha);
    expect(init?.files.map((file) => file.path)).toEqual(['src/engine.ts']);

    // Unknown senders never receive an initialization payload.
    expect(harness.manager.diffWindowInit(new FakeSender())).toBeUndefined();
  });

  it('focuses the existing window when the same commit is opened again', async () => {
    const harness = createHarness();
    const repoWindow = await openRepository(harness);
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: commitSha,
    });
    const diffWindow = harness.windows[1];
    if (!diffWindow) throw new Error('Expected a diff window.');
    const focusCalls = diffWindow.focusCalls;

    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: commitSha,
    });

    expect(harness.windows).toHaveLength(2);
    expect(diffWindow.focusCalls).toBe(focusCalls + 1);
  });

  it('evicts the freshly created session when an identical diff is already open', async () => {
    const harness = createHarness();
    const repoWindow = await openRepository(harness);
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: commitSha,
    });
    const diffWindow = harness.windows[1];
    if (!diffWindow) throw new Error('Expected a diff window.');
    const keptId = harness.manager.diffWindowInit(diffWindow.webContents)?.id;
    if (!keptId) throw new Error('Expected an initialization payload.');
    const repository = harness.repositoryServices[0];
    if (!repository) throw new Error('Expected a repository service.');
    const closeDiff = vi.spyOn(repository, 'closeDiff');

    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: commitSha,
    });

    // The duplicate open must not leak its freshly minted git session into the
    // session LRU, where it could eventually evict a live window's session.
    expect(closeDiff).toHaveBeenCalledOnce();
    expect(closeDiff).not.toHaveBeenCalledWith(keptId);
  });

  it('leaves no stale bookkeeping when loading a diff window fails', async () => {
    const harness = createHarness();
    const repoWindow = await openRepository(harness);

    harness.setLoader((kind) =>
      kind === 'diff' ? Promise.reject(new Error('load failed')) : Promise.resolve(),
    );
    await expect(
      harness.manager.openDiffWindow(repoWindow.webContents, {
        kind: 'commit',
        commitHash: commitSha,
      }),
    ).rejects.toThrow('load failed');
    const failedWindow = harness.windows[1];
    if (!failedWindow) throw new Error('Expected the discarded window.');
    expect(failedWindow.destroyed).toBe(true);
    expect(harness.manager.diffWindowInit(failedWindow.webContents)).toBeUndefined();

    harness.setLoader(() => Promise.resolve());
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: commitSha,
    });

    // The failed attempt must not linger in the dedupe index or the retry
    // would focus-and-leak instead of creating a working window.
    expect(harness.windows).toHaveLength(3);
    const retryWindow = harness.windows[2];
    if (!retryWindow) throw new Error('Expected the retry to create a window.');
    expect(retryWindow.destroyed).toBe(false);
    expect(harness.manager.diffWindowInit(retryWindow.webContents)?.headSha).toBe(
      commitSha,
    );
  });

  it('coalesces concurrent opens of the same commit into one window', async () => {
    const harness = createHarness();
    const repoWindow = await openRepository(harness);

    await Promise.all([
      harness.manager.openDiffWindow(repoWindow.webContents, {
        kind: 'commit',
        commitHash: commitSha,
      }),
      harness.manager.openDiffWindow(repoWindow.webContents, {
        kind: 'commit',
        commitHash: commitSha,
      }),
    ]);

    expect(harness.windows).toHaveLength(2);
  });

  it('opens distinct commits as separate windows', async () => {
    const harness = createHarness();
    const repoWindow = await openRepository(harness);
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: commitSha,
    });

    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: parentSha,
    });

    expect(harness.windows).toHaveLength(3);
    const secondDiff = harness.windows[2];
    if (!secondDiff) throw new Error('Expected a second diff window.');
    expect(harness.manager.diffWindowInit(secondDiff.webContents)?.headSha).toBe(
      parentSha,
    );
  });

  it('propagates shared settings updates to open diff windows', async () => {
    const harness = createHarness();
    const repoWindow = await openRepository(harness);
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: commitSha,
    });
    const diffWindow = harness.windows[1];
    if (!diffWindow) throw new Error('Expected a diff window.');

    await harness.manager.updateSettings(repoWindow.webContents, {
      defaultWorktreePath: '../<repo_name>.worktrees',
      dateFormat: 'month-day-year',
      timeFormat: '12-hour',
    });

    const pushed = diffWindow.webContents.sent.filter(
      (update) => update.channel === ipc.snapshotUpdate,
    );
    const latest = pushed[pushed.length - 1]?.value;
    if (!isDiffSnapshot(latest)) throw new Error('Expected a diff snapshot push.');
    expect(latest.settings.dateFormat).toBe('month-day-year');
    expect(latest.settings.timeFormat).toBe('12-hour');
  });

  it('cascades closing the repository window to its diff windows', async () => {
    const harness = createHarness();
    const repoWindow = await openRepository(harness);
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: commitSha,
    });
    const diffWindow = harness.windows[1];
    if (!diffWindow) throw new Error('Expected a diff window.');

    repoWindow.close();

    expect(diffWindow.destroyed).toBe(true);
    // The un-consumed initialization payload is dropped on teardown.
    expect(harness.manager.diffWindowInit(diffWindow.webContents)).toBeUndefined();
  });

  it('keeps the initialization payload until the window consumes it', async () => {
    const harness = createHarness();
    const repoWindow = await openRepository(harness);
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: commitSha,
    });
    const diffWindow = harness.windows[1];
    if (!diffWindow) throw new Error('Expected a diff window.');

    expect(harness.manager.diffWindowInit(diffWindow.webContents)).toBeDefined();
  });

  it('dedupes worktree diffs by their comparison pair and follows toolbar retargets', async () => {
    const harness = createHarness();
    const repoWindow = await openRepository(harness);
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'worktree',
      worktreeId: featureOne.id,
    });
    const firstDiff = harness.windows[1];
    if (!firstDiff) throw new Error('Expected a diff window.');

    // Opening the same worktree again focuses the existing window.
    const focusCalls = firstDiff.focusCalls;
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'worktree',
      worktreeId: featureOne.id,
    });
    expect(harness.windows).toHaveLength(2);
    expect(firstDiff.focusCalls).toBe(focusCalls + 1);

    // A toolbar rebase inside the window retargets its dedupe identity.
    const diffSession = harness.sessions.resolve(firstDiff.webContents).service;
    await diffSession.openBranchDiff({
      sourceBranch: featureTwo.branch,
      targetBranch: 'main',
    });

    // The vacated identity must create a fresh window instead of focusing
    // the one that moved away…
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'worktree',
      worktreeId: featureOne.id,
    });
    expect(harness.windows).toHaveLength(3);
    const freshWindow = harness.windows[2];
    if (!freshWindow) throw new Error('Expected a new diff window.');
    expect(harness.manager.diffWindowInit(freshWindow.webContents)?.headSha).toBe(
      shaFor(featureOne.branch),
    );

    // …while the retargeted identity still dedupes onto the rebased window.
    const beforeRetargetFocus = firstDiff.focusCalls;
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'worktree',
      worktreeId: featureTwo.id,
    });
    expect(harness.windows).toHaveLength(3);
    expect(firstDiff.focusCalls).toBe(beforeRetargetFocus + 1);
  });

  it('caps live diff windows per repository instead of letting the LRU evict them', async () => {
    const harness = createHarness();
    const repoWindow = await openRepository(harness);
    const commitAt = (index: number): string =>
      `${String(index)}${'f'.repeat(40 - String(index).length)}`;

    for (let index = 0; index < 10; index += 1) {
      await harness.manager.openDiffWindow(repoWindow.webContents, {
        kind: 'commit',
        commitHash: commitAt(index),
      });
    }
    expect(harness.windows).toHaveLength(11);

    await expect(
      harness.manager.openDiffWindow(repoWindow.webContents, {
        kind: 'commit',
        commitHash: commitAt(10),
      }),
    ).rejects.toThrow('Too many open diff windows for this repository.');
    expect(harness.windows).toHaveLength(11);

    // Closing one window frees capacity.
    const firstDiff = harness.windows[1];
    if (!firstDiff) throw new Error('Expected an open diff window.');
    firstDiff.close();
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: commitAt(10),
    });
    const replacement = harness.windows[11];
    if (!replacement) throw new Error('Expected the replacement diff window.');
    expect(replacement.destroyed).toBe(false);
    expect(harness.manager.diffWindowInit(replacement.webContents)?.headSha).toBe(
      commitAt(10),
    );
  });

  it('propagates tool preference changes from any window to every other window', async () => {
    const harness = createHarness();
    const repoWindow = await openRepository(harness);
    await harness.manager.openDiffWindow(repoWindow.webContents, {
      kind: 'commit',
      commitHash: commitSha,
    });
    const diffWindow = harness.windows[1];
    if (!diffWindow) throw new Error('Expected a diff window.');

    await harness.manager.setToolPreference(diffWindow.webContents, 'terminal', 'iterm2');

    const pushedToRepository = repoWindow.webContents.sent.filter(
      (update) => update.channel === ipc.snapshotUpdate,
    );
    const latest = pushedToRepository[pushedToRepository.length - 1]?.value;
    if (!latest || typeof latest !== 'object' || !('repository' in latest)) {
      throw new Error('Expected a repository snapshot push.');
    }
    const snapshot = latest as Extract<AppSnapshot, { kind: 'repository' }>;
    expect(snapshot.toolPreferences.terminal).toBe('iterm2');
  });
});

function isDiffSnapshot(value: unknown): value is Extract<AppSnapshot, { kind: 'diff' }> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'diff'
  );
}
