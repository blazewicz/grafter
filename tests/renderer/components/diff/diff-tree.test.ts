import { describe, expect, it } from 'vitest';
import type { DiffFileSummary } from '../../../../src/shared/contracts';
import {
  buildDiffTree,
  diffDirectoryPaths,
  filterDiffFiles,
  flattenDiffTree,
} from '../../../../src/renderer/components/diff/diff-tree';

const files: DiffFileSummary[] = [
  {
    id: 'a',
    path: 'src/renderer/App.tsx',
    status: 'modified',
    additions: 3,
    deletions: 1,
    binary: false,
  },
  {
    id: 'b',
    path: 'src/main/index.ts',
    previousPath: 'src/main/entry.ts',
    status: 'renamed',
    additions: 1,
    deletions: 1,
    binary: false,
  },
  {
    id: 'c',
    path: 'README.md',
    status: 'modified',
    additions: 2,
    deletions: 0,
    binary: false,
  },
];

describe('diff file tree', () => {
  it('sorts folders before files and nests path segments', () => {
    const tree = buildDiffTree(files);
    expect(tree).toMatchObject([
      {
        kind: 'directory',
        name: 'src',
        children: [
          {
            kind: 'directory',
            name: 'main',
            children: [{ kind: 'file', name: 'index.ts' }],
          },
          {
            kind: 'directory',
            name: 'renderer',
            children: [{ kind: 'file', name: 'App.tsx' }],
          },
        ],
      },
      { kind: 'file', name: 'README.md' },
    ]);
    expect(flattenDiffTree(tree).map((file) => file.id)).toEqual(['b', 'a', 'c']);
    expect(diffDirectoryPaths(files)).toEqual(['src', 'src/renderer', 'src/main']);
  });

  it('filters case-insensitively across current and previous paths', () => {
    expect(filterDiffFiles(files, 'RENDERER')).toEqual([files[0]]);
    expect(filterDiffFiles(files, 'entry')).toEqual([files[1]]);
    expect(filterDiffFiles(files, '  ')).toEqual(files);
  });
});
