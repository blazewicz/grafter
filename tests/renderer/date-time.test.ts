import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatTime } from '../../src/renderer/date-time';

const date = new Date(2026, 6, 18, 17, 5, 9);

describe('date and time formatting', () => {
  it('formats each explicit date layout', () => {
    expect(formatDate(date, 'day-month-year')).toBe('18/07/2026');
    expect(formatDate(date, 'month-day-year')).toBe('07/18/2026');
    expect(formatDate(date, 'year-month-day')).toBe('2026-07-18');
  });

  it('formats explicit 24-hour and 12-hour clocks', () => {
    expect(formatTime(date, '24-hour')).toBe('17:05');
    expect(formatTime(date, '24-hour', true)).toBe('17:05:09');
    expect(formatTime(date, '12-hour')).toBe('5:05 PM');
    expect(formatTime(date, '12-hour', true)).toBe('5:05:09 PM');
  });

  it('delegates system preferences to the active locale', () => {
    expect(formatDate(date, 'system', 'en-US')).toBe(
      new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date),
    );
    expect(formatTime(date, 'system', false, 'en-US')).toBe(
      new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date),
    );
  });

  it('uses the OS formatting region independently from the app language', () => {
    expect(formatDate(date, 'system', 'en-PL')).toBe('18/07/2026');
    expect(formatTime(date, 'system', false, 'en-PL')).toBe('17:05');
    expect(
      formatDateTime(date, { dateFormat: 'system', timeFormat: 'system' }, 'en-PL'),
    ).toBe('18/07/2026 17:05:09');
  });

  it('falls back to day-first and 24-hour formatting when locale detection fails', () => {
    expect(
      formatDateTime(date, { dateFormat: 'system', timeFormat: 'system' }, [
        'not_a_locale',
      ]),
    ).toBe('18/07/2026 17:05:09');
  });

  it('handles invalid timestamps without throwing', () => {
    expect(formatDate('not-a-date', 'day-month-year')).toBe('Invalid date');
    expect(formatTime('not-a-date', '24-hour')).toBe('Invalid time');
  });
});
