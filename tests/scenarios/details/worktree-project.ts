import type { DeepPartial } from 'fishery';
import type {
  AppSnapshot,
  Project,
  ProjectConfig,
  PullRequest,
  Worktree,
  WorktreeDetails,
} from '../../../src/shared/contracts';
import {
  appSnapshotFactory,
  mainWorktreeFactory,
  projectConfigFactory,
  projectFactory,
  pullRequestFactory,
  worktreeDetailsFactory,
  worktreeFactory,
} from '../../factories';

interface WorktreeProjectScenarioOptions {
  project?: DeepPartial<ProjectConfig>;
  mainWorktree?: DeepPartial<Worktree>;
  details?: DeepPartial<WorktreeDetails>;
  snapshot?: DeepPartial<Omit<AppSnapshot, 'projects'>>;
}

export interface WorktreeProjectScenario {
  mainWorktree: Worktree;
  details: WorktreeDetails;
  project: Project;
  snapshot: AppSnapshot;
}

export function buildWorktreeProjectScenario(
  options: WorktreeProjectScenarioOptions = {},
): WorktreeProjectScenario {
  const projectConfig = projectConfigFactory.build(options.project);
  const mainWorktree = mainWorktreeFactory.build({
    id: `${projectConfig.id}:main`,
    projectId: projectConfig.id,
    path: projectConfig.path,
    ...options.mainWorktree,
  });
  const featureWorktree = worktreeFactory.build({
    id: `${projectConfig.id}:feature`,
    projectId: projectConfig.id,
    isMain: false,
  });
  const details = worktreeDetailsFactory.build(
    {
      ...featureWorktree,
      ...options.details,
      projectId: projectConfig.id,
      projectName: projectConfig.name,
      isMain: false,
    },
    { transient: { project: projectConfig, worktree: featureWorktree } },
  );
  const project = projectFactory.build(projectConfig, {
    associations: { worktrees: [mainWorktree, details] },
  });
  const snapshot = appSnapshotFactory.build(options.snapshot, {
    associations: { projects: [project] },
  });

  return { mainWorktree, details, project, snapshot };
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
