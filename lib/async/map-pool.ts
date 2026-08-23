/**
 * Await every promise. Attach a no-op rejection handler first so a sibling
 * failure cannot become an unhandledRejection (Vercel turns those into HTML 500s).
 */
export async function awaitAll<T extends readonly unknown[]>(
  promises: [...{ [K in keyof T]: Promise<T[K]> }]
): Promise<T> {
  for (const promise of promises) {
    void promise.catch(() => undefined)
  }
  return Promise.all(promises) as Promise<T>
}

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

  const workers = Array.from({ length: limit }, () => worker())
  return awaitAll(workers).then(() => out)
}
