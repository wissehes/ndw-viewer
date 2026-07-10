"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import MapGL, {
  type MapLayerMouseEvent,
  NavigationControl,
} from "@vis.gl/react-maplibre";
import { type ReactNode, useState } from "react";
import { useMapView } from "@/app/hooks/useMapView";
import { roundCoord, roundZoom } from "@/app/lib/mapView";

const STYLE_URL = process.env.NEXT_PUBLIC_MAPTILER_STYLE_URL;

interface BaseMapProps {
  interactiveLayerIds?: string[];
  onClick?: (event: MapLayerMouseEvent) => void;
  children?: ReactNode;
}

// Shared MapLibre/MapTiler map shell: style-URL guard, error surfacing, cursor
// handling, and NavigationControl. Feature layers/popups are passed as children.
// The view is synced to the URL via useMapView (shareable, persists on reload).
export default function BaseMap({
  interactiveLayerIds,
  onClick,
  children,
}: BaseMapProps) {
  const [view, setView] = useMapView();
  const [cursor, setCursor] = useState("auto");
  const [error, setError] = useState<string | null>(null);

  // Read once at mount; MapGL stays uncontrolled, so writing back on move
  // doesn't re-trigger a jump.
  const [initialViewState] = useState(() => ({
    longitude: view.lng,
    latitude: view.lat,
    zoom: view.zoom,
  }));

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
        onMoveEnd={(e) =>
          setView({
            lng: roundCoord(e.viewState.longitude),
            lat: roundCoord(e.viewState.latitude),
            zoom: roundZoom(e.viewState.zoom),
          })
        }
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
