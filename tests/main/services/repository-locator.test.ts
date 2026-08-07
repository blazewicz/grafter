import { mkdir, mkdtemp, realpath, symlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RepositoryLocator } from '../../../src/main/services/repository-locator';
import { StubCommandRunner } from '../support/stub-command-runner';

interface RepositoryFixture {
  main: string;
  linked: string;
  commonDirectory: string;
  worktreeOutput: string;
}

describe('RepositoryLocator', () => {
  it('resolves the main worktree and canonical common-directory identity', async () => {
    const fixture = await createRepositoryFixture();
    const runner = repositoryRunner(fixture);

    await expect(new RepositoryLocator(runner).locate(fixture.main)).resolves.toEqual({
      commonDirectoryPath: fixture.commonDirectory,
      mainWorktreePath: fixture.main,
      selectedWorktreePath: fixture.main,
      name: path.basename(fixture.main),
    });
    expect(runner.commands.map((command) => command.args)).toEqual([
      ['rev-parse', '--is-bare-repository'],
      ['rev-parse', '--show-toplevel'],
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      ['worktree', 'list', '--porcelain'],
    ]);
    expect(
      runner.commands.every(
        (command) =>
          command.executable === 'git' &&
          command.isReadOnly &&
          command.context.kind === 'application',
      ),
    ).toBe(true);
  });

  it('resolves a linked worktree to the same repository and preserves its selection', async () => {
    const fixture = await createRepositoryFixture();
    const locator = new RepositoryLocator(repositoryRunner(fixture));

    const fromMain = await locator.locate(fixture.main);
    const fromLinked = await locator.locate(fixture.linked);

    expect(fromLinked).toEqual({
      commonDirectoryPath: fixture.commonDirectory,
      mainWorktreePath: fixture.main,
      selectedWorktreePath: fixture.linked,
      name: path.basename(fixture.main),
    });
    expect(fromLinked.commonDirectoryPath).toBe(fromMain.commonDirectoryPath);
    expect(fromLinked.mainWorktreePath).toBe(fromMain.mainWorktreePath);
  });

  it('canonicalizes a symlinked selected path', async () => {
    const fixture = await createRepositoryFixture();
    const selectedLink = path.join(path.dirname(fixture.main), 'linked-alias');
    await symlink(fixture.linked, selectedLink);
    const runner = repositoryRunner(fixture);

    await expect(
      new RepositoryLocator(runner).locate(selectedLink),
    ).resolves.toMatchObject({
      mainWorktreePath: fixture.main,
      selectedWorktreePath: fixture.linked,
    });
    expect(runner.commands[0]?.cwd).toBe(fixture.linked);
  });

  it('rejects a folder that is not a Git worktree with an actionable error', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-not-git-'));
    const runner = new StubCommandRunner(() => ({
      exitCode: 128,
      stderr: 'fatal: not a git repository',
    }));

    await expect(new RepositoryLocator(runner).locate(directory)).rejects.toThrow(
      `The selected folder is not a Git worktree: ${directory}`,
    );
    expect(runner.commands).toHaveLength(1);
  });

  it('rejects a missing selected path without invoking Git', async () => {
    const missing = path.join(os.tmpdir(), `grafter-missing-${randomUUID()}`);
    const runner = new StubCommandRunner(() => {
      throw new Error('Git should not run.');
    });

    await expect(new RepositoryLocator(runner).locate(missing)).rejects.toThrow(
      `The selected folder does not exist: ${missing}`,
    );
    expect(runner.commands).toHaveLength(0);
  });

  it('rejects bare repositories with an actionable error', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grafter-bare-'));
    const runner = new StubCommandRunner(() => ({ stdout: 'true\n' }));

    await expect(new RepositoryLocator(runner).locate(directory)).rejects.toThrow(
      'Bare Git repositories are not supported. Select a worktree.',
    );
    expect(runner.commands).toHaveLength(1);
  });

  it.each([
    ['', 'Git did not report any repository worktrees.'],
    ['worktree MAIN\nbranch refs/heads/main\n', 'incomplete worktree list'],
    ['worktree MAIN\nHEAD aaaaaaa\n', 'incomplete worktree list'],
    [
      'worktree MAIN\nworktree LINKED\nHEAD aaaaaaa\nbranch refs/heads/main\n',
      'incomplete worktree list',
    ],
    [
      'worktree MAIN\nHEAD aaaaaaa\nbranch refs/heads/main\n\nworktree MAIN\nHEAD bbbbbbb\nbranch refs/heads/feature\n',
      'selected folder is missing from Git’s worktree list',
    ],
  ])('rejects malformed or incomplete worktree output', async (template, message) => {
    const fixture = await createRepositoryFixture();
    const output = template
      .replaceAll('MAIN', fixture.main)
      .replaceAll('LINKED', fixture.linked);
    const runner = repositoryRunner(fixture, output);

    await expect(new RepositoryLocator(runner).locate(fixture.linked)).rejects.toThrow(
      message,
    );
  });
});

async function createRepositoryFixture(): Promise<RepositoryFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'grafter-locator-'));
  const unresolvedMain = path.join(root, 'repository');
  const unresolvedLinked = path.join(root, 'repository.worktrees', 'feature');
  const unresolvedCommonDirectory = path.join(unresolvedMain, '.git');
  await mkdir(unresolvedCommonDirectory, { recursive: true });
  await mkdir(unresolvedLinked, { recursive: true });
  const [main, linked, commonDirectory] = await Promise.all([
    realpath(unresolvedMain),
    realpath(unresolvedLinked),
    realpath(unresolvedCommonDirectory),
  ]);
  return {
    main,
    linked,
    commonDirectory,
    worktreeOutput: `worktree ${main}
HEAD aaaaaaa
branch refs/heads/main

worktree ${linked}
HEAD bbbbbbb
branch refs/heads/feature
`,
  };
}

function repositoryRunner(
  fixture: RepositoryFixture,
  worktreeOutput = fixture.worktreeOutput,
): StubCommandRunner {
  return new StubCommandRunner((spec) => {
    if (spec.args[0] === 'rev-parse' && spec.args[1] === '--is-bare-repository') {
      return { stdout: 'false\n' };
    }
    if (spec.args[0] === 'rev-parse' && spec.args[1] === '--show-toplevel') {
      return {
        stdout: `${spec.cwd === fixture.linked ? fixture.linked : fixture.main}\n`,
      };
    }
    if (spec.args.includes('--git-common-dir')) {
      return { stdout: `${fixture.commonDirectory}\n` };
    }
    if (spec.args[0] === 'worktree') return { stdout: worktreeOutput };
    throw new Error(`Unexpected command: ${spec.executable} ${spec.args.join(' ')}`);
  });
}
