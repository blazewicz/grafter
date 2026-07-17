import type { CommandContext, Project, Worktree } from './contracts';

export function commandContextKey(context: CommandContext): string {
  switch (context.kind) {
    case 'application':
      return 'application';
    case 'project':
      return `project:${context.projectId}`;
    case 'worktree':
      return `worktree:${context.projectId}:${context.worktreeId}`;
  }
}

export function projectCommandContext(project: Pick<Project, 'id'>): CommandContext {
  return { kind: 'project', projectId: project.id };
}

export function worktreeCommandContext(
  worktree: Pick<Worktree, 'id' | 'projectId'>,
): CommandContext {
  return {
    kind: 'worktree',
    projectId: worktree.projectId,
    worktreeId: worktree.id,
  };
}

export function isCommandContext(value: unknown): value is CommandContext {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();

  if (candidate.kind === 'application') {
    return keys.length === 1 && keys[0] === 'kind';
  }
  if (candidate.kind === 'project') {
    return (
      keys.join(',') === 'kind,projectId' &&
      typeof candidate.projectId === 'string' &&
      candidate.projectId.length > 0
    );
  }
  return (
    candidate.kind === 'worktree' &&
    keys.join(',') === 'kind,projectId,worktreeId' &&
    typeof candidate.projectId === 'string' &&
    candidate.projectId.length > 0 &&
    typeof candidate.worktreeId === 'string' &&
    candidate.worktreeId.length > 0
  );
}
