import type {
  FeatureCollection,
  SituationFeature,
} from "@/types/NDW/ActueelBeeld";
import { createCachedFeed } from "../feedCache";
import {
  asArray,
  extractGeometry,
  fetchGzipXml,
  findFirst,
  toNumber,
} from "./index";

// NDW "actueel beeld" (current situations) feed: gzipped DATEX II v3 XML,
// ~4 MB uncompressed, refreshed roughly every minute. We fetch it server-side,
// convert it to GeoJSON, and cache the result (see createCachedFeed).

const FEED_URL = "https://opendata.ndw.nu/actueel_beeld.xml.gz";

// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
function toGeoJSON(parsed: any): FeatureCollection {
  const situations = asArray(parsed?.messageContainer?.payload?.situation);
  const features: SituationFeature[] = [];

  for (const situation of situations) {
    const geometry = extractGeometry(situation);
    if (!geometry) continue;

    const records = asArray(situation.situationRecord);
    // Use the first record for descriptive fields; strip the leading "sit:"
    // namespace kept in the xsi:type attribute value.
    const primary = records[0] ?? {};
    const rawType: string = primary["@_type"] ?? "Unknown";
    const type = rawType.replace(/^.*:/, "");

    const cause = findFirst(primary, "causeType") ?? undefined;
    const speedRaw = findFirst(primary, "temporarySpeedLimit");
    const speedLimit = speedRaw != null ? Number(speedRaw) : undefined;
    const subtype =
      findFirst(primary, "vehicleObstructionType") ??
      findFirst(primary, "obstructionType") ??
      findFirst(primary, "accidentType") ??
      undefined;
    const management =
      findFirst(primary, "roadOrCarriagewayOrLaneManagementType") ?? undefined;
    const lanesOpen = toNumber(findFirst(primary, "numberOfOperationalLanes"));
    const lanesRestricted = toNumber(
      findFirst(primary, "numberOfLanesRestricted"),
    );
    const lanesTotal = toNumber(findFirst(primary, "originalNumberOfLanes"));
    const safetyRelated = findFirst(primary, "safetyRelatedMessage");

    features.push({
      type: "Feature",
      geometry,
      properties: {
        id: String(situation["@_id"] ?? ""),
        type,
        subtype: subtype != null ? String(subtype) : undefined,
        management: management != null ? String(management) : undefined,
        lanesOpen,
        lanesRestricted,
        lanesTotal,
        mobility: findFirst(primary, "mobilityType") ?? undefined,
        safetyRelated:
          safetyRelated === true || String(safetyRelated) === "true",
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
