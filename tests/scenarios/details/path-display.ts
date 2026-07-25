import { fakeSlug } from '../../factories/faker';
import {
  buildWorktreeProjectScenario,
  type WorktreeProjectScenario,
} from './worktree-project';

export type PathTopology = 'sibling-of-main' | 'inside-home' | 'outside-home';

export interface PathDisplayScenario extends WorktreeProjectScenario {
  label: PathTopology;
  homeDirectory: string;
  expectedPathCardPath: string;
  expectedMainListPath: string;
  expectedWorktreeListPath: string;
}

export function buildPathDisplayScenario(topology: PathTopology): PathDisplayScenario {
  const homeDirectory = `/Users/${fakeSlug('developer')}`;
  const repositoryName = fakeSlug('repository');
  const worktreeName = fakeSlug('worktree');
  const projectPath =
    topology === 'inside-home'
      ? `${homeDirectory}/Code/${repositoryName}/main`
      : `${homeDirectory}/Code/${repositoryName}`;
  const worktreePath =
    topology === 'sibling-of-main'
      ? `${homeDirectory}/Code/${repositoryName}.worktrees/${worktreeName}`
      : topology === 'inside-home'
        ? `${homeDirectory}/worktrees/${worktreeName}/${repositoryName}`
        : `/Volumes/${fakeSlug('volume')}/${repositoryName}.worktrees/${worktreeName}`;
  const scenario = buildWorktreeProjectScenario({
    project: { path: projectPath },
    details: { path: worktreePath },
    snapshot: { homeDirectory },
  });

  return {
    ...scenario,
    label: topology,
    homeDirectory,
    expectedPathCardPath:
      topology === 'sibling-of-main'
        ? `../${repositoryName}.worktrees/${worktreeName}`
        : topology === 'inside-home'
          ? `~/worktrees/${worktreeName}/${repositoryName}`
          : worktreePath,
    expectedMainListPath: collapseScenarioHome(projectPath, homeDirectory),
    expectedWorktreeListPath: collapseScenarioHome(worktreePath, homeDirectory),
  };
}

export function buildPathDisplayScenarios(): PathDisplayScenario[] {
  return [
    buildPathDisplayScenario('sibling-of-main'),
    buildPathDisplayScenario('inside-home'),
    buildPathDisplayScenario('outside-home'),
  ];
}

function collapseScenarioHome(path: string, homeDirectory: string): string {
  return path.startsWith(`${homeDirectory}/`)
    ? `~${path.slice(homeDirectory.length)}`
    : path;
}
