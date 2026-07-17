import type {
  AppSnapshot,
  CommandRecord,
  GrafterApi,
  WorktreeDetails,
} from '../shared/contracts';

const now = new Date().toISOString();

let snapshot: AppSnapshot = {
  settings: { defaultWorktreePath: '../<repo_name>.worktrees' },
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
          path: '/Users/kasia/Code/grafter',
          branch: 'main',
          head: '3e7cb81',
          isMain: true,
          locked: false,
        },
        {
          id: 'grafter:glass',
          projectId: 'grafter',
          path: '/Users/kasia/Code/grafter.worktrees/feature-glass-sidebar',
          branch: 'feature/glass-sidebar',
          head: 'cf91e24',
          isMain: false,
          locked: false,
        },
        {
          id: 'grafter:audit',
          projectId: 'grafter',
          path: '/Users/kasia/Code/grafter.worktrees/audit-console',
          branch: 'audit-console',
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
          path: '/Users/kasia/Code/garden-api',
          branch: 'main',
          head: '051dce3',
          isMain: true,
          locked: false,
        },
      ],
    },
  ],
  commands: [
    {
      id: 'cmd-1',
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
      exitCode: 0,
      output: [
        { stream: 'stdout', text: '124\t18\tsrc/renderer/App.tsx\n', timestamp: now },
        { stream: 'stdout', text: '296\t0\tsrc/renderer/styles.css\n', timestamp: now },
      ],
    },
    {
      id: 'cmd-2',
      tool: 'github',
      executable: 'gh',
      args: ['pr', 'view', 'feature/glass-sidebar', '--json', 'number,title,url'],
      cwd: '/Users/kasia/Code/grafter.worktrees/feature-glass-sidebar',
      displayCommand:
        "gh pr view feature/glass-sidebar --json 'number,title,url,state,baseRefName'",
      purpose: 'Find pull request',
      isReadOnly: true,
      status: 'succeeded',
      requiresApproval: false,
      startedAt: now,
      finishedAt: now,
      exitCode: 0,
      output: [
        {
          stream: 'stdout',
          text: '{"number":42,"title":"Build translucent sidebar"}\n',
          timestamp: now,
        },
      ],
    },
  ],
};

const details: Record<string, WorktreeDetails> = {
  'grafter:main': {
    ...snapshot.projects[0]!.worktrees[0]!,
    projectName: 'grafter',
    targetBranch: 'main',
    diff: { files: 0, additions: 0, deletions: 0 },
  },
  'grafter:glass': {
    ...snapshot.projects[0]!.worktrees[1]!,
    projectName: 'grafter',
    targetBranch: 'main',
    diff: { files: 7, additions: 438, deletions: 41 },
    pullRequest: {
      number: 42,
      title: 'Build translucent sidebar',
      url: 'https://github.com/example/grafter/pull/42',
      state: 'OPEN',
      baseBranch: 'main',
    },
  },
  'grafter:audit': {
    ...snapshot.projects[0]!.worktrees[2]!,
    projectName: 'grafter',
    targetBranch: 'main',
    diff: { files: 3, additions: 121, deletions: 9 },
  },
  'garden:main': {
    ...snapshot.projects[1]!.worktrees[0]!,
    projectName: 'garden-api',
    targetBranch: 'main',
    diff: { files: 0, additions: 0, deletions: 0 },
  },
};

function updateCommand(record: CommandRecord): void {
  snapshot = {
    ...snapshot,
    commands: [record, ...snapshot.commands.filter((item) => item.id !== record.id)],
  };
}

export const previewApi: GrafterApi = {
  getSnapshot: () => Promise.resolve(structuredClone(snapshot)),
  chooseProject: () => Promise.resolve(null),
  removeProject: (projectId) => {
    snapshot = {
      ...snapshot,
      projects: snapshot.projects.filter((project) => project.id !== projectId),
    };
    return Promise.resolve(structuredClone(snapshot));
  },
  refresh: () => Promise.resolve(structuredClone(snapshot)),
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
  prepareRemoveWorktree: (worktreeId) => {
    const worktree = snapshot.projects
      .flatMap((project) => project.worktrees)
      .find((item) => item.id === worktreeId);
    const command: CommandRecord = {
      id: 'preview-remove',
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
  revealPath: () => Promise.resolve(),
  openExternal: () => Promise.resolve(),
  onCommandUpdate: (listener) => {
    void listener;
    void updateCommand;
    return () => undefined;
  },
};
