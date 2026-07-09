"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Kaart" },
  { href: "/signs", label: "Borden" },
];

// Small overlay to switch between the map views.
export default function MapNav() {
  const pathname = usePathname();

  return (
    <nav className="absolute left-4 top-4 z-10 flex gap-1 rounded-full bg-white/90 p-1 shadow-md backdrop-blur dark:bg-zinc-900/90">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
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
