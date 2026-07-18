import { describe, expect, it } from 'vitest';
import { validateClipboardText } from '../../src/shared/clipboard';

describe('clipboard command validation', () => {
  it('accepts a non-empty command string unchanged', () => {
    expect(validateClipboardText("git commit -m 'Fix it'")).toBe(
      "git commit -m 'Fix it'",
    );
  });

  it('rejects invalid and excessively large IPC payloads', () => {
    expect(() => validateClipboardText('')).toThrow('Invalid clipboard text.');
    expect(() => validateClipboardText({ command: 'git status' })).toThrow(
      'Invalid clipboard text.',
    );
    expect(() => validateClipboardText('x'.repeat(100_001))).toThrow(
      'Invalid clipboard text.',
    );
  });
});
