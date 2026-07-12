"use client";

import {
  Layer,
  type LayerProps,
  Marker,
  Source,
  useMap,
} from "@vis.gl/react-maplibre";
import type { LngLatBounds } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import type {
  DripFeature,
  DripFeatureCollection,
  DripProperties,
} from "@/types/NDW/Drips";

// Active DRIP dots — visible when zoomed out, handed off to the panel images.
const dotLayer: LayerProps = {
  id: "drip-dot",
  type: "circle",
  filter: ["==", ["get", "active"], true],
  maxzoom: 12,
  paint: {
    "circle-radius": 5,
    "circle-color": "#0891b2",
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#ffffff",
  },
};

// The actual rendered panel image, shown when zoomed in. Images are added lazily
// via the map's "styleimagemissing" event (see below), keyed by feature id.
const panelLayer: LayerProps = {
  id: "drip-panel",
  type: "symbol",
  filter: ["has", "image"],
  minzoom: 12,
  layout: {
    "icon-image": ["get", "id"],
    "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 16, 1.4],
    "icon-allow-overlap": true,
  },
};

// Above this zoom, text-only DRIPs render as HTML sign markers instead of dots.
const TEXT_MIN_ZOOM = 12;
const MAX_SIGNS = 300;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// A single text DRIP styled as an amber-on-black route-information panel.
function DripSign({ lines }: { lines: string[] }) {
  return (
    <div className="flex cursor-pointer flex-col items-center rounded-md border border-amber-400/60 bg-black/90 px-2 py-1 text-center font-mono text-[11px] font-bold leading-tight text-amber-400 shadow-lg ring-1 ring-black/40">
      {lines.map((line, i) => (
        <div key={`${i}-${line}`} className="whitespace-nowrap">
          {line || " "}
        </div>
      ))}
    </div>
  );
}

// Text-only DRIPs (vms:TextDisplay) carry no rendered bitmap, so they'd vanish
// at the panel-image zoom. Render their text lines as HTML sign markers instead,
// culled to the viewport and only past TEXT_MIN_ZOOM (mirrors MSI's gantry rows).
function DripTextMarkers({
  features,
  onSelect,
}: {
  features: DripFeature[];
  onSelect: (props: DripProperties, coords: [number, number]) => void;
}) {
  const { current: map } = useMap();
  const [view, setView] = useState<{
    zoom: number;
    bounds: LngLatBounds | null;
  }>({ zoom: 0, bounds: null });

  useEffect(() => {
    if (!map) return;
    const instance = map.getMap();
    const update = () =>
      setView({ zoom: instance.getZoom(), bounds: instance.getBounds() });
    instance.on("moveend", update);
    instance.on("zoomend", update);
    update();
    return () => {
      instance.off("moveend", update);
      instance.off("zoomend", update);
    };
  }, [map]);

  if (view.zoom < TEXT_MIN_ZOOM || !view.bounds) return null;

  const bounds = view.bounds;
  const visible: DripFeature[] = [];
  for (const feature of features) {
    if (!bounds.contains(feature.geometry.coordinates)) continue;
    visible.push(feature);
    if (visible.length >= MAX_SIGNS) break;
  }

  return (
    <>
      {visible.map((feature) => (
        <Marker
          key={feature.properties.id}
          longitude={feature.geometry.coordinates[0]}
          latitude={feature.geometry.coordinates[1]}
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            onSelect(feature.properties, feature.geometry.coordinates);
          }}
        >
          <DripSign lines={feature.properties.text ?? []} />
        </Marker>
      ))}
    </>
  );
}

export default function DripLayer({
  data,
  visible,
  onSelect,
}: {
  data: DripFeatureCollection | null;
  visible: boolean;
  onSelect: (props: DripProperties, coords: [number, number]) => void;
}) {
  const { current: map } = useMap();

  // id -> panel image data URI (for lazy addImage), and the text-only features
  // rendered as HTML sign markers.
  const { imageIndex, textFeatures } = useMemo(() => {
    const index = new Map<string, string>();
    const texts: DripFeature[] = [];
    if (data) {
      for (const feature of data.features) {
        const { image, text } = feature.properties;
        if (image) index.set(feature.properties.id, image);
        else if (text?.length) texts.push(feature);
      }
    }
    return { imageIndex: index, textFeatures: texts };
  }, [data]);

  useEffect(() => {
    if (!map) return;
    const instance = map.getMap();
    const handler = async (e: { id: string }) => {
      const uri = imageIndex.get(e.id);
      if (!uri || instance.hasImage(e.id)) return;
      try {
        const img = await loadImage(uri);
        if (!instance.hasImage(e.id)) instance.addImage(e.id, img);
      } catch {
        // ignore individual image failures
      }
    };
    instance.on("styleimagemissing", handler);
    return () => {
      instance.off("styleimagemissing", handler);
    };
  }, [map, imageIndex]);

  if (!data || !visible) return null;

  return (
    <>
      <Source id="drips" type="geojson" data={data}>
        <Layer {...dotLayer} />
        <Layer {...panelLayer} />
      </Source>
      <DripTextMarkers features={textFeatures} onSelect={onSelect} />
    </>
  );
}
