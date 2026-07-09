import { createCachedFeed } from "@/app/lib/feedCache";
import { asArray, fetchGzipXml, findFirst } from "@/app/lib/feeds";

// NDW DRIP feed (dynamic route information panels): gzipped DATEX II v3 VMS.
// Two payloads — a static table (panel locations + descriptions) and a dynamic
// publication (current status + rendered display image), joined by controller id.

const FEED_URL =
  "https://opendata.ndw.nu/dynamische_route_informatie_paneel.xml.gz";

export const revalidate = 60;

export interface DripProperties {
  id: string;
  description: string;
  vmsType: string;
  status: string; // working | blank | notWorking | ...
  active: boolean; // status === "working"
  bearing: number;
  updateTime?: string;
  text?: string[];
  image?: string; // data URI of the rendered panel, only for working panels
}

export interface DripFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: DripProperties;
}

export interface DripFeatureCollection {
  type: "FeatureCollection";
  features: DripFeature[];
}

interface PanelLocation {
  coordinates: [number, number];
  description: string;
  vmsType: string;
  bearing: number;
}

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
        const lines = asArray(findFirst(inner, "textLine"))
          .map((line) =>
            typeof line === "string" ? line : findFirst(line, "#text"),
          )
          .filter((line): line is string => Boolean(line));
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

export async function GET() {
  try {
    return Response.json(await feed.get());
  } catch (err) {
    console.error("drips failed:", err);
    return Response.json(
      { error: "Failed to load NDW DRIP feed" },
      { status: 502 },
    );
  }
}
