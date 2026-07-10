"use client";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { TRPCReactProvider } from "@/trpc/client";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <NuqsAdapter>
      <TRPCReactProvider>{children}</TRPCReactProvider>
    </NuqsAdapter>
  );
}
