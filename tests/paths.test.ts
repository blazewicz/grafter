import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expandWorktreeTemplate, worktreePathForBranch } from '../src/shared/paths';

describe('worktree paths', () => {
  it('expands the repository placeholder relative to the main clone', () => {
    expect(
      expandWorktreeTemplate('../<repo_name>.worktrees', 'grafter', '/code/grafter'),
    ).toBe(path.resolve('/code/grafter', '../grafter.worktrees'));
  });

  it('makes nested branch names safe as one worktree directory', () => {
    expect(worktreePathForBranch('/code/grafter.worktrees', 'feature/audit/logs')).toBe(
      path.join('/code/grafter.worktrees', 'feature-audit-logs'),
    );
  });
});
