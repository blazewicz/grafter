import { describe, expect, it } from 'vitest';
import { ApplicationRuntime } from '../../src/main/application-runtime';
import type { RepositoryLocation } from '../../src/main/services/repository-locator';
import { RepositoryService } from '../../src/main/services/repository-service';
import { StateStore } from '../../src/main/store';
import { WindowManager } from '../../src/main/window-manager';
import type { WindowSessionService } from '../../src/main/window-session-services';
import { WindowSessionRegistry } from '../../src/main/window-sessions';
import { FakeSender, FakeWindow } from './support/fake-window';
import { StubCommandRunner } from './support/stub-command-runner';

const commitSha = 'a'.repeat(40);
const parentSha = 'b'.repeat(40);

interface DiffHarness {
  manager: WindowManager<FakeSender, FakeWindow>;
  windows: FakeWindow[];
  loadedKinds: ('app' | 'diff')[];
  runner: StubCommandRunner;
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
  return `worktree ${location.mainWorktreePath}\nHEAD 1111111\nbranch refs/heads/main\n`;
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
      spec.args[0] === 'rev-parse' &&
      spec.args[1] === '--verify' &&
      spec.args[2]?.endsWith('^{commit}')
    ) {
      return { stdout: `${spec.args[2].replace(/\^\{commit\}$/, '')}\n` };
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
      return Promise.resolve();
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
    createRepositoryId: () => 'repository-1',
    createRepositoryService: (project, canonicalRepositoryKey) =>
      new RepositoryService(project, canonicalRepositoryKey, store, runtime),
  });
  return { manager, windows, loadedKinds, runner };
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
});
