import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProjectTreeItem, Worktree } from '../../../../src/shared/contracts';
import { ProjectNode } from '../../../../src/renderer/components/sidebar/ProjectNode';

function worktree(branch: string, name: string, path: string, isMain = false): Worktree {
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

describe('ProjectNode worktree labels', () => {
  it('renders worktrees alphabetically with secondary branch labels and no hierarchy', () => {
    const checkedOut = worktree(
      'feature/checked-out',
      'z-checked-worktree',
      '/repo.worktrees/checked',
    );
    const stacked = worktree(
      'feature/stacked',
      'a-stacked-worktree',
      '/repo.worktrees/stacked',
    );
    const main = worktree('feature/from-main', 'repo', '/repo', true);
    const project: ProjectTreeItem = {
      id: 'project',
      name: 'repo',
      path: '/repo',
      worktrees: [checkedOut, stacked, main],
    };

    const html = renderToStaticMarkup(
      createElement(ProjectNode, {
        homeDirectory: '/repo.worktrees',
        project,
        expanded: true,
        selectedId: checkedOut.id,
        adding: false,
        onToggle: () => undefined,
        onSelect: () => undefined,
        onAdd: () => undefined,
        onCancelAdd: () => undefined,
        onCreated: () => undefined,
        onRemoveProject: () => undefined,
        onRemoveWorktree: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(
      html.indexOf('Main worktree, checked out branch feature/from-main'),
    ).toBeLessThan(
      html.indexOf('a-stacked-worktree, checked out branch feature/stacked'),
    );
    expect(
      html.indexOf('a-stacked-worktree, checked out branch feature/stacked'),
    ).toBeLessThan(
      html.indexOf('z-checked-worktree, checked out branch feature/checked-out'),
    );
    expect(html).toContain('mainWorktreeRow');
    expect(html).toContain('lucide-folder-root');
    expect(html.match(/lucide-git-branch/g)).toHaveLength(2);
    expect(html).toContain('>main</span>');
    expect(html).toContain('data-tooltip-content="Main worktree · /repo"');
    expect(html).toContain('data-branch-name="feature/from-main"');
    expect(html).toContain('feature/checked-out');
    expect(html).toContain('feature/stacked');
    expect(html).toContain('data-tooltip-content="../repo.worktrees/checked"');
    expect(html).toContain('aria-label="Remove repo project"');
    expect(html).toContain('title="Remove project"');
    expect(html.match(/lucide-trash-2/g)).toHaveLength(3);
    expect(html).not.toContain('More options for repo');
    expect(html).not.toContain('title="/repo.worktrees/checked"');
    expect(html).not.toContain('feature/missing-base');
  });

  it('omits the redundant branch label when the main worktree is on main', () => {
    const main = worktree('main', 'repo', '/repo', true);
    const project: ProjectTreeItem = {
      id: 'project',
      name: 'repo',
      path: '/repo',
      worktrees: [main],
    };

    const html = renderToStaticMarkup(
      createElement(ProjectNode, {
        homeDirectory: '/repo.worktrees',
        project,
        expanded: true,
        selectedId: main.id,
        adding: false,
        onToggle: () => undefined,
        onSelect: () => undefined,
        onAdd: () => undefined,
        onCancelAdd: () => undefined,
        onCreated: () => undefined,
        onRemoveProject: () => undefined,
        onRemoveWorktree: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).toContain('aria-label="Main worktree, checked out branch main"');
    expect(html).not.toContain('data-branch-name="main"');
  });
});
