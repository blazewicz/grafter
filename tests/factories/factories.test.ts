import { describe, expect, it } from 'vitest';
import {
  approvalRequestFactory,
  branchDiffSessionFactory,
  commandRecordFactory,
  commitDetailsFactory,
  commitDiffSessionFactory,
  commitFactory,
  commitPageFactory,
  diffFilePatchFactory,
  diffFileSummaryFactory,
  mainWorktreeFactory,
  projectConfigFactory,
  projectFactory,
  pullRequestFactory,
  resetTestDataFactories,
  worktreeDetailsFactory,
  worktreeFactory,
} from '.';
import { buildDiffViewerScenario } from '../scenarios/diff/diff-viewer';
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
    const approvalCwd = '/Users/developer/Code/approval-target';
    const approval = approvalRequestFactory.build(
      {},
      { transient: { commandOverrides: { cwd: approvalCwd } } },
    );

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
      cwd: approvalCwd,
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

  it('builds commit details by extending the shared commit data', () => {
    const commitFields = {
      hash: '1234567890abcdef1234567890abcdef12345678',
      title: 'Share commit metadata',
      authorName: 'Ada Lovelace',
      authoredAt: '2026-07-21T12:30:00.000Z',
    };
    const commit = commitFactory.build(commitFields, {
      transient: { withAuthorEmail: false },
    });
    const details = commitDetailsFactory.build(
      {
        ...commitFields,
        body: 'Keep the detailed representation additive.',
        stats: { files: 2, additions: 8, deletions: 3 },
      },
      { transient: { withAuthorEmail: false } },
    );
    const page = commitPageFactory.build({ commits: [commit] });

    expect(details).toEqual({
      ...commit,
      body: 'Keep the detailed representation additive.',
      stats: { files: 2, additions: 8, deletions: 3 },
    });
    expect(page).toEqual({ commits: [commit], total: 1, hasMore: false });
  });

  it('builds diff files and valid patches through focused composition', () => {
    const file = diffFileSummaryFactory.build({ status: 'renamed' });
    const patch = diffFilePatchFactory.build(
      {},
      {
        transient: {
          file,
          lineKinds: ['context', 'deletion', 'addition', 'annotation'],
          oldStart: 12,
          newStart: 20,
        },
      },
    );

    expect(file.previousPath).toBeDefined();
    expect(patch.fileId).toBe(file.id);
    expect(patch.binary).toBe(false);
    expect(patch.hunks).toEqual([
      expect.objectContaining({
        header: '@@ -12,2 +20,2 @@',
        oldStart: 12,
        oldLines: 2,
        newStart: 20,
        newLines: 2,
        lines: [
          expect.objectContaining({ kind: 'context', oldLine: 12, newLine: 20 }),
          expect.objectContaining({ kind: 'deletion', oldLine: 13 }),
          expect.objectContaining({ kind: 'addition', newLine: 21 }),
          { kind: 'annotation', text: 'No newline at end of file' },
        ],
      }),
    ]);
  });

  it('keeps branch and commit session aggregates consistent', () => {
    const modifiedFile = diffFileSummaryFactory.build({ additions: 5, deletions: 2 });
    const addedFile = diffFileSummaryFactory.build({
      status: 'added',
      additions: 8,
      deletions: 0,
    });
    const files = [modifiedFile, addedFile];
    const branchSession = branchDiffSessionFactory.build({ files });
    const commitSession = commitDiffSessionFactory.build({
      files,
      commit: { authorEmail: 'author@example.com' },
    });
    const rootCommitSession = commitDiffSessionFactory.build({
      files: [addedFile],
      parentShas: [],
    });

    expect(branchSession.stats).toEqual({ files: 2, additions: 13, deletions: 2 });
    expect(branchSession.sourceWorktreeId).toBeUndefined();
    expect(branchSession.githubRepository).toBeUndefined();
    expect(commitSession.stats).toEqual(branchSession.stats);
    expect(commitSession.commit).toMatchObject({
      hash: commitSession.headSha,
      authorEmail: 'author@example.com',
      stats: commitSession.stats,
    });
    expect(commitSession.baseSha).toBe(commitSession.parentShas[0]);
    expect(rootCommitSession.parentShas).toEqual([]);
    expect(rootCommitSession.baseSha).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  });

  it('rejects inconsistent diff relationships', () => {
    const file = diffFileSummaryFactory.build();

    expect(() =>
      diffFilePatchFactory.build(
        { fileId: `${file.id}-elsewhere` },
        { transient: { file } },
      ),
    ).toThrow('The diff patch must belong to its associated file.');
    expect(() =>
      branchDiffSessionFactory.build({
        files: [file],
        stats: { files: 2, additions: 0, deletions: 0 },
      }),
    ).toThrow('Diff session stats must match its file summaries.');
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
    const firstDiffFile = diffFileSummaryFactory.build();
    const firstDiffPatch = diffFilePatchFactory.build();
    const firstBranchSession = branchDiffSessionFactory.build();
    const firstCommit = commitFactory.build();
    const firstCommitPage = commitPageFactory.build();
    const firstCommitDetails = commitDetailsFactory.build();
    const firstCommitSession = commitDiffSessionFactory.build();

    resetTestDataFactories();

    expect(worktreeFactory.build()).toEqual(firstWorktree);
    expect(pullRequestFactory.build()).toEqual(firstPullRequest);
    expect(diffFileSummaryFactory.build()).toEqual(firstDiffFile);
    expect(diffFilePatchFactory.build()).toEqual(firstDiffPatch);
    expect(branchDiffSessionFactory.build()).toEqual(firstBranchSession);
    expect(commitFactory.build()).toEqual(firstCommit);
    expect(commitPageFactory.build()).toEqual(firstCommitPage);
    expect(commitDetailsFactory.build()).toEqual(firstCommitDetails);
    expect(commitDiffSessionFactory.build()).toEqual(firstCommitSession);
  });
});

describe('diff scenarios', () => {
  it('publishes cohesive viewer relationships and independent expected values', () => {
    const scenario = buildDiffViewerScenario();

    expect(scenario.branchSession.sourceWorktreeId).toBe(scenario.sourceWorktree.id);
    expect(scenario.detachedBranchSession).not.toHaveProperty('sourceWorktreeId');
    expect(scenario.branchSession.stats).toEqual({
      files: 7,
      additions: 17,
      deletions: 11,
    });
    expect(scenario.commitSession.commit.stats).toEqual(scenario.commitSession.stats);
    expect(scenario.commitSession.parentShas).toHaveLength(2);
    expect(scenario.rootCommitSession.parentShas).toEqual([]);
    expect(scenario.files.renamed.previousPath).toBe(scenario.expected.deletionLine.path);
    expect(scenario.files.deleted.previousPath).toBe(scenario.expected.deletedFile.path);
    expect(scenario.patches.textual.fileId).toBe(scenario.files.renamed.id);
    expect(scenario.patches.metadataOnly).toMatchObject({
      fileId: scenario.files.metadataOnly.id,
      hunks: [],
    });
    expect(scenario.patches.binary).toMatchObject({
      fileId: scenario.files.binary.id,
      binary: true,
      hunks: [],
    });
    expect(scenario.lines.deletion.oldLine).toBe(41);
    expect(scenario.lines.addition.newLine).toBe(51);
    expect(scenario.expected.deletionLine.reference).toBe('src/shared/diff-types.ts:41');
    expect(scenario.expected.newSideSelection.githubUrl).toBe(
      'https://github.com/grafter-tests/git-workflow-app/blob/2222222222222222222222222222222222222222/src/shared/diff-contracts.ts#L50-L51',
    );
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
