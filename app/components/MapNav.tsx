"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { useMapView } from "@/app/hooks/useMapView";
import { serializeMapView } from "@/app/lib/mapView";

const LINKS = [
  { href: "/", label: "Situatie" },
  { href: "/signs", label: "Borden" },
  { href: "/verkeer", label: "Verkeer" },
];

function MapNavLinks() {
  const pathname = usePathname();
  // Carry the live view onto the links so switching pages keeps the pan/zoom.
  const [view] = useMapView();
  const query = serializeMapView(view);

  return (
    <nav className="absolute left-4 top-4 z-10 flex gap-1 rounded-full bg-white/90 p-1 shadow-md backdrop-blur dark:bg-zinc-900/90">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={`${href}${query}`}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              active
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// Overlay to switch between the map views. useMapView reads useSearchParams,
// which needs a Suspense boundary during prerender; keeping it here lets the
// host pages stay static.
export default function MapNav() {
  return (
    <Suspense>
      <MapNavLinks />
    </Suspense>
  );
}
