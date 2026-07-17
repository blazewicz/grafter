import { describe, expect, it } from 'vitest';
import { validateCommandForClipboard } from '../src/shared/clipboard';

describe('clipboard command validation', () => {
  it('accepts a non-empty command string unchanged', () => {
    expect(validateCommandForClipboard("git commit -m 'Fix it'")).toBe(
      "git commit -m 'Fix it'",
    );
  });

  it('rejects invalid and excessively large IPC payloads', () => {
    expect(() => validateCommandForClipboard('')).toThrow('Invalid command text.');
    expect(() => validateCommandForClipboard({ command: 'git status' })).toThrow(
      'Invalid command text.',
    );
    expect(() => validateCommandForClipboard('x'.repeat(100_001))).toThrow(
      'Invalid command text.',
    );
  });
});
