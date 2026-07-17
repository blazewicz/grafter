const maximumClipboardTextLength = 100_000;

export function validateClipboardText(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumClipboardTextLength
  ) {
    throw new Error('Invalid clipboard text.');
  }
  return value;
}
