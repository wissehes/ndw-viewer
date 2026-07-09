"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import MapGL, {
  Layer,
  type LayerProps,
  type MapLayerMouseEvent,
  NavigationControl,
  Popup,
  Source,
} from "@vis.gl/react-maplibre";
import type { ExpressionSpecification } from "maplibre-gl";
import { useCallback, useEffect, useState } from "react";
import type {
  FeatureCollection,
  SituationProperties,
} from "@/app/api/actueel-beeld/route";

const STYLE_URL = process.env.NEXT_PUBLIC_MAPTILER_STYLE_URL;
const LAYER_ID = "situations-layer";

// Marker color per DATEX II situation record type.
const TYPE_COLORS: Record<string, string> = {
  Accident: "#e11d48", // red
  VehicleObstruction: "#f97316", // orange
  GeneralObstruction: "#f59e0b", // amber
  AbnormalTraffic: "#eab308", // yellow
  RoadOrCarriagewayOrLaneManagement: "#2563eb", // blue
  SpeedManagement: "#7c3aed", // purple
  ReroutingManagement: "#16a34a", // green
  GeneralNetworkManagement: "#0891b2", // cyan
};
const DEFAULT_COLOR = "#6b7280"; // gray

// MapLibre "match" expression: color circles by properties.type.
const colorExpression = [
  "match",
  ["get", "type"],
  ...Object.entries(TYPE_COLORS).flat(),
  DEFAULT_COLOR,
] as unknown as ExpressionSpecification;

const layerStyle: LayerProps = {
  id: LAYER_ID,
  type: "circle",
  paint: {
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["zoom"],
      6,
      3,
      12,
      7,
    ] as unknown as ExpressionSpecification,
    "circle-color": colorExpression,
    "circle-stroke-width": 1,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 0.9,
  },
};

interface PopupInfo {
  longitude: number;
  latitude: number;
  props: SituationProperties;
}

function SituationPopup({ props }: { props: SituationProperties }) {
  const color = TYPE_COLORS[props.type] ?? DEFAULT_COLOR;
  const rows: Array<[string, string | undefined]> = [
    ["Cause", props.cause],
    ["Severity", props.severity],
    [
      "Speed limit",
      props.speedLimit != null ? `${props.speedLimit} km/h` : undefined,
    ],
    ["From", props.startTime],
    ["Until", props.endTime],
  ];

  return (
    <div className="font-sans text-xs leading-relaxed text-zinc-800">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <strong>{props.type}</strong>
      </div>
      <div className="mb-1 text-[11px] text-zinc-400">{props.id}</div>
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label}>
            <span className="text-zinc-500">{label}:</span> {value}
          </div>
        ))}
    </div>
  );
}

export default function TrafficMap() {
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null);
  const [cursor, setCursor] = useState("auto");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/actueel-beeld")
      .then((res) => {
        if (!res.ok) throw new Error(`API responded ${res.status}`);
        return res.json();
      })
      .then((json: FeatureCollection) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load NDW situations:", err);
          setError(err.message ?? String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature || feature.geometry.type !== "Point") {
      setPopupInfo(null);
      return;
    }
    const [longitude, latitude] = feature.geometry.coordinates as [
      number,
      number,
    ];
    setPopupInfo({
      longitude,
      latitude,
      props: feature.properties as SituationProperties,
    });
  }, []);

  if (!STYLE_URL) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-100 p-8 text-center dark:bg-zinc-900">
        <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          Set <code>NEXT_PUBLIC_MAPTILER_STYLE_URL</code> in a{" "}
          <code>.env.local</code> file to your MapTiler style URL, then restart
          the dev server.
        </p>
      </div>
    );
  }

  return (
    <>
      <MapGL
        initialViewState={{ longitude: 5.29, latitude: 52.13, zoom: 7 }}
        mapStyle={STYLE_URL}
        interactiveLayerIds={[LAYER_ID]}
        cursor={cursor}
        onClick={onClick}
        onMouseEnter={() => setCursor("pointer")}
        onMouseLeave={() => setCursor("auto")}
        onError={(e) => setError(e.error?.message ?? "Unknown map error")}
      >
        <NavigationControl position="top-right" />
        {data && (
          <Source id="situations" type="geojson" data={data}>
            <Layer {...layerStyle} />
          </Source>
        )}
        {popupInfo && (
          <Popup
            longitude={popupInfo.longitude}
            latitude={popupInfo.latitude}
            anchor="bottom"
            closeButton
            closeOnClick={false}
            maxWidth="260px"
            onClose={() => setPopupInfo(null)}
          >
            <SituationPopup props={popupInfo.props} />
          </Popup>
        )}
      </MapGL>
      {error && (
        <div className="absolute left-1/2 top-4 z-10 max-w-md -translate-x-1/2 rounded-md bg-red-600 px-4 py-2 text-center text-sm text-white shadow-lg">
          Map error: {error}
        </div>
      )}
    </>
  );
}
