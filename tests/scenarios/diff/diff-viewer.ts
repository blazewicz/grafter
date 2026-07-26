import type {
  BranchDiffSession,
  CommitDiffSession,
  DiffFilePatch,
  DiffFileSummary,
  DiffLine,
  GitHubRepository,
  Worktree,
} from '../../../src/shared/contracts';
import {
  branchDiffSessionFactory,
  commitDiffSessionFactory,
  diffFilePatchFactory,
  diffFileSummaryFactory,
  worktreeFactory,
} from '../../factories';

export interface DiffViewerScenario {
  projectId: string;
  sourceWorktree: Worktree;
  githubRepository: GitHubRepository;
  branches: {
    source: string;
    target: string;
    alternativeSource: string;
    alternativeTarget: string;
    available: string[];
  };
  branchSession: BranchDiffSession;
  detachedBranchSession: BranchDiffSession;
  commitSession: CommitDiffSession;
  rootCommitSession: CommitDiffSession;
  files: {
    modified: DiffFileSummary;
    added: DiffFileSummary;
    renamed: DiffFileSummary;
    deleted: DiffFileSummary;
    binary: DiffFileSummary;
    metadataOnly: DiffFileSummary;
  };
  patches: {
    textual: DiffFilePatch;
    metadataOnly: DiffFilePatch;
    binary: DiffFilePatch;
  };
  lines: {
    context: DiffLine;
    deletion: DiffLine;
    addition: DiffLine;
    annotation: DiffLine;
  };
  expected: {
    addedFile: {
      path: string;
      revision: string;
      githubUrl: string;
    };
    deletedFile: {
      path: string;
      revision: string;
      githubUrl: string;
    };
    deletionLine: {
      path: string;
      revision: string;
      reference: string;
      githubUrl: string;
    };
    additionLine: {
      path: string;
      revision: string;
      reference: string;
      githubUrl: string;
    };
    newSideSelection: {
      reference: string;
      githubUrl: string;
    };
  };
}

export function buildDiffViewerScenario(): DiffViewerScenario {
  const projectId = 'diff-viewer-project';
  const baseSha = '1111111111111111111111111111111111111111';
  const headSha = '2222222222222222222222222222222222222222';
  const secondParentSha = '3333333333333333333333333333333333333333';
  const rootCommitSha = '4444444444444444444444444444444444444444';
  const emptyTreeSha = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const githubRepository = {
    owner: 'grafter-tests',
    name: 'git-workflow-app',
  };
  const branches = {
    source: 'feature/diff-viewer',
    target: 'main',
    alternativeSource: 'feature/diff-viewer-next',
    alternativeTarget: 'release/next',
  };
  const sourceWorktree = worktreeFactory.build({
    id: `${projectId}:source`,
    projectId,
    branch: branches.source,
    head: headSha,
  });
  const files = {
    modified: diffFileSummaryFactory.build({
      id: 'modified-viewer',
      path: 'src/renderer/DiffViewer.tsx',
      status: 'modified',
      additions: 3,
      deletions: 2,
    }),
    added: diffFileSummaryFactory.build({
      id: 'added-panel',
      path: 'src/renderer/components/NewDiffPanel.tsx',
      status: 'added',
      additions: 12,
      deletions: 0,
    }),
    renamed: diffFileSummaryFactory.build({
      id: 'renamed-contracts',
      path: 'src/shared/diff-contracts.ts',
      previousPath: 'src/shared/diff-types.ts',
      status: 'renamed',
      additions: 2,
      deletions: 1,
    }),
    deleted: diffFileSummaryFactory.build({
      id: 'deleted-legacy-viewer',
      path: 'src/renderer/removed-diff.ts',
      previousPath: 'src/renderer/legacy-diff.ts',
      status: 'deleted',
      additions: 0,
      deletions: 8,
    }),
    binary: diffFileSummaryFactory.build({
      id: 'binary-preview',
      path: 'assets/diff-preview.png',
      status: 'modified',
      binary: true,
    }),
    metadataOnly: diffFileSummaryFactory.build({
      id: 'metadata-only-script',
      path: 'scripts/setup-diff.sh',
      status: 'type-changed',
      additions: 0,
      deletions: 0,
    }),
  };
  const sessionFiles = [
    files.modified,
    files.added,
    files.renamed,
    files.deleted,
    files.binary,
    files.metadataOnly,
  ];
  const branchSession = branchDiffSessionFactory.build({
    id: 'branch-diff-viewer-session',
    projectId,
    sourceWorktreeId: sourceWorktree.id,
    branch: branches.source,
    targetBranch: branches.target,
    baseSha,
    headSha,
    githubRepository,
    files: sessionFiles,
  });
  const { sourceWorktreeId, ...detachedBranchSession } = branchSession;
  if (sourceWorktreeId !== sourceWorktree.id) {
    throw new Error('The branch diff scenario must reference its source worktree.');
  }
  const commitSession = commitDiffSessionFactory.build({
    id: 'commit-diff-viewer-session',
    projectId,
    baseSha,
    headSha,
    githubRepository,
    files: sessionFiles,
    commit: {
      hash: headSha,
      title: 'Build the diff viewer test foundation',
      body: 'Add shared factories and cohesive scenario data for renderer tests.',
      authorName: 'Ada Lovelace',
      authorEmail: 'ada@example.com',
      authoredAt: '2026-07-21T12:30:00.000Z',
    },
    parentShas: [baseSha, secondParentSha],
  });
  const rootCommitSession = commitDiffSessionFactory.build({
    id: 'root-commit-diff-viewer-session',
    projectId,
    baseSha: emptyTreeSha,
    headSha: rootCommitSha,
    githubRepository,
    files: [files.added],
    commit: {
      hash: rootCommitSha,
      title: 'Create the project',
      body: '',
      authorName: 'Grace Hopper',
      authorEmail: 'grace@example.com',
      authoredAt: '2026-07-01T08:00:00.000Z',
    },
    parentShas: [],
  });
  const textualPatch = diffFilePatchFactory.build(
    {},
    {
      transient: {
        file: files.renamed,
        lineKinds: ['context', 'deletion', 'addition', 'annotation'],
        oldStart: 40,
        newStart: 50,
      },
    },
  );
  const metadataOnlyPatch = diffFilePatchFactory.build(
    { hunks: [] },
    { transient: { file: files.metadataOnly } },
  );
  const binaryPatch = diffFilePatchFactory.build(
    {},
    { transient: { file: files.binary } },
  );
  const textualHunk = textualPatch.hunks[0];
  const [contextLine, deletionLine, additionLine, annotationLine] =
    textualHunk?.lines ?? [];
  if (
    !contextLine ||
    !deletionLine ||
    !additionLine ||
    !annotationLine ||
    contextLine.kind !== 'context' ||
    deletionLine.kind !== 'deletion' ||
    additionLine.kind !== 'addition' ||
    annotationLine.kind !== 'annotation'
  ) {
    throw new Error('The textual diff scenario must include all representative lines.');
  }

  return {
    projectId,
    sourceWorktree,
    githubRepository,
    branches: {
      ...branches,
      available: [
        branches.target,
        branches.source,
        branches.alternativeSource,
        branches.alternativeTarget,
      ],
    },
    branchSession,
    detachedBranchSession,
    commitSession,
    rootCommitSession,
    files,
    patches: {
      textual: textualPatch,
      metadataOnly: metadataOnlyPatch,
      binary: binaryPatch,
    },
    lines: {
      context: contextLine,
      deletion: deletionLine,
      addition: additionLine,
      annotation: annotationLine,
    },
    expected: {
      addedFile: {
        path: 'src/renderer/components/NewDiffPanel.tsx',
        revision: '2222222222222222222222222222222222222222',
        githubUrl:
          'https://github.com/grafter-tests/git-workflow-app/blob/2222222222222222222222222222222222222222/src/renderer/components/NewDiffPanel.tsx',
      },
      deletedFile: {
        path: 'src/renderer/legacy-diff.ts',
        revision: '1111111111111111111111111111111111111111',
        githubUrl:
          'https://github.com/grafter-tests/git-workflow-app/blob/1111111111111111111111111111111111111111/src/renderer/legacy-diff.ts',
      },
      deletionLine: {
        path: 'src/shared/diff-types.ts',
        revision: '1111111111111111111111111111111111111111',
        reference: 'src/shared/diff-types.ts:41',
        githubUrl:
          'https://github.com/grafter-tests/git-workflow-app/blob/1111111111111111111111111111111111111111/src/shared/diff-types.ts#L41',
      },
      additionLine: {
        path: 'src/shared/diff-contracts.ts',
        revision: '2222222222222222222222222222222222222222',
        reference: 'src/shared/diff-contracts.ts:51',
        githubUrl:
          'https://github.com/grafter-tests/git-workflow-app/blob/2222222222222222222222222222222222222222/src/shared/diff-contracts.ts#L51',
      },
      newSideSelection: {
        reference: 'src/shared/diff-contracts.ts:50-51',
        githubUrl:
          'https://github.com/grafter-tests/git-workflow-app/blob/2222222222222222222222222222222222222222/src/shared/diff-contracts.ts#L50-L51',
      },
    },
  };
}
