import { describe, expect, it } from 'vitest';
import { displayCommand, quoteArg } from '../src/main/commands';

describe('command display', () => {
  it('leaves safe arguments readable', () => {
    expect(displayCommand('git', ['worktree', 'list', '--porcelain'])).toBe(
      'git worktree list --porcelain',
    );
  });

  it('quotes spaces and embedded single quotes exactly', () => {
    expect(quoteArg("don't run this")).toBe("'don'\\''t run this'");
  });
});
