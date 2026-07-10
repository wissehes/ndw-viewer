// Generates app/data/measurement-locations.json from the NDW measurement site
// table (measurement_current.xml.gz).
//
// The "snelheden en intensiteiten" feed (trafficspeed.xml.gz) carries only a
// measurementSiteReference id plus indexed measured values — no coordinates and
// no hint of what each index means. The site table holds both, but unpacks to
// ~390 MB of XML, far too big to parse per request. So we extract the static
// bits here, once, into a small lookup the runtime feed joins against:
//
//   { [id]: { c:[lon,lat], n:name, side, lanes, s:[speedIdx], f:[flowIdx] } }
//
// `s`/`f` are the measuredValue indexes carrying the aggregate ("anyVehicle")
// speed / flow, so the runtime doesn't re-derive them from the huge table.
//
// The table is static reference data (updated occasionally). Re-run when NDW
// publishes a new version:
//
//   node scripts/generate-measurement-locations.mjs
//
// Streams the gunzip and processes one <measurementSiteRecord> at a time off a
// rolling buffer — never holds the whole document in memory.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

const FEED_URL = "https://opendata.ndw.nu/measurement_current.xml.gz";
const OUT_PATH = fileURLToPath(
  new URL("../app/data/measurement-locations.json", import.meta.url),
);

// Pull the first capture of a tag out of a record chunk.
function tag(chunk, name) {
  const m = chunk.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1] : undefined;
}

// Map each site's measuredValue indexes to lanes. The feed reports every lane
// separately, split further by vehicle-length category; we keep the per-lane
// "anyVehicle" aggregate for speed and flow. Returns:
//   perLane: [ [lane, speedIndex, flowIndex] ]  (0 = that value not reported)
//   allS/allF: every speed/flow index — fallback for the rare site with no
//              anyVehicle aggregate at all.
function laneBreakdown(chunk) {
  const lanes = new Map(); // lane number -> { s, f }
  const allS = [];
  const allF = [];
  const re =
    /<measurementSpecificCharacteristics index="(\d+)">([\s\S]*?)<\/measurementSpecificCharacteristics>\s*<\/measurementSpecificCharacteristics>/g;
  for (let m = re.exec(chunk); m !== null; m = re.exec(chunk)) {
    const index = Number(m[1]);
    const body = m[2];
    const valueType = tag(body, "specificMeasurementValueType");
    const isSpeed = valueType === "trafficSpeed";
    const isFlow = valueType === "trafficFlow";
    if (!isSpeed && !isFlow) continue;
    if (isSpeed) allS.push(index);
    else allF.push(index);
    // Only the aggregate ("anyVehicle") value goes into the per-lane map.
    if (!/<vehicleType>anyVehicle<\/vehicleType>/.test(body)) continue;
    const laneMatch = body.match(/<specificLane>lane(\d+)<\/specificLane>/);
    const lane = laneMatch ? Number(laneMatch[1]) : 1;
    let entry = lanes.get(lane);
    if (!entry) {
      entry = { s: 0, f: 0 };
      lanes.set(lane, entry);
    }
    if (isSpeed) entry.s = index;
    else entry.f = index;
  }
  const perLane = [...lanes.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lane, e]) => [lane, e.s, e.f])
    .filter(([, s, f]) => s || f);
  return { perLane, allS, allF };
}

function parseRecord(chunk) {
  const id = chunk.match(/<measurementSiteRecord id="([^"]+)"/)?.[1];
  if (!id) return null;

  // Prefer the display point; it's the single representative coordinate.
  const display = chunk.match(
    /<locationForDisplay>([\s\S]*?)<\/locationForDisplay>/,
  )?.[1];
  const lat = Number(tag(display ?? chunk, "latitude"));
  const lon = Number(tag(display ?? chunk, "longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const nameBlock = chunk.match(
    /<measurementSiteName>([\s\S]*?)<\/measurementSiteName>/,
  )?.[1];
  const name = nameBlock?.match(/<value[^>]*>([^<]*)<\/value>/)?.[1];
  const side = tag(chunk, "measurementSide");
  const lanes = Number(tag(chunk, "measurementSiteNumberOfLanes"));

  const { perLane, allS, allF } = laneBreakdown(chunk);
  // Skip records that measure neither speed nor flow (e.g. travel-time link
  // definitions) — they never appear in the trafficspeed feed and only bloat
  // the lookup.
  if (!perLane.length && !allS.length && !allF.length) return null;

  const entry = { c: [Number(lon.toFixed(6)), Number(lat.toFixed(6))] };
  if (name) entry.n = name;
  if (side) entry.side = side;
  if (Number.isFinite(lanes)) entry.lanes = lanes;
  // Prefer the per-lane aggregate map; fall back to flat index lists only when
  // the site has no anyVehicle aggregate.
  if (perLane.length) {
    entry.m = perLane;
  } else {
    entry.s = allS;
    entry.f = allF;
  }
  return [id, entry];
}

console.log("Downloading measurement table…");
const res = await fetch(FEED_URL);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);

const gunzip = createGunzip();

const locations = {};
let count = 0;
let buffer = "";
const OPEN = "<measurementSiteRecord ";
const CLOSE = "</measurementSiteRecord>";

// Drain every complete <measurementSiteRecord> currently buffered.
gunzip.on("data", (buf) => {
  buffer += buf.toString("utf8");
  for (
    let close = buffer.indexOf(CLOSE);
    close !== -1;
    close = buffer.indexOf(CLOSE)
  ) {
    const open = buffer.indexOf(OPEN);
    if (open === -1 || open > close) {
      // No open tag before this close — drop up to and past the close.
      buffer = buffer.slice(close + CLOSE.length);
      continue;
    }
    const chunk = buffer.slice(open, close + CLOSE.length);
    buffer = buffer.slice(close + CLOSE.length);
    const parsed = parseRecord(chunk);
    if (parsed) {
      locations[parsed[0]] = parsed[1];
      count++;
    }
  }
  // Keep only from the last OPEN so the buffer can't grow unbounded across
  // chunks that contain no complete record.
  const lastOpen = buffer.lastIndexOf(OPEN);
  if (lastOpen > 0) buffer = buffer.slice(lastOpen);
});

console.log("Streaming + parsing (this reads ~390 MB of XML)…");
await new Promise((resolve, reject) => {
  gunzip.on("end", resolve);
  gunzip.on("error", reject);
  (async () => {
    try {
      // res.body is a web ReadableStream; feed each chunk into node's gunzip.
      for await (const value of res.body) {
        gunzip.write(Buffer.from(value));
      }
      gunzip.end();
    } catch (err) {
      reject(err);
    }
  })();
});

await mkdir(dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, JSON.stringify(locations));
console.log(`Wrote ${count} measurement locations to ${OUT_PATH}`);
