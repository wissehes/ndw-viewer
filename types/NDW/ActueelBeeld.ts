export interface SituationProperties {
  id: string;
  type: string;
  severity?: string;
  cause?: string;
  speedLimit?: number;
  startTime?: string;
  endTime?: string;
}

export interface SituationFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: SituationProperties;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: SituationFeature[];
}
