import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DiffFileStatus, DiffSession } from '../../../../src/shared/contracts';
import { DiffViewer } from '../../../../src/renderer/components/diff/DiffViewer';

const expectedPresentation: Record<
  DiffFileStatus,
  { icon: string; color: string; tone: string }
> = {
  added: { icon: 'file-plus', color: 'var(--green)', tone: 'positive' },
  copied: { icon: 'copy', color: '#858791', tone: 'neutral' },
  deleted: { icon: 'file-minus', color: 'var(--red)', tone: 'negative' },
  modified: { icon: 'file-diff', color: '#858791', tone: 'neutral' },
  renamed: { icon: 'file-symlink', color: '#858791', tone: 'neutral' },
  'type-changed': { icon: 'file-cog', color: '#858791', tone: 'neutral' },
};

const statuses = Object.keys(expectedPresentation) as DiffFileStatus[];
const session: DiffSession = {
  id: 'session',
  worktreeId: 'worktree',
  branch: 'feature/diff-icons',
  targetBranch: 'main',
  baseSha: 'base',
  headSha: 'head',
  stats: { files: statuses.length, additions: 6, deletions: 6 },
  files: statuses.map((status, index) => ({
    id: `file-${index}`,
    path: `src/${status}.ts`,
    ...(status === 'copied' || status === 'renamed'
      ? { previousPath: `src/old-${status}.ts` }
      : {}),
    status,
    additions: 1,
    deletions: 1,
    binary: false,
  })),
};

describe('DiffViewer file status presentation', () => {
  it('uses the same status icon and color in the tree and file header', () => {
    const html = renderToStaticMarkup(
      createElement(DiffViewer, {
        session,
        onClose: () => undefined,
        onError: () => undefined,
      }),
    );

    for (const status of statuses) {
      const { icon, color, tone } = expectedPresentation[status];
      const matchingIcons = html.match(
        new RegExp(
          `<svg(?=[^>]*class="[^"]*lucide-${icon}[^"]*")(?=[^>]*style="color:${escapeRegExp(color)}")(?=[^>]*data-file-status="${status}")(?=[^>]*data-status-tone="${tone}")[^>]*>`,
          'g',
        ),
      );
      expect(matchingIcons, status).toHaveLength(2);
    }
  });

  it('renders expanded file controls without a textual status pill', () => {
    const html = renderToStaticMarkup(
      createElement(DiffViewer, {
        session,
        onClose: () => undefined,
        onError: () => undefined,
      }),
    );

    expect(html.match(/aria-label="Collapse [^"]+ diff"/g)).toHaveLength(statuses.length);
    expect(html.match(/data-brand-mark="visual-studio-code"/g)).toHaveLength(
      statuses.length,
    );
    expect(html).not.toContain('>MODIFIED<');
    expect(html).not.toContain('>RENAMED<');
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
