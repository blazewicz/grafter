export async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  limit: number,
  mapper: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Concurrency limit must be a positive integer.');
  }

  const results = new Array<Result>(items.length);
  const entries = items.entries();

  const worker = async (): Promise<void> => {
    for (;;) {
      const entry = entries.next();
      if (entry.done) return;
      const [index, item] = entry.value;
      results[index] = await mapper(item, index);
    }
  };

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
