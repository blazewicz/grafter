import { describe, expect, it } from 'vitest';
import { pullRequestStateFromGitHub } from '../../src/shared/contracts';

describe('pullRequestStateFromGitHub', () => {
  it('distinguishes draft and ready open pull requests', () => {
    expect(pullRequestStateFromGitHub('OPEN', false)).toBe('OPEN');
    expect(pullRequestStateFromGitHub('OPEN', true)).toBe('DRAFT');
  });

  it('preserves terminal pull request states', () => {
    expect(pullRequestStateFromGitHub('MERGED', false)).toBe('MERGED');
    expect(pullRequestStateFromGitHub('CLOSED', false)).toBe('CLOSED');
  });

  it('rejects malformed GitHub responses', () => {
    expect(pullRequestStateFromGitHub('DRAFT', true)).toBeUndefined();
    expect(pullRequestStateFromGitHub('OPEN', undefined)).toBeUndefined();
  });
});
