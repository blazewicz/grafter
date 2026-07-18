import type {
  DateFormatPreference,
  Settings,
  TimeFormatPreference,
} from '../shared/contracts';

type DateTimeValue = Date | number | string;

function asDate(value: DateTimeValue): Date {
  return value instanceof Date ? value : new Date(value);
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function fallbackDate(date: Date): string {
  return `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function fallbackTime(date: Date, includeSeconds: boolean): string {
  const seconds = includeSeconds ? `:${twoDigits(date.getSeconds())}` : '';
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}${seconds}`;
}

export function formatDate(
  value: DateTimeValue,
  preference: DateFormatPreference,
  locales?: Intl.LocalesArgument,
): string {
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';

  const day = twoDigits(date.getDate());
  const month = twoDigits(date.getMonth() + 1);
  const year = String(date.getFullYear());
  if (preference === 'day-month-year') return `${day}/${month}/${year}`;
  if (preference === 'month-day-year') return `${month}/${day}/${year}`;
  if (preference === 'year-month-day') return `${year}-${month}-${day}`;

  try {
    return new Intl.DateTimeFormat(locales, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return fallbackDate(date);
  }
}

export function formatTime(
  value: DateTimeValue,
  preference: TimeFormatPreference,
  includeSeconds = false,
  locales?: Intl.LocalesArgument,
): string {
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return 'Invalid time';

  if (preference === '24-hour') return fallbackTime(date, includeSeconds);
  if (preference === '12-hour') {
    const hours = date.getHours();
    const seconds = includeSeconds ? `:${twoDigits(date.getSeconds())}` : '';
    return `${hours % 12 || 12}:${twoDigits(date.getMinutes())}${seconds} ${
      hours < 12 ? 'AM' : 'PM'
    }`;
  }

  try {
    return new Intl.DateTimeFormat(locales, {
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
    }).format(date);
  } catch {
    return fallbackTime(date, includeSeconds);
  }
}

export function formatDateTime(
  value: DateTimeValue,
  settings: Pick<Settings, 'dateFormat' | 'timeFormat'>,
  locales?: Intl.LocalesArgument,
): string {
  return `${formatDate(value, settings.dateFormat, locales)} ${formatTime(
    value,
    settings.timeFormat,
    true,
    locales,
  )}`;
}
