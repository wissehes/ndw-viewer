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
import IncidentsLayer, {
  DEFAULT_INCIDENT_COLOR,
  INCIDENT_COLORS,
  INCIDENT_TYPES,
  INCIDENTS_LAYER_ID,
} from "./traffic/IncidentsLayer";

const CIRCLE_LAYER_ID = "situations-layer";
const LINE_LAYER_ID = "situations-line-layer";
const CLOSURE_CASING_LAYER_ID = "situations-closure-layer";
const CLOSURE_DASH_LAYER_ID = "situations-closure-dash-layer";

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

// MapLibre "match" expression: color by properties.type.
const colorExpression = [
  "match",
  ["get", "type"],
  ...Object.entries(TYPE_COLORS).flat(),
  DEFAULT_COLOR,
] as unknown as ExpressionSpecification;

const isIncident = ["match", ["get", "type"], INCIDENT_TYPES, true, false];

// A closed carriageway / road — the management types that mean "you can't drive
// here". Rendered as a bold red dashed line so it reads as a hard closure.
const CLOSURE_TYPES = ["carriagewayClosures", "roadClosed"];
const isClosure = ["match", ["get", "management"], CLOSURE_TYPES, true, false];
const CLOSURE_COLOR = "#dc2626";

function isIncidentType(type: string): boolean {
  return INCIDENT_TYPES.includes(type);
}

function isClosureType(management?: string): boolean {
  return management != null && CLOSURE_TYPES.includes(management);
}

// Situations split into the safety incidents (drawn by IncidentsLayer as
// triangles) and the rest — the general situations, many of them linear
// (roadwork stretches, speed zones). Those non-incident records render here:
// lines for LineString geometry, circles for point locations.
const lineLayer: LayerProps = {
  id: LINE_LAYER_ID,
  type: "line",
  // Regular management/speed lines — closures are drawn separately, on top.
  filter: [
    "all",
    ["==", ["geometry-type"], "LineString"],
    ["!", isIncident],
    ["!", isClosure],
  ] as unknown as ExpressionSpecification,
  layout: { "line-cap": "round", "line-join": "round" },
  paint: {
    "line-color": colorExpression,
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      6,
      2,
      14,
      5,
    ] as unknown as ExpressionSpecification,
    "line-opacity": 0.85,
  },
};

// Closures render as two stacked lines: a bold red casing plus a white dashed
// overlay, so a shut road (e.g. A1 Hilversum–Naarden) is unmistakable.
const closureCasingLayer: LayerProps = {
  id: CLOSURE_CASING_LAYER_ID,
  type: "line",
  filter: [
    "all",
    ["==", ["geometry-type"], "LineString"],
    isClosure,
  ] as unknown as ExpressionSpecification,
  layout: { "line-cap": "round", "line-join": "round" },
  paint: {
    "line-color": CLOSURE_COLOR,
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      6,
      4,
      14,
      9,
    ] as unknown as ExpressionSpecification,
    "line-opacity": 0.95,
  },
};

const closureDashLayer: LayerProps = {
  id: CLOSURE_DASH_LAYER_ID,
  type: "line",
  filter: [
    "all",
    ["==", ["geometry-type"], "LineString"],
    isClosure,
  ] as unknown as ExpressionSpecification,
  layout: { "line-cap": "butt", "line-join": "round" },
  paint: {
    "line-color": "#ffffff",
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      6,
      1.5,
      14,
      3,
    ] as unknown as ExpressionSpecification,
    "line-dasharray": [2, 2] as unknown as ExpressionSpecification,
  },
};

const circleLayer: LayerProps = {
  id: CIRCLE_LAYER_ID,
  type: "circle",
  filter: [
    "all",
    ["==", ["geometry-type"], "Point"],
    ["!", isIncident],
  ] as unknown as ExpressionSpecification,
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
  const incident = isIncidentType(props.type);
  const closure = isClosureType(props.management);
  const color = closure
    ? CLOSURE_COLOR
    : incident
      ? (INCIDENT_COLORS[props.type] ?? DEFAULT_INCIDENT_COLOR)
      : (TYPE_COLORS[props.type] ?? DEFAULT_COLOR);
  const rows: Array<[string, string | undefined]> = [
    ["Subtype", props.subtype],
    ["Management", props.management],
    ["Mobility", props.mobility],
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
        {incident ? (
          <span
            className="inline-block shrink-0"
            style={{
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderBottom: `10px solid ${color}`,
            }}
          />
        ) : (
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <strong>{props.type}</strong>
      </div>
      {closure && (
        <div className="my-1 inline-block rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          Weg afgesloten
        </div>
      )}
      <div className="mb-1 text-[11px] text-zinc-400">
        {incident ? "Safety incident" : props.id}
      </div>
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
  const { data } = useQuery(
    trpc.feeds.actueelBeeld.queryOptions(undefined, {
      refetchInterval: 60_000,
    }),
  );
  const [showSituations, setShowSituations] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null);

  // Anchor the popup at the click point (works for line geometry too) and look
  // the feature up by id for typed properties.
  const onClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) {
        setPopupInfo(null);
        return;
      }
      const id = String(feature.properties?.id);
      const match = data?.features.find((f) => f.properties.id === id);
      if (match) {
        setPopupInfo({
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
          props: match.properties,
        });
      }
    },
    [data],
  );

  const interactiveLayerIds = [
    LINE_LAYER_ID,
    CIRCLE_LAYER_ID,
    CLOSURE_CASING_LAYER_ID,
    INCIDENTS_LAYER_ID,
  ];

  return (
    <>
      <BaseMap interactiveLayerIds={interactiveLayerIds} onClick={onClick}>
        {data && (
          <Source id="situations" type="geojson" data={data}>
            {showSituations && <Layer {...lineLayer} />}
            {showSituations && <Layer {...circleLayer} />}
            {showSituations && <Layer {...closureCasingLayer} />}
            {showSituations && <Layer {...closureDashLayer} />}
          </Source>
        )}
        <IncidentsLayer data={data ?? null} visible={showIncidents} />
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

      <div className="absolute left-4 top-16 z-10 w-56 rounded-lg bg-white/95 p-3 text-sm shadow-md backdrop-blur dark:bg-zinc-900/95">
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={showSituations}
            onChange={(e) => setShowSituations(e.target.checked)}
          />
          Situaties
        </label>
        <p className="mb-2 ml-6 text-[11px] text-zinc-500">
          Wegwerkzaamheden, aangepaste snelheden en rijstrooksturing.
        </p>
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={showIncidents}
            onChange={(e) => setShowIncidents(e.target.checked)}
          />
          Incidenten
        </label>
        <p className="ml-6 text-[11px] text-zinc-500">
          Ongevallen en obstructies (veiligheidsmeldingen).
        </p>
      </div>
    </>
  );
}
