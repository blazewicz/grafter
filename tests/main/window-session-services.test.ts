import { describe, expect, it, vi } from 'vitest';
import { ApplicationRuntime } from '../../src/main/application-runtime';
import { RepositoryService } from '../../src/main/services/repository-service';
import { StateStore } from '../../src/main/store';
import { RepositoryWindowSession } from '../../src/main/window-session-services';
import type {
  CommandContext,
  CommandRecord,
  ProjectConfig,
} from '../../src/shared/contracts';
import { projectConfigFactory } from '../factories';

describe('RepositoryWindowSession compatibility isolation', () => {
  it('adapts exactly one project and filters command events to its repository', async () => {
    const firstProject = projectConfigFactory.build();
    const secondProject = projectConfigFactory.build();
    const store = new StateStore('/unused', { persist: () => Promise.resolve() });
    await store.update((state) => state.projects.push(firstProject, secondProject));
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

    expect(first.snapshot().projects.map((project) => project.id)).toEqual([
      firstProject.id,
    ]);
    expect(second.snapshot().projects.map((project) => project.id)).toEqual([
      secondProject.id,
    ]);
    expect(firstCommands.map((record) => record.id)).toEqual([firstRecord.id]);
    expect(secondCommands.map((record) => record.id)).toEqual([secondRecord.id]);
    expect(() =>
      first.commandLog({ kind: 'project', projectId: secondProject.id }),
    ).toThrow('not available in this repository window');

    first.dispose();
    second.dispose();
  });

  it('stops snapshot and command publication after disposal', async () => {
    const project = projectConfigFactory.build();
    const store = new StateStore('/unused', { persist: () => Promise.resolve() });
    await store.update((state) => state.projects.push(project));
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
