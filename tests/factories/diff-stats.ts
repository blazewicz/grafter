import { Factory } from 'fishery';
import type { DiffStats } from '../../src/shared/contracts';
import { testFaker } from './faker';

export const diffStatsFactory = Factory.define<DiffStats>(() => ({
  files: testFaker.number.int({ min: 1, max: 20 }),
  additions: testFaker.number.int({ min: 1, max: 500 }),
  deletions: testFaker.number.int({ min: 0, max: 200 }),
}));
