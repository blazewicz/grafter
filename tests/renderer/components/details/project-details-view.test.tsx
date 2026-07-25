// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectDetailsView } from '../../../../src/renderer/components/details/ProjectDetailsView';
import type { ProjectTreeItem } from '../../../../src/shared/contracts';

const project: ProjectTreeItem = {
  id: 'project',
  name: 'repo',
  path: '/Users/kasia/projects/repo',
  worktrees: [
    {
      id: 'project:main',
      projectId: 'project',
      displayName: 'main',
      path: '/Users/kasia/projects/repo',
      branch: 'main',
      head: '1234567',
      isMain: true,
      locked: false,
    },
  ],
};

function renderProjectDetailsView(nextProject: ProjectTreeItem = project): void {
  render(
    <ProjectDetailsView
      homeDirectory="/Users/kasia"
      project={nextProject}
      onSelectWorktree={() => undefined}
    />,
  );
}

describe('ProjectDetailsView', () => {
  afterEach(() => {
    cleanup();
  });

  it('composes the project worktree list', () => {
    renderProjectDetailsView();

    const worktrees = screen.getByRole('region', { name: 'Worktrees' });
    expect(screen.getByText('1 worktree')).toBeVisible();
    expect(
      within(worktrees).getByRole('button', { name: '~/projects/repo' }),
    ).toBeVisible();
    expect(within(worktrees).getByText('main')).toBeVisible();
  });
});
