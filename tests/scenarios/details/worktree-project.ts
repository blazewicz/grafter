import type { DeepPartial } from 'fishery';
import type {
  AppSnapshot,
  Project,
  ProjectTreeItem,
  PullRequest,
  Worktree,
  WorktreeComparison,
  WorktreeDetails,
} from '../../../src/shared/contracts';
import {
  appSnapshotFactory,
  mainWorktreeFactory,
  projectTreeItemFactory,
  pullRequestFactory,
  worktreeComparisonFactory,
  worktreeDetailsFactory,
  worktreeFactory,
} from '../../factories';

interface WorktreeProjectScenarioOptions {
  project?: DeepPartial<Project>;
  mainWorktree?: DeepPartial<Worktree>;
  details?: DeepPartial<WorktreeDetails>;
  snapshot?: DeepPartial<Omit<AppSnapshot, 'projects'>>;
}

export interface WorktreeProjectScenario {
  mainWorktree: Worktree;
  details: WorktreeDetails;
  project: ProjectTreeItem;
  snapshot: AppSnapshot;
}

export function buildWorktreeProjectScenario(
  options: WorktreeProjectScenarioOptions = {},
): WorktreeProjectScenario {
  const projectBase = projectTreeItemFactory.build(options.project, {
    associations: { worktrees: [] },
  });
  const mainWorktree = mainWorktreeFactory.build({
    id: `${projectBase.id}:main`,
    projectId: projectBase.id,
    path: projectBase.path,
    ...options.mainWorktree,
  });
  const featureWorktree = worktreeFactory.build({
    id: `${projectBase.id}:feature`,
    projectId: projectBase.id,
    isMain: false,
  });
  const details = worktreeDetailsFactory.build(
    {
      ...featureWorktree,
      ...options.details,
      projectId: projectBase.id,
      projectName: projectBase.name,
      isMain: false,
    },
    { transient: { worktree: featureWorktree } },
  );
  const project = projectTreeItemFactory.build(projectBase, {
    associations: { worktrees: [mainWorktree, details] },
  });
  const snapshot = appSnapshotFactory.build(options.snapshot, {
    associations: { projects: [project] },
  });

  return { mainWorktree, details, project, snapshot };
}

interface ComparedWorktreeScenarioOptions extends WorktreeProjectScenarioOptions {
  comparison?: DeepPartial<WorktreeComparison>;
}

export function buildComparedWorktreeScenario(
  options: ComparedWorktreeScenarioOptions = {},
): WorktreeProjectScenario {
  const scenario = buildWorktreeProjectScenario(options);
  const comparison = worktreeComparisonFactory.build(options.comparison);
  return replaceScenarioDetails(scenario, { ...scenario.details, ...comparison });
}

interface PullRequestWorktreeScenarioOptions extends WorktreeProjectScenarioOptions {
  pullRequest?: DeepPartial<PullRequest>;
}

export function buildPullRequestWorktreeScenario(
  options: PullRequestWorktreeScenarioOptions = {},
): WorktreeProjectScenario {
  const scenario = buildWorktreeProjectScenario(options);
  const pullRequest = pullRequestFactory.build(options.pullRequest);
  return replaceScenarioDetails(scenario, { ...scenario.details, pullRequest });
}

function replaceScenarioDetails(
  scenario: WorktreeProjectScenario,
  details: WorktreeDetails,
): WorktreeProjectScenario {
  const project = {
    ...scenario.project,
    worktrees: scenario.project.worktrees.map((worktree) =>
      worktree.id === scenario.details.id ? details : worktree,
    ),
  };
  const snapshot = {
    ...scenario.snapshot,
    projects: scenario.snapshot.projects.map((candidate) =>
      candidate.id === project.id ? project : candidate,
    ),
  };

  return {
    ...scenario,
    details,
    project,
    snapshot,
  };
}
