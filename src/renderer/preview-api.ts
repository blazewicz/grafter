import type {
  AppSnapshot,
  CommandLogScope,
  CommandRecord,
  DiffFilePatch,
  DiffSession,
  GrafterApi,
  Project,
  RepositoryWindowSnapshot,
  Settings,
  WorktreeDetails,
} from '../shared/contracts';
import { commandContextKey } from '../shared/command-context';

const now = new Date().toISOString();
const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
const previewOverflowWorktrees: Project['worktrees'] = [
  {
    id: 'grafter:duplicate-a',
    projectId: 'grafter',
    displayName: 'review',
    path: '/Users/kasia/Code/grafter.worktrees/team-a/review',
    branch: 'feature/duplicate-display-name-from-team-a',
    head: 'a61e110',
    isMain: false,
    locked: false,
  },
  {
    id: 'grafter:duplicate-b',
    projectId: 'grafter',
    displayName: 'review',
    path: '/Users/kasia/Code/grafter.worktrees/team-b/review',
    branch: 'feature/duplicate-display-name-from-team-b',
    head: 'b72f221',
    isMain: false,
    locked: false,
  },
  ...Array.from({ length: 9 }, (_, index) => ({
    id: `grafter:overflow-${index + 1}`,
    projectId: 'grafter',
    displayName: `migration-check-${String(index + 1).padStart(2, '0')}`,
    path: `/Users/kasia/Code/grafter.worktrees/migration-check-${index + 1}`,
    branch: `feature/repository-window-sidebar-validation-${index + 1}`,
    head: `${index + 1}`.repeat(7).slice(0, 7),
    isMain: false,
    locked: false,
  })),
];
const gardenPreviewProject: Project = {
  id: 'garden',
  name: 'garden-api',
  path: '/Users/kasia/Code/garden-api',
  worktrees: [
    {
      id: 'garden:main',
      projectId: 'garden',
      displayName: 'main',
      path: '/Users/kasia/Code/garden-api',
      branch: 'main',
      status: 'clean',
      head: '051dce3',
      isMain: true,
      locked: false,
    },
  ],
};
const previewCommits = [
  {
    hash: 'b91d6a818eb0d8c9c7a1e228b3716e95ac7434d2',
    title: 'Refine comparison controls',
    authorName: 'Kasia Nowak',
    authorEmail: 'kasia@example.com',
    authoredAt: '2026-07-22T15:18:00+02:00',
  },
  {
    hash: '6a43e5b6140dc9024df47cb421de3fb2273376de',
    title: 'Keep branch selection feedback compact',
    authorName: 'Kasia Nowak',
    authorEmail: 'kasia@example.com',
    authoredAt: '2026-07-22T13:04:00+02:00',
  },
  {
    hash: 'f7d3f984f3c02f16c64b63730347267f9135cd72',
    title: 'Add comparison base persistence',
    authorName: 'Marek Zieliński',
    authorEmail: 'marek@example.com',
    authoredAt: '2026-07-21T17:31:00+02:00',
  },
  {
    hash: 'd61c94173060a62c1b6e49ad67ef04e4f58451ea',
    title: 'Open branch comparisons in the diff viewer',
    authorName: 'Alicja Kowalska',
    authorEmail: 'alicja@example.com',
    authoredAt: '2026-07-21T11:46:00+02:00',
  },
  {
    hash: '54c47b48052d86434733930e1444d494117761aa',
    title: 'Resolve the automatic target branch',
    authorName: 'Kasia Nowak',
    authorEmail: 'kasia@example.com',
    authoredAt: '2026-07-20T16:22:00+02:00',
  },
  {
    hash: '27f25fe02935509765a78d85cded9e40d36ec2a9',
    title: 'Introduce branch diff statistics',
    authorName: 'Marek Zieliński',
    authorEmail: 'marek@example.com',
    authoredAt: '2026-07-20T10:09:00+02:00',
  },
];

const previewSettings: Settings = {
  defaultWorktreePath: '../<repo_name>.worktrees',
  dateFormat: 'system',
  timeFormat: 'system',
};
const previewRecentRepositories = [
  {
    repositoryId: 'grafter',
    name: 'grafter',
    commonDirectoryPath: '/Users/kasia/Code/grafter/.git',
    mainWorktreePath: '/Users/kasia/Code/grafter',
    lastOpenedPath: '/Users/kasia/Code/grafter.worktrees/feature-glass-sidebar',
    lastOpenedAt: now,
  },
  {
    repositoryId: 'garden',
    name: 'garden-api',
    commonDirectoryPath: '/Users/kasia/Code/garden-api/.git',
    mainWorktreePath: '/Users/kasia/Code/garden-api',
    lastOpenedPath: '/Users/kasia/Code/garden-api',
    lastOpenedAt: twoMinutesAgo,
  },
];

let snapshot: AppSnapshot = {
  kind: 'repository',
  homeDirectory: '/Users/kasia',
  systemLocale: 'en-GB',
  settings: previewSettings,
  toolPreferences: { editor: 'vscode', terminal: 'terminal' },
  repository: {
    id: 'grafter',
    name: 'grafter-repository-scoped-windows-migration',
    path: '/Users/kasia/Code/grafter',
    setupScript: 'npm install',
    worktrees: [
      {
        id: 'grafter:main',
        projectId: 'grafter',
        displayName: 'main',
        path: '/Users/kasia/Code/grafter',
        branch: 'main',
        head: '3e7cb81',
        isMain: true,
        locked: false,
        status: 'clean',
      },
      {
        id: 'grafter:glass',
        projectId: 'grafter',
        displayName: 'feature-glass-sidebar',
        path: '/Users/kasia/Code/grafter.worktrees/feature-glass-sidebar',
        branch: 'feature/glass-sidebar',
        pullRequest: {
          number: 42,
          title: 'Build translucent sidebar',
          url: 'https://github.com/example/grafter/pull/42',
          state: 'DRAFT',
          baseBranch: 'main',
        },
        head: 'cf91e24',
        isMain: false,
        locked: false,
        status: 'clean',
      },
      {
        id: 'grafter:audit',
        projectId: 'grafter',
        displayName: 'audit-console',
        path: '/Users/kasia/Code/grafter.worktrees/audit-console',
        branch: 'audit-console',
        status: 'dirty',
        pullRequest: {
          number: 47,
          title: 'Add the audit console',
          url: 'https://github.com/example/grafter/pull/47',
          state: 'OPEN',
          baseBranch: 'feature/merged-base',
        },
        head: '81ca492',
        isMain: false,
        locked: false,
      },
      {
        id: 'grafter:comparison-preview',
        projectId: 'grafter',
        displayName: 'comparison-preview',
        path: '/Users/kasia/Code/grafter.worktrees/comparison-preview',
        branch: 'feature/comparison-preview',
        pullRequest: {
          number: 51,
          title: 'Refine comparison controls',
          url: 'https://github.com/example/grafter/pull/51',
          state: 'OPEN',
          baseBranch: 'main',
        },
        head: 'b91d6a8',
        isMain: false,
        locked: false,
      },
      ...previewOverflowWorktrees,
    ],
  },
};

const previewRepositories = structuredClone([
  repositorySnapshot().repository,
  gardenPreviewProject,
]);
if (typeof window !== 'undefined') {
  const requestedState = new URLSearchParams(window.location.search).get('state');
  if (requestedState === 'welcome') {
    snapshot = {
      kind: 'welcome',
      homeDirectory: '/Users/kasia',
      systemLocale: 'en-GB',
      settings: previewSettings,
      toolPreferences: { editor: 'vscode', terminal: 'terminal' },
      recentRepositories: previewRecentRepositories,
    };
  } else if (requestedState === 'loading') {
    snapshot = { kind: 'loading' };
  }
}

let commands: CommandRecord[] = [
  {
    id: 'cmd-1',
    context: {
      kind: 'worktree',
      projectId: 'grafter',
      worktreeId: 'grafter:glass',
    },
    tool: 'git',
    executable: 'git',
    args: ['diff', '--numstat', 'refs/heads/main...HEAD'],
    cwd: '/Users/kasia/Code/grafter.worktrees/feature-glass-sidebar',
    displayCommand: 'git diff --numstat refs/heads/main...HEAD',
    purpose: 'Compare with main',
    isReadOnly: true,
    status: 'succeeded',
    requiresApproval: false,
    startedAt: now,
    finishedAt: now,
    durationMs: 18.42,
    exitCode: 0,
    output: [
      { stream: 'stdout', text: '124\t18\tsrc/renderer/App.tsx\n', timestamp: now },
      {
        stream: 'stdout',
        text: '296\t0\tsrc/renderer/components/details/details.module.css\n',
        timestamp: now,
      },
    ],
  },
  {
    id: 'cmd-2',
    context: {
      kind: 'worktree',
      projectId: 'grafter',
      worktreeId: 'grafter:glass',
    },
    tool: 'git',
    executable: 'git',
    args: ['diff', '--numstat', 'refs/heads/main...HEAD'],
    cwd: '/Users/kasia/Code/grafter.worktrees/feature-glass-sidebar',
    displayCommand: 'git diff --numstat refs/heads/main...HEAD',
    purpose: 'Compare with main',
    isReadOnly: true,
    status: 'succeeded',
    requiresApproval: false,
    startedAt: twoMinutesAgo,
    finishedAt: twoMinutesAgo,
    durationMs: 21.08,
    exitCode: 0,
    output: [
      {
        stream: 'stdout',
        text: '118\t18\tsrc/renderer/App.tsx\n',
        timestamp: twoMinutesAgo,
      },
      {
        stream: 'stdout',
        text: '281\t0\tsrc/renderer/components/details/details.module.css\n',
        timestamp: twoMinutesAgo,
      },
    ],
  },
  {
    id: 'cmd-3',
    context: {
      kind: 'worktree',
      projectId: 'grafter',
      worktreeId: 'grafter:glass',
    },
    tool: 'github',
    executable: 'gh',
    args: [
      'pr',
      'view',
      'feature/glass-sidebar',
      '--json',
      'number,title,url,state,isDraft,baseRefName',
    ],
    cwd: '/Users/kasia/Code/grafter.worktrees/feature-glass-sidebar',
    displayCommand:
      "gh pr view feature/glass-sidebar --json 'number,title,url,state,isDraft,baseRefName'",
    purpose: 'Find pull request',
    isReadOnly: true,
    status: 'succeeded',
    requiresApproval: false,
    startedAt: fourMinutesAgo,
    finishedAt: fourMinutesAgo,
    durationMs: 382.74,
    exitCode: 0,
    output: [
      {
        stream: 'stdout',
        text: '{"number":42,"title":"Build translucent sidebar","state":"OPEN","isDraft":true,"baseRefName":"main"}\n',
        timestamp: fourMinutesAgo,
      },
    ],
  },
  {
    id: 'cmd-4',
    context: {
      kind: 'worktree',
      projectId: 'grafter',
      worktreeId: 'grafter:audit',
    },
    tool: 'git',
    executable: 'git',
    args: ['status', '--porcelain=v1'],
    cwd: '/Users/kasia/Code/grafter.worktrees/audit-console',
    displayCommand: 'git status --porcelain=v1',
    purpose: 'Check audit-console worktree status',
    isReadOnly: true,
    status: 'succeeded',
    requiresApproval: false,
    startedAt: now,
    finishedAt: now,
    durationMs: 12.36,
    exitCode: 0,
    output: [],
  },
  {
    id: 'cmd-5',
    context: { kind: 'project', projectId: 'grafter' },
    tool: 'git',
    executable: 'git',
    args: ['worktree', 'list', '--porcelain'],
    cwd: '/Users/kasia/Code/grafter',
    displayCommand: 'git worktree list --porcelain',
    purpose: 'Discover grafter worktrees',
    isReadOnly: true,
    status: 'succeeded',
    requiresApproval: false,
    startedAt: now,
    finishedAt: now,
    durationMs: 15.91,
    exitCode: 0,
    output: [],
  },
];
const commandListeners = new Set<(record: CommandRecord) => void>();

const details: Record<string, WorktreeDetails> = {
  'grafter:main': {
    ...previewRepositories[0]!.worktrees[0]!,
    projectName: 'grafter-repository-scoped-windows-migration',
  },
  'grafter:glass': {
    ...previewRepositories[0]!.worktrees[1]!,
    projectName: 'grafter-repository-scoped-windows-migration',
    automaticBaseBranch: 'main',
    targetBranch: 'release/next',
    comparisonBaseOverride: 'release/next',
    comparisonBaseOverrideUnavailable: true,
  },
  'grafter:audit': {
    ...previewRepositories[0]!.worktrees[2]!,
    projectName: 'grafter-repository-scoped-windows-migration',
    automaticBaseBranch: 'feature/merged-base',
    automaticBaseBranchUnavailable: true,
    targetBranch: 'main',
    diffStats: { files: 3, additions: 121, deletions: 9 },
  },
  'grafter:comparison-preview': {
    ...previewRepositories[0]!.worktrees[3]!,
    projectName: 'grafter-repository-scoped-windows-migration',
    automaticBaseBranch: 'main',
    targetBranch: 'main',
    diffStats: { files: 4, additions: 86, deletions: 12 },
  },
  'garden:main': {
    ...previewRepositories[1]!.worktrees[0]!,
    projectName: 'garden-api',
  },
};

for (const worktree of previewOverflowWorktrees) {
  details[worktree.id] = {
    ...worktree,
    projectName: 'grafter-repository-scoped-windows-migration',
    automaticBaseBranch: 'main',
    targetBranch: 'main',
  };
}

const previewDiffFiles: DiffSession['files'] = [
  {
    id: 'preview-file-app',
    path: 'src/renderer/App.tsx',
    status: 'modified',
    additions: 124,
    deletions: 18,
    binary: false,
  },
  {
    id: 'preview-file-details-css',
    path: 'src/renderer/components/details/details.module.css',
    status: 'modified',
    additions: 296,
    deletions: 0,
    binary: false,
  },
  {
    id: 'preview-file-project-node',
    path: 'src/renderer/sidebar/Sidebar.tsx',
    status: 'modified',
    additions: 8,
    deletions: 4,
    binary: false,
  },
  {
    id: 'preview-file-test',
    path: 'tests/renderer/components/details/worktree-details-render.test.ts',
    status: 'modified',
    additions: 4,
    deletions: 3,
    binary: false,
  },
  {
    id: 'preview-file-path',
    path: 'src/shared/path-display.ts',
    previousPath: 'src/shared/display-path.ts',
    status: 'renamed',
    additions: 3,
    deletions: 7,
    binary: false,
  },
  {
    id: 'preview-file-logo',
    path: 'assets/grafter-mark.png',
    status: 'added',
    binary: true,
  },
  {
    id: 'preview-file-readme',
    path: 'README.md',
    status: 'modified',
    additions: 3,
    deletions: 9,
    binary: false,
  },
];

const previewPatches = new Map<string, DiffFilePatch>([
  [
    'preview-file-app',
    {
      fileId: 'preview-file-app',
      binary: false,
      hunks: [
        {
          header: '@@ -18,7 +18,10 @@ export function App(): React.JSX.Element {',
          oldStart: 18,
          oldLines: 7,
          newStart: 18,
          newLines: 10,
          lines: [
            {
              kind: 'context',
              text: '  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);',
              oldLine: 18,
              newLine: 18,
            },
            {
              kind: 'addition',
              text: '  const [diffSession, setDiffSession] = useState<DiffSession>();',
              newLine: 19,
            },
            {
              kind: 'addition',
              text: '  const [diffOpening, setDiffOpening] = useState(false);',
              newLine: 20,
            },
            {
              kind: 'context',
              text: '  const [expanded, setExpanded] = useState<Set<string>>(new Set());',
              oldLine: 19,
              newLine: 21,
            },
            {
              kind: 'deletion',
              text: '  const [logsOpen, setLogsOpen] = useState(false);',
              oldLine: 20,
            },
            {
              kind: 'addition',
              text: '  const [logsOpen, setLogsOpen] = useState(true);',
              newLine: 22,
            },
            {
              kind: 'context',
              text: '  const [error, setError] = useState<string>();',
              oldLine: 21,
              newLine: 23,
            },
          ],
        },
        {
          header: '@@ -238,6 +248,12 @@ export function App(): React.JSX.Element {',
          oldStart: 238,
          oldLines: 3,
          newStart: 248,
          newLines: 6,
          lines: [
            {
              kind: 'context',
              text: '      <AuditPanel',
              oldLine: 238,
              newLine: 248,
            },
            {
              kind: 'addition',
              text: '      {diffSession && (',
              newLine: 249,
            },
            {
              kind: 'addition',
              text: '        <DiffViewer session={diffSession} onClose={closeDiff} />',
              newLine: 250,
            },
            {
              kind: 'addition',
              text: '      )}',
              newLine: 251,
            },
            {
              kind: 'context',
              text: '    </div>',
              oldLine: 239,
              newLine: 252,
            },
          ],
        },
      ],
    },
  ],
  [
    'preview-file-details-css',
    {
      fileId: 'preview-file-details-css',
      binary: false,
      hunks: [
        {
          header: '@@ -404,6 +404,14 @@',
          oldStart: 404,
          oldLines: 2,
          newStart: 404,
          newLines: 10,
          lines: [
            {
              kind: 'context',
              text: '.section-heading {',
              oldLine: 404,
              newLine: 404,
            },
            {
              kind: 'addition',
              text: '  display: flex;',
              newLine: 405,
            },
            {
              kind: 'addition',
              text: '  align-items: center;',
              newLine: 406,
            },
            {
              kind: 'addition',
              text: '  justify-content: space-between;',
              newLine: 407,
            },
            {
              kind: 'context',
              text: '}',
              oldLine: 405,
              newLine: 408,
            },
          ],
        },
      ],
    },
  ],
  [
    'preview-file-project-node',
    {
      fileId: 'preview-file-project-node',
      binary: false,
      hunks: [
        {
          header: '@@ -145,3 +145,4 @@',
          oldStart: 145,
          oldLines: 3,
          newStart: 145,
          newLines: 4,
          lines: [
            {
              kind: 'context',
              text: '      <button className={styles.worktreeRow}>',
              oldLine: 145,
              newLine: 145,
            },
            {
              kind: 'addition',
              text: '        aria-current={selected ? "page" : undefined}',
              newLine: 146,
            },
            {
              kind: 'context',
              text: '        onClick={() => onSelect(worktree.id)}',
              oldLine: 146,
              newLine: 147,
            },
          ],
        },
      ],
    },
  ],
  [
    'preview-file-test',
    {
      fileId: 'preview-file-test',
      binary: false,
      hunks: [
        {
          header: '@@ -58,2 +58,3 @@',
          oldStart: 58,
          oldLines: 2,
          newStart: 58,
          newLines: 3,
          lines: [
            {
              kind: 'context',
              text: "    expect(html).toContain('Changes against');",
              oldLine: 58,
              newLine: 58,
            },
            {
              kind: 'addition',
              text: "    expect(html).toContain('View diff');",
              newLine: 59,
            },
            {
              kind: 'context',
              text: '  });',
              oldLine: 59,
              newLine: 60,
            },
          ],
        },
      ],
    },
  ],
  [
    'preview-file-path',
    {
      fileId: 'preview-file-path',
      binary: false,
      hunks: [
        {
          header: '@@ -1,3 +1,3 @@',
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 3,
          lines: [
            {
              kind: 'deletion',
              text: 'export function displayPath(value: string): string {',
              oldLine: 1,
            },
            {
              kind: 'addition',
              text: 'export function displayWorktreePath(value: string): string {',
              newLine: 1,
            },
            {
              kind: 'context',
              text: '  return value;',
              oldLine: 2,
              newLine: 2,
            },
          ],
        },
      ],
    },
  ],
  [
    'preview-file-readme',
    {
      fileId: 'preview-file-readme',
      binary: false,
      hunks: [
        {
          header: '@@ -12,3 +12,4 @@',
          oldStart: 12,
          oldLines: 3,
          newStart: 12,
          newLines: 4,
          lines: [
            {
              kind: 'context',
              text: 'Grafter keeps Git commands visible.',
              oldLine: 12,
              newLine: 12,
            },
            {
              kind: 'addition',
              text: 'Committed branch changes can be inspected without leaving the app.',
              newLine: 13,
            },
            {
              kind: 'context',
              text: '',
              oldLine: 13,
              newLine: 14,
            },
          ],
        },
      ],
    },
  ],
]);

function updateCommand(record: CommandRecord): void {
  commands = [record, ...commands.filter((item) => item.id !== record.id)];
  for (const listener of commandListeners) listener(structuredClone(record));
}

async function copyPreviewText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Could not copy the text.');
  }
}

export const previewApi: GrafterApi = {
  getSnapshot: () => Promise.resolve(structuredClone(snapshot)),
  getCommandLog: (scope: CommandLogScope) => {
    const repositoryId = repositorySnapshot().repository.id;
    const context =
      scope.kind === 'repository'
        ? { kind: 'project' as const, projectId: repositoryId }
        : {
            kind: 'worktree' as const,
            projectId: repositoryId,
            worktreeId: scope.worktreeId,
          };
    return Promise.resolve(
      structuredClone(
        commands.filter(
          (command) => commandContextKey(command.context) === commandContextKey(context),
        ),
      ),
    );
  },
  chooseRepository: () => Promise.resolve(null),
  openRecentRepository: (repositoryId) => {
    const repository = previewRepositories.find(
      (candidate) => candidate.id === repositoryId,
    );
    if (!repository) return Promise.reject(new Error('Recent repository not found.'));
    snapshot = {
      kind: 'repository',
      homeDirectory: '/Users/kasia',
      systemLocale: 'en-GB',
      settings: previewSettings,
      toolPreferences: { editor: 'vscode', terminal: 'terminal' },
      repository: structuredClone(repository),
    };
    return Promise.resolve(structuredClone(snapshot));
  },
  refresh: () => Promise.resolve(structuredClone(snapshot)),
  listBranches: () =>
    Promise.resolve([
      'audit-console',
      'feature/comparison-preview',
      'feature/glass-sidebar',
      'feature/worktree-picker',
      'fix/linux-shell',
      'main',
      'release/0.1',
    ]),
  suggestWorktreePath: (branch) =>
    Promise.resolve(`/Users/kasia/Code/grafter.worktrees/${branch.replaceAll('/', '-')}`),
  createWorktree: () => Promise.resolve({ snapshot: structuredClone(snapshot) }),
  switchBranch: ({ worktreeId, branch }) => {
    const current = repositorySnapshot();
    const project = current.repository;
    const worktree = project.worktrees.find((item) => item.id === worktreeId);
    if (!worktree) return Promise.reject(new Error('Worktree not found.'));
    if (worktreeId === 'grafter:audit') {
      return Promise.reject(
        new Error('Your local changes would be overwritten by checkout.'),
      );
    }

    const switched = { ...worktree, branch };
    delete switched.pullRequest;
    snapshot = {
      ...current,
      repository: {
        ...project,
        worktrees: project.worktrees.map((candidate) =>
          candidate.id === worktreeId ? switched : candidate,
        ),
      },
    };
    details[worktreeId] = {
      ...switched,
      projectName: project.name,
      ...(branch === 'main'
        ? {}
        : {
            targetBranch: 'main',
            diffStats: { files: 2, additions: 18, deletions: 4 },
          }),
    };
    return Promise.resolve(structuredClone(snapshot));
  },
  prepareRemoveWorktree: (worktreeId) => {
    const current = repositorySnapshot();
    const worktree = current.repository.worktrees.find((item) => item.id === worktreeId);
    const command: CommandRecord = {
      id: 'preview-remove',
      context: worktree
        ? {
            kind: 'project',
            projectId: worktree.projectId,
          }
        : { kind: 'application' },
      tool: 'git',
      executable: 'git',
      args: ['worktree', 'remove', worktree?.path ?? '/path/to/worktree'],
      cwd: current.repository.path,
      displayCommand: `git worktree remove '${worktree?.path ?? '/path/to/worktree'}'`,
      purpose: `Remove the ${worktree?.branch ?? 'selected'} worktree`,
      isReadOnly: false,
      status: 'awaiting-approval',
      requiresApproval: true,
      startedAt: new Date().toISOString(),
      output: [],
    };
    updateCommand(command);
    return Promise.resolve({
      approvalId: 'preview-approval',
      command,
      warning: `This permanently removes the ${worktree?.branch ?? 'selected'} worktree directory. Dirty worktrees are refused by Git.`,
    });
  },
  approveCommand: () => Promise.resolve(structuredClone(snapshot)),
  rejectCommand: () => Promise.resolve(structuredClone(snapshot)),
  getWorktreeDetails: (worktreeId) =>
    Promise.resolve(structuredClone(details[worktreeId]!)),
  setComparisonBase: ({ worktreeId, targetBranch }) => {
    const worktreeDetails = details[worktreeId];
    if (!worktreeDetails) return Promise.reject(new Error('Worktree not found.'));
    const automaticTarget =
      worktreeDetails.pullRequest?.baseBranch ??
      repositorySnapshot().repository.worktrees.find((worktree) => worktree.isMain)
        ?.branch;
    const automaticBaseBranchUnavailable =
      targetBranch === undefined &&
      worktreeDetails.automaticBaseBranchUnavailable === true;
    const nextTarget = automaticBaseBranchUnavailable
      ? 'main'
      : (targetBranch ?? automaticTarget);
    const comparison = nextTarget
      ? {
          ...(automaticTarget ? { automaticBaseBranch: automaticTarget } : {}),
          ...(automaticBaseBranchUnavailable ? { automaticBaseBranchUnavailable } : {}),
          targetBranch: nextTarget,
          diffStats: {
            files: nextTarget === 'main' ? 7 : 4,
            additions: nextTarget === 'main' ? 438 : 91,
            deletions: nextTarget === 'main' ? 41 : 26,
          },
          ...(targetBranch ? { comparisonBaseOverride: targetBranch } : {}),
        }
      : {};
    const detailsWithoutComparison = { ...worktreeDetails };
    delete detailsWithoutComparison.automaticBaseBranch;
    delete detailsWithoutComparison.targetBranch;
    delete detailsWithoutComparison.diffStats;
    delete detailsWithoutComparison.comparisonBaseOverride;
    delete detailsWithoutComparison.automaticBaseBranchUnavailable;
    delete detailsWithoutComparison.comparisonBaseOverrideUnavailable;
    details[worktreeId] = { ...detailsWithoutComparison, ...comparison };
    return Promise.resolve(structuredClone(comparison));
  },
  listBranchCommits: ({ offset, limit }) => {
    const commits = previewCommits.slice(offset, offset + limit);
    return Promise.resolve(
      structuredClone({
        commits,
        total: previewCommits.length,
        hasMore: offset + commits.length < previewCommits.length,
      }),
    );
  },
  openDiff: (worktreeId) => {
    const worktreeDetails = details[worktreeId];
    if (!worktreeDetails?.targetBranch) {
      return Promise.reject(
        new Error('This branch does not have a committed comparison target.'),
      );
    }
    return Promise.resolve(
      structuredClone({
        kind: 'branch' as const,
        id: 'preview-diff',
        projectId: worktreeDetails.projectId,
        sourceWorktreeId: worktreeId,
        branch: worktreeDetails.branch,
        targetBranch: worktreeDetails.targetBranch,
        baseSha: '4fc93b86a45b1a47af174e0b97e422a31eb19db0',
        headSha: worktreeDetails.head,
        githubRepository: { owner: 'example', name: 'grafter' },
        stats: { files: 7, additions: 438, deletions: 41 },
        files: previewDiffFiles,
      }),
    );
  },
  openBranchDiff: ({ sourceBranch, targetBranch }) => {
    const project = repositorySnapshot().repository;
    const sourceWorktree = project.worktrees.find(
      (worktree) => worktree.branch === sourceBranch,
    );
    return Promise.resolve(
      structuredClone({
        kind: 'branch' as const,
        id: `preview-diff-${sourceBranch}-${targetBranch}`,
        projectId: project.id,
        ...(sourceWorktree ? { sourceWorktreeId: sourceWorktree.id } : {}),
        branch: sourceBranch,
        targetBranch,
        baseSha: '4fc93b86a45b1a47af174e0b97e422a31eb19db0',
        headSha: sourceWorktree?.head ?? '7a81a663bc1be77168cf1b4745c3658c860db6de',
        githubRepository: { owner: 'example', name: 'grafter' },
        stats: { files: 7, additions: 438, deletions: 41 },
        files: previewDiffFiles,
      }),
    );
  },
  openCommitDiff: ({ commitHash }) => {
    const projectId = repositorySnapshot().repository.id;
    const commit = previewCommits.find((item) => item.hash === commitHash);
    if (!commit) {
      return Promise.reject(new Error('Commit not found.'));
    }
    return Promise.resolve(
      structuredClone({
        kind: 'commit' as const,
        id: `preview-commit-${commitHash}`,
        projectId,
        baseSha: '4fc93b86a45b1a47af174e0b97e422a31eb19db0',
        headSha: commitHash,
        githubRepository: { owner: 'example', name: 'grafter' },
        stats: { files: 7, additions: 438, deletions: 41 },
        files: previewDiffFiles,
        commit: {
          ...commit,
          body: '',
          stats: { files: 7, additions: 438, deletions: 41 },
        },
        parentShas: ['4fc93b86a45b1a47af174e0b97e422a31eb19db0'],
      }),
    );
  },
  getDiffFile: ({ fileId }) => {
    const patch = previewPatches.get(fileId);
    const file = previewDiffFiles.find((item) => item.id === fileId);
    if (!file) return Promise.reject(new Error('File not found.'));
    return new Promise((resolve) => {
      window.setTimeout(
        () =>
          resolve(structuredClone(patch ?? { fileId, binary: file.binary, hunks: [] })),
        80,
      );
    });
  },
  closeDiff: () => Promise.resolve(),
  refreshPullRequest: (worktreeId) => {
    const pullRequest = repositorySnapshot().repository.worktrees.find(
      (worktree) => worktree.id === worktreeId,
    )?.pullRequest;
    return Promise.resolve(pullRequest ? structuredClone(pullRequest) : undefined);
  },
  updateSettings: (settings) => {
    if (snapshot.kind === 'loading') return Promise.resolve(snapshot);
    snapshot = { ...snapshot, settings };
    return Promise.resolve(structuredClone(snapshot));
  },
  setToolPreference: (group, tool) => {
    if (snapshot.kind === 'loading') return Promise.resolve(snapshot);
    const current = repositorySnapshot();
    snapshot = {
      ...current,
      toolPreferences: { ...current.toolPreferences, [group]: tool },
    };
    return Promise.resolve(structuredClone(snapshot));
  },
  updateRepositorySetup: (script) => {
    const current = repositorySnapshot();
    snapshot = {
      ...current,
      repository: { ...current.repository, setupScript: script },
    };
    return Promise.resolve(structuredClone(snapshot));
  },
  openWorktreeDirectory: () => Promise.resolve(),
  openWorktreeInTerminal: () => Promise.resolve(),
  openWorktreeInEditor: () => Promise.resolve(),
  openDiffFileInEditor: () => Promise.resolve(),
  openExternal: () => Promise.resolve(),
  copyText: copyPreviewText,
  onSnapshotUpdate: () => () => undefined,
  onCommandUpdate: (listener) => {
    commandListeners.add(listener);
    return () => commandListeners.delete(listener);
  },
};

function repositorySnapshot(): RepositoryWindowSnapshot {
  if (snapshot.kind !== 'repository') {
    throw new Error('This preview operation requires an open repository.');
  }
  return snapshot;
}
