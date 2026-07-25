import { describe, expect, it } from 'vitest';
import {
  pullRequestFactory,
  resetTestDataFactories,
  worktreeDetailsFactory,
  worktreeFactory,
} from '.';
import { buildCommitHistoryScenario } from '../scenarios/details/commit-history';
import {
  buildComparedWorktreeScenario,
  buildPullRequestWorktreeScenario,
  buildWorktreeProjectScenario,
} from '../scenarios/details/worktree-project';

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
    const compared = buildComparedWorktreeScenario({
      comparison: {
        targetBranch: 'release/next',
        comparisonBaseOverride: 'release/next',
        comparisonBaseOverrideUnavailable: true,
      },
    });
    const withPullRequest = buildPullRequestWorktreeScenario({
      pullRequest: { number: 42, baseBranch: 'main' },
    });

    expect(compared.details.targetBranch).toBe('release/next');
    expect(compared.details.comparisonBaseOverrideUnavailable).toBe(true);
    expect(
      compared.project.worktrees.find((worktree) => worktree.id === compared.details.id),
    ).toEqual(compared.details);
    expect(withPullRequest.details.pullRequest?.number).toBe(42);
    expect(withPullRequest.snapshot.projects[0]?.worktrees).toContainEqual(
      withPullRequest.details,
    );
  });

  it('builds internally consistent commit pages', () => {
    const scenario = buildCommitHistoryScenario({
      count: 3,
      page: { total: 6, hasMore: true },
    });

    expect(scenario.commits).toHaveLength(3);
    expect(scenario.page).toEqual({
      commits: scenario.commits,
      total: 6,
      hasMore: true,
    });
  });
});
