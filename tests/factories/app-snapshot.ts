import { Factory } from 'fishery';
import type { AppSnapshot } from '../../src/shared/contracts';
import { projectFactory } from './project';
import { settingsFactory } from './settings';

export const appSnapshotFactory = Factory.define<AppSnapshot>(({ associations }) => ({
  homeDirectory: '/Users/developer',
  systemLocale: 'en-GB',
  settings: settingsFactory.build(),
  projects: associations.projects ?? projectFactory.buildList(1),
}));
