import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { editorLaunchSpec } from '../../src/main/editors';

describe('editor launch commands', () => {
  it('opens VS Code in a new window on macOS without requiring code on PATH', () => {
    const directory = path.join(path.sep, 'code', 'project with spaces');

    expect(editorLaunchSpec('vscode', directory, 'darwin')).toEqual({
      executable: '/usr/bin/open',
      args: ['-n', '-a', 'Visual Studio Code', '--args', '--new-window', directory],
    });
  });

  it('opens VS Code in a new window on Linux', () => {
    expect(editorLaunchSpec('vscode', '/code/project', 'linux')).toEqual({
      executable: 'code',
      args: ['--new-window', '/code/project'],
    });
  });

  it('rejects relative paths', () => {
    expect(() => editorLaunchSpec('vscode', 'relative/project')).toThrow(
      'The editor path must be absolute.',
    );
  });

  it('rejects unsupported editor values received at runtime', () => {
    expect(() => editorLaunchSpec('unknown' as 'vscode', '/code/project')).toThrow(
      'Unsupported IDE.',
    );
  });

  it('rejects unsupported platforms', () => {
    expect(() => editorLaunchSpec('vscode', '/code/project', 'win32')).toThrow(
      'Opening an IDE is supported only on macOS and Linux.',
    );
  });
});
