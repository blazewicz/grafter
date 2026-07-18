import type { DateFormatPreference, Settings, TimeFormatPreference } from './contracts';

export const defaultSettings: Settings = {
  defaultWorktreePath: '../<repo_name>.worktrees',
  dateFormat: 'system',
  timeFormat: 'system',
};

const dateFormats: readonly DateFormatPreference[] = [
  'system',
  'day-month-year',
  'month-day-year',
  'year-month-day',
];
const timeFormats: readonly TimeFormatPreference[] = ['system', '24-hour', '12-hour'];

export function isDateFormatPreference(value: unknown): value is DateFormatPreference {
  return dateFormats.some((format) => format === value);
}

export function isTimeFormatPreference(value: unknown): value is TimeFormatPreference {
  return timeFormats.some((format) => format === value);
}

export function normalizeSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') return { ...defaultSettings };
  const candidate = value as Record<string, unknown>;
  return {
    defaultWorktreePath:
      typeof candidate.defaultWorktreePath === 'string'
        ? candidate.defaultWorktreePath
        : defaultSettings.defaultWorktreePath,
    dateFormat: isDateFormatPreference(candidate.dateFormat)
      ? candidate.dateFormat
      : defaultSettings.dateFormat,
    timeFormat: isTimeFormatPreference(candidate.timeFormat)
      ? candidate.timeFormat
      : defaultSettings.timeFormat,
  };
}

export function isSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.defaultWorktreePath === 'string' &&
    isDateFormatPreference(candidate.dateFormat) &&
    isTimeFormatPreference(candidate.timeFormat)
  );
}
