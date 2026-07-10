import { createSerializer, parseAsFloat } from "nuqs/server";

// Default map view (center of the Netherlands).
export const DEFAULT_VIEW = { longitude: 5.29, latitude: 52.13, zoom: 7 };

// View state in the query string, shareable and shared between the map pages.
// Server-safe (no React), so the client hook and serializer both reuse it.
// Defaults are omitted from the URL by nuqs.
export const mapViewParsers = {
  lng: parseAsFloat.withDefault(DEFAULT_VIEW.longitude),
  lat: parseAsFloat.withDefault(DEFAULT_VIEW.latitude),
  zoom: parseAsFloat.withDefault(DEFAULT_VIEW.zoom),
};

export const mapViewUrlOptions = {
  // Panning fires often: don't spam history or rewrite the URL every frame.
  history: "replace",
  throttleMs: 300,
} as const;

// View -> query string ("?lng=..&lat=..&zoom=.."), defaults omitted.
export const serializeMapView = createSerializer(mapViewParsers);

// Trim URL precision: ~5 decimals of lng/lat is roughly meter-level.
export function roundCoord(n: number) {
  return Math.round(n * 1e5) / 1e5;
}

export function roundZoom(n: number) {
  return Math.round(n * 100) / 100;
}
