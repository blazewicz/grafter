import { describe, expect, it } from 'vitest';
import {
  buildBranchHierarchy,
  type BranchHierarchyNode,
} from '../src/shared/branch-hierarchy';
import type { Worktree } from '../src/shared/contracts';

function worktree(branch: string, baseBranch?: string, isMain = false): Worktree {
  const name = branch.replaceAll('/', '-');
  return {
    id: `project:/worktrees/${name}`,
    projectId: 'project',
    name,
    path: `/worktrees/${name}`,
    branch,
    ...(baseBranch ? { baseBranch } : {}),
    head: branch,
    isMain,
    locked: false,
  };
}

function describeNodes(nodes: BranchHierarchyNode[]): unknown {
  return nodes.map((node) => ({
    branch: node.branch,
    workspace: node.worktree?.name,
    children: describeNodes(node.children),
  }));
}

function countWorkspaces(nodes: BranchHierarchyNode[]): number {
  return nodes.reduce(
    (count, node) => count + (node.worktree ? 1 : 0) + countWorkspaces(node.children),
    0,
  );
}

describe('buildBranchHierarchy', () => {
  it('nests checked-out branches and creates one ghost for a missing base', () => {
    const worktrees = [
      worktree('main', undefined, true),
      worktree('feature/auth', 'main'),
      worktree('feature/auth-ui', 'feature/auth'),
      worktree('feature/payment-tests', 'feature/payments'),
    ];

    const hierarchy = buildBranchHierarchy(worktrees);

    expect(describeNodes(hierarchy)).toEqual([
      {
        branch: 'main',
        workspace: 'main',
        children: [
          {
            branch: 'feature/auth',
            workspace: 'feature-auth',
            children: [
              {
                branch: 'feature/auth-ui',
                workspace: 'feature-auth-ui',
                children: [],
              },
            ],
          },
        ],
      },
      {
        branch: 'feature/payments',
        workspace: undefined,
        children: [
          {
            branch: 'feature/payment-tests',
            workspace: 'feature-payment-tests',
            children: [],
          },
        ],
      },
    ]);
    expect(countWorkspaces(hierarchy)).toBe(worktrees.length);
  });

  it('breaks cyclic base relationships without dropping either workspace', () => {
    const worktrees = [
      worktree('feature/one', 'feature/two'),
      worktree('feature/two', 'feature/one'),
    ];

    const hierarchy = buildBranchHierarchy(worktrees);

    expect(countWorkspaces(hierarchy)).toBe(2);
    expect(describeNodes(hierarchy)).toEqual([
      {
        branch: 'feature/one',
        workspace: 'feature-one',
        children: [
          {
            branch: 'feature/two',
            workspace: 'feature-two',
            children: [],
          },
        ],
      },
    ]);
  });
});
