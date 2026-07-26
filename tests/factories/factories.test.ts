import { describe, expect, it } from 'vitest';
import {
  approvalRequestFactory,
  commandRecordFactory,
  mainWorktreeFactory,
  projectConfigFactory,
  projectFactory,
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
  it('builds semantic command presets and allows explicit overrides', () => {
    const command = commandRecordFactory.build();
    const awaitingApproval = commandRecordFactory.build(
      {},
      { transient: { preset: 'awaiting-approval' } },
    );
    const overriddenApproval = commandRecordFactory.build(
      { status: 'failed' },
      { transient: { preset: 'awaiting-approval' } },
    );
    const approval = approvalRequestFactory.build();

    expect(command).toMatchObject({
      isReadOnly: true,
      status: 'succeeded',
      requiresApproval: false,
    });
    expect(awaitingApproval).toMatchObject({
      isReadOnly: false,
      status: 'awaiting-approval',
      requiresApproval: true,
    });
    expect(overriddenApproval).toMatchObject({
      isReadOnly: false,
      status: 'failed',
      requiresApproval: true,
    });
    expect(approval.command).toMatchObject({
      isReadOnly: false,
      status: 'awaiting-approval',
      requiresApproval: true,
    });
  });

  it('builds project configs and hydrated projects at their distinct boundaries', () => {
    const projectConfig = projectConfigFactory.build();
    const project = projectFactory.build();

    expect(projectConfig).not.toHaveProperty('worktrees');
    expect(projectConfig).not.toHaveProperty('setupScript');
    expect(project).not.toHaveProperty('setupScript');
    expect(project.worktrees).toHaveLength(1);
    expect(project.worktrees[0]).toMatchObject({
      projectId: project.id,
      path: project.path,
      isMain: true,
    });
  });

  it('adds a generated setup script to project configs and projects when requested', () => {
    const projectConfig = projectConfigFactory.build(
      {},
      { transient: { withSetupScript: true } },
    );
    const project = projectFactory.build({}, { transient: { withSetupScript: true } });

    expect(projectConfig.setupScript).toMatch(/ install$/);
    expect(project.setupScript).toMatch(/ install$/);
  });

  it('builds realistic neutral worktree defaults', () => {
    const worktree = worktreeFactory.build();
    const details = worktreeDetailsFactory.build();

    expect(worktree.id).toContain(worktree.projectId);
    expect(worktree.path).toContain(worktree.projectId);
    expect(worktree.head).toMatch(/^[a-f0-9]{40}$/);
    expect(worktree.pullRequest).toBeUndefined();
    expect(details.targetBranch).toBeUndefined();
    expect(details.diffStats).toBeUndefined();
  });

  it('rejects inconsistent project and worktree relationships', () => {
    const projectConfig = projectConfigFactory.build();

    expect(() =>
      projectFactory.build(projectConfig, {
        associations: {
          worktrees: [
            mainWorktreeFactory.build({
              projectId: projectConfig.id,
              path: `${projectConfig.path}-elsewhere`,
            }),
          ],
        },
      }),
    ).toThrow('The main worktree path must match the project path.');

    expect(() =>
      projectFactory.build(projectConfig, {
        associations: {
          worktrees: [
            worktreeFactory.build({
              projectId: `${projectConfig.id}-elsewhere`,
            }),
          ],
        },
      }),
    ).toThrow('Every worktree must belong to the project.');
  });

  it('derives a main worktree project name from its path', () => {
    const worktree = mainWorktreeFactory.build({
      path: '/Users/developer/Code/grafter',
    });

    const details = worktreeDetailsFactory.build({}, { transient: { worktree } });

    expect(details.projectName).toBe('grafter');
  });

  it('uses the associated project name for linked worktree details', () => {
    const project = projectConfigFactory.build();
    const worktree = worktreeFactory.build({ projectId: project.id });

    const details = worktreeDetailsFactory.build(
      {},
      { transient: { project, worktree } },
    );

    expect(details.projectName).toBe(project.name);
  });

  it('rejects details that conflict with their associated project', () => {
    const project = projectConfigFactory.build();
    const worktree = worktreeFactory.build({ projectId: project.id });

    expect(() =>
      worktreeDetailsFactory.build(
        { projectName: `${project.name}-elsewhere` },
        { transient: { project, worktree } },
      ),
    ).toThrow('The worktree details project name must match the project name.');
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
