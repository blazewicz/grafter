import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CommandRecord } from '../../../../src/shared/contracts';
import { AuditPanel } from '../../../../src/renderer/components/audit/AuditPanel';

const command: CommandRecord = {
  id: 'latest',
  context: {
    kind: 'worktree',
    projectId: 'project',
    worktreeId: 'worktree',
  },
  tool: 'git',
  executable: 'git',
  args: ['status'],
  cwd: '/repo',
  displayCommand: 'git status',
  purpose: 'Check worktree status',
  isReadOnly: true,
  status: 'succeeded',
  requiresApproval: false,
  startedAt: '2026-07-20T19:00:00.000Z',
  output: [],
};

describe('AuditPanel', () => {
  it('follows the latest command quietly by default', () => {
    const html = renderToStaticMarkup(
      createElement(AuditPanel, {
        open: true,
        commands: [command],
        latestActivity: undefined,
        settings: {
          defaultWorktreePath: '../<repo_name>.worktrees',
          dateFormat: 'system',
          timeFormat: 'system',
        },
        systemLocale: 'en-GB',
        contextLabel: 'worktree',
        onToggle: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html).not.toContain('Follow latest');
    expect(html).toContain('<span>Hide read-only</span>');
    expect(html).toContain('Check worktree status');
  });
});
