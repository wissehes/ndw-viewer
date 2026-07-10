export interface DripProperties {
  id: string;
  description: string;
  vmsType: string;
  status: string; // working | blank | notWorking | ...
  active: boolean; // status === "working"
  bearing: number;
  updateTime?: string;
  text?: string[];
  image?: string; // data URI of the rendered panel, only for working panels
}

export interface DripFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: DripProperties;
}

export interface DripFeatureCollection {
  type: "FeatureCollection";
  features: DripFeature[];
}

export interface PanelLocation {
  coordinates: [number, number];
  description: string;
  vmsType: string;
  bearing: number;
}
