import { describe, expect, it } from 'vitest';
import {
  initialNavigationHistory,
  navigationHistoryReducer,
  reconcileNavigationHistory,
} from '../../../../src/renderer/components/shell/useNavigationHistory';

describe('navigation history', () => {
  it('navigates backward and forward without duplicating entries', () => {
    const first = navigationHistoryReducer(initialNavigationHistory, {
      type: 'navigate',
      id: 'project',
    });
    const second = navigationHistoryReducer(first, {
      type: 'navigate',
      id: 'worktree',
    });

    const back = navigationHistoryReducer(second, { type: 'back' });
    expect(back).toEqual({ entries: ['project', 'worktree'], index: 0 });
    expect(navigationHistoryReducer(back, { type: 'forward' })).toEqual(second);
    expect(navigationHistoryReducer(second, { type: 'navigate', id: 'worktree' })).toBe(
      second,
    );
  });

  it('clears forward entries after navigating from an earlier entry', () => {
    const state = {
      entries: ['project-a', 'worktree-a', 'project-b'],
      index: 1,
    };

    expect(
      navigationHistoryReducer(state, { type: 'navigate', id: 'worktree-b' }),
    ).toEqual({
      entries: ['project-a', 'worktree-a', 'worktree-b'],
      index: 2,
    });
  });

  it('initializes from a snapshot without treating refreshes as navigation', () => {
    const initialized = reconcileNavigationHistory(
      initialNavigationHistory,
      ['project', 'worktree'],
      'worktree',
    );

    expect(initialized).toEqual({ entries: ['worktree'], index: 0 });
    expect(
      reconcileNavigationHistory(initialized, ['project', 'worktree'], 'worktree'),
    ).toBe(initialized);
  });

  it('prunes removed entries and selects the nearest remaining destination', () => {
    const state = {
      entries: ['project-a', 'worktree-a', 'project-b', 'worktree-b'],
      index: 2,
    };

    expect(
      reconcileNavigationHistory(
        state,
        ['project-a', 'worktree-a', 'worktree-b'],
        'worktree-a',
      ),
    ).toEqual({
      entries: ['project-a', 'worktree-a', 'worktree-b'],
      index: 1,
    });
  });
});
