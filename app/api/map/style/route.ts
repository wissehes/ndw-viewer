// Proxies the MapLibre style JSON from MAPTILER_STYLE_URL. Reading the env var
// here (server-side, per request) makes it a runtime variable — the client
// points at /api/map/style, so the URL can be set when the container starts
// instead of being baked into the build like a NEXT_PUBLIC_ var would be.
//
// force-dynamic keeps this out of static generation, so the env is read at
// runtime rather than at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const styleUrl = process.env.MAPTILER_STYLE_URL;
  if (!styleUrl) {
    return Response.json(
      { error: "MAPTILER_STYLE_URL is not set" },
      { status: 500 },
    );
  }

  try {
    // Cache the upstream style for an hour; it rarely changes between deploys.
    const res = await fetch(styleUrl, { next: { revalidate: 3600 } });
    if (!res.ok) {
      throw new Error(`Failed to fetch style: ${res.statusText}`);
    }
    const styleJson = await res.json();
    return Response.json(styleJson, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Failed to fetch style: ${msg}` },
      { status: 500 },
    );
  }
}
