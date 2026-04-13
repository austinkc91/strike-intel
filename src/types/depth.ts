export interface DepthQueryResult {
  lat: number;
  lng: number;
  lake: string;
  depth_ft: number;
  depth_m: number;
}

export interface ContourFeature {
  type: 'Feature';
  geometry: GeoJSON.Geometry;
  properties: {
    depth_ft: number;
    is_major: number;
    lake_id: string;
  };
}

export interface ContourQueryResult {
  type: 'FeatureCollection';
  features: ContourFeature[];
  bbox: [number, number, number, number];
  count: number;
}

export interface TileMetadata {
  name: string;
  description: string;
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number];
  center: [number, number, number];
  format: string;
  tiles: string[];
}
