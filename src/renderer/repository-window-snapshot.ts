import type { AppSnapshot, Project } from '../shared/contracts';

/**
 * Work unit 7 temporarily exposes repository sessions through the legacy AppSnapshot
 * projects array. Keep that compatibility shape at the renderer boundary until work unit 9
 * replaces the shared contract; repository-window components receive only the singular value.
 */
export function scopeRepositoryWindowSnapshot(snapshot: AppSnapshot): AppSnapshot {
  const repository = currentRepository(snapshot);
  if (!repository) {
    return snapshot.projects.length ? { ...snapshot, projects: [] } : snapshot;
  }
  return snapshot.projects.length === 1
    ? snapshot
    : { ...snapshot, projects: [repository] };
}

export function currentRepository(snapshot: AppSnapshot | null): Project | undefined {
  return snapshot?.projects.at(0);
}
