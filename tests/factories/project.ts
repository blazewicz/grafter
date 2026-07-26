import { Factory } from 'fishery';
import type { Project } from '../../src/shared/contracts';
import { fakeSlug } from './faker';

export const projectFactory = Factory.define<Project>(({ params }) => {
  const name = params.name ?? fakeSlug('repository');

  return {
    id: params.id ?? name,
    name,
    path: params.path ?? `/Users/developer/Code/${name}`,
  };
});
