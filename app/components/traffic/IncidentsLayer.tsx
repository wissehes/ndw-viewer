"use client";

import { Layer, type LayerProps, Source, useMap } from "@vis.gl/react-maplibre";
import type { ExpressionSpecification } from "maplibre-gl";
import { useEffect } from "react";
import type { FeatureCollection } from "@/types/NDW/ActueelBeeld";

export const INCIDENTS_LAYER_ID = "incidents-layer";

// The safety-incident record types (the SRTI subset of actueel_beeld). Rendered
// as warning triangles; everything else is drawn as a situation line/circle.
export const INCIDENT_TYPES = [
  "Accident",
  "VehicleObstruction",
  "GeneralObstruction",
];

// Warning-triangle icon per incident type. Colors are the red/orange/amber
// family shared with the situation circles in TrafficMap.
const ICONS: Record<string, { id: string; color: string }> = {
  Accident: { id: "incident-accident", color: "#e11d48" }, // red
  VehicleObstruction: { id: "incident-vehicle", color: "#f97316" }, // orange
  GeneralObstruction: { id: "incident-general", color: "#f59e0b" }, // amber
};
const DEFAULT_ICON = { id: "incident-general", color: "#f59e0b" };

// icon-image: map properties.type -> one of the triangle icon ids.
const iconImage = [
  "match",
  ["get", "type"],
  ...Object.entries(ICONS).flatMap(([type, { id }]) => [type, id]),
  DEFAULT_ICON.id,
] as unknown as ExpressionSpecification;

const layerStyle: LayerProps = {
  id: INCIDENTS_LAYER_ID,
  type: "symbol",
  // Only the incident record types (obstructions/accidents).
  filter: [
    "match",
    ["get", "type"],
    INCIDENT_TYPES,
    true,
    false,
  ] as unknown as ExpressionSpecification,
  layout: {
    "icon-image": iconImage,
    "icon-size": [
      "interpolate",
      ["linear"],
      ["zoom"],
      6,
      0.5,
      14,
      1,
    ] as unknown as ExpressionSpecification,
    "icon-allow-overlap": true,
  },
};

// Draw a rounded warning triangle (filled with `color`, white edge + white "!")
// as ImageData for map.addImage. Sized at pixelRatio 2 for crisp rendering.
function makeTriangleIcon(color: string): ImageData {
  const ratio = 2;
  const size = 22 * ratio;
  const pad = 2 * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  const top = pad;
  const bottom = size - pad;
  const left = pad;
  const right = size - pad;
  const mid = size / 2;

  ctx.beginPath();
  ctx.moveTo(mid, top);
  ctx.lineTo(right, bottom);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 3 * ratio;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();

  // Exclamation mark.
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(
    mid - 1.2 * ratio,
    top + 7 * ratio,
    2.4 * ratio,
    6 * ratio,
    ratio,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.arc(mid, bottom - 3.5 * ratio, 1.5 * ratio, 0, Math.PI * 2);
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

// Safety incidents drawn as warning triangles, filtered from the shared
// actueel_beeld source (no separate feed — SRTI is a strict subset). Icons are
// added lazily via "styleimagemissing" (same technique as DripLayer), keyed by
// the icon ids referenced in the layer's icon-image expression.
export default function IncidentsLayer({
  data,
  visible,
}: {
  data: FeatureCollection | null;
  visible: boolean;
}) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map) return;
    const instance = map.getMap();
    const byIconId = new Map<string, string>();
    for (const { id, color } of [...Object.values(ICONS), DEFAULT_ICON]) {
      byIconId.set(id, color);
    }
    const handler = (e: { id: string }) => {
      const color = byIconId.get(e.id);
      if (!color || instance.hasImage(e.id)) return;
      try {
        instance.addImage(e.id, makeTriangleIcon(color), { pixelRatio: 2 });
      } catch {
        // ignore individual image failures
      }
    };
    instance.on("styleimagemissing", handler);
    return () => {
      instance.off("styleimagemissing", handler);
    };
  }, [map]);

  if (!data || !visible) return null;

  return (
    <Source id="incidents" type="geojson" data={data}>
      <Layer {...layerStyle} />
    </Source>
  );
}

export const INCIDENT_COLORS = Object.fromEntries(
  Object.entries(ICONS).map(([type, { color }]) => [type, color]),
) as Record<string, string>;
export const DEFAULT_INCIDENT_COLOR = DEFAULT_ICON.color;
