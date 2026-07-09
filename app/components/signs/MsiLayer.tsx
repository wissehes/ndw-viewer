"use client";

import { Layer, type LayerProps, Source, useMap } from "@vis.gl/react-maplibre";
import type { ExpressionSpecification } from "maplibre-gl";
import { useEffect } from "react";
import type { MsiFeatureCollection } from "@/app/api/msi/route";

// Dot color per active display state (used when zoomed out).
export const MSI_COLORS: Record<string, string> = {
  speedlimit: "#f59e0b", // amber
  lane_closed: "#dc2626", // red
  lane_open: "#16a34a", // green
  lane_closed_ahead: "#f97316", // orange
  restriction_end: "#9ca3af", // gray
};
const DEFAULT_COLOR = "#9ca3af";

const dotColor = [
  "match",
  ["get", "display"],
  ...Object.entries(MSI_COLORS).flat(),
  DEFAULT_COLOR,
] as unknown as ExpressionSpecification;

// speedlimit -> "msi-speed-<n>", others -> "msi-<display>"
const iconImage = [
  "case",
  ["==", ["get", "display"], "speedlimit"],
  ["concat", "msi-speed-", ["to-string", ["get", "speed"]]],
  ["concat", "msi-", ["get", "display"]],
] as unknown as ExpressionSpecification;

// Faint dots for blank signs — context for the gantry when zoomed right in.
const blankLayer: LayerProps = {
  id: "msi-blank",
  type: "circle",
  filter: ["==", ["get", "display"], "blank"],
  minzoom: 13,
  paint: {
    "circle-radius": 2,
    "circle-color": "#94a3b8",
    "circle-opacity": 0.4,
  },
};

// Active dots — visible when zoomed out, handed off to the detail icons at z12.
const activeDotLayer: LayerProps = {
  id: "msi-active-dot",
  type: "circle",
  filter: ["==", ["get", "active"], true],
  maxzoom: 12,
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 11, 5],
    "circle-color": dotColor,
    "circle-stroke-width": 1,
    "circle-stroke-color": "#ffffff",
  },
};

// Detail icons (matrix-sign renderings) when zoomed in.
const detailLayer: LayerProps = {
  id: "msi-detail",
  type: "symbol",
  filter: ["==", ["get", "active"], true],
  minzoom: 12,
  layout: {
    "icon-image": iconImage,
    "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 16, 1.1],
    "icon-allow-overlap": true,
  },
};

function roundedBase(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.roundRect(2, 2, size - 4, size - 4, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

// Draw a matrix-sign icon on a canvas and return its pixels for map.addImage.
// Canvas text avoids any dependency on the map style's glyph fonts.
function makeIcon(display: string, speed: string | null): ImageData | null {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  roundedBase(ctx, size);
  const c = size / 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (display) {
    case "speedlimit": {
      ctx.beginPath();
      ctx.arc(c, c, 17, 0, Math.PI * 2);
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 21px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(speed ?? ""), c, c + 1);
      break;
    }
    case "lane_closed": {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(14, 14);
      ctx.lineTo(34, 34);
      ctx.moveTo(34, 14);
      ctx.lineTo(14, 34);
      ctx.stroke();
      break;
    }
    case "lane_open": {
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.moveTo(c, 36);
      ctx.lineTo(c - 12, 20);
      ctx.lineTo(c - 4, 20);
      ctx.lineTo(c - 4, 12);
      ctx.lineTo(c + 4, 12);
      ctx.lineTo(c + 4, 20);
      ctx.lineTo(c + 12, 20);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "lane_closed_ahead": {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(32, 14);
      ctx.lineTo(16, 32);
      ctx.lineTo(26, 32);
      ctx.moveTo(16, 32);
      ctx.lineTo(16, 22);
      ctx.stroke();
      break;
    }
    case "restriction_end": {
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(15, 33);
      ctx.lineTo(33, 15);
      ctx.stroke();
      break;
    }
    default:
      return null;
  }
  return ctx.getImageData(0, 0, size, size);
}

export default function MsiLayer({
  data,
  visible,
}: {
  data: MsiFeatureCollection | null;
  visible: boolean;
}) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map) return;
    const instance = map.getMap();
    const handler = (e: { id: string }) => {
      const id = e.id;
      if (!id.startsWith("msi-") || instance.hasImage(id)) return;
      const image = id.startsWith("msi-speed-")
        ? makeIcon("speedlimit", id.slice("msi-speed-".length))
        : makeIcon(id.slice(4), null);
      if (image && !instance.hasImage(id)) {
        instance.addImage(id, image, { pixelRatio: 2 });
      }
    };
    instance.on("styleimagemissing", handler);
    return () => {
      instance.off("styleimagemissing", handler);
    };
  }, [map]);

  if (!data || !visible) return null;

  return (
    <Source id="msi" type="geojson" data={data}>
      <Layer {...blankLayer} />
      <Layer {...activeDotLayer} />
      <Layer {...detailLayer} />
    </Source>
  );
}
