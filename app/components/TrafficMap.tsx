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
import { formatDateTime } from "@/app/lib/format";
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
const WORKS_LAYER_ID = "works-line-layer";
const WORKS_CIRCLE_ID = "works-circle-layer";
const CLOSURE_CASING_LAYER_ID = "works-closure-layer";
const CLOSURE_DASH_LAYER_ID = "works-closure-dash-layer";

// Layers backed by the afsluitingen (closures/works) feed rather than
// actueel_beeld — used to route popup lookups to the right dataset.
const WORKS_LAYER_IDS = new Set<string>([
  WORKS_LAYER_ID,
  WORKS_CIRCLE_ID,
  CLOSURE_CASING_LAYER_ID,
]);

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

// Closure/works management types. On the actueel_beeld source these are
// excluded from the generic situation layers — the dedicated afsluitingen feed
// owns them (in-force filtering), so drawing them here too would double up.
const MGMT_WORKS_CLOSURE = [
  "carriagewayClosures",
  "laneClosures",
  "roadClosed",
];
const isWorksClosureMgmt = [
  "match",
  ["get", "management"],
  MGMT_WORKS_CLOSURE,
  true,
  false,
];

// A carriageway/road closure means (that direction of) the road is shut — drawn
// as a red closure. A lane closure keeps the road open with fewer lanes — drawn
// amber, with an "X of Y lanes open" detail.
const CLOSURE_TYPES = ["roadClosed", "carriagewayClosures"];
const WORKS_TYPES = ["laneClosures"];
const WORKS_COLOR = "#f59e0b"; // amber
const CLOSURE_COLOR = "#dc2626"; // red

const isClosed = [
  "any",
  ["match", ["get", "management"], CLOSURE_TYPES, true, false],
  ["==", ["get", "lanesOpen"], 0],
];

function isIncidentType(type: string): boolean {
  return INCIDENT_TYPES.includes(type);
}

function isClosedProps(props: SituationProperties): boolean {
  return (
    (props.management != null && CLOSURE_TYPES.includes(props.management)) ||
    props.lanesOpen === 0
  );
}

function isWorksProps(props: SituationProperties): boolean {
  return (
    !isClosedProps(props) &&
    props.management != null &&
    WORKS_TYPES.includes(props.management)
  );
}

// --- actueel_beeld: general situations (incidents drawn separately as
// triangles; works/closures excluded — the afsluitingen feed owns those). ---
const lineLayer: LayerProps = {
  id: LINE_LAYER_ID,
  type: "line",
  filter: [
    "all",
    ["==", ["geometry-type"], "LineString"],
    ["!", isIncident],
    ["!", isWorksClosureMgmt],
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

const circleLayer: LayerProps = {
  id: CIRCLE_LAYER_ID,
  type: "circle",
  filter: [
    "all",
    ["==", ["geometry-type"], "Point"],
    ["!", isIncident],
    ["!", isWorksClosureMgmt],
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

// --- afsluitingen: works & closures, pre-filtered server-side to measures in
// force now that carry real lane-impact. Works render as a prominent amber
// dashed line; genuine closures (rare) as a bold red casing + white dash. ---
const worksLayer: LayerProps = {
  id: WORKS_LAYER_ID,
  type: "line",
  filter: [
    "all",
    ["==", ["geometry-type"], "LineString"],
    ["!", isClosed],
  ] as unknown as ExpressionSpecification,
  layout: { "line-cap": "round", "line-join": "round" },
  paint: {
    "line-color": WORKS_COLOR,
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      6,
      3,
      14,
      6,
    ] as unknown as ExpressionSpecification,
    "line-dasharray": [3, 2] as unknown as ExpressionSpecification,
    "line-opacity": 0.9,
  },
};

const closureCasingLayer: LayerProps = {
  id: CLOSURE_CASING_LAYER_ID,
  type: "line",
  filter: [
    "all",
    ["==", ["geometry-type"], "LineString"],
    isClosed,
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
    isClosed,
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

const worksCircleLayer: LayerProps = {
  id: WORKS_CIRCLE_ID,
  type: "circle",
  filter: [
    "==",
    ["geometry-type"],
    "Point",
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
    "circle-color": [
      "case",
      isClosed,
      CLOSURE_COLOR,
      WORKS_COLOR,
    ] as unknown as ExpressionSpecification,
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

// "1 of 3 lanes open" / "1 lane closed" when the feed provides lane counts.
function laneSummary(props: SituationProperties): string | undefined {
  if (props.lanesOpen != null && props.lanesTotal != null) {
    return `${props.lanesOpen} of ${props.lanesTotal} lanes open`;
  }
  if (props.lanesRestricted != null && props.lanesRestricted > 0) {
    return `${props.lanesRestricted} lane${props.lanesRestricted > 1 ? "s" : ""} closed`;
  }
  return undefined;
}

function SituationPopup({ props }: { props: SituationProperties }) {
  const incident = isIncidentType(props.type);
  const closed = isClosedProps(props);
  const works = isWorksProps(props);
  const color = closed
    ? CLOSURE_COLOR
    : works
      ? WORKS_COLOR
      : incident
        ? (INCIDENT_COLORS[props.type] ?? DEFAULT_INCIDENT_COLOR)
        : (TYPE_COLORS[props.type] ?? DEFAULT_COLOR);
  const rows: Array<[string, string | undefined]> = [
    ["Subtype", props.subtype],
    ["Management", props.management],
    ["Lanes", laneSummary(props)],
    ["Mobility", props.mobility],
    ["Cause", props.cause],
    ["Severity", props.severity],
    [
      "Speed limit",
      props.speedLimit != null ? `${props.speedLimit} km/h` : undefined,
    ],
    ["From", formatDateTime(props.startTime)],
    ["Until", formatDateTime(props.endTime)],
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
      {closed && (
        <div className="my-1 inline-block rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          Weg afgesloten
        </div>
      )}
      {works && (
        <div className="my-1 inline-block rounded bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          Wegwerkzaamheden / rijstrookbeperking
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
  const { data: works } = useQuery(
    trpc.feeds.afsluitingen.queryOptions(undefined, {
      refetchInterval: 60_000,
    }),
  );
  const [showSituations, setShowSituations] = useState(true);
  const [showWorks, setShowWorks] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null);

  // Anchor the popup at the click point (works for line geometry too) and look
  // the feature up by id in the dataset that owns the clicked layer.
  const onClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) {
        setPopupInfo(null);
        return;
      }
      const id = String(feature.properties?.id);
      const source = WORKS_LAYER_IDS.has(feature.layer.id) ? works : data;
      const match = source?.features.find((f) => f.properties.id === id);
      if (match) {
        setPopupInfo({
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
          props: match.properties,
        });
      }
    },
    [data, works],
  );

  const interactiveLayerIds = [
    LINE_LAYER_ID,
    CIRCLE_LAYER_ID,
    WORKS_LAYER_ID,
    WORKS_CIRCLE_ID,
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
          </Source>
        )}
        {works && (
          <Source id="works" type="geojson" data={works}>
            {showWorks && <Layer {...worksLayer} />}
            {showWorks && <Layer {...closureCasingLayer} />}
            {showWorks && <Layer {...closureDashLayer} />}
            {showWorks && <Layer {...worksCircleLayer} />}
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
          Snelheden, rijstrooksturing en omleidingen.
        </p>
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={showWorks}
            onChange={(e) => setShowWorks(e.target.checked)}
          />
          Werkzaamheden
        </label>
        <p className="mb-2 ml-6 text-[11px] text-zinc-500">
          Actuele maatregelen. Rijbaan-/wegafsluiting als rode streeplijn;
          rijstrookbeperking amber, met aantal open rijstroken.
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
