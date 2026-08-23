/** Bounded parallel map that preserves input order. */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const limit = Math.min(Math.max(1, concurrency), items.length)
  const out = new Array<R>(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      out[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
  return out
}
