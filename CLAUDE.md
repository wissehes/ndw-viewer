# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project goal

Visualize live data from the **NDW** (Nationaal Dataportaal Wegverkeer — the Dutch national road-traffic data portal) on a map. API/data docs: <https://docs.ndw.nu>. No mapping library or NDW integration exists yet — the app is still the `create-next-app` scaffold.

## Commands

Uses **pnpm** (see `packageManager` in package.json) and **Biome** (not ESLint/Prettier) for lint/format.

- `pnpm dev` — run the dev server (<http://localhost:3000>)
- `pnpm build` — production build
- `pnpm start` — serve the production build
- `pnpm lint` — Biome check (lint + format + import-organize checks)
- `pnpm format` — Biome format, writing changes

There is no test runner configured yet.

## Critical: this is Next.js 16, not the version you know

`AGENTS.md` (imported above) applies to all work here. Next.js is pinned to **16.2.10**, which has breaking API/convention changes from older versions. **Before writing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/`** — start at `node_modules/next/dist/docs/01-app/` (this project uses the App Router) and heed deprecation notices. Do not rely on training-data recollection of Next.js APIs.

## Stack notes

- **App Router** under `app/` — `layout.tsx` (root, sets Geist fonts + dark-mode-aware body) and `page.tsx` (currently the default scaffold landing page, safe to replace).
- **React 19.2** with the **React Compiler enabled** (`reactCompiler: true` in `next.config.ts`, `babel-plugin-react-compiler`). Avoid manual `useMemo`/`useCallback` micro-optimizations the compiler handles.
- **Tailwind CSS v4** — configured via `@import "tailwindcss"` and `@theme` in `app/globals.css` and the `@tailwindcss/postcss` PostCSS plugin. There is no `tailwind.config.js`; theme tokens live in CSS.
- **Path alias**: `@/*` maps to the repo root (e.g. `@/app/...`).
- Biome config in `biome.json` enables the `next` and `react` lint domains; import organization runs as an assist action.
