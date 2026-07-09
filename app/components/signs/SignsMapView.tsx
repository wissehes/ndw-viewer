"use client";

import dynamic from "next/dynamic";

// maplibre-gl is browser-only, so load the signs map without SSR.
const SignsMap = dynamic(() => import("./SignsMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-100 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500">Loading map…</p>
    </div>
  ),
});

export default function SignsMapView() {
  return <SignsMap />;
}
