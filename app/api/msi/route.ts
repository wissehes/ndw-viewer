import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import msiLocations from "@/app/data/msi-locations.json";
import { createCachedFeed } from "@/app/lib/feedCache";
import { asArray } from "@/app/lib/feeds";

// NDW MSI feed (matrix signals over motorway lanes): gzipped SOAP/custom XML.
// Events carry no coordinates — only a sign uuid + road/km/lane and a display
// state. Coordinates come from the static shapefile lookup (app/data, generated
// by scripts/generate-msi-locations.mjs). Each uuid appears in two events: one
// with `lanelocation`, one with `display`; we merge them by uuid.

const FEED_URL = "https://opendata.ndw.nu/Matrixsignaalinformatie.xml.gz";
const LANE_WIDTH_M = 3.5;

export const revalidate = 60;

// [lon, lat, bearing] per sign uuid.
const locations = msiLocations as unknown as Record<
  string,
  [number, number, number]
>;

export interface MsiProperties {
  uuid: string;
  road: string;
  carriageway: string;
  lane: number;
  km: number;
  bearing: number;
  display: string; // blank | speedlimit | lane_closed | lane_open | ...
  speed: number | null;
  flashing: boolean;
  redRing: boolean;
  active: boolean; // display !== "blank"
  updateTime?: string;
}

export interface MsiFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: MsiProperties;
}

export interface MsiFeatureCollection {
  type: "FeatureCollection";
  features: MsiFeature[];
}

// The MSI feed is not gzipped-DATEX like the others; parse it directly here so
// the shared fetchGzipXml (which returns DATEX-shaped data) stays focused.
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: "@_",
});

// Offset a point perpendicular to its bearing so per-lane signs on one gantry
// spread across the carriageway instead of stacking on the same coordinate.
function offsetForLane(
  [lon, lat]: [number, number],
  bearing: number,
  lane: number,
): [number, number] {
  const meters = LANE_WIDTH_M * (lane - 1);
  if (meters === 0) return [lon, lat];
  const rad = ((bearing + 90) * Math.PI) / 180; // perpendicular, to the right
  const east = Math.sin(rad) * meters;
  const north = Math.cos(rad) * meters;
  const dLat = north / 110540;
  const dLon = east / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lon + dLon, lat + dLat];
}

// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
function parseDisplay(display: any): {
  display: string;
  speed: number | null;
  flashing: boolean;
  redRing: boolean;
} {
  const key = Object.keys(display)[0] ?? "blank";
  const value = display[key];
  let speed: number | null = null;
  let flashing = false;
  let redRing = false;
  if (value && typeof value === "object") {
    flashing = String(value["@_flashing"]) === "true";
    redRing = String(value["@_red_ring"]) === "true";
    const text = Number(value["#text"]);
    if (Number.isFinite(text)) speed = text;
  }
  return { display: key, speed, flashing, redRing };
}

// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
function toGeoJSON(parsed: any): MsiFeatureCollection {
  const events = asArray(
    parsed?.Envelope?.Body?.NdwVms?.variable_message_sign_events?.event,
  );

  // Merge the two events per uuid (one has lanelocation, one has display).
  // biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
  const merged = new Map<string, { loc?: any; disp?: any }>();
  for (const event of events) {
    const uuid = event?.sign_id?.uuid;
    if (!uuid) continue;
    let entry = merged.get(uuid);
    if (!entry) {
      entry = {};
      merged.set(uuid, entry);
    }
    if (event.lanelocation) entry.loc = event;
    if (event.display) entry.disp = event;
  }

  const features: MsiFeature[] = [];
  for (const [uuid, { loc, disp }] of merged) {
    const coord = locations[uuid];
    if (!coord) continue; // no shapefile geocode for this sign
    const [lon, lat, bearing] = coord;
    const lane = Number(loc?.lanelocation?.lane) || 1;
    const { display, speed, flashing, redRing } = disp
      ? parseDisplay(disp.display)
      : { display: "blank", speed: null, flashing: false, redRing: false };

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: offsetForLane([lon, lat], bearing, lane),
      },
      properties: {
        uuid,
        road: String(loc?.lanelocation?.road ?? ""),
        carriageway: String(loc?.lanelocation?.carriageway ?? ""),
        lane,
        km: Number(loc?.lanelocation?.km) || 0,
        bearing,
        display,
        speed,
        flashing,
        redRing,
        active: display !== "blank",
        updateTime: disp?.ts_state ?? disp?.ts_event,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

async function fetchMsi(): Promise<MsiFeatureCollection> {
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`MSI feed responded ${res.status}`);
  const xml = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
  return toGeoJSON(parser.parse(xml));
}

const feed = createCachedFeed<MsiFeatureCollection>(fetchMsi, 60_000);

export async function GET() {
  try {
    return Response.json(await feed.get());
  } catch (err) {
    console.error("msi failed:", err);
    return Response.json(
      { error: "Failed to load NDW MSI feed" },
      { status: 502 },
    );
  }
}
