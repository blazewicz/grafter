import { describe, expect, it } from 'vitest';
import { collapseHomePath, displayWorktreePath } from '../../src/shared/path-display';

describe('path display', () => {
  it('collapses the home directory while preserving paths outside it', () => {
    expect(collapseHomePath('/Users/kasia', '/Users/kasia')).toBe('~');
    expect(collapseHomePath('/Users/kasia/Code/grafter', '/Users/kasia/')).toBe(
      '~/Code/grafter',
    );
    expect(collapseHomePath('/Users/kasia-old/project', '/Users/kasia')).toBe(
      '/Users/kasia-old/project',
    );
    expect(collapseHomePath('/tmp/Users/kasia/project', '/Users/kasia')).toBe(
      '/tmp/Users/kasia/project',
    );
  });

  it('does not search arbitrary text for a home path', () => {
    expect(
      collapseHomePath("git worktree remove '/Users/kasia/Code/feature'", '/Users/kasia'),
    ).toBe("git worktree remove '/Users/kasia/Code/feature'");
  });

  it('uses a relative worktree path when it requires at most one parent', () => {
    expect(
      displayWorktreePath(
        '/Users/kasia/Code/repo.worktrees/feature',
        '/Users/kasia/Code/repo',
        '/Users/kasia',
      ),
    ).toBe('../repo.worktrees/feature');
    expect(
      displayWorktreePath(
        '/Users/kasia/Code/repo/nested',
        '/Users/kasia/Code/repo',
        '/Users/kasia',
      ),
    ).toBe('nested');
  });

  it('keeps a collapsed full path when relative display needs two parents', () => {
    expect(
      displayWorktreePath(
        '/Users/kasia/worktrees/repo/feature',
        '/Users/kasia/Code/projects/repo',
        '/Users/kasia',
      ),
    ).toBe('~/worktrees/repo/feature');
  });

  it('keeps the main clone as a collapsed full path', () => {
    expect(
      displayWorktreePath(
        '/Users/kasia/Code/repo',
        '/Users/kasia/Code/repo',
        '/Users/kasia',
      ),
    ).toBe('~/Code/repo');
  });
});
