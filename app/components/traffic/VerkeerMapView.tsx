"use client";

import dynamic from "next/dynamic";

// maplibre-gl is browser-only, so load the traffic map without SSR.
const VerkeerMap = dynamic(() => import("./VerkeerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-100 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500">Loading map…</p>
    </div>
  ),
});

export default function VerkeerMapView() {
  return <VerkeerMap />;
}
