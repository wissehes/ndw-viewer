"use client";

import { type MapLayerMouseEvent, Popup } from "@vis.gl/react-maplibre";
import { useCallback, useEffect, useState } from "react";
import type {
  DripFeatureCollection,
  DripProperties,
} from "@/app/api/drips/route";
import type {
  MsiFeatureCollection,
  MsiGantryProperties,
} from "@/app/api/msi/route";
import BaseMap from "../BaseMap";
import DripLayer from "./DripLayer";
import MsiLayer, { GantryRow, MSI_COLORS } from "./MsiLayer";

const INTERACTIVE_LAYERS = ["drip-dot", "drip-panel", "msi-gantry-dot"];

const MSI_LABELS: Record<string, string> = {
  speedlimit: "Speed limit",
  lane_closed: "Lane closed",
  lane_open: "Lane open",
  lane_closed_ahead: "Lane closed ahead",
  restriction_end: "End of restriction",
  blank: "Blank",
};

type PopupInfo =
  | { longitude: number; latitude: number; kind: "drip"; props: DripProperties }
  | {
      longitude: number;
      latitude: number;
      kind: "msi";
      props: MsiGantryProperties;
    };

function useFeed<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${url} responded ${res.status}`);
        return res.json();
      })
      .then((json: T) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) console.error(`Failed to load ${url}:`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return data;
}

function DripPopupBody({ props }: { props: DripProperties }) {
  return (
    <div className="font-sans text-xs leading-relaxed text-zinc-800">
      <strong>{props.description || "DRIP"}</strong>
      <div className="mb-1 text-[11px] text-zinc-400">{props.status}</div>
      {props.image && (
        // biome-ignore lint/performance/noImgElement: base64 data URI, not a next/image asset
        <img
          src={props.image}
          alt="Panel"
          className="my-1 max-w-55 rounded bg-black"
        />
      )}
      {props.text?.map((line) => (
        <div key={line}>{line}</div>
      ))}
      {props.updateTime && (
        <div className="mt-1 text-[11px] text-zinc-400">{props.updateTime}</div>
      )}
    </div>
  );
}

function MsiPopupBody({ props }: { props: MsiGantryProperties }) {
  const activeLanes = props.lanes.filter((l) => l.display !== "blank");
  return (
    <div className="font-sans text-xs leading-relaxed text-zinc-800">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: MSI_COLORS[props.primaryDisplay] ?? "#9ca3af",
          }}
        />
        <strong>
          MSI {props.road} {props.carriageway}
        </strong>
      </div>
      <div className="mb-1.5 text-[11px] text-zinc-400">km {props.km}</div>
      <GantryRow lanes={props.lanes} />
      <ul className="mt-1.5">
        {activeLanes.map((lane) => (
          <li key={lane.lane}>
            <span className="text-zinc-500">Lane {lane.lane}:</span>{" "}
            {MSI_LABELS[lane.display] ?? lane.display}
            {lane.speed != null ? ` ${lane.speed} km/h` : ""}
          </li>
        ))}
      </ul>
      {props.updateTime && (
        <div className="mt-1 text-[11px] text-zinc-400">{props.updateTime}</div>
      )}
    </div>
  );
}

export default function SignsMap() {
  const drips = useFeed<DripFeatureCollection>("/api/drips");
  const msi = useFeed<MsiFeatureCollection>("/api/msi");
  const [showDrips, setShowDrips] = useState(true);
  const [showMsi, setShowMsi] = useState(true);
  const [popup, setPopup] = useState<PopupInfo | null>(null);

  // Look features up in the fetched data by id — MapLibre stringifies array
  // properties (drip.text, gantry.lanes) on event features, so we avoid those.
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

      if (feature.layer.id.startsWith("drip")) {
        const drip = drips?.features.find((f) => f.properties.id === id);
        if (drip) {
          setPopup({
            longitude,
            latitude,
            kind: "drip",
            props: drip.properties,
          });
        }
      } else {
        const gantry = msi?.features.find((f) => f.properties.id === id);
        if (gantry) {
          setPopup({
            longitude,
            latitude,
            kind: "msi",
            props: gantry.properties,
          });
        }
      }
    },
    [drips, msi],
  );

  const onSelectGantry = useCallback(
    (props: MsiGantryProperties, coords: [number, number]) => {
      setPopup({
        longitude: coords[0],
        latitude: coords[1],
        kind: "msi",
        props,
      });
    },
    [],
  );

  return (
    <>
      <BaseMap interactiveLayerIds={INTERACTIVE_LAYERS} onClick={onClick}>
        <DripLayer data={drips} visible={showDrips} />
        <MsiLayer data={msi} visible={showMsi} onSelect={onSelectGantry} />
        {popup && (
          <Popup
            longitude={popup.longitude}
            latitude={popup.latitude}
            anchor="bottom"
            closeButton
            closeOnClick={false}
            maxWidth="280px"
            onClose={() => setPopup(null)}
          >
            {popup.kind === "drip" ? (
              <DripPopupBody props={popup.props} />
            ) : (
              <MsiPopupBody props={popup.props} />
            )}
          </Popup>
        )}
      </BaseMap>

      <div className="absolute left-4 top-16 z-10 w-56 rounded-lg bg-white/95 p-3 text-sm shadow-md backdrop-blur dark:bg-zinc-900/95">
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={showDrips}
            onChange={(e) => setShowDrips(e.target.checked)}
          />
          DRIPs
        </label>
        <p className="mb-2 ml-6 text-[11px] text-zinc-500">
          Dots when zoomed out; panel images when zoomed in.
        </p>
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={showMsi}
            onChange={(e) => setShowMsi(e.target.checked)}
          />
          Matrix signs (MSI)
        </label>
        <p className="mb-1 ml-6 text-[11px] text-zinc-500">
          Dots when zoomed out; lane rows when zoomed in.
        </p>
        <ul className="ml-6 space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
          {Object.entries(MSI_COLORS).map(([key, color]) => (
            <li key={key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              {MSI_LABELS[key]}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
