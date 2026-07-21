import type { GitHubRepository } from './contracts';

interface RemoteCandidate {
  name: string;
  url: string;
  purpose: 'fetch' | 'push';
}

export function parseGitHubRepositoryFromRemotes(
  output: string,
): GitHubRepository | undefined {
  const candidates = output
    .split('\n')
    .flatMap<RemoteCandidate>((line) => {
      const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim());
      return match?.[1] && match[2] && (match[3] === 'fetch' || match[3] === 'push')
        ? [{ name: match[1], url: match[2], purpose: match[3] }]
        : [];
    })
    .sort((left, right) => remotePriority(left) - remotePriority(right));

  for (const candidate of candidates) {
    const repository = parseGitHubRemoteUrl(candidate.url);
    if (repository) return repository;
  }
  return undefined;
}

export function githubFileUrl(
  repository: GitHubRepository,
  revision: string,
  filePath: string,
  startLine?: number,
  endLine?: number,
): string {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const fragment =
    startLine === undefined
      ? ''
      : `#L${startLine}${endLine === undefined ? '' : `-L${endLine}`}`;
  return `https://github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/blob/${encodeURIComponent(revision)}/${encodedPath}${fragment}`;
}

function remotePriority(candidate: RemoteCandidate): number {
  const remote = candidate.name === 'origin' ? 0 : candidate.name === 'upstream' ? 2 : 4;
  return remote + (candidate.purpose === 'fetch' ? 0 : 1);
}

function parseGitHubRemoteUrl(remoteUrl: string): GitHubRepository | undefined {
  let repositoryPath: string | undefined;
  if (/^(?:[^@]+@)?github\.com:/i.test(remoteUrl)) {
    repositoryPath = remoteUrl.slice(remoteUrl.indexOf(':') + 1);
  } else {
    try {
      const parsed = new URL(remoteUrl);
      if (parsed.hostname.toLowerCase() !== 'github.com') return undefined;
      repositoryPath = parsed.pathname.replace(/^\//, '');
    } catch {
      return undefined;
    }
  }

  const parts = repositoryPath
    .replace(/\.git\/?$/, '')
    .replace(/\/$/, '')
    .split('/');
  if (parts.length !== 2) return undefined;
  const [owner, name] = parts;
  if (!owner || !name || !isGitHubPathSegment(owner) || !isGitHubPathSegment(name)) {
    return undefined;
  }
  return { owner, name };
}

function isGitHubPathSegment(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}
