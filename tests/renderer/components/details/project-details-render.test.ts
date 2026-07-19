import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProjectTreeItem, Worktree } from '../../../../src/shared/contracts';
import { ProjectDetails } from '../../../../src/renderer/components/details/ProjectDetails';

function worktree(name: string, path: string, branch: string, isMain = false): Worktree {
  return {
    id: `project:${path}`,
    projectId: 'project',
    name,
    path,
    branch,
    head: branch,
    isMain,
    locked: false,
  };
}

describe('ProjectDetails', () => {
  it('renders concrete home-collapsed worktree paths with full hover labels', () => {
    const main = worktree('repo', '/Users/kasia/projects/repo', 'main', true);
    const alpha = worktree('alpha', '/Users/kasia/worktrees/alpha', 'feature/alpha');
    const collision = worktree(
      'repo',
      '/Users/kasia/worktrees/b77c/repo',
      'feature/worktree-first',
    );
    const project: ProjectTreeItem = {
      id: 'project',
      name: 'repo',
      path: '/Users/kasia/projects/repo',
      worktrees: [collision, alpha, main],
    };

    const html = renderToStaticMarkup(
      createElement(ProjectDetails, {
        homeDirectory: '/Users/kasia',
        project,
        onSelectWorktree: () => undefined,
      }),
    );

    expect(html).toContain('<h1>repo</h1>');
    expect(html).toContain('aria-label="Worktrees"');
    expect(html).toContain('3 worktrees');
    expect(html.indexOf('>~/projects/repo</button>')).toBeLessThan(
      html.indexOf('>~/worktrees/alpha</button>'),
    );
    expect(html.indexOf('>~/worktrees/alpha</button>')).toBeLessThan(
      html.indexOf('>~/worktrees/b77c/repo</button>'),
    );
    expect(html).toContain('title="~/projects/repo"');
    expect(html).toContain('title="~/worktrees/alpha"');
    expect(html).toContain('title="~/worktrees/b77c/repo"');
    expect(html).toContain('feature/alpha');
    expect(html).toContain('feature/worktree-first');
    expect(html).not.toContain('MAIN CLONE');
    expect(html).not.toContain('/Users/kasia');
    expect(html).not.toContain('Checked-out branches');
    expect(html).not.toContain('workspace');
  });
});
