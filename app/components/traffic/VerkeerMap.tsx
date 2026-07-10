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
import type { TrafficSpeedProperties } from "@/types/NDW/TrafficSpeed";
import BaseMap from "../BaseMap";

const LAYER_ID = "traffic-speed-layer";

type Metric = "speed" | "intensity";

// Color ramps as [value, color] stops. Speed: green (fast) → red (slow).
// Intensity: light → dark blue as flow (veh/h) rises.
const SPEED_STOPS: Array<[number, string]> = [
  [20, "#dc2626"],
  [40, "#f97316"],
  [60, "#eab308"],
  [80, "#84cc16"],
  [100, "#16a34a"],
];
const FLOW_STOPS: Array<[number, string]> = [
  [0, "#dbeafe"],
  [750, "#93c5fd"],
  [1500, "#3b82f6"],
  [3000, "#1d4ed8"],
  [4500, "#1e3a8a"],
];
const NO_DATA_COLOR = "#9ca3af"; // gray — no valid reading for this metric

const STOPS: Record<Metric, Array<[number, string]>> = {
  speed: SPEED_STOPS,
  intensity: FLOW_STOPS,
};
const PROP: Record<Metric, "speed" | "flow"> = {
  speed: "speed",
  intensity: "flow",
};

// Circle color: gray when the metric is null, else interpolated over the ramp.
function colorExpression(metric: Metric): ExpressionSpecification {
  const prop = PROP[metric];
  return [
    "case",
    ["==", ["coalesce", ["get", prop], -1], -1],
    NO_DATA_COLOR,
    [
      "interpolate",
      ["linear"],
      ["get", prop],
      ...STOPS[metric].flatMap(([value, color]) => [value, color]),
    ],
  ] as unknown as ExpressionSpecification;
}

function layerStyle(metric: Metric): LayerProps {
  return {
    id: LAYER_ID,
    type: "circle",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        6,
        2.5,
        12,
        6,
      ] as unknown as ExpressionSpecification,
      "circle-color": colorExpression(metric),
      "circle-stroke-width": 0.5,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.9,
    },
  };
}

interface PopupInfo {
  longitude: number;
  latitude: number;
  props: TrafficSpeedProperties;
}

function MeasurementPopup({ props }: { props: TrafficSpeedProperties }) {
  const rows: Array<[string, string | undefined]> = [
    ["Speed", props.speed != null ? `${props.speed} km/h` : undefined],
    ["Intensity", props.flow != null ? `${props.flow} veh/h` : undefined],
    ["Lanes", props.lanes != null ? String(props.lanes) : undefined],
    ["Direction", props.side],
    ["Updated", props.updateTime],
  ];
  return (
    <div className="font-sans text-xs leading-relaxed text-zinc-800">
      <strong>{props.name || "Measurement site"}</strong>
      <div className="mb-1 text-[11px] text-zinc-400">{props.id}</div>
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label}>
            <span className="text-zinc-500">{label}:</span> {value}
          </div>
        ))}
      {props.perLane && (
        <table className="mt-1.5 w-full border-collapse text-[11px]">
          <thead>
            <tr className="text-zinc-500">
              <th className="pr-2 text-left font-medium">Lane</th>
              <th className="pr-2 text-right font-medium">km/h</th>
              <th className="text-right font-medium">veh/h</th>
            </tr>
          </thead>
          <tbody>
            {props.perLane.map((l) => (
              <tr key={l.lane}>
                <td className="pr-2">{l.lane}</td>
                <td className="pr-2 text-right tabular-nums">
                  {l.speed != null ? l.speed : "—"}
                </td>
                <td className="text-right tabular-nums">
                  {l.flow != null ? l.flow : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Legend({ metric }: { metric: Metric }) {
  const stops = STOPS[metric];
  const unit = metric === "speed" ? "km/h" : "veh/h";
  return (
    <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
      {stops.map(([value, color], i) => {
        const prev = i === 0 ? null : stops[i - 1][0];
        const label =
          i === 0
            ? `≤ ${value}`
            : i === stops.length - 1
              ? `≥ ${value}`
              : `${prev}–${value}`;
        return (
          <li key={value} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label} {unit}
          </li>
        );
      })}
      <li className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: NO_DATA_COLOR }}
        />
        No data
      </li>
    </ul>
  );
}

export default function VerkeerMap() {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.feeds.trafficSpeed.queryOptions(undefined, {
      refetchInterval: 30_000,
    }),
  );
  const [metric, setMetric] = useState<Metric>("speed");
  const [popup, setPopup] = useState<PopupInfo | null>(null);

  // Look features up by id in the fetched data so we get typed properties
  // (including null metrics) rather than MapLibre's coerced event props.
  const onClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") {
        setPopup(null);
        return;
      }
      const [longitude, latitude] = feature.geometry.coordinates as [
        number,
        number,
      ];
      const id = String(feature.properties?.id);
      const match = data?.features.find((f) => f.properties.id === id);
      if (match) {
        setPopup({ longitude, latitude, props: match.properties });
      }
    },
    [data],
  );

  return (
    <>
      <BaseMap interactiveLayerIds={[LAYER_ID]} onClick={onClick}>
        {data && (
          <Source id="traffic-speed" type="geojson" data={data}>
            <Layer {...layerStyle(metric)} />
          </Source>
        )}
        {popup && (
          <Popup
            longitude={popup.longitude}
            latitude={popup.latitude}
            anchor="bottom"
            closeButton
            closeOnClick={false}
            maxWidth="260px"
            onClose={() => setPopup(null)}
          >
            <MeasurementPopup props={popup.props} />
          </Popup>
        )}
      </BaseMap>

      <div className="absolute left-4 top-16 z-10 w-56 rounded-lg bg-white/95 p-3 text-sm shadow-md backdrop-blur dark:bg-zinc-900/95">
        <div className="mb-2 font-medium">Snelheden &amp; intensiteiten</div>
        <div className="flex rounded-md bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
          {(["speed", "intensity"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`flex-1 rounded px-2 py-1 font-medium transition-colors ${
                metric === m
                  ? "bg-white shadow-sm dark:bg-zinc-700"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {m === "speed" ? "Speed" : "Intensity"}
            </button>
          ))}
        </div>
        <Legend metric={metric} />
      </div>
    </>
  );
}
