import { Factory } from 'fishery';
import type { ProjectTreeItem } from '../../src/shared/contracts';
import { fakeSlug } from './faker';
import { mainWorktreeFactory } from './worktree';

export const projectTreeItemFactory = Factory.define<ProjectTreeItem>(
  ({ associations, params }) => {
    const name = params.name ?? fakeSlug('repository');
    const id = params.id ?? name;
    const path = params.path ?? `/Users/developer/Code/${name}`;

    return {
      id,
      name,
      path,
      worktrees:
        associations.worktrees ??
        mainWorktreeFactory.buildList(1, {
          id: `${id}:main`,
          projectId: id,
          path,
        }),
    };
  },
);
