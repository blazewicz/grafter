import { describe, expect, it } from 'vitest';
import { isPullRequestState } from '../src/shared/contracts';

describe('isPullRequestState', () => {
  it('accepts the pull request states returned by GitHub', () => {
    expect(['OPEN', 'MERGED', 'CLOSED'].every(isPullRequestState)).toBe(true);
  });

  it('rejects unknown pull request states', () => {
    expect(isPullRequestState('DRAFT')).toBe(false);
    expect(isPullRequestState(undefined)).toBe(false);
  });
});
