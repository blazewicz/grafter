import { spawn } from 'node:child_process';
import path from 'node:path';
import type { EditorTool } from '../shared/contracts';

export interface EditorLaunchSpec {
  executable: string;
  args: string[];
}

export function editorLaunchSpec(
  editor: EditorTool,
  directoryPath: string,
  platform: NodeJS.Platform = process.platform,
): EditorLaunchSpec {
  if (!path.isAbsolute(directoryPath)) {
    throw new Error('The editor path must be absolute.');
  }

  switch (editor) {
    case 'vscode':
      if (platform === 'darwin') {
        return {
          executable: '/usr/bin/open',
          args: [
            '-n',
            '-a',
            'Visual Studio Code',
            '--args',
            '--new-window',
            directoryPath,
          ],
        };
      }
      if (platform === 'linux') {
        return {
          executable: 'code',
          args: ['--new-window', directoryPath],
        };
      }
      throw new Error('Opening an IDE is supported only on macOS and Linux.');
    default:
      throw new Error('Unsupported IDE.');
  }
}

export function launchEditor(editor: EditorTool, directoryPath: string): Promise<void> {
  const spec = editorLaunchSpec(editor, directoryPath);

  return new Promise((resolve, reject) => {
    const child = spawn(spec.executable, spec.args, {
      shell: false,
      stdio: 'ignore',
    });

    child.once('error', reject);
    child.once('close', (exitCode) => {
      if (exitCode === 0) resolve();
      else
        reject(new Error(`The IDE launcher exited with code ${exitCode ?? 'unknown'}.`));
    });
  });
}
