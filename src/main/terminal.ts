import { spawn } from 'node:child_process';
import path from 'node:path';

export interface TerminalLaunchSpec {
  executable: string;
  args: string[];
}

export function terminalLaunchSpec(
  directoryPath: string,
  platform: NodeJS.Platform = process.platform,
): TerminalLaunchSpec {
  if (!path.isAbsolute(directoryPath)) {
    throw new Error('The terminal path must be absolute.');
  }

  if (platform === 'darwin') {
    return {
      executable: '/usr/bin/open',
      args: ['-a', 'Terminal', directoryPath],
    };
  }
  if (platform === 'linux') {
    return {
      executable: 'x-terminal-emulator',
      args: ['--working-directory', directoryPath],
    };
  }
  throw new Error('Opening a terminal is supported only on macOS and Linux.');
}

export function launchTerminal(directoryPath: string): Promise<void> {
  const spec = terminalLaunchSpec(directoryPath);

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
