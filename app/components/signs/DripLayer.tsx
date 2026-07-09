"use client";

import { Layer, type LayerProps, Source, useMap } from "@vis.gl/react-maplibre";
import { useEffect, useMemo } from "react";
import type { DripFeatureCollection } from "@/app/api/drips/route";

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export default function DripLayer({
  data,
  visible,
}: {
  data: DripFeatureCollection | null;
  visible: boolean;
}) {
  const { current: map } = useMap();

  // id -> panel image data URI, for lazy loading on styleimagemissing.
  const imageIndex = useMemo(() => {
    const index = new Map<string, string>();
    if (data) {
      for (const feature of data.features) {
        if (feature.properties.image) {
          index.set(feature.properties.id, feature.properties.image);
        }
      }
    }
    return index;
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
    <Source id="drips" type="geojson" data={data}>
      <Layer {...dotLayer} />
      <Layer {...panelLayer} />
    </Source>
  );
}
