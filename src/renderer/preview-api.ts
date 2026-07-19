import type {
  AppSnapshot,
  CommandContext,
  CommandRecord,
  GrafterApi,
  WorktreeDetails,
} from '../shared/contracts';
import { commandContextKey } from '../shared/command-context';

const now = new Date().toISOString();
const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();

let snapshot: AppSnapshot = {
  homeDirectory: '/Users/kasia',
  systemLocale: 'en-GB',
  settings: {
    defaultWorktreePath: '../<repo_name>.worktrees',
    dateFormat: 'system',
    timeFormat: 'system',
  },
  projects: [
    {
      id: 'grafter',
      name: 'grafter',
      path: '/Users/kasia/Code/grafter',
      setupScript: 'npm install',
      worktrees: [
        {
          id: 'grafter:main',
          projectId: 'grafter',
          name: 'grafter',
          path: '/Users/kasia/Code/grafter',
          branch: 'main',
          head: '3e7cb81',
          isMain: true,
          locked: false,
        },
        {
          id: 'grafter:glass',
          projectId: 'grafter',
          name: 'feature-glass-sidebar',
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
        },
        {
          id: 'grafter:audit',
          projectId: 'grafter',
          name: 'audit-console',
          path: '/Users/kasia/Code/grafter.worktrees/audit-console',
          branch: 'audit-console',
          pullRequest: {
            number: 47,
            title: 'Add the audit console',
            url: 'https://github.com/example/grafter/pull/47',
            state: 'OPEN',
            baseBranch: 'feature/worktree-picker',
          },
          head: '81ca492',
          isMain: false,
          locked: false,
        },
      ],
    },
    {
      id: 'garden',
      name: 'garden-api',
      path: '/Users/kasia/Code/garden-api',
      worktrees: [
        {
          id: 'garden:main',
          projectId: 'garden',
          name: 'garden-api',
          path: '/Users/kasia/Code/garden-api',
          branch: 'main',
          head: '051dce3',
          isMain: true,
          locked: false,
        },
      ],
    },
  ],
};

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
    args: ['diff', '--numstat', 'main...HEAD'],
    cwd: '/Users/kasia/Code/grafter.worktrees/feature-glass-sidebar',
    displayCommand: 'git diff --numstat main...HEAD',
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
    args: ['diff', '--numstat', 'main...HEAD'],
    cwd: '/Users/kasia/Code/grafter.worktrees/feature-glass-sidebar',
    displayCommand: 'git diff --numstat main...HEAD',
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

const details: Record<string, WorktreeDetails> = {
  'grafter:main': {
    ...snapshot.projects[0]!.worktrees[0]!,
    projectName: 'grafter',
    commit: {
      hash: '3e7cb81771d9d59de29f052c2fc7852d12b2a990',
      title: 'Polish branch switching feedback',
      body: '',
      authorName: 'Kasia Nowak',
      authorEmail: 'kasia@example.com',
      authoredAt: '2026-07-19T10:14:00+02:00',
    },
  },
  'grafter:glass': {
    ...snapshot.projects[0]!.worktrees[1]!,
    projectName: 'grafter',
    commit: {
      hash: 'cf91e24bc937201570241099a8d04377c705426a',
      title: 'Build translucent sidebar',
      body: 'Tighten the selected worktree hierarchy and keep secondary actions hidden until hover.\n\nThis also aligns spacing with the details view.',
      authorName: 'Kasia Nowak',
      authorEmail: 'kasia@example.com',
      authoredAt: '2026-07-19T12:42:00+02:00',
    },
    targetBranch: 'main',
    diff: { files: 7, additions: 438, deletions: 41 },
  },
  'grafter:audit': {
    ...snapshot.projects[0]!.worktrees[2]!,
    projectName: 'grafter',
    commit: {
      hash: '81ca4922f8233eb7bab2fb30ec764f473296f484',
      title: 'Add the audit console',
      body: 'Group command attempts by their worktree context.',
      authorName: 'Marek Zieliński',
      authoredAt: '2026-07-18T17:08:00+02:00',
    },
    targetBranch: 'feature/worktree-picker',
    diff: { files: 3, additions: 121, deletions: 9 },
  },
  'garden:main': {
    ...snapshot.projects[1]!.worktrees[0]!,
    projectName: 'garden-api',
    commit: {
      hash: '30dd5c35c5d87793437ac634a9aa5056d180dbb7',
      title: 'Document local development',
      body: '',
      authorName: 'Alicja Kowalska',
      authoredAt: '2026-07-17T09:30:00+02:00',
    },
  },
};

function updateCommand(record: CommandRecord): void {
  commands = [record, ...commands.filter((item) => item.id !== record.id)];
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
  getCommandLog: (context: CommandContext) =>
    Promise.resolve(
      structuredClone(
        commands.filter(
          (command) => commandContextKey(command.context) === commandContextKey(context),
        ),
      ),
    ),
  chooseProject: () => Promise.resolve(null),
  removeProject: (projectId) => {
    snapshot = {
      ...snapshot,
      projects: snapshot.projects.filter((project) => project.id !== projectId),
    };
    return Promise.resolve(structuredClone(snapshot));
  },
  refresh: () => Promise.resolve(structuredClone(snapshot)),
  refreshProject: () => Promise.resolve(structuredClone(snapshot)),
  listBranches: () =>
    Promise.resolve([
      'audit-console',
      'feature/glass-sidebar',
      'feature/worktree-picker',
      'fix/linux-shell',
      'main',
      'release/0.1',
    ]),
  suggestWorktreePath: (_projectId, branch) =>
    Promise.resolve(`/Users/kasia/Code/grafter.worktrees/${branch.replaceAll('/', '-')}`),
  createWorktree: () => Promise.resolve({ snapshot: structuredClone(snapshot) }),
  switchBranch: ({ worktreeId, branch }) => {
    const project = snapshot.projects.find((item) =>
      item.worktrees.some((worktree) => worktree.id === worktreeId),
    );
    const worktree = project?.worktrees.find((item) => item.id === worktreeId);
    if (!project || !worktree) return Promise.reject(new Error('Worktree not found.'));
    if (worktreeId === 'grafter:audit') {
      return Promise.reject(
        new Error('Your local changes would be overwritten by checkout.'),
      );
    }

    const switched = { ...worktree, branch };
    delete switched.pullRequest;
    snapshot = {
      ...snapshot,
      projects: snapshot.projects.map((item) =>
        item.id === project.id
          ? {
              ...item,
              worktrees: item.worktrees.map((candidate) =>
                candidate.id === worktreeId ? switched : candidate,
              ),
            }
          : item,
      ),
    };
    details[worktreeId] = {
      ...switched,
      projectName: project.name,
      commit: {
        hash: switched.head,
        title: `Switch to ${branch}`,
        body: '',
        authorName: 'Kasia Nowak',
        authorEmail: 'kasia@example.com',
        authoredAt: new Date().toISOString(),
      },
      ...(branch === 'main'
        ? {}
        : {
            targetBranch: 'main',
            diff: { files: 2, additions: 18, deletions: 4 },
          }),
    };
    return Promise.resolve(structuredClone(snapshot));
  },
  prepareRemoveWorktree: (worktreeId) => {
    const worktree = snapshot.projects
      .flatMap((project) => project.worktrees)
      .find((item) => item.id === worktreeId);
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
      cwd: snapshot.projects[0]?.path ?? '/path/to/main-clone',
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
  refreshPullRequest: (worktreeId) => {
    const pullRequest = snapshot.projects
      .flatMap((project) => project.worktrees)
      .find((worktree) => worktree.id === worktreeId)?.pullRequest;
    return Promise.resolve(pullRequest ? structuredClone(pullRequest) : undefined);
  },
  getWorktreeStatus: (worktreeId) =>
    Promise.resolve(worktreeId === 'grafter:audit' ? 'dirty' : 'clean'),
  updateSettings: (settings) => {
    snapshot = { ...snapshot, settings };
    return Promise.resolve(structuredClone(snapshot));
  },
  updateProjectSetup: (projectId, script) => {
    snapshot = {
      ...snapshot,
      projects: snapshot.projects.map((project) =>
        project.id === projectId ? { ...project, setupScript: script } : project,
      ),
    };
    return Promise.resolve(structuredClone(snapshot));
  },
  openWorktreeDirectory: () => Promise.resolve(),
  openWorktreeInEditor: () => Promise.resolve(),
  openExternal: () => Promise.resolve(),
  copyText: copyPreviewText,
  onSnapshotUpdate: () => () => undefined,
  onCommandUpdate: (listener) => {
    void listener;
    void updateCommand;
    return () => undefined;
  },
};
