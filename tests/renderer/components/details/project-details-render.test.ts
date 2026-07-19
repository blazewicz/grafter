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
  it('renders a worktree-first navigation list without paths or duplicate metadata', () => {
    const main = worktree('repo', '/projects/repo', 'main', true);
    const alpha = worktree('alpha', '/worktrees/alpha', 'feature/alpha');
    const collision = worktree('repo', '/worktrees/b77c/repo', 'feature/worktree-first');
    const project: ProjectTreeItem = {
      id: 'project',
      name: 'repo',
      path: '/projects/repo',
      worktrees: [collision, alpha, main],
    };

    const html = renderToStaticMarkup(
      createElement(ProjectDetails, {
        project,
        onSelectWorktree: () => undefined,
      }),
    );

    expect(html).toContain('<h1>repo</h1>');
    expect(html).toContain('aria-label="Worktrees"');
    expect(html).toContain('3 worktrees');
    expect(html.indexOf('>main</button>')).toBeLessThan(html.indexOf('>alpha</button>'));
    expect(html.indexOf('>alpha</button>')).toBeLessThan(
      html.indexOf('>b77c/repo</button>'),
    );
    expect(html).toContain('feature/alpha');
    expect(html).toContain('feature/worktree-first');
    expect(html).not.toContain('MAIN CLONE');
    expect(html).not.toContain('/projects/repo');
    expect(html).not.toContain('/worktrees/alpha');
    expect(html).not.toContain('Checked-out branches');
    expect(html).not.toContain('workspace');
  });
});
