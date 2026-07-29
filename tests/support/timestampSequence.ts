import { faker } from '@faker-js/faker';

type Duration =
  | { milliseconds: number; seconds?: number; minutes?: number }
  | { milliseconds?: number; seconds: number; minutes?: number }
  | { milliseconds?: number; seconds?: number; minutes: number };

export function timestampSequence(start = faker.date.recent()) {
  let current = start.getTime();

  function nextTs(): string;
  function nextTs(duration: Duration): string;
  function nextTs(duration?: Duration): string {
    const advance =
      duration === undefined
        ? faker.number.int({ min: 100, max: 1000 })
        : (duration.milliseconds ?? 0) +
          (duration.seconds ?? 0) * 1_000 +
          (duration.minutes ?? 0) * 60_000;

    current += advance;
    return new Date(current).toISOString();
  }

  return nextTs;
}
