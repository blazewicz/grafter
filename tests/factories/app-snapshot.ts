import { Factory } from 'fishery';
import type { AppSnapshot } from '../../src/shared/contracts';
import { projectTreeItemFactory } from './project-tree-item';
import { settingsFactory } from './settings';

export const appSnapshotFactory = Factory.define<AppSnapshot>(({ associations }) => ({
  homeDirectory: '/Users/developer',
  systemLocale: 'en-GB',
  settings: settingsFactory.build(),
  projects: associations.projects ?? projectTreeItemFactory.buildList(1),
}));
