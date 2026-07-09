"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import MapGL, {
  type MapLayerMouseEvent,
  NavigationControl,
} from "@vis.gl/react-maplibre";
import { type ReactNode, useState } from "react";

const STYLE_URL = process.env.NEXT_PUBLIC_MAPTILER_STYLE_URL;

const DEFAULT_VIEW = { longitude: 5.29, latitude: 52.13, zoom: 7 };

interface BaseMapProps {
  initialViewState?: { longitude: number; latitude: number; zoom: number };
  interactiveLayerIds?: string[];
  onClick?: (event: MapLayerMouseEvent) => void;
  children?: ReactNode;
}

// Shared MapLibre/MapTiler map shell: style-URL guard, error surfacing, cursor
// handling, and NavigationControl. Feature layers/popups are passed as children.
export default function BaseMap({
  initialViewState = DEFAULT_VIEW,
  interactiveLayerIds,
  onClick,
  children,
}: BaseMapProps) {
  const [cursor, setCursor] = useState("auto");
  const [error, setError] = useState<string | null>(null);

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
        initialViewState={initialViewState}
        mapStyle={STYLE_URL}
        interactiveLayerIds={interactiveLayerIds}
        cursor={cursor}
        onClick={onClick}
        onMouseEnter={() => setCursor("pointer")}
        onMouseLeave={() => setCursor("auto")}
        onError={(e) => setError(e.error?.message ?? "Unknown map error")}
      >
        <NavigationControl position="top-right" />
        {children}
      </MapGL>
      {error && (
        <div className="absolute left-1/2 top-4 z-10 max-w-md -translate-x-1/2 rounded-md bg-red-600 px-4 py-2 text-center text-sm text-white shadow-lg">
          Map error: {error}
        </div>
      )}
    </>
  );
}
