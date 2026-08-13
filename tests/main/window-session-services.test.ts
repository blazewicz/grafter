import { describe, expect, it, vi } from 'vitest';
import { ApplicationRuntime } from '../../src/main/application-runtime';
import { CommandRunner } from '../../src/main/commands';
import { RepositoryService } from '../../src/main/services/repository-service';
import { StateStore } from '../../src/main/store';
import { RepositoryWindowSession } from '../../src/main/window-session-services';
import type {
  CommandContext,
  CommandRecord,
  ProjectConfig,
} from '../../src/shared/contracts';
import { projectConfigFactory } from '../factories';
import { deferred } from '../support/deferred';
import { StubCommandRunner } from './support/stub-command-runner';

describe('RepositoryWindowSession isolation', () => {
  it('exposes exactly one repository and filters command events to it', async () => {
    const firstProject = projectConfigFactory.build();
    const secondProject = projectConfigFactory.build();
    const store = new StateStore('/unused', { persist: () => Promise.resolve() });
    await store.addRepository(firstProject);
    await store.addRepository(secondProject);
    const runtime = new ApplicationRuntime();
    const first = createSession(firstProject, store, runtime);
    const second = createSession(secondProject, store, runtime);
    const firstCommands: CommandRecord[] = [];
    const secondCommands: CommandRecord[] = [];
    first.subscribeToCommandUpdates((record) => firstCommands.push(record));
    second.subscribeToCommandUpdates((record) => secondCommands.push(record));

    const firstRecord = runtime.commandRunner.createPending(
      commandSpec({ kind: 'project', projectId: firstProject.id }),
    );
    const secondRecord = runtime.commandRunner.createPending(
      commandSpec({ kind: 'project', projectId: secondProject.id }),
    );
    runtime.commandRunner.createPending(commandSpec({ kind: 'application' }));

    expect(first.snapshot()).toMatchObject({
      kind: 'repository',
      repository: { id: firstProject.id },
    });
    expect(second.snapshot()).toMatchObject({
      kind: 'repository',
      repository: { id: secondProject.id },
    });
    expect(firstCommands.map((record) => record.id)).toEqual([firstRecord.id]);
    expect(secondCommands.map((record) => record.id)).toEqual([secondRecord.id]);
    expect(first.commandLog({ kind: 'repository' }).map((record) => record.id)).toEqual([
      firstRecord.id,
    ]);
    expect(second.commandLog({ kind: 'repository' }).map((record) => record.id)).toEqual([
      secondRecord.id,
    ]);
    expect(() =>
      first.commandLog({ kind: 'repository', projectId: secondProject.id }),
    ).toThrow('Invalid command log scope');
    expect(() =>
      first.commandLog({ kind: 'worktree', worktreeId: `${secondProject.id}:main` }),
    ).toThrow('Worktree not found');

    first.dispose();
    second.dispose();
  });

  it('stops snapshot and command publication after disposal', async () => {
    const project = projectConfigFactory.build();
    const store = new StateStore('/unused', { persist: () => Promise.resolve() });
    await store.addRepository(project);
    const runtime = new ApplicationRuntime();
    const session = createSession(project, store, runtime);
    const snapshotSubscriber = vi.fn();
    const commandSubscriber = vi.fn();
    session.subscribeToSnapshotUpdates(snapshotSubscriber);
    session.subscribeToCommandUpdates(commandSubscriber);

    session.dispose();
    runtime.commandRunner.createPending(
      commandSpec({ kind: 'project', projectId: project.id }),
    );

    expect(snapshotSubscriber).not.toHaveBeenCalled();
    expect(commandSubscriber).not.toHaveBeenCalled();
  });

  it('uses the shared repository-refresh limit and releases capacity after failure', async () => {
    const limit = ApplicationRuntime.maximumConcurrentRepositoryRefreshes;
    const projects = projectConfigFactory.buildList(limit + 1);
    const store = new StateStore('/unused', { persist: () => Promise.resolve() });
    for (const project of projects) await store.addRepository(project);
    const refreshLimitReached = deferred<void>();
    const queuedRefreshStarted = deferred<void>();
    const releaseFailure = deferred<void>();
    const releaseSuccessfulRefreshes = deferred<void>();
    let started = 0;
    let active = 0;
    let maximumActive = 0;
    const runner = new StubCommandRunner(async (spec) => {
      if (
        spec.tool !== 'git' ||
        (spec.args[0] !== 'worktree' && spec.args[0] !== 'status')
      ) {
        throw new Error('Unexpected command.');
      }
      if (spec.args[0] === 'status') return { stdout: '' };
      started += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (started === limit) refreshLimitReached.resolve();
      if (started === limit + 1) queuedRefreshStarted.resolve();
      if (spec.cwd === projects[0]?.path) {
        await releaseFailure.promise;
        active -= 1;
        throw new Error('Repository refresh failed.');
      }
      await releaseSuccessfulRefreshes.promise;
      active -= 1;
      return {
        stdout: `worktree ${spec.cwd}\nHEAD 1111111\nbranch refs/heads/main\n`,
      };
    });
    const runtime = new ApplicationRuntime({ commandRunner: runner });
    const sessions = projects.map((project) => createSession(project, store, runtime));

    const refreshes = sessions.map((session) => session.refresh());
    await refreshLimitReached.promise;
    expect(started).toBe(limit);
    expect(maximumActive).toBe(limit);

    releaseFailure.resolve();
    await queuedRefreshStarted.promise;
    expect(started).toBe(limit + 1);
    expect(maximumActive).toBe(limit);
    releaseSuccessfulRefreshes.resolve();

    const results = await Promise.allSettled(refreshes);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(limit);
    expect(ApplicationRuntime.maximumConcurrentRepositoryRefreshes).toBeLessThan(
      CommandRunner.maximumConcurrentCommands,
    );
    for (const session of sessions) session.dispose();
  });
});

function createSession(
  project: ProjectConfig,
  store: StateStore,
  runtime: ApplicationRuntime,
): RepositoryWindowSession {
  return new RepositoryWindowSession(
    new RepositoryService(project, `${project.path}/.git`, store, runtime),
    store,
    runtime,
    { homeDirectory: '/Users/developer', systemLocale: 'en-GB' },
  );
}

function commandSpec(context: CommandContext) {
  return {
    context,
    tool: 'git' as const,
    execution: { admission: 'limited' as const },
    executable: 'git',
    args: ['status'],
    cwd: '/repository',
    purpose: 'Test command routing',
    isReadOnly: true,
    requiresApproval: true,
  };
}
