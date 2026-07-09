// Generates app/data/msi-locations.json from the NDW MSI shapefile.
//
// MSI (matrix signal) events in Matrixsignaalinformatie.xml.gz carry no
// coordinates — only a sign uuid + road/km/lane. This script builds a static
// lookup `{ [uuid]: [lon, lat, bearing] }` from the shapefile so the /api/msi
// route can geocode events at runtime without any shapefile/zip dependency.
//
// The shapefile is static reference data (updated occasionally). Re-run this
// when NDW publishes a new one:
//
//   node scripts/generate-msi-locations.mjs
//
// Requires the `shapefile` devDependency and the `unzip` CLI (macOS/Linux).

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "shapefile";

const ZIP_URL = "https://opendata.ndw.nu/ndw_msi_shapefiles_latest.zip";
const OUT_PATH = new URL("../app/data/msi-locations.json", import.meta.url);

const work = mkdtempSync(join(tmpdir(), "ndw-msi-"));
const zipPath = join(work, "msi.zip");

console.log("Downloading shapefile…");
const res = await fetch(ZIP_URL);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

console.log("Unzipping…");
execFileSync("unzip", ["-o", "-q", zipPath, "-d", work]);

const shp = join(work, "MSI", "shapes.shp");
const dbf = join(work, "MSI", "shapes.dbf");

console.log("Parsing shapefile…");
const source = await open(shp, dbf);
const locations = {};
let count = 0;

for (;;) {
  const { done, value } = await source.read();
  if (done) break;
  const { geometry, properties } = value;
  if (!geometry || geometry.type !== "Point") continue;
  const uuid = properties.uuid;
  if (!uuid) continue;
  const [lon, lat] = geometry.coordinates;
  const bearing = Number(properties.bearing);
  locations[uuid] = [
    Number(lon.toFixed(6)),
    Number(lat.toFixed(6)),
    Number.isFinite(bearing) ? Number(bearing.toFixed(1)) : 0,
  ];
  count++;
}

mkdirSync(dirname(fileURLToPath(OUT_PATH)), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(locations));
console.log(`Wrote ${count} MSI locations to app/data/msi-locations.json`);
