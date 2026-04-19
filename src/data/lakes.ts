import type { Lake } from '../types';

// Single-lake build for now — we hard-bind Strike Intel to Texoma so the
// Map and Catches pages have the lake context without requiring the user
// to pick one from the Home page first. When we add more lakes, replace
// this constant with a list and revive the lake picker.
export const LAKE_TEXOMA: Lake = {
  id: 'lake-texoma',
  name: 'Lake Texoma',
  state: 'TX/OK',
  center: { latitude: 33.82, longitude: -96.57 },
  bounds: {
    ne: { latitude: 33.92, longitude: -96.47 },
    sw: { latitude: 33.72, longitude: -96.67 },
  },
  area_acres: 89000,
  max_depth_ft: null,
  bathymetrySource: null,
  bathymetryTileUrl: null,
  shorelineGeoJSON: null,
  species: [],
  usgsStationId: null,
};
