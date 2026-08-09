import { spawn } from 'node:child_process';
import path from 'node:path';
import type { TerminalTool } from '../shared/contracts';

export interface TerminalLaunchSpec {
  executable: string;
  args: string[];
}

export function terminalLaunchSpec(
  tool: TerminalTool,
  directoryPath: string,
  platform: NodeJS.Platform = process.platform,
): TerminalLaunchSpec {
  if (!path.isAbsolute(directoryPath)) {
    throw new Error('The terminal path must be absolute.');
  }

  if (platform === 'darwin') {
    if (tool === 'terminal') {
      return {
        executable: '/usr/bin/open',
        args: ['-a', 'Terminal', directoryPath],
      };
    }
    if (tool === 'iterm2') {
      return {
        executable: '/usr/bin/open',
        args: ['-a', 'iTerm', directoryPath],
      };
    }
  }
  if (platform === 'linux' && tool === 'terminal') {
    return {
      executable: 'x-terminal-emulator',
      args: ['--working-directory', directoryPath],
    };
  }
  throw new Error(
    'Opening a terminal is supported only with Terminal or iTerm2 on macOS, or the default terminal on Linux.',
  );
}

export function launchTerminal(tool: TerminalTool, directoryPath: string): Promise<void> {
  const spec = terminalLaunchSpec(tool, directoryPath);

  return new Promise((resolve, reject) => {
    const child = spawn(spec.executable, spec.args, {
      shell: false,
      stdio: 'ignore',
    });

    child.once('error', reject);
    child.once('close', (exitCode) => {
      if (exitCode === 0) resolve();
      else
        reject(
          new Error(`The terminal launcher exited with code ${exitCode ?? 'unknown'}.`),
        );
    });
  });
}
