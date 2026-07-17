import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProjectTreeItem, Worktree } from '../src/shared/contracts';
import { ProjectNode } from '../src/renderer/components/sidebar/ProjectNode';

function worktree(
  branch: string,
  name: string,
  path: string,
  baseBranch: string,
): Worktree {
  return {
    id: `project:${path}`,
    projectId: 'project',
    name,
    path,
    branch,
    pullRequest: {
      number: 1,
      title: branch,
      url: 'https://github.com/example/repo/pull/1',
      state: 'OPEN',
      baseBranch,
    },
    head: branch,
    isMain: false,
    locked: false,
  };
}

describe('ProjectNode branch labels', () => {
  it('renders one hover label per branch and worktree while omitting a ghost pill', () => {
    const checkedOut = worktree(
      'feature/checked-out',
      'checked-worktree',
      '/repo.worktrees/checked',
      'main',
    );
    const stacked = worktree(
      'feature/stacked',
      'stacked-worktree',
      '/repo.worktrees/stacked',
      'feature/missing-base',
    );
    const project: ProjectTreeItem = {
      id: 'project',
      name: 'repo',
      path: '/repo',
      defaultBranch: 'main',
      worktrees: [checkedOut, stacked],
    };

    const html = renderToStaticMarkup(
      createElement(ProjectNode, {
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

    expect(html).toContain(
      'role="tooltip" aria-hidden="true">feature/checked-out</span>',
    );
    expect(html.match(/checked-worktree/g)).toHaveLength(1);
    expect(html).toContain(
      'role="tooltip" aria-hidden="true">/repo.worktrees/checked</span>',
    );
    expect(html).toContain(
      'role="tooltip" aria-hidden="true">feature/missing-base</span>',
    );
    expect(html.match(/role="tooltip"/g)).toHaveLength(5);
    expect(html).not.toContain('title="/repo.worktrees/checked"');
    expect(html).not.toContain('no workspace');
  });
});
