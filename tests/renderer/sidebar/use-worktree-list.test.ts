import { describe, expect, it } from 'vitest';
import { resolveHighlightedId } from '../../../src/renderer/sidebar/useWorktreeList';

const visibleIds = ['grafter:main', 'grafter:feature', 'grafter:hotfix'];

describe('resolveHighlightedId', () => {
  it('keeps the highlighted id while it remains visible', () => {
    expect(resolveHighlightedId('grafter:feature', 'grafter:main', visibleIds)).toBe(
      'grafter:feature',
    );
  });

  it('falls back to the selected id when the highlight is no longer visible', () => {
    expect(resolveHighlightedId('grafter:gone', 'grafter:main', visibleIds)).toBe(
      'grafter:main',
    );
  });

  it('falls back to the first visible id when neither is visible', () => {
    expect(resolveHighlightedId('grafter:gone', 'grafter:gone', visibleIds)).toBe(
      'grafter:main',
    );
  });

  it('falls back to the first visible id when there is no highlight yet', () => {
    expect(resolveHighlightedId(undefined, 'grafter:gone', visibleIds)).toBe(
      'grafter:main',
    );
  });

  it('returns undefined for an empty list', () => {
    expect(resolveHighlightedId('grafter:feature', 'grafter:main', [])).toBeUndefined();
  });
});
