import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";

// Shared helpers for the NDW open-data feeds. Most are gzipped XML (DATEX II or
// a SOAP/custom schema); `removeNSPrefix` drops the `sit:`/`loc:`/`vms:`/`com:`
// namespaces so downstream code can use plain keys.
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: "@_",
});

export async function fetchGzipXml(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Feed ${url} responded ${res.status}`);
  const compressed = Buffer.from(await res.arrayBuffer());
  const xml = gunzipSync(compressed).toString("utf8");
  return parser.parse(xml);
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// Coerce a parsed-XML scalar to a finite number, or undefined. Shared by the
// DATEX II feeds that read lane counts / speed limits.
export function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Recursively find the first value for `key` anywhere in a nested object.
// DATEX II nests fields (coordinates, causes, …) differently per record type,
// so a structural search is more robust than hard-coding each path.
// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
export function findFirst(node: any, key: string): any {
  if (!node || typeof node !== "object") return null;
  if (node[key] != null) return node[key];
  for (const k of Object.keys(node)) {
    const found = findFirst(node[k], key);
    if (found != null) return found;
  }
  return null;
}

// Parse a DATEX II gml posList ("lat lon lat lon …") into [lon, lat] pairs.
function parsePosList(posList: string): [number, number][] {
  const nums = posList.trim().split(/\s+/).map(Number);
  const coords: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const lat = nums[i];
    const lon = nums[i + 1];
    if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lon, lat]);
  }
  return coords;
}

export type PointGeometry = { type: "Point"; coordinates: [number, number] };
export type LineGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

// Extract the GeoJSON geometry of a DATEX II situation/record: a LineString
// when it carries a gml line (roadworks stretches, speed zones, …), otherwise a
// Point. Returns null when there are no usable coordinates. Used by the
// SituationPublication feed (actueel-beeld).
export function extractGeometry(
  // biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
  node: any,
): PointGeometry | LineGeometry | null {
  // Prefer a full line geometry when present.
  const line = findFirst(node, "gmlLineString");
  const linePosList = line != null ? findFirst(line, "posList") : null;
  if (typeof linePosList === "string") {
    const coords = parsePosList(linePosList);
    if (coords.length >= 2) return { type: "LineString", coordinates: coords };
    if (coords.length === 1) return { type: "Point", coordinates: coords[0] };
  }

  // Otherwise an explicit WGS84 point.
  const point = findFirst(node, "pointCoordinates");
  if (point) {
    const lat = Number(point.latitude);
    const lon = Number(point.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { type: "Point", coordinates: [lon, lat] };
    }
  }

  // Last resort: the first vertex of any stray posList.
  const posList = findFirst(node, "posList");
  if (typeof posList === "string") {
    const coords = parsePosList(posList);
    if (coords.length) return { type: "Point", coordinates: coords[0] };
  }
  return null;
}
