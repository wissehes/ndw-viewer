"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode, useState } from "react";

// The NDW feeds refresh ~every minute (and are cached 60s server-side), so keep
// data fresh for a minute and auto-refetch on that cadence to stay live.
export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchInterval: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </NuqsAdapter>
  );
}
