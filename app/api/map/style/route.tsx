export async function GET() {
  // Fetch the map style JSON from the provided url
  const styleUrl = process.env.NEXT_PUBLIC_MAPTILER_STYLE_URL;
  if (!styleUrl) {
    return Response.json(
      {
        error: "NEXT_PUBLIC_MAPTILER_STYLE_URL is not set",
      },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(styleUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch style: ${res.statusText}`);
    }
    const styleJson = await res.json();
    return Response.json(styleJson);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    return Response.json(
      {
        error: `Failed to fetch style: ${msg}`,
      },
      { status: 500 },
    );
  }
}
