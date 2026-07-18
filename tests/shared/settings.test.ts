import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  isSettings,
  normalizeSettings,
} from '../../src/shared/settings';

describe('settings', () => {
  it('uses system date and time preferences by default', () => {
    expect(defaultSettings).toEqual({
      defaultWorktreePath: '../<repo_name>.worktrees',
      dateFormat: 'system',
      timeFormat: 'system',
    });
  });

  it('replaces malformed persisted preferences with defaults', () => {
    expect(
      normalizeSettings({
        defaultWorktreePath: '/worktrees/<repo_name>',
        dateFormat: 'invented',
        timeFormat: 24,
      }),
    ).toEqual({
      defaultWorktreePath: '/worktrees/<repo_name>',
      dateFormat: 'system',
      timeFormat: 'system',
    });
  });

  it('validates the complete settings contract', () => {
    expect(
      isSettings({
        defaultWorktreePath: '/worktrees/<repo_name>',
        dateFormat: 'year-month-day',
        timeFormat: '24-hour',
      }),
    ).toBe(true);
    expect(
      isSettings({
        defaultWorktreePath: '/worktrees/<repo_name>',
        dateFormat: 'year-month-day',
      }),
    ).toBe(false);
  });
});
