import { Factory } from 'fishery';
import type { Settings } from '../../src/shared/contracts';

export const settingsFactory = Factory.define<Settings>(() => ({
  defaultWorktreePath: '../<repo_name>.worktrees',
  dateFormat: 'year-month-day',
  timeFormat: '24-hour',
}));
