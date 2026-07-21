import type { DiffFileSummary } from '../../../shared/contracts';

export type DiffTreeNode = DiffTreeDirectory | DiffTreeFile;

export interface DiffTreeDirectory {
  kind: 'directory';
  name: string;
  path: string;
  children: DiffTreeNode[];
}

export interface DiffTreeFile {
  kind: 'file';
  name: string;
  path: string;
  file: DiffFileSummary;
}

interface MutableDirectory {
  name: string;
  path: string;
  directories: Map<string, MutableDirectory>;
  files: DiffTreeFile[];
}

export function filterDiffFiles(
  files: readonly DiffFileSummary[],
  query: string,
): DiffFileSummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...files];
  return files.filter(
    (file) =>
      file.path.toLocaleLowerCase().includes(normalized) ||
      file.previousPath?.toLocaleLowerCase().includes(normalized),
  );
}

export function buildDiffTree(files: readonly DiffFileSummary[]): DiffTreeNode[] {
  const root: MutableDirectory = {
    name: '',
    path: '',
    directories: new Map(),
    files: [],
  };

  for (const file of files) {
    const parts = file.path.split('/');
    const fileName = parts.pop() ?? file.path;
    let directory = root;
    for (const part of parts) {
      const directoryPath = directory.path ? `${directory.path}/${part}` : part;
      let child = directory.directories.get(part);
      if (!child) {
        child = {
          name: part,
          path: directoryPath,
          directories: new Map(),
          files: [],
        };
        directory.directories.set(part, child);
      }
      directory = child;
    }
    directory.files.push({
      kind: 'file',
      name: fileName,
      path: file.path,
      file,
    });
  }

  return materializeChildren(root);
}

export function flattenDiffTree(nodes: readonly DiffTreeNode[]): DiffFileSummary[] {
  return nodes.flatMap((node) =>
    node.kind === 'file' ? [node.file] : flattenDiffTree(node.children),
  );
}

export function diffDirectoryPaths(files: readonly DiffFileSummary[]): string[] {
  const paths = new Set<string>();
  for (const file of files) {
    const parts = file.path.split('/');
    parts.pop();
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      paths.add(current);
    }
  }
  return [...paths];
}

function materializeChildren(directory: MutableDirectory): DiffTreeNode[] {
  const directories: DiffTreeDirectory[] = [...directory.directories.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((child) => ({
      kind: 'directory',
      name: child.name,
      path: child.path,
      children: materializeChildren(child),
    }));
  const files = directory.files
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));
  return [...directories, ...files];
}
