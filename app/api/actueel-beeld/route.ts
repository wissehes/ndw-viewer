import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";

// NDW "actueel beeld" (current situations) feed: gzipped DATEX II v3 XML,
// ~4 MB uncompressed, refreshed roughly every minute. We fetch it server-side,
// convert it to GeoJSON, and cache the result in-process so the heavy
// fetch+gunzip+parse runs at most once per TTL regardless of page loads.

const FEED_URL = "https://opendata.ndw.nu/actueel_beeld.xml.gz";
const TTL_MS = 60_000; // NDW updates ~every minute

// Secondary HTTP-layer cache; the module cache below is the primary store.
export const revalidate = 60;

export interface SituationProperties {
  id: string;
  type: string;
  severity?: string;
  cause?: string;
  speedLimit?: number;
  startTime?: string;
  endTime?: string;
}

export interface SituationFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: SituationProperties;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: SituationFeature[];
}

// --- In-memory cache ---------------------------------------------------------
// NOTE: module state is per-process. It resets on dev hot-reload and is not
// shared across serverless instances. Fine here; a shared store (Redis/KV)
// would be the next step for a scaled deployment.
type CacheEntry = { data: FeatureCollection; fetchedAt: number };
let cache: CacheEntry | null = null;
let inflight: Promise<FeatureCollection> | null = null;

async function getSituations(): Promise<FeatureCollection> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.data;
  }
  // Dedupe concurrent refreshes: only one fetch/parse runs at a time.
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  try {
    return await inflight;
  } catch (err) {
    // Serve stale data through a transient upstream failure if we have it.
    if (cache) {
      console.error("actueel-beeld refresh failed, serving stale cache:", err);
      return cache.data;
    }
    throw err;
  }
}

async function refresh(): Promise<FeatureCollection> {
  const res = await fetch(FEED_URL);
  if (!res.ok) {
    throw new Error(`NDW feed responded ${res.status}`);
  }
  const compressed = Buffer.from(await res.arrayBuffer());
  const xml = gunzipSync(compressed).toString("utf8");
  const data = toGeoJSON(xml);
  cache = { data, fetchedAt: Date.now() };
  return data;
}

// --- DATEX II v3 -> GeoJSON --------------------------------------------------
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: "@_",
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// Recursively find the first value for `key` anywhere in a nested object.
// DATEX II nests coordinates differently per location-reference type, so a
// structural search is more robust than hard-coding each path.
// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
function findFirst(node: any, key: string): any {
  if (!node || typeof node !== "object") return null;
  if (node[key] != null) return node[key];
  for (const k of Object.keys(node)) {
    const found = findFirst(node[k], key);
    if (found != null) return found;
  }
  return null;
}

// Returns [lon, lat] for a situation, or null if it has no usable coordinates.
// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
function extractCoordinates(situation: any): [number, number] | null {
  // Preferred: an explicit point (WGS84 lat/lon).
  const point = findFirst(situation, "pointCoordinates");
  if (point) {
    const lat = Number(point.latitude);
    const lon = Number(point.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lon, lat];
  }
  // Fallback: first vertex of a line geometry ("lat lon lat lon ...").
  const posList = findFirst(situation, "posList");
  if (typeof posList === "string") {
    const nums = posList.trim().split(/\s+/).map(Number);
    if (
      nums.length >= 2 &&
      Number.isFinite(nums[0]) &&
      Number.isFinite(nums[1])
    ) {
      return [nums[1], nums[0]];
    }
  }
  return null;
}

function toGeoJSON(xml: string): FeatureCollection {
  const parsed = parser.parse(xml);
  const situations = asArray(parsed?.messageContainer?.payload?.situation);
  const features: SituationFeature[] = [];

  for (const situation of situations) {
    const coordinates = extractCoordinates(situation);
    if (!coordinates) continue;

    const records = asArray(situation.situationRecord);
    // Use the first record for descriptive fields; strip the leading "sit:"
    // namespace kept in the xsi:type attribute value.
    const primary = records[0] ?? {};
    const rawType: string = primary["@_type"] ?? "Unknown";
    const type = rawType.replace(/^.*:/, "");

    const cause = findFirst(primary, "causeType") ?? undefined;
    const speedRaw = findFirst(primary, "temporarySpeedLimit");
    const speedLimit = speedRaw != null ? Number(speedRaw) : undefined;

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: {
        id: String(situation["@_id"] ?? ""),
        type,
        severity: situation.overallSeverity,
        cause,
        speedLimit: Number.isFinite(speedLimit) ? speedLimit : undefined,
        startTime: findFirst(primary, "overallStartTime") ?? undefined,
        endTime: findFirst(primary, "overallEndTime") ?? undefined,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

export async function GET() {
  try {
    const data = await getSituations();
    return Response.json(data);
  } catch (err) {
    console.error("actueel-beeld failed:", err);
    return Response.json(
      { error: "Failed to load NDW actueel_beeld feed" },
      { status: 502 },
    );
  }
}
