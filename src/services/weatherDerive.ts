/**
 * Shared helpers for deriving CatchWeather fields from raw Open-Meteo hourly
 * arrays, plus a tiny in-memory cache for the hourly endpoint so the weekly
 * forecast and the trip planner's hourly view don't double-fetch.
 */

import type { WeatherCondition, PressureTrend } from '../types';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

const HOURLY_PARAMS = [
  'temperature_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'precipitation',
  'pressure_msl',
].join(',');

export interface HourlyData {
  time: string[];
  temperature_2m: number[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  wind_gusts_10m: number[];
  cloud_cover: number[];
  precipitation: number[];
  pressure_msl: number[];
}

export function deriveCondition(cloud: number, precip: number, gusts: number): WeatherCondition {
  if (precip > 0.1 && gusts > 25) return 'storm';
  if (precip > 0) return 'rain';
  if (cloud > 60) return 'overcast';
  if (cloud > 20) return 'partly_cloudy';
  return 'clear';
}

export function derivePressureTrend(pressures: number[], idx: number): PressureTrend {
  const lookback = Math.max(0, idx - 6);
  const diff = pressures[idx] - pressures[lookback];
  if (diff > 1.5) return 'rising';
  if (diff < -1.5) return 'falling';
  return 'stable';
}

export function pressureRate3h(pressures: number[], idx: number): number {
  const past = Math.max(0, idx - 3);
  return Math.round((pressures[idx] - pressures[past]) * 10) / 10;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { ts: number; data: HourlyData }>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

export async function fetchOpenMeteoHourly(lat: number, lng: number): Promise<HourlyData> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lng.toString(),
    hourly: HOURLY_PARAMS,
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
    forecast_days: '7',
  });

  const res = await fetch(`${FORECAST_URL}?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo hourly fetch failed: ${res.status}`);
  const json = await res.json();

  const data: HourlyData = {
    time: json.hourly?.time ?? [],
    temperature_2m: json.hourly?.temperature_2m ?? [],
    wind_speed_10m: json.hourly?.wind_speed_10m ?? [],
    wind_direction_10m: json.hourly?.wind_direction_10m ?? [],
    wind_gusts_10m: json.hourly?.wind_gusts_10m ?? [],
    cloud_cover: json.hourly?.cloud_cover ?? [],
    precipitation: json.hourly?.precipitation ?? [],
    pressure_msl: json.hourly?.pressure_msl ?? [],
  };

  cache.set(key, { ts: Date.now(), data });
  return data;
}

/**
 * Bucket hourly indices by local-calendar day. Open-Meteo returns local-time
 * strings when timezone=auto, so plain Date getters are correct.
 */
export function bucketHourlyByDay(times: string[]): Map<string, { idxStart: number; idxEnd: number }> {
  const buckets = new Map<string, { idxStart: number; idxEnd: number }>();
  for (let i = 0; i < times.length; i++) {
    const d = new Date(times[i]);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const existing = buckets.get(key);
    if (!existing) buckets.set(key, { idxStart: i, idxEnd: i });
    else existing.idxEnd = i;
  }
  return buckets;
}
