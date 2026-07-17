import type { Worktree } from './contracts';

export interface BranchHierarchyNode {
  id: string;
  branch: string;
  worktree?: Worktree;
  children: BranchHierarchyNode[];
}

export function buildBranchHierarchy(
  worktrees: readonly Worktree[],
  defaultBranch?: string,
): BranchHierarchyNode[] {
  const realNodes = worktrees.map((worktree): BranchHierarchyNode => ({
    id: worktree.id,
    branch: worktree.branch,
    worktree,
    children: [],
  }));
  const firstNodeByBranch = new Map<string, BranchHierarchyNode>();
  for (const node of realNodes) {
    if (!firstNodeByBranch.has(node.branch)) firstNodeByBranch.set(node.branch, node);
  }

  const ghostNodes = new Map<string, BranchHierarchyNode>();
  const parentById = new Map<string, BranchHierarchyNode>();

  for (const node of realNodes) {
    const baseBranch = node.worktree?.baseBranch;
    if (!baseBranch || baseBranch === node.branch || baseBranch === defaultBranch) {
      continue;
    }

    const parent =
      firstNodeByBranch.get(baseBranch) ?? getOrCreateGhostNode(baseBranch, ghostNodes);
    parentById.set(node.id, parent);
  }

  for (const node of realNodes) {
    if (hasParentCycle(node, parentById)) parentById.delete(node.id);
  }

  const allNodes = [...realNodes, ...ghostNodes.values()];
  for (const node of realNodes) {
    parentById.get(node.id)?.children.push(node);
  }

  return allNodes.filter((node) => !parentById.has(node.id));
}

function getOrCreateGhostNode(
  branch: string,
  ghostNodes: Map<string, BranchHierarchyNode>,
): BranchHierarchyNode {
  const existing = ghostNodes.get(branch);
  if (existing) return existing;

  const node: BranchHierarchyNode = {
    id: `ghost:${branch}`,
    branch,
    children: [],
  };
  ghostNodes.set(branch, node);
  return node;
}

function hasParentCycle(
  start: BranchHierarchyNode,
  parentById: ReadonlyMap<string, BranchHierarchyNode>,
): boolean {
  const visited = new Set<string>([start.id]);
  let current = parentById.get(start.id);
  while (current) {
    if (visited.has(current.id)) return true;
    visited.add(current.id);
    current = parentById.get(current.id);
  }
  return false;
}
