import path from 'node:path';

export function expandWorktreeTemplate(
  template: string,
  repoName: string,
  repoPath: string,
): string {
  const expanded = template.replaceAll('<repo_name>', repoName);
  return path.resolve(repoPath, expanded);
}

export function worktreePathForBranch(root: string, branch: string): string {
  const safeBranch = branch.replace(/^refs\/heads\//, '').replaceAll('/', '-');
  return path.join(root, safeBranch);
}
