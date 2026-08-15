import { describe, expect, it } from 'vitest';
import {
  resolveHighlightedId,
  worktreeKeyAction,
} from '../../../src/renderer/sidebar/useWorktreeList';

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

describe('worktreeKeyAction', () => {
  it('moves the highlight forward and wraps past the last option', () => {
    expect(worktreeKeyAction('ArrowDown', 'grafter:feature', visibleIds)).toEqual({
      kind: 'highlight',
      id: 'grafter:hotfix',
    });
    expect(worktreeKeyAction('ArrowDown', 'grafter:hotfix', visibleIds)).toEqual({
      kind: 'highlight',
      id: 'grafter:main',
    });
  });

  it('moves the highlight backward and wraps past the first option', () => {
    expect(worktreeKeyAction('ArrowUp', 'grafter:main', visibleIds)).toEqual({
      kind: 'highlight',
      id: 'grafter:hotfix',
    });
    expect(worktreeKeyAction('ArrowUp', 'grafter:feature', visibleIds)).toEqual({
      kind: 'highlight',
      id: 'grafter:main',
    });
  });

  it('starts from the first option going down and the last going up', () => {
    expect(worktreeKeyAction('ArrowDown', undefined, visibleIds)).toEqual({
      kind: 'highlight',
      id: 'grafter:main',
    });
    expect(worktreeKeyAction('ArrowUp', undefined, visibleIds)).toEqual({
      kind: 'highlight',
      id: 'grafter:hotfix',
    });
  });

  it('jumps to the first or last option when the highlight is no longer visible', () => {
    expect(worktreeKeyAction('ArrowDown', 'grafter:gone', visibleIds)).toEqual({
      kind: 'highlight',
      id: 'grafter:main',
    });
    expect(worktreeKeyAction('ArrowUp', 'grafter:gone', visibleIds)).toEqual({
      kind: 'highlight',
      id: 'grafter:hotfix',
    });
  });

  it('jumps to the first and last option with Home and End', () => {
    expect(worktreeKeyAction('Home', 'grafter:hotfix', visibleIds)).toEqual({
      kind: 'highlight',
      id: 'grafter:main',
    });
    expect(worktreeKeyAction('End', 'grafter:main', visibleIds)).toEqual({
      kind: 'highlight',
      id: 'grafter:hotfix',
    });
  });

  it('commits the highlighted option with Enter', () => {
    expect(worktreeKeyAction('Enter', 'grafter:feature', visibleIds)).toEqual({
      kind: 'select',
      id: 'grafter:feature',
    });
  });

  it('commits the first option with Enter when nothing is highlighted', () => {
    expect(worktreeKeyAction('Enter', undefined, visibleIds)).toEqual({
      kind: 'select',
      id: 'grafter:main',
    });
  });

  it('ignores Space, letters, and unmapped keys', () => {
    expect(worktreeKeyAction(' ', 'grafter:feature', visibleIds)).toBeUndefined();
    expect(worktreeKeyAction('f', 'grafter:feature', visibleIds)).toBeUndefined();
    expect(worktreeKeyAction('ArrowLeft', 'grafter:feature', visibleIds)).toBeUndefined();
  });

  it('returns undefined for an empty list', () => {
    expect(worktreeKeyAction('ArrowDown', undefined, [])).toBeUndefined();
    expect(worktreeKeyAction('Enter', undefined, [])).toBeUndefined();
  });
});
