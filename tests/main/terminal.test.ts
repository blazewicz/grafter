import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { terminalLaunchSpec } from '../../src/main/terminal';

describe('terminal launch commands', () => {
  it('opens Terminal at the worktree directory on macOS', () => {
    const directory = path.join(path.sep, 'code', 'project with spaces');

    expect(terminalLaunchSpec(directory, 'darwin')).toEqual({
      executable: '/usr/bin/open',
      args: ['-a', 'Terminal', directory],
    });
  });

  it('opens the default terminal emulator at the directory on Linux', () => {
    expect(terminalLaunchSpec('/code/project', 'linux')).toEqual({
      executable: 'x-terminal-emulator',
      args: ['--working-directory', '/code/project'],
    });
  });

  it('rejects relative paths', () => {
    expect(() => terminalLaunchSpec('relative/project')).toThrow(
      'The terminal path must be absolute.',
    );
  });

  it('rejects unsupported platforms', () => {
    expect(() => terminalLaunchSpec('/code/project', 'win32')).toThrow(
      'Opening a terminal is supported only on macOS and Linux.',
    );
  });
});
