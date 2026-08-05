// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { previewApi } from '../../src/renderer/preview-api';

describe('preview API window contracts', () => {
  it('uses one repository snapshot and derives retained diff identity from it', async () => {
    const initial = await previewApi.getSnapshot();
    if (initial.kind !== 'repository') throw new Error('Expected repository preview.');

    expect(initial).not.toHaveProperty('projects');
    const diff = await previewApi.openBranchDiff({
      sourceBranch: initial.repository.worktrees[0]?.branch ?? 'main',
      targetBranch: 'preview-target',
    });
    const updated = await previewApi.updateRepositorySetup('npm run preview');

    expect(diff.projectId).toBe(initial.repository.id);
    expect(updated).toMatchObject({
      kind: 'repository',
      repository: { id: initial.repository.id, setupScript: 'npm run preview' },
    });
  });
});
