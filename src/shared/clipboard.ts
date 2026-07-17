const maximumCommandLength = 100_000;

export function validateCommandForClipboard(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumCommandLength
  ) {
    throw new Error('Invalid command text.');
  }
  return value;
}
