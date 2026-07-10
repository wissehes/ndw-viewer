"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Layer,
  type LayerProps,
  type MapLayerMouseEvent,
  Popup,
  Source,
} from "@vis.gl/react-maplibre";
import type { ExpressionSpecification } from "maplibre-gl";
import { useCallback, useState } from "react";
import { useTRPC } from "@/trpc/client";
import type { SituationProperties } from "@/types/NDW/ActueelBeeld";
import BaseMap from "./BaseMap";

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
  const trpc = useTRPC();
  const { data } = useQuery(trpc.feeds.actueelBeeld.queryOptions());
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null);

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

  return (
    <BaseMap interactiveLayerIds={[LAYER_ID]} onClick={onClick}>
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
    </BaseMap>
  );
}
