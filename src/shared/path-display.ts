function trimTrailingSeparators(directory: string): string {
  return directory.length > 1 ? directory.replace(/\/+$/, '') : directory;
}

export function collapseHomePath(path: string, homeDirectory: string): string {
  const home = trimTrailingSeparators(homeDirectory);
  if (!home || home === '/') return path;
  if (path === home) return '~';
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export function displayWorktreePath(
  worktreePath: string,
  mainClonePath: string,
  homeDirectory: string,
): string {
  const target = trimTrailingSeparators(worktreePath);
  const mainClone = trimTrailingSeparators(mainClonePath);
  if (target === mainClone) return collapseHomePath(worktreePath, homeDirectory);

  const targetSegments = target.split('/').filter(Boolean);
  const mainCloneSegments = mainClone.split('/').filter(Boolean);
  let sharedSegments = 0;

  while (
    sharedSegments < targetSegments.length &&
    sharedSegments < mainCloneSegments.length &&
    targetSegments[sharedSegments] === mainCloneSegments[sharedSegments]
  ) {
    sharedSegments += 1;
  }

  const parentCount = mainCloneSegments.length - sharedSegments;
  if (parentCount > 1) return collapseHomePath(worktreePath, homeDirectory);

  return [
    ...Array.from({ length: parentCount }, () => '..'),
    ...targetSegments.slice(sharedSegments),
  ].join('/');
}
