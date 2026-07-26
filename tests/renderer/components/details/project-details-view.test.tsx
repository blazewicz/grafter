// @vitest-environment happy-dom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectDetailsView } from '../../../../src/renderer/components/details/ProjectDetailsView';
import type { Project } from '../../../../src/shared/contracts';
import { buildPathDisplayScenario } from '../../../scenarios/details/path-display';

const pathScenario = buildPathDisplayScenario('sibling-of-main');
const { project } = pathScenario;

function renderProjectDetailsView(nextProject: Project = project): void {
  render(
    <ProjectDetailsView
      homeDirectory={pathScenario.homeDirectory}
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
    expect(screen.getByText(`${project.worktrees.length} worktrees`)).toBeVisible();
    expect(
      within(worktrees).getByRole('button', {
        name: pathScenario.expectedMainListPath,
      }),
    ).toBeVisible();
    expect(
      within(worktrees).getByRole('button', {
        name: pathScenario.expectedWorktreeListPath,
      }),
    ).toBeVisible();
    for (const worktree of project.worktrees) {
      expect(within(worktrees).getByText(worktree.branch)).toBeVisible();
    }
  });
});
