import { en, Faker } from '@faker-js/faker';

const TEST_DATA_SEED = 20_260_725;

export const testFaker = new Faker({
  locale: [en],
  seed: TEST_DATA_SEED,
});

export function resetTestFaker(): void {
  testFaker.seed(TEST_DATA_SEED);
}

export function fakeSlug(prefix?: string): string {
  const value = testFaker.helpers
    .slugify(testFaker.word.words(2))
    .replaceAll(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();
  return prefix ? `${prefix}-${value}` : value;
}
