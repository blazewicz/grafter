import { describe, expect, it } from 'vitest';
import {
  pullRequestFactory,
  resetTestDataFactories,
  worktreeDetailsFactory,
  worktreeFactory,
} from '.';
import { buildBranchComparisonScenario } from '../scenarios/details/branch-comparison';
import { buildBranchSwitchScenario } from '../scenarios/details/branch-switch';
import { buildCommitHistoryCardScenario } from '../scenarios/details/commit-history';
import { buildPathDisplayScenarios } from '../scenarios/details/path-display';
import {
  buildPullRequestWorktreeScenario,
  buildWorktreeProjectScenario,
} from '../scenarios/details/worktree-project';
import { buildWorktreeOrderingScenario } from '../scenarios/details/worktree-ordering';

describe('domain factories', () => {
  it('builds realistic neutral worktree defaults', () => {
    const worktree = worktreeFactory.build();
    const details = worktreeDetailsFactory.build();

    expect(worktree.id).toContain(worktree.projectId);
    expect(worktree.path).toContain(worktree.projectId);
    expect(worktree.head).toMatch(/^[a-f0-9]{7}$/);
    expect(worktree.pullRequest).toBeUndefined();
    expect(details.targetBranch).toBeUndefined();
    expect(details.diffStats).toBeUndefined();
  });

  it('rebuilds the same defaults after factory state is reset', () => {
    const firstWorktree = worktreeFactory.build();
    const firstPullRequest = pullRequestFactory.build();

    resetTestDataFactories();

    expect(worktreeFactory.build()).toEqual(firstWorktree);
    expect(pullRequestFactory.build()).toEqual(firstPullRequest);
  });
});

describe('details scenarios', () => {
  it('keeps project, worktree, and snapshot relationships consistent', () => {
    const scenario = buildWorktreeProjectScenario();

    expect(scenario.mainWorktree.projectId).toBe(scenario.project.id);
    expect(scenario.details.projectId).toBe(scenario.project.id);
    expect(scenario.details.projectName).toBe(scenario.project.name);
    expect(scenario.project.worktrees).toEqual([scenario.mainWorktree, scenario.details]);
    expect(scenario.snapshot.projects).toEqual([scenario.project]);
  });

  it('publishes comparison and pull request variants through their aggregates', () => {
    const compared = buildBranchComparisonScenario();
    const withPullRequest = buildPullRequestWorktreeScenario();

    expect(compared.overrideDetails.targetBranch).toBe(compared.availableWorktree.branch);
    expect(compared.unavailableOverrideDetails.comparisonBaseOverrideUnavailable).toBe(
      true,
    );
    expect(
      compared.project.worktrees.find((worktree) => worktree.id === compared.details.id),
    ).toEqual(compared.details);
    expect(withPullRequest.details.pullRequest).toBeDefined();
    expect(withPullRequest.snapshot.projects[0]?.worktrees).toContainEqual(
      withPullRequest.details,
    );
  });

  it('builds internally consistent interaction scenarios', () => {
    const branchSwitch = buildBranchSwitchScenario();
    const commitHistory = buildCommitHistoryCardScenario();
    const pathScenarios = buildPathDisplayScenarios();
    const ordering = buildWorktreeOrderingScenario();

    expect(branchSwitch.availableWorktree.branch).not.toBe(branchSwitch.details.branch);
    expect(branchSwitch.switchedSnapshot.projects[0]?.worktrees).toContainEqual(
      expect.objectContaining({
        id: branchSwitch.details.id,
        branch: branchSwitch.availableWorktree.branch,
      }),
    );
    expect(commitHistory.completePage.commits).toEqual([
      commitHistory.newest,
      commitHistory.earlier,
    ]);
    expect(commitHistory.firstPage.hasMore).toBe(true);
    expect(pathScenarios.map((scenario) => scenario.label)).toEqual([
      'sibling-of-main',
      'inside-home',
      'outside-home',
    ]);
    expect(ordering.expectedWorktrees[0]).toBe(ordering.mainWorktree);
    expect(ordering.unsortedWorktrees).not.toEqual(ordering.expectedWorktrees);
  });
});
