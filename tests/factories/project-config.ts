import { Factory } from 'fishery';
import type { ProjectConfig } from '../../src/shared/contracts';
import { fakeSlug } from './faker';

export const projectConfigFactory = Factory.define<ProjectConfig>(({ params }) => {
  const name = params.name ?? fakeSlug('repository');

  return {
    id: params.id ?? name,
    name,
    path: params.path ?? `/Users/developer/Code/${name}`,
  };
});
