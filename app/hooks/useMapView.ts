"use client";

import { useQueryStates } from "nuqs";
import { mapViewParsers, mapViewUrlOptions } from "@/app/lib/mapView";

export function useMapView() {
  return useQueryStates(mapViewParsers, mapViewUrlOptions);
}
