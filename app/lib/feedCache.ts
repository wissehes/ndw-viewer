// In-memory TTL cache for expensive feed transforms, shared by the NDW API
// routes. The heavy fetch+decompress+parse runs at most once per TTL regardless
// of how many client requests arrive, with concurrent refreshes deduped and
// stale data served through transient upstream failures.
//
// NOTE: module state is per-process — it resets on dev hot-reload and is not
// shared across serverless instances. Fine for this use; a shared store
// (Redis/KV) would be the next step for a scaled deployment.

export interface CachedFeed<T> {
  get(): Promise<T>;
}

export function createCachedFeed<T>(
  fetcher: () => Promise<T>,
  ttlMs: number,
): CachedFeed<T> {
  let cache: { data: T; fetchedAt: number } | null = null;
  let inflight: Promise<T> | null = null;

  async function refresh(): Promise<T> {
    const data = await fetcher();
    cache = { data, fetchedAt: Date.now() };
    return data;
  }

  return {
    async get() {
      if (cache && Date.now() - cache.fetchedAt < ttlMs) {
        return cache.data;
      }
      // Dedupe concurrent refreshes: only one fetch/parse runs at a time.
      if (!inflight) {
        inflight = refresh().finally(() => {
          inflight = null;
        });
      }
      try {
        return await inflight;
      } catch (err) {
        // Serve stale data through a transient upstream failure if we have it.
        if (cache) {
          console.error("Feed refresh failed, serving stale cache:", err);
          return cache.data;
        }
        throw err;
      }
    },
  };
}
