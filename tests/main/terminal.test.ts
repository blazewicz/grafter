import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { terminalLaunchSpec } from '../../src/main/terminal';

describe('terminal launch commands', () => {
  it('opens Terminal at the worktree directory on macOS', () => {
    const directory = path.join(path.sep, 'code', 'project with spaces');

    expect(terminalLaunchSpec('terminal', directory, 'darwin')).toEqual({
      executable: '/usr/bin/open',
      args: ['-a', 'Terminal', directory],
    });
  });

  it('opens iTerm2 at the worktree directory on macOS', () => {
    expect(terminalLaunchSpec('iterm2', '/code/project', 'darwin')).toEqual({
      executable: '/usr/bin/open',
      args: ['-a', 'iTerm', '/code/project'],
    });
  });

  it('opens the default terminal emulator at the directory on Linux', () => {
    expect(terminalLaunchSpec('terminal', '/code/project', 'linux')).toEqual({
      executable: 'x-terminal-emulator',
      args: ['--working-directory', '/code/project'],
    });
  });

  it('rejects iTerm2 on Linux', () => {
    expect(() => terminalLaunchSpec('iterm2', '/code/project', 'linux')).toThrow(
      'Opening a terminal is supported only with Terminal or iTerm2 on macOS, or the default terminal on Linux.',
    );
  });

  it('rejects relative paths', () => {
    expect(() => terminalLaunchSpec('terminal', 'relative/project')).toThrow(
      'The terminal path must be absolute.',
    );
  });

  it('rejects unsupported platforms', () => {
    expect(() => terminalLaunchSpec('terminal', '/code/project', 'win32')).toThrow(
      'Opening a terminal is supported only with Terminal or iTerm2 on macOS, or the default terminal on Linux.',
    );
  });
});
