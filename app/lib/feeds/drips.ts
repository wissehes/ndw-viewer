import type {
  DripFeature,
  DripFeatureCollection,
  PanelLocation,
} from "@/types/NDW/Drips";
import { createCachedFeed } from "../feedCache";
import { asArray, fetchGzipXml, findFirst } from "./index";

// NDW DRIP feed (dynamic route information panels): gzipped DATEX II v3 VMS.
// Two payloads — a static table (panel locations + descriptions) and a dynamic
// publication (current status + rendered display image), joined by controller id.

const FEED_URL =
  "https://opendata.ndw.nu/dynamische_route_informatie_paneel.xml.gz";

// Index panel locations from the table payload, keyed by `${controllerId}#${vmsIndex}`.
// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
function buildLocationIndex(table: any): Map<string, PanelLocation> {
  const index = new Map<string, PanelLocation>();
  for (const controller of asArray(table?.vmsControllerTable?.vmsController)) {
    const controllerId = controller["@_id"];
    if (!controllerId) continue;
    for (const outer of asArray(controller.vms)) {
      const vmsIndex = outer["@_vmsIndex"] ?? "1";
      const data = outer.vms ?? outer;
      const point = findFirst(data, "pointCoordinates");
      if (!point) continue;
      const lat = Number(point.latitude);
      const lon = Number(point.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      index.set(`${controllerId}#${vmsIndex}`, {
        coordinates: [lon, lat],
        description: String(findFirst(data.description, "#text") ?? ""),
        vmsType: String(data.vmsType ?? ""),
        bearing: Number(findFirst(data.vmsLocation, "bearing")) || 0,
      });
    }
  }
  return index;
}

// DRIP text lines embed pictograms as codes we can't render: numeric symbol
// refs (`%s138`, `$138`) and font-mapped symbol chars in the Latin-1 symbol
// block (e.g. `£` = U+00A3). Strip them — there's no public authoritative
// mapping for the feed's specific numbers, so showing raw codes or guessed
// icons would be misleading. Latin-1 letters (Dutch diacritics) are preserved.
function stripSymbolCodes(text: string): string {
  return text
    .replace(/%s\d+|\$\d{3}/g, " ")
    .replace(/[¡-¿×÷]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// A text line arrives as { textLine: { textLine: "the text" }, @_lineIndex }
// (the DATEX element nests under itself, and removeNSPrefix collapses the
// prefixes). Descend through the nested `textLine`/`#text` wrappers to the
// string leaf.
// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
function extractLineText(lineNode: any): string {
  let node = lineNode?.textLine ?? lineNode;
  while (node && typeof node === "object") {
    node = node.textLine ?? node["#text"];
  }
  return typeof node === "string" ? node.trim() : "";
}

// Collect all text lines (across every display area) of a vmsStatus message,
// ordered by lineIndex. Line entries are the nodes carrying `@_lineIndex`; we
// find them anywhere in the message rather than assuming a fixed nesting depth.
type TextLine = { idx: number; text: string };
// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
function collectTextLines(node: any, acc: TextLine[] = []): TextLine[] {
  if (!node || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const item of node) collectTextLines(item, acc);
    return acc;
  }
  if ("@_lineIndex" in node) {
    acc.push({
      idx: Number(node["@_lineIndex"]) || acc.length + 1,
      text: extractLineText(node),
    });
    return acc; // a line node's children are the text wrappers — don't recurse
  }
  for (const key of Object.keys(node)) {
    if (!key.startsWith("@_")) collectTextLines(node[key], acc);
  }
  return acc;
}

// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
function toGeoJSON(parsed: any): DripFeatureCollection {
  const payloads = asArray(parsed?.messageContainer?.payload);
  const table = payloads.find((p) =>
    String(p["@_type"]).includes("VmsTablePublication"),
  );
  const publication = payloads.find((p) =>
    String(p["@_type"]).includes("VmsPublication"),
  );
  const locations = buildLocationIndex(table);
  const features: DripFeature[] = [];

  for (const status of asArray(publication?.vmsControllerStatus)) {
    const controllerId = status?.vmsControllerReference?.["@_id"];
    if (!controllerId) continue;
    const topUpdate = status.statusUpdateTime;

    for (const outer of asArray(status.vmsStatus)) {
      const vmsIndex = outer["@_vmsIndex"] ?? "1";
      const inner = outer.vmsStatus ?? outer;
      const location = locations.get(`${controllerId}#${vmsIndex}`);
      if (!location) continue;

      const workingStatus = String(inner.workingStatus ?? "unknown");
      const active = workingStatus === "working";

      let image: string | undefined;
      let text: string[] | undefined;
      if (active) {
        const imageData = findFirst(inner, "imageData");
        if (imageData) {
          const format = findFirst(inner, "imageFormat") ?? "png";
          image = `data:image/${format};base64,${imageData}`;
        }
        const lines = collectTextLines(inner)
          .sort((a, b) => a.idx - b.idx)
          .map((line) => stripSymbolCodes(line.text))
          .filter((line) => line.length > 0);
        if (lines.length) text = lines;
      }

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: location.coordinates },
        properties: {
          id: `${controllerId}#${vmsIndex}`,
          description: location.description,
          vmsType: location.vmsType,
          status: workingStatus,
          active,
          bearing: location.bearing,
          updateTime: inner.statusUpdateTime ?? topUpdate,
          ...(image ? { image } : {}),
          ...(text ? { text } : {}),
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

const feed = createCachedFeed<DripFeatureCollection>(
  async () => toGeoJSON(await fetchGzipXml(FEED_URL)),
  60_000,
);

// Cached DRIP feed as a GeoJSON FeatureCollection. Shared by the tRPC procedure
// (feeds.drips); the heavy fetch+parse runs at most once per TTL per process.
export const getDrips = () => feed.get();
