import type { Worktree } from '../../../src/shared/contracts';
import { worktreeFactory } from '../../factories';
import { fakeSlug } from '../../factories/faker';
import { buildWorktreeProjectScenario } from './worktree-project';

export interface WorktreeOrderingScenario {
  homeDirectory: string;
  mainWorktree: Worktree;
  unsortedWorktrees: Worktree[];
  expectedWorktrees: Worktree[];
  expectedDisplayedPaths: string[];
  selectableWorktree: Worktree;
  selectableDisplayedPath: string;
}

export function buildWorktreeOrderingScenario(): WorktreeOrderingScenario {
  const projectScenario = buildWorktreeProjectScenario();
  const homeDirectory = projectScenario.snapshot.homeDirectory;
  const firstByName = worktreeFactory.build({
    projectId: projectScenario.project.id,
    displayName: `a-${fakeSlug('worktree')}`,
    path: `${homeDirectory}/worktrees/${fakeSlug('first')}`,
  });
  const sharedDisplayName = `m-${fakeSlug('shared')}`;
  const firstByPath = worktreeFactory.build({
    projectId: projectScenario.project.id,
    displayName: sharedDisplayName,
    path: `${homeDirectory}/worktrees/a-${fakeSlug('path')}`,
  });
  const lastByPath = worktreeFactory.build({
    projectId: projectScenario.project.id,
    displayName: sharedDisplayName,
    path: `${homeDirectory}/worktrees/z-${fakeSlug('path')}`,
  });
  const expectedWorktrees = [
    projectScenario.mainWorktree,
    firstByName,
    firstByPath,
    lastByPath,
  ];

  return {
    homeDirectory,
    mainWorktree: projectScenario.mainWorktree,
    unsortedWorktrees: [
      lastByPath,
      firstByPath,
      firstByName,
      projectScenario.mainWorktree,
    ],
    expectedWorktrees,
    expectedDisplayedPaths: expectedWorktrees.map((worktree) =>
      collapseScenarioHome(worktree.path, homeDirectory),
    ),
    selectableWorktree: firstByName,
    selectableDisplayedPath: collapseScenarioHome(firstByName.path, homeDirectory),
  };
}

function collapseScenarioHome(path: string, homeDirectory: string): string {
  return path.startsWith(`${homeDirectory}/`)
    ? `~${path.slice(homeDirectory.length)}`
    : path;
}
