import { Factory } from 'fishery';
import type { PullRequest } from '../../src/shared/contracts';
import { fakeSlug, testFaker } from './faker';

export const pullRequestFactory = Factory.define<PullRequest>(({ params, sequence }) => {
  const number = params.number ?? sequence;
  const owner = fakeSlug('owner');
  const repository = fakeSlug('repo');

  return {
    number,
    title: testFaker.git.commitMessage(),
    url: `https://github.com/${owner}/${repository}/pull/${number}`,
    state: 'OPEN',
    baseBranch: 'main',
  };
});
