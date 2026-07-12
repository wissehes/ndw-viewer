export interface SituationProperties {
  id: string;
  type: string;
  subtype?: string; // obstruction/accident sub-classification
  management?: string; // roadOrCarriagewayOrLaneManagementType (closures, etc.)
  mobility?: string; // stationary | mobile (obstructions)
  safetyRelated?: boolean; // record flagged as safety-related (SRTI subset)
  severity?: string;
  cause?: string;
  speedLimit?: number;
  startTime?: string;
  endTime?: string;
}

// Situations are points (obstructions/accidents/point locations) or lines
// (roadwork stretches, speed zones, lane management along a carriageway).
export interface SituationFeature {
  type: "Feature";
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] };
  properties: SituationProperties;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: SituationFeature[];
}
