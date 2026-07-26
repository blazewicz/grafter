import type { DeepPartial } from 'fishery';
import type {
  AppSnapshot,
  Project,
  ProjectTreeItem,
  PullRequest,
  Worktree,
  WorktreeDetails,
} from '../../../src/shared/contracts';
import {
  appSnapshotFactory,
  mainWorktreeFactory,
  projectTreeItemFactory,
  pullRequestFactory,
  worktreeDetailsFactory,
  worktreeFactory,
  projectFactory,
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
  const project = projectFactory.build(options.project);
  const mainWorktree = mainWorktreeFactory.build({
    id: `${project.id}:main`,
    projectId: project.id,
    path: project.path,
    ...options.mainWorktree,
  });
  const featureWorktree = worktreeFactory.build({
    id: `${project.id}:feature`,
    projectId: project.id,
    isMain: false,
  });
  const details = worktreeDetailsFactory.build(
    {
      ...featureWorktree,
      ...options.details,
      projectId: project.id,
      projectName: project.name,
      isMain: false,
    },
    { transient: { worktree: featureWorktree } },
  );
  const projectTreeItem = projectTreeItemFactory.build(project, {
    associations: { worktrees: [mainWorktree, details] },
  });
  const snapshot = appSnapshotFactory.build(options.snapshot, {
    associations: { projects: [projectTreeItem] },
  });

  return { mainWorktree, details, project: projectTreeItem, snapshot };
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

export function replaceScenarioDetails(
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
