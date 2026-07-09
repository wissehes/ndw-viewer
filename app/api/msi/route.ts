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
//
// Signs are grouped per gantry (road|carriageway|km) so the client can render a
// gantry's lanes as one fixed-pixel row instead of overlapping per-lane markers.

const FEED_URL = "https://opendata.ndw.nu/Matrixsignaalinformatie.xml.gz";

export const revalidate = 60;

// [lon, lat, bearing] per sign uuid.
const locations = msiLocations as unknown as Record<
  string,
  [number, number, number]
>;

// Display priority for the gantry's representative color when zoomed out.
const DISPLAY_PRIORITY = [
  "lane_closed",
  "lane_closed_ahead",
  "speedlimit",
  "lane_open",
  "restriction_end",
];

export interface MsiLane {
  lane: number;
  display: string; // blank | speedlimit | lane_closed | lane_open | ...
  speed: number | null;
  flashing: boolean;
}

export interface MsiGantryProperties {
  id: string;
  road: string;
  carriageway: string;
  km: number;
  active: boolean; // any lane not blank
  primaryDisplay: string; // for dot color when zoomed out
  lanes: MsiLane[]; // sorted by lane number
  updateTime?: string;
}

export interface MsiFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: MsiGantryProperties;
}

export interface MsiFeatureCollection {
  type: "FeatureCollection";
  features: MsiFeature[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: "@_",
});

// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
function parseDisplay(display: any): {
  display: string;
  speed: number | null;
  flashing: boolean;
} {
  const key = Object.keys(display)[0] ?? "blank";
  const value = display[key];
  let speed: number | null = null;
  let flashing = false;
  if (value && typeof value === "object") {
    flashing = String(value["@_flashing"]) === "true";
    const text = Number(value["#text"]);
    if (Number.isFinite(text)) speed = text;
  }
  return { display: key, speed, flashing };
}

interface Accumulator {
  lonSum: number;
  latSum: number;
  count: number;
  road: string;
  carriageway: string;
  km: number;
  lanes: MsiLane[];
  updateTime?: string;
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

  // Group signs into gantries by road|carriageway|km.
  const gantries = new Map<string, Accumulator>();
  for (const { loc, disp } of merged.values()) {
    const uuid = loc?.sign_id?.uuid ?? disp?.sign_id?.uuid;
    const coord = uuid ? locations[uuid] : undefined;
    if (!coord) continue; // no shapefile geocode for this sign
    const [lon, lat] = coord;

    const road = String(loc?.lanelocation?.road ?? "");
    const carriageway = String(loc?.lanelocation?.carriageway ?? "");
    const km = Number(loc?.lanelocation?.km) || 0;
    const lane = Number(loc?.lanelocation?.lane) || 1;
    const { display, speed, flashing } = disp
      ? parseDisplay(disp.display)
      : { display: "blank", speed: null, flashing: false };

    const key = `${road}|${carriageway}|${km}`;
    let gantry = gantries.get(key);
    if (!gantry) {
      gantry = {
        lonSum: 0,
        latSum: 0,
        count: 0,
        road,
        carriageway,
        km,
        lanes: [],
      };
      gantries.set(key, gantry);
    }
    gantry.lonSum += lon;
    gantry.latSum += lat;
    gantry.count += 1;
    gantry.lanes.push({ lane, display, speed, flashing });
    const update = disp?.ts_state ?? disp?.ts_event;
    if (update && (!gantry.updateTime || update > gantry.updateTime)) {
      gantry.updateTime = update;
    }
  }

  const features: MsiFeature[] = [];
  for (const [key, gantry] of gantries) {
    const lanes = gantry.lanes.sort((a, b) => a.lane - b.lane);
    const active = lanes.some((l) => l.display !== "blank");
    const primaryDisplay =
      DISPLAY_PRIORITY.find((d) => lanes.some((l) => l.display === d)) ??
      "blank";
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [
          gantry.lonSum / gantry.count,
          gantry.latSum / gantry.count,
        ],
      },
      properties: {
        id: key,
        road: gantry.road,
        carriageway: gantry.carriageway,
        km: gantry.km,
        active,
        primaryDisplay,
        lanes,
        updateTime: gantry.updateTime,
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
