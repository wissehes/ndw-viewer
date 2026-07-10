export interface LaneMeasurement {
  lane: number;
  speed: number | null; // km/h, null if not reported this minute
  flow: number | null; // vehicles/hour
}

export interface TrafficSpeedProperties {
  id: string;
  name?: string;
  side?: string; // travel direction, e.g. "northEastBound"
  lanes?: number;
  speed: number | null; // average vehicle speed, km/h (null if no valid reading)
  flow: number | null; // total traffic flow / intensity, vehicles/hour
  perLane?: LaneMeasurement[]; // per-lane breakdown (omitted for single-lane sites)
  updateTime?: string;
}

export interface TrafficSpeedFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: TrafficSpeedProperties;
}

export interface TrafficSpeedFeatureCollection {
  type: "FeatureCollection";
  features: TrafficSpeedFeature[];
}
