import type { Timestamp } from 'firebase/firestore';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface UserSettings {
  defaultLakeId: string | null;
  units: 'imperial' | 'metric';
  windDisplayFormat: 'mph' | 'kph' | 'knots';
}

export interface User {
  displayName: string;
  email: string | null;
  createdAt: Timestamp;
  settings: UserSettings;
}

export interface Lake {
  id: string;
  name: string;
  state: string;
  center: GeoPoint;
  bounds: { ne: GeoPoint; sw: GeoPoint };
  area_acres: number;
  max_depth_ft: number | null;
  bathymetrySource: 'navionics' | 'state' | 'globathy' | '3dlakes' | 'user' | null;
  bathymetryTileUrl: string | null;
  shorelineGeoJSON: string | null;
  species: string[];
  usgsStationId: string | null;
}

export type WeatherCondition = 'clear' | 'partly_cloudy' | 'overcast' | 'rain' | 'storm';
export type PressureTrend = 'rising' | 'falling' | 'stable';
export type SolunarPeriod = 'major' | 'minor' | 'none';
export type StructureType = 'hump' | 'saddle' | 'point' | 'channel' | 'dropoff' | 'flat';
export type PhotoSource = 'camera' | 'import' | null;

export interface CatchWeather {
  temp_f: number;
  wind_speed_mph: number;
  wind_direction_deg: number;
  wind_gusts_mph: number;
  cloud_cover_pct: number;
  precipitation_in: number;
  pressure_hpa: number;
  condition: WeatherCondition;
  moon_phase: string;
  pressure_trend: PressureTrend;
  water_temp_f: number | null;
}

export interface CatchCharacteristics {
  depth_ft: number | null;
  slope_degrees: number | null;
  dropoffProximity: number | null;
  channelProximity: number | null;
  pointProximity: number | null;
  shorelineDistance: number;
  windExposure: number;
  nearestStructureType: StructureType | null;
  nearestStructureDist: number | null;
}

export interface CatchSolunar {
  period: SolunarPeriod;
  minutesToWindow: number;
}

export interface Catch {
  id: string;
  userId: string;
  lakeId: string;
  location: GeoPoint;
  timestamp: Timestamp;
  loggedAt: Timestamp;
  species: string | null;
  weight_lbs: number | null;
  length_in: number | null;
  lure: string | null;
  notes: string | null;
  photo: string | null;
  photoSource: PhotoSource;
  characteristics: CatchCharacteristics | null;
  weather: CatchWeather | null;
  solunar: CatchSolunar | null;
}

export interface CatchFormData {
  location: GeoPoint;
  timestamp: Date;
  species: string;
  weight_lbs: string;
  length_in: string;
  lure: string;
  notes: string;
  photo: File | null;
  photoSource: PhotoSource;
}

export interface StructureFeature {
  type: StructureType;
  geometry: GeoJSON.Geometry;
  depth_range: [number, number];
  label: string;
}

export interface TripPlan {
  id: string;
  lakeId: string;
  targetDate: Timestamp;
  forecastWeather: CatchWeather;
  recommendedSpots: Array<{
    location: GeoPoint;
    score: number;
    characteristics: CatchCharacteristics;
  }>;
  feedingWindows: Array<{
    start: Date;
    end: Date;
    type: SolunarPeriod;
  }>;
  createdAt: Timestamp;
}
