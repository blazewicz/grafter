import { describe, expect, it } from 'vitest';
import { TaskLimiter } from '../../src/main/task-limiter';

describe('TaskLimiter', () => {
  it('continues admitting queued work after a task rejects', async () => {
    const limiter = new TaskLimiter(1);
    const failure = limiter.run(() => {
      throw new Error('expected failure');
    });
    const success = limiter.run(() => 'continued');

    await expect(failure).rejects.toThrow('expected failure');
    await expect(success).resolves.toBe('continued');
  });
});
