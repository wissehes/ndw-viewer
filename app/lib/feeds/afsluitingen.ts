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

// NDW "tijdelijke verkeersmaatregelen — afsluitingen" feed: the dedicated
// register of temporary road/lane closures and works, as a DATEX II v3
// SituationPublication. Unlike actueel_beeld's broad situation image, records
// here carry validity windows, so we can show only the measures that are
// actually in force right now — instead of announced-but-inactive measures
// that made unaffected roads look closed. Carriageway/road closures render as
// closures; lane closures carry a lane count for "X of Y lanes open" detail.
const FEED_URL =
  "https://opendata.ndw.nu/tijdelijke_verkeersmaatregelen_afsluitingen.xml.gz";

function isActive(start: unknown, end: unknown, now: number): boolean {
  // Envelope check: the measure's overall window contains "now". NDW also
  // publishes recurring day/time sub-schedules (overnight works); we don't
  // model those here, so a measure with a wide envelope but a nightly schedule
  // shows all day. That's a known NDW-data limitation, not something the feed
  // lets us resolve reliably.
  if (typeof start === "string") {
    const t = Date.parse(start);
    if (Number.isFinite(t) && t > now) return false;
  }
  if (typeof end === "string") {
    const t = Date.parse(end);
    if (Number.isFinite(t) && t < now) return false;
  }
  return true;
}

// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
function toGeoJSON(parsed: any): FeatureCollection {
  const now = Date.now();
  const situations = asArray(parsed?.messageContainer?.payload?.situation);
  const features: SituationFeature[] = [];

  for (const situation of situations) {
    const situationId = String(situation["@_id"] ?? "");
    const severity = situation.overallSeverity;

    // A closure situation bundles several records: the closure(s) themselves
    // plus ReroutingManagement records whose `alternativeRoute` carries the
    // DETOUR geometry (a long polyline over the diversion roads). We must draw
    // only the closures — reading geometry from the whole situation would pick
    // up a detour line and paint unaffected roads as closed (the A15 phantom).
    // So iterate records, keep only the road/carriageway/lane-management ones,
    // and take each one's own location geometry.
    for (const record of asArray(situation.situationRecord)) {
      const management = record?.roadOrCarriagewayOrLaneManagementType;
      if (management == null) continue; // rerouting / network-mgmt record

      // Keep only measures in force right now — drops announced-but-inactive
      // (and expired) measures. A full closure carries no lane count (zero
      // lanes open), so we do NOT require one.
      const startTime = findFirst(record, "overallStartTime");
      const endTime = findFirst(record, "overallEndTime");
      if (!isActive(startTime, endTime, now)) continue;

      // Geometry from THIS record's location only, never the whole situation.
      const geometry = extractGeometry(record.locationReference ?? record);
      if (!geometry) continue;

      const rawType: string = record["@_type"] ?? "Unknown";
      features.push({
        type: "Feature",
        geometry,
        properties: {
          id: String(record["@_id"] ?? situationId),
          type: rawType.replace(/^.*:/, ""),
          management: String(management),
          lanesOpen: toNumber(findFirst(record, "numberOfOperationalLanes")),
          lanesRestricted: toNumber(
            findFirst(record, "numberOfLanesRestricted"),
          ),
          lanesTotal: toNumber(findFirst(record, "originalNumberOfLanes")),
          severity,
          cause: findFirst(record, "causeType") ?? undefined,
          startTime: startTime != null ? String(startTime) : undefined,
          endTime: endTime != null ? String(endTime) : undefined,
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

const feed = createCachedFeed<FeatureCollection>(
  async () => toGeoJSON(await fetchGzipXml(FEED_URL)),
  60_000,
);

// Cached closures/works feed as a GeoJSON FeatureCollection: one feature per
// in-force road/carriageway/lane-management record, using that record's own
// geometry (detour routes excluded). Wired to tRPC as feeds.afsluitingen.
export const getAfsluitingen = () => feed.get();
