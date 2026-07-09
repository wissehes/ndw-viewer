"use client";

import {
  Layer,
  type LayerProps,
  Marker,
  Source,
  useMap,
} from "@vis.gl/react-maplibre";
import type { ExpressionSpecification, LngLatBounds } from "maplibre-gl";
import { useEffect, useState } from "react";
import type {
  MsiFeature,
  MsiFeatureCollection,
  MsiGantryProperties,
  MsiLane,
} from "@/app/api/msi/route";
import MergeArrow from "./MergeArrow";

// Color per active display state (dot color when zoomed out + legend).
export const MSI_COLORS: Record<string, string> = {
  speedlimit: "#f59e0b", // amber
  lane_closed: "#dc2626", // red
  lane_open: "#16a34a", // green
  lane_closed_ahead: "#f97316", // orange
  restriction_end: "#9ca3af", // gray
};
const DEFAULT_COLOR = "#9ca3af";

// Above this zoom, gantries render as fixed-pixel lane rows instead of dots.
const ROW_MIN_ZOOM = 12;
const MAX_ROWS = 600;
// Pixels each row is pushed perpendicular (right) of its travel direction, so
// the two carriageways of a road land on opposite sides instead of overlapping.
const ROW_OFFSET = 30;

const dotColor = [
  "match",
  ["get", "primaryDisplay"],
  ...Object.entries(MSI_COLORS).flat(),
  DEFAULT_COLOR,
] as unknown as ExpressionSpecification;

const gantryDotLayer: LayerProps = {
  id: "msi-gantry-dot",
  type: "circle",
  filter: ["==", ["get", "active"], true],
  maxzoom: ROW_MIN_ZOOM,
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 11, 5],
    "circle-color": dotColor,
    "circle-stroke-width": 1,
    "circle-stroke-color": "#ffffff",
  },
};

// One lane cell, styled like a black matrix panel showing its state.
function LaneCell({ lane }: { lane: MsiLane }) {
  let content: React.ReactNode = null;
  switch (lane.display) {
    case "speedlimit":
      content = (
        <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-red-600 text-[8px] font-bold leading-none text-amber-400">
          {lane.speed}
        </span>
      );
      break;
    case "lane_closed":
      content = <span className="text-sm font-bold text-red-500">✕</span>;
      break;
    case "lane_open":
      content = <span className="text-sm font-bold text-green-500">↓</span>;
      break;
    case "lane_closed_ahead":
      content = <MergeArrow merge={lane.merge} />;
      break;
    case "restriction_end":
      content = <span className="text-sm font-bold text-zinc-300">╱</span>;
      break;
  }
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-zinc-900">
      {content}
    </div>
  );
}

// A gantry's lanes as one horizontal row.
export function GantryRow({ lanes }: { lanes: MsiLane[] }) {
  return (
    <div className="flex gap-px rounded bg-black/80 p-0.5 shadow-md ring-1 ring-black/30">
      {lanes.map((lane) => (
        <LaneCell key={lane.lane} lane={lane} />
      ))}
    </div>
  );
}

// Renders gantry rows as HTML markers, culled to the viewport, only when zoomed
// in past ROW_MIN_ZOOM. Marker layout is in screen space, so lanes always sit
// side by side regardless of zoom.
function GantryMarkers({
  data,
  onSelect,
}: {
  data: MsiFeatureCollection;
  onSelect: (props: MsiGantryProperties, coords: [number, number]) => void;
}) {
  const { current: map } = useMap();
  // Track zoom + bounds as real state so the render (and the React Compiler)
  // recompute the visible set whenever the map moves.
  const [view, setView] = useState<{
    zoom: number;
    bounds: LngLatBounds | null;
    bearing: number;
  }>({ zoom: 0, bounds: null, bearing: 0 });

  useEffect(() => {
    if (!map) return;
    const instance = map.getMap();
    const update = () =>
      setView({
        zoom: instance.getZoom(),
        bounds: instance.getBounds(),
        bearing: instance.getBearing(),
      });
    instance.on("moveend", update);
    instance.on("zoomend", update);
    update();
    return () => {
      instance.off("moveend", update);
      instance.off("zoomend", update);
    };
  }, [map]);

  if (view.zoom < ROW_MIN_ZOOM || !view.bounds) return null;

  const bounds = view.bounds;
  const visible: MsiFeature[] = [];
  for (const feature of data.features) {
    if (!feature.properties.active) continue;
    const [lon, lat] = feature.geometry.coordinates;
    if (!bounds.contains([lon, lat])) continue;
    visible.push(feature);
    if (visible.length >= MAX_ROWS) break;
  }

  return (
    <>
      {visible.map((feature) => {
        const { bearing, road, carriageway } = feature.properties;
        // Bearing relative to the current screen orientation (map can rotate).
        const screen = bearing - view.bearing;
        const rad = (screen * Math.PI) / 180;
        // Right-of-travel unit vector in screen space (y points down).
        const offset: [number, number] = [
          Math.cos(rad) * ROW_OFFSET,
          Math.sin(rad) * ROW_OFFSET,
        ];
        return (
          <Marker
            key={feature.properties.id}
            longitude={feature.geometry.coordinates[0]}
            latitude={feature.geometry.coordinates[1]}
            anchor="center"
            offset={offset}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelect(feature.properties, feature.geometry.coordinates);
            }}
          >
            <div className="flex cursor-pointer flex-col items-center gap-0.5">
              <div className="flex items-center gap-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-bold leading-none text-white ring-1 ring-black/40">
                <span
                  className="inline-block leading-none"
                  style={{ transform: `rotate(${screen}deg)` }}
                >
                  ▲
                </span>
                <span>
                  {road} {carriageway}
                </span>
              </div>
              <GantryRow lanes={feature.properties.lanes} />
            </div>
          </Marker>
        );
      })}
    </>
  );
}

export default function MsiLayer({
  data,
  visible,
  onSelect,
}: {
  data: MsiFeatureCollection | null;
  visible: boolean;
  onSelect: (props: MsiGantryProperties, coords: [number, number]) => void;
}) {
  if (!data || !visible) return null;
  return (
    <>
      <Source id="msi" type="geojson" data={data}>
        <Layer {...gantryDotLayer} />
      </Source>
      <GantryMarkers data={data} onSelect={onSelect} />
    </>
  );
}
