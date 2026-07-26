import type { AppSnapshot, Worktree } from '../../../src/shared/contracts';
import { appSnapshotFactory, projectFactory, worktreeFactory } from '../../factories';
import { fakeSlug } from '../../factories/faker';
import {
  buildWorktreeProjectScenario,
  type WorktreeProjectScenario,
} from './worktree-project';

export interface BranchSwitchScenario extends WorktreeProjectScenario {
  availableWorktree: Worktree;
  branches: string[];
  switchedSnapshot: AppSnapshot;
}

export function buildBranchSwitchScenario(): BranchSwitchScenario {
  const scenario = buildWorktreeProjectScenario();
  const availableWorktree = worktreeFactory.build({
    projectId: scenario.project.id,
    branch: `${scenario.details.branch}-${fakeSlug('next')}`,
  });
  const switchedWorktree = worktreeFactory.build({
    id: scenario.details.id,
    projectId: scenario.details.projectId,
    displayName: scenario.details.displayName,
    path: scenario.details.path,
    branch: availableWorktree.branch,
    head: scenario.details.head,
    isMain: false,
    locked: scenario.details.locked,
  });
  const switchedProject = projectFactory.build(scenario.project, {
    associations: { worktrees: [scenario.mainWorktree, switchedWorktree] },
  });
  const switchedSnapshot = appSnapshotFactory.build(scenario.snapshot, {
    associations: { projects: [switchedProject] },
  });

  return {
    ...scenario,
    availableWorktree,
    branches: [
      scenario.mainWorktree.branch,
      scenario.details.branch,
      availableWorktree.branch,
    ],
    switchedSnapshot,
  };
}
