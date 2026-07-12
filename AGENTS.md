<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project goal

Visualize live data from the **NDW** (Nationaal Dataportaal Wegverkeer — the Dutch national road-traffic data portal) on a map. API/data docs: <https://docs.ndw.nu>. The map is built on **MapLibre GL** via `@vis.gl/react-maplibre`; NDW feeds are fetched, parsed and served through a **tRPC** layer (see Architecture below).

## Commands

Uses **pnpm** (see `packageManager` in package.json) and **Biome** (not ESLint/Prettier) for lint/format.

- `pnpm dev` — run the dev server (<http://localhost:3000>)
- `pnpm build` — production build
- `pnpm start` — serve the production build
- `pnpm lint` — Biome check (lint + format + import-organize checks)
- `pnpm format` — Biome format, writing changes

There is no test runner configured yet.

## Critical: this is Next.js 16, not the version you know

The Next.js warning at the top of this file applies to all work here. Next.js is pinned to **16.2.10**, which has breaking API/convention changes from older versions. **Before writing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/`** — start at `node_modules/next/dist/docs/01-app/` (this project uses the App Router) and heed deprecation notices. Do not rely on training-data recollection of Next.js APIs.

## Architecture & conventions

Data flows **NDW upstream → feed transform → in-memory cache → tRPC → TanStack Query → map layer**. When adding a feed or a query, follow the existing layering rather than fetching from a component directly.

### tRPC layer (`trpc/`)

tRPC v11 with the **TanStack React Query** integration and a **superjson** transformer (set in both `init.ts` and `client.tsx` — keep them in sync).

- `init.ts` — creates the `t` instance and exports the building blocks: `createTRPCRouter`, `baseProcedure`, `createCallerFactory`, and `createTRPCContext` (context is currently empty `{}`; add shared per-request state here).
- `routers/_app.ts` — the root `appRouter`; **must** re-export its type as `AppRouter` (the client is typed against it).
- `routers/feeds.ts` — feed procedures. Keep routers **thin**: a procedure is one-line wiring to a `getX()` in `app/lib/feeds/`. No fetch/parse/transform logic in the router.
- `server.tsx` — `server-only` RSC-side proxy + cached `getQueryClient` for prefetching in Server Components.
- `client.tsx` — `"use client"` provider (`TRPCReactProvider`) and the `useTRPC()` hook. Mounted app-wide via `app/providers.tsx`.
- `query-client.ts` — shared `makeQueryClient` (default `staleTime` 30s, superjson (de)hydration).
- HTTP handler lives at `app/api/trpc/[trpc]/route.ts`.

**Consuming a query in a client component** — use `useTRPC()` + TanStack `useQuery`, not a bespoke fetch:

```tsx
const trpc = useTRPC();
const { data } = useQuery(trpc.feeds.drips.queryOptions(undefined, { refetchInterval: 30_000 }));
```

Use `refetchInterval` for the live-polling feeds.

### NDW feeds (`app/lib/feeds/`)

- One file per feed (`actueel-beeld.ts`, `drips.ts`, `msi.ts`); each exports a `getX()` returning a GeoJSON `FeatureCollection`.
- `index.ts` holds shared helpers: `fetchGzipXml` (feeds are gzipped DATEX II / SOAP XML), `asArray`, `findFirst`. The `fast-xml-parser` instance strips namespace prefixes (`removeNSPrefix`).
- Every feed is wrapped in `createCachedFeed` (`app/lib/feedCache.ts`) — a per-process TTL cache that dedupes concurrent refreshes and serves stale data through transient upstream failures. Note: module-scoped, so it resets on hot-reload and isn't shared across serverless instances.
- Feed response types live in `types/NDW/*.ts` at the repo root (import via `@/types/NDW/...`).

### Other standards

- **URL state via nuqs** — shared view state (map position/zoom) lives in the URL, not React state. See `app/hooks/useMapView.ts` + `app/lib/mapView.ts`; the `NuqsAdapter` is mounted in `app/providers.tsx`.
- **Runtime (not build-time) config** — env vars that must be settable at container start are read server-side in an API route and proxied to the client, rather than baked in as `NEXT_PUBLIC_*`. Pattern: `app/api/map/style/route.ts` (reads `MAPTILER_STYLE_URL`, `export const dynamic = "force-dynamic"`). This supports the `output: "standalone"` Docker build.
- **Browser-only map** — MapLibre must not SSR; load map components with `next/dynamic` + `{ ssr: false }` (see `SignsMapView.tsx`).
- **Validation** — use **zod** for procedure `.input(...)` schemas.

## Deployment

Deploys to a **k3s** cluster via a GitHub Actions pipeline on every push to `main`. Container images are published to **GHCR** (`ghcr.io/wissehes/ndw-viewer`).

### CI/CD (`.github/workflows/deploy.yaml`)

Two jobs: **build** then **deploy** (`deploy` `needs: build`).

- **build** — runs on the self-hosted `ndw-viewer-runners`; logs in to GHCR (`GITHUB_TOKEN`), then `docker/build-push-action` builds from the repo `Dockerfile` and pushes two tags: `:${{ github.sha }}` and `:latest` (with GHA build cache).
- **deploy** — runs on `ubuntu-latest`; joins the cluster's network over **Tailscale** (OAuth secrets + `tag:github-actions`), sets up `kubectl`, writes the `KUBECONFIG` secret to disk, then:
  - `kubectl apply -f k8s/` — reconcile the manifests.
  - `kubectl set image deployment/ndw-viewer ndw-viewer=<IMAGE>:<sha>` — pin to the exact commit image (not `:latest`) so the rollout is deterministic.
  - `kubectl rollout status … --timeout=120s` — block until healthy.

Required GitHub secrets: `KUBECONFIG`, `TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_SECRET` (`GITHUB_TOKEN` is provided automatically).

### k8s manifests (`k8s/`)

Applied wholesale with `kubectl apply -f k8s/`; the running image is overridden by the pipeline's `set image` step, so bumping the image tag in the manifest is not how you deploy.

- `deployment.yaml` — `Deployment` (1 replica, `RollingUpdate` with `maxUnavailable: 0`/`maxSurge: 1` for zero-downtime). Pulls from GHCR via the `ghcr-secret` `imagePullSecret`; container listens on port 3000. `MAPTILER_STYLE_URL` is injected from the `ndw-viewer-secrets` Secret (matches the runtime-config pattern above — see Other standards).
- `service.yaml` — `Service` mapping port 80 → container `targetPort` 3000.
- `ingress.yaml` — Traefik `Ingress` exposing `ndw.k3s.wissehes.nl` → the service on port 80.

Cluster prerequisites (managed out-of-band, not in this repo): the `ghcr-secret` pull secret, the `ndw-viewer-secrets` Secret, and a Traefik ingress controller.

## Stack notes

- **App Router** under `app/` — `layout.tsx` (root, sets Geist fonts, dark-mode-aware body, mounts `Providers`). Routes: `/` (`page.tsx`, traffic/actueel-beeld map) and `/signs` (`signs/page.tsx`, MSI + DRIP signs map).
- **React 19.2** with the **React Compiler enabled** (`reactCompiler: true` in `next.config.ts`, `babel-plugin-react-compiler`). Avoid manual `useMemo`/`useCallback` micro-optimizations the compiler handles.
- **Tailwind CSS v4** — configured via `@import "tailwindcss"` and `@theme` in `app/globals.css` and the `@tailwindcss/postcss` PostCSS plugin. There is no `tailwind.config.js`; theme tokens live in CSS.
- **Path alias**: `@/*` maps to the repo root (e.g. `@/app/...`, `@/trpc/...`, `@/types/...`).
- Biome config in `biome.json` enables the `next` and `react` lint domains; import organization runs as an assist action.
