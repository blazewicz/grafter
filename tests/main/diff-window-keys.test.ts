import { describe, expect, it } from 'vitest';
import type { DiffSession } from '../../src/shared/contracts';
import { branchDiffSessionFactory, commitDiffSessionFactory } from '../factories';
import { diffWindowKey } from '../../src/main/diff-window-keys';

describe('diffWindowKey', () => {
  it('identifies branch comparisons by project and branch pair', () => {
    const session = branchDiffSessionFactory.build({
      projectId: 'project-1',
      branch: 'feature',
      targetBranch: 'main',
    });

    const key = diffWindowKey(session);

    expect(key).toBe('project-1|branch|feature|main');
  });

  it('treats swapped branch pairs as distinct diffs', () => {
    const source = branchDiffSessionFactory.build({
      projectId: 'project-1',
      branch: 'feature',
      targetBranch: 'main',
    });
    const swapped = branchDiffSessionFactory.build({
      projectId: 'project-1',
      branch: 'main',
      targetBranch: 'feature',
    });

    expect(diffWindowKey(swapped)).not.toBe(diffWindowKey(source));
  });

  it('identifies commit diffs by project and head revision regardless of id', () => {
    const first = commitDiffSessionFactory.build({ projectId: 'project-1' });
    const second = commitDiffSessionFactory.build({
      projectId: 'project-1',
      headSha: first.headSha,
    });
    const otherProject = commitDiffSessionFactory.build({
      projectId: 'project-2',
      headSha: first.headSha,
    });
    const asSession = (value: DiffSession): DiffSession => value;

    expect(diffWindowKey(asSession(second))).toBe(diffWindowKey(asSession(first)));
    expect(diffWindowKey(asSession(otherProject))).not.toBe(
      diffWindowKey(asSession(first)),
    );
  });
});
