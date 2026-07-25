import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Worktree, WorktreeStatus } from '../../../../src/shared/contracts';
import { PathCard } from '../../../../src/renderer/components/details/PathCard';

const worktree: Worktree = {
  id: 'project:/repo.worktrees/feature',
  projectId: 'project',
  displayName: 'feature',
  path: '/repo.worktrees/feature',
  branch: 'feature/change',
  head: '1234567',
  isMain: false,
  locked: false,
};

function renderPathCard(
  worktreeData: Worktree,
  status: WorktreeStatus | undefined = 'clean',
): string {
  return renderToStaticMarkup(
    createElement(PathCard, {
      homeDirectory: '/repo.worktrees',
      projectWorktrees: [worktreeData],
      worktree: worktreeData,
      status: status,
      copiedText: undefined,
      onCopy: () => undefined,
      onError: () => undefined,
    }),
  );
}

describe('PathCard rendering', () => {
  it('renders worktree path', () => {
    const html = renderPathCard(worktree);

    expect(html).toContain('<code>~/feature</code>');
  });

  it('renders worktree path copy button', () => {
    const html = renderPathCard(worktree);

    expect(html).toContain('aria-label="Copy worktree path"');
  });

  it('renders workspace status pill', () => {
    const html = renderPathCard(worktree);

    expect(html).toContain('title="No local changes"');
    expect(html).toContain('clean</span>');
  });

  it('renders open directory button', () => {
    const html = renderPathCard(worktree);

    expect(html).toContain('aria-label="Open worktree directory"');
    expect(html).toContain('data-brand-mark="finder"');
  });

  it('renders open editor with selected editor', () => {
    const html = renderPathCard(worktree);

    expect(html).toContain('aria-label="Choose IDE"');
    expect(html).toContain('data-brand-mark="visual-studio-code"');
    expect(html).toContain('aria-label="Open worktree in Visual Studio Code"');
  });
});
