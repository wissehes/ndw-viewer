import type {
  FeatureCollection,
  SituationFeature,
} from "@/types/NDW/ActueelBeeld";
import { createCachedFeed } from "../feedCache";
import { asArray, fetchGzipXml, findFirst } from "./index";

// NDW "actueel beeld" (current situations) feed: gzipped DATEX II v3 XML,
// ~4 MB uncompressed, refreshed roughly every minute. We fetch it server-side,
// convert it to GeoJSON, and cache the result (see createCachedFeed).

const FEED_URL = "https://opendata.ndw.nu/actueel_beeld.xml.gz";

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

// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
function toGeoJSON(parsed: any): FeatureCollection {
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

const feed = createCachedFeed<FeatureCollection>(
  async () => toGeoJSON(await fetchGzipXml(FEED_URL)),
  60_000,
);

// Cached "actueel beeld" feed as a GeoJSON FeatureCollection. Shared by the
// tRPC procedure (feeds.actueelBeeld); the heavy fetch+parse runs at most once
// per TTL per process.
export const getActueelBeeld = () => feed.get();
