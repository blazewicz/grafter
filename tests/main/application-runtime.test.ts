import { describe, expect, it } from 'vitest';
import { ApplicationRuntime } from '../../src/main/application-runtime';
import type { CommandSpec } from '../../src/main/commands';
import type { CommandRecord } from '../../src/shared/contracts';
import { deferred } from '../support/deferred';

const command: CommandSpec = {
  context: { kind: 'project', projectId: 'repository' },
  tool: 'git',
  execution: { admission: 'limited' },
  executable: 'git',
  args: ['status'],
  cwd: '/repository',
  purpose: 'Check repository status',
  isReadOnly: true,
};

describe('ApplicationRuntime repository mutation coordination', () => {
  it('serializes consumers sharing a canonical repository key in invocation order', async () => {
    const runtime = new ApplicationRuntime();
    const firstGate = deferred<void>();
    const firstStarted = deferred<void>();
    const secondStarted = deferred<void>();
    const order: string[] = [];

    const first = runtime.runRepositoryMutation('/repository/.git', async () => {
      order.push('first');
      firstStarted.resolve();
      await firstGate.promise;
    });
    const second = runtime.runRepositoryMutation('/repository/.git', () => {
      order.push('second');
      secondStarted.resolve();
      return Promise.resolve();
    });
    const third = runtime.runRepositoryMutation('/repository/.git', () => {
      order.push('third');
      return Promise.resolve();
    });

    await firstStarted.promise;
    expect(order).toEqual(['first']);
    firstGate.resolve();
    await secondStarted.promise;
    await Promise.all([first, second, third]);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('allows different canonical repositories to mutate independently', async () => {
    const runtime = new ApplicationRuntime();
    const bothStarted = deferred<void>();
    const release = deferred<void>();
    let active = 0;
    let maximumActive = 0;

    const mutate = (key: string) =>
      runtime.runRepositoryMutation(key, async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (active === 2) bothStarted.resolve();
        await release.promise;
        active -= 1;
      });
    const first = mutate('/first/.git');
    const second = mutate('/second/.git');

    await bothStarted.promise;
    expect(maximumActive).toBe(2);
    release.resolve();
    await Promise.all([first, second]);
  });

  it('releases a repository queue after rejected and thrown operations', async () => {
    const runtime = new ApplicationRuntime();
    const order: string[] = [];
    const rejected = runtime.runRepositoryMutation('/repository/.git', () => {
      order.push('rejected');
      return Promise.reject(new Error('command failed'));
    });
    const thrown = runtime.runRepositoryMutation('/repository/.git', () => {
      order.push('thrown');
      throw new Error('callback failed');
    });
    const succeeded = runtime.runRepositoryMutation('/repository/.git', () => {
      order.push('succeeded');
      return Promise.resolve(42);
    });

    await expect(rejected).rejects.toThrow('command failed');
    await expect(thrown).rejects.toThrow('callback failed');
    await expect(succeeded).resolves.toBe(42);
    expect(order).toEqual(['rejected', 'thrown', 'succeeded']);

    await expect(
      runtime.runRepositoryMutation('/repository/.git', () => Promise.resolve('reused')),
    ).resolves.toBe('reused');
  });
});

describe('ApplicationRuntime shared limits', () => {
  it('shares background capacity across consumers and leaves interactive work unqueued', async () => {
    const runtime = new ApplicationRuntime();
    const limit = ApplicationRuntime.maximumConcurrentBackgroundCommands;
    const full = deferred<void>();
    const release = deferred<void>();
    let active = 0;
    let maximumActive = 0;
    let started = 0;

    const background = () =>
      runtime.runBackgroundCommand(async () => {
        active += 1;
        started += 1;
        maximumActive = Math.max(maximumActive, active);
        if (active === limit) full.resolve();
        await release.promise;
        active -= 1;
      });
    const consumerOne = Array.from({ length: limit }, background);
    const consumerTwo = Array.from({ length: limit }, background);

    await full.promise;
    expect(started).toBe(limit);
    await expect(Promise.resolve('interactive')).resolves.toBe('interactive');
    expect(active).toBe(limit);
    release.resolve();
    await Promise.all([...consumerOne, ...consumerTwo]);
    expect(maximumActive).toBe(limit);
    expect(started).toBe(limit * 2);
  });

  it('shares repository-refresh capacity and releases it after failure', async () => {
    const runtime = new ApplicationRuntime();
    const limit = ApplicationRuntime.maximumConcurrentRepositoryRefreshes;
    const full = deferred<void>();
    const release = deferred<void>();
    let active = 0;
    let maximumActive = 0;
    let started = 0;

    const refresh = (fail = false) =>
      runtime.runRepositoryRefresh(async () => {
        active += 1;
        started += 1;
        maximumActive = Math.max(maximumActive, active);
        if (active === limit) full.resolve();
        await release.promise;
        active -= 1;
        if (fail) throw new Error('refresh failed');
      });
    const consumerOne = Array.from({ length: limit }, (_, index) => refresh(index === 0));
    const consumerTwo = Array.from({ length: limit }, () => refresh());

    await full.promise;
    expect(started).toBe(limit);
    release.resolve();
    const results = await Promise.allSettled([...consumerOne, ...consumerTwo]);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(maximumActive).toBe(limit);
    expect(started).toBe(limit * 2);
    await expect(
      runtime.runRepositoryRefresh(() => Promise.resolve('reused')),
    ).resolves.toBe('reused');
  });
});

describe('ApplicationRuntime event and error routing', () => {
  it('publishes independent command updates to subscribers until they unsubscribe', () => {
    const runtime = new ApplicationRuntime();
    const first: CommandRecord[] = [];
    const second: CommandRecord[] = [];
    const unsubscribeFirst = runtime.subscribeToCommandUpdates((record) =>
      first.push(record),
    );
    runtime.subscribeToCommandUpdates((record) => second.push(record));

    const pending = runtime.commandRunner.createPending(command);
    first[0]?.args.push('mutated by subscriber');
    unsubscribeFirst();
    unsubscribeFirst();
    runtime.commandRunner.reject(pending.id);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(second[0]?.args).toEqual(['status']);
    expect(second[1]).toMatchObject({ id: pending.id, status: 'failed' });
  });

  it('keeps subscriber failures observable without blocking other subscribers', async () => {
    const reported = deferred<unknown>();
    const runtime = new ApplicationRuntime({
      onCommandSubscriberError: reported.resolve,
    });
    const received = deferred<CommandRecord>();
    runtime.subscribeToCommandUpdates(() => {
      throw new Error('subscriber failed');
    });
    runtime.subscribeToCommandUpdates(received.resolve);

    const pending = runtime.commandRunner.createPending(command);

    await expect(received.promise).resolves.toMatchObject({ id: pending.id });
    await expect(reported.promise).resolves.toEqual(new Error('subscriber failed'));
  });

  it('reports rejected fire-and-forget work and remains usable', async () => {
    const reports: { message: string; error: unknown }[] = [];
    const twoReports = deferred<void>();
    const runtime = new ApplicationRuntime({
      onBackgroundError: (message, error) => {
        reports.push({ message, error });
        if (reports.length === 2) twoReports.resolve();
      },
    });

    runtime.observeBackgroundTask(
      () => Promise.reject(new Error('async failure')),
      'Async background work failed.',
    );
    runtime.observeBackgroundTask(() => {
      throw new Error('sync failure');
    }, 'Sync background work failed.');

    await twoReports.promise;
    expect(reports).toEqual(
      expect.arrayContaining([
        {
          message: 'Async background work failed.',
          error: new Error('async failure'),
        },
        { message: 'Sync background work failed.', error: new Error('sync failure') },
      ]),
    );
    await expect(
      runtime.runBackgroundCommand(() => Promise.resolve('reused')),
    ).resolves.toBe('reused');
  });
});
