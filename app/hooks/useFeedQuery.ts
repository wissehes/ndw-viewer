"use client";

import { useQuery } from "@tanstack/react-query";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

// Fetches an NDW GeoJSON feed. Caching/refetch cadence comes from the
// QueryClient defaults in app/providers.tsx.
export function useFeedQuery<T>(url: string) {
  return useQuery<T>({ queryKey: [url], queryFn: () => fetchJson<T>(url) });
}
