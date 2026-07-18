import { describe, expect, it } from 'vitest';
import { isCommandContext } from '../../src/shared/command-context';

describe('command context validation', () => {
  it('accepts only narrow, non-empty context payloads', () => {
    expect(isCommandContext({ kind: 'application' })).toBe(true);
    expect(isCommandContext({ kind: 'project', projectId: 'project' })).toBe(true);
    expect(
      isCommandContext({
        kind: 'worktree',
        projectId: 'project',
        worktreeId: 'worktree',
      }),
    ).toBe(true);

    expect(isCommandContext({ kind: 'project', projectId: '' })).toBe(false);
    expect(
      isCommandContext({
        kind: 'worktree',
        projectId: 'project',
        worktreeId: 'worktree',
        unexpected: true,
      }),
    ).toBe(false);
  });
});
