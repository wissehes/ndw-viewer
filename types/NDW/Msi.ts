export interface MsiLane {
  lane: number;
  display: string; // blank | speedlimit | lane_closed | lane_open | ...
  speed: number | null;
  flashing: boolean;
  merge: "left" | "right" | null; // for lane_closed_ahead: which way to merge
}

export interface MsiGantryProperties {
  id: string;
  road: string;
  carriageway: string;
  km: number;
  bearing: number; // travel direction, degrees clockwise from north (uniform per gantry)
  active: boolean; // any lane not blank
  primaryDisplay: string; // for dot color when zoomed out
  lanes: MsiLane[]; // sorted by lane number
  updateTime?: string;
}

export interface MsiFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: MsiGantryProperties;
}

export interface MsiFeatureCollection {
  type: "FeatureCollection";
  features: MsiFeature[];
}
