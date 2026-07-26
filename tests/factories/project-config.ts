import { Factory } from 'fishery';
import type { ProjectConfig } from '../../src/shared/contracts';
import { fakeSlug, testFaker } from './faker';

export interface ProjectConfigTransientParams {
  withSetupScript: boolean;
}

export const projectConfigFactory = Factory.define<
  ProjectConfig,
  ProjectConfigTransientParams
>(({ params, transientParams }) => {
  const name = params.name ?? fakeSlug('repository');
  const setupScript =
    params.setupScript ??
    (transientParams.withSetupScript
      ? testFaker.helpers.arrayElement([
          'npm install',
          'pnpm install',
          'yarn install',
          'bun install',
        ])
      : undefined);

  return {
    id: params.id ?? name,
    name,
    path: params.path ?? `/Users/developer/Code/${name}`,
    ...(setupScript === undefined ? {} : { setupScript }),
  };
});
