import { worktreeCommandContext } from '../../shared/command-context';
import { pullRequestStateFromGitHub } from '../../shared/contracts';
import type { PullRequest, Worktree } from '../../shared/contracts';
import type { CommandRunner } from '../commands';

export class GitHubService {
  static readonly commandTimeoutMs = 30_000;

  constructor(private readonly runner: CommandRunner) {}

  async pullRequest(worktree: Worktree): Promise<PullRequest | undefined> {
    if (worktree.branch === '(detached)') return undefined;
    try {
      const result = await this.runner.run({
        context: worktreeCommandContext(worktree),
        tool: 'github',
        execution: {
          admission: 'limited',
          timeoutMs: GitHubService.commandTimeoutMs,
        },
        executable: 'gh',
        args: [
          'pr',
          'view',
          worktree.branch,
          '--json',
          'number,title,url,state,isDraft,baseRefName',
        ],
        cwd: worktree.path,
        purpose: `Find the pull request for ${worktree.branch}`,
        isReadOnly: true,
      });
      if (result.record.exitCode !== 0) return undefined;
      return parsePullRequest(result.stdout);
    } catch {
      return undefined;
    }
  }
}

function parsePullRequest(output: string): PullRequest | undefined {
  const parsed: unknown = JSON.parse(output);
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  if (
    !('number' in parsed) ||
    typeof parsed.number !== 'number' ||
    !('title' in parsed) ||
    typeof parsed.title !== 'string' ||
    !('url' in parsed) ||
    typeof parsed.url !== 'string' ||
    !('baseRefName' in parsed) ||
    typeof parsed.baseRefName !== 'string' ||
    !parsed.baseRefName ||
    !('state' in parsed) ||
    !('isDraft' in parsed)
  ) {
    return undefined;
  }
  const state = pullRequestStateFromGitHub(parsed.state, parsed.isDraft);
  if (!state) return undefined;
  return {
    number: parsed.number,
    title: parsed.title,
    url: parsed.url,
    state,
    baseBranch: parsed.baseRefName,
  };
}
