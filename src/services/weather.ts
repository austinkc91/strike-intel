import type { CatchWeather, PressureTrend, WeatherCondition } from '../types';

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
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

interface OpenMeteoHourly {
  time: string[];
  temperature_2m: number[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  wind_gusts_10m: number[];
  cloud_cover: number[];
  precipitation: number[];
  pressure_msl: number[];
}

function derivePressureTrend(
  pressures: number[],
  currentIndex: number,
): PressureTrend {
  // Look back 6 hours
  const lookback = Math.max(0, currentIndex - 6);
  const pastPressure = pressures[lookback];
  const currentPressure = pressures[currentIndex];
  const diff = currentPressure - pastPressure;

  if (diff > 1.5) return 'rising';
  if (diff < -1.5) return 'falling';
  return 'stable';
}

function deriveCondition(
  cloudCover: number,
  precipitation: number,
  gusts: number,
): WeatherCondition {
  if (precipitation > 0.1 && gusts > 25) return 'storm';
  if (precipitation > 0) return 'rain';
  if (cloudCover > 60) return 'overcast';
  if (cloudCover > 20) return 'partly_cloudy';
  return 'clear';
}

function findClosestHourIndex(times: string[], targetDate: Date): number {
  const targetMs = targetDate.getTime();
  let closest = 0;
  let minDiff = Infinity;

  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(new Date(times[i]).getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = i;
    }
  }
  return closest;
}

export async function fetchWeatherForCatch(
  lat: number,
  lng: number,
  timestamp: Date,
): Promise<Omit<CatchWeather, 'moon_phase' | 'water_temp_f'>> {
  const dateStr = timestamp.toISOString().slice(0, 10);

  // Use archive for past dates, forecast for today/future
  const now = new Date();
  const isHistorical =
    timestamp.getTime() < now.getTime() - 2 * 24 * 60 * 60 * 1000;

  const baseUrl = isHistorical ? ARCHIVE_URL : FORECAST_URL;

  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lng.toString(),
    hourly: HOURLY_PARAMS,
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
  });

  if (isHistorical) {
    params.set('start_date', dateStr);
    params.set('end_date', dateStr);
  } else {
    // Forecast API needs a date range that includes today
    params.set('start_date', dateStr);
    params.set('end_date', dateStr);
  }

  const res = await fetch(`${baseUrl}?${params}`);
  if (!res.ok) {
    throw new Error(`Weather API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const hourly: OpenMeteoHourly = data.hourly;

  if (!hourly || !hourly.time || hourly.time.length === 0) {
    throw new Error('No hourly weather data returned');
  }

  const idx = findClosestHourIndex(hourly.time, timestamp);

  const temp_f = hourly.temperature_2m[idx];
  const wind_speed_mph = hourly.wind_speed_10m[idx];
  const wind_direction_deg = hourly.wind_direction_10m[idx];
  const wind_gusts_mph = hourly.wind_gusts_10m[idx];
  const cloud_cover_pct = hourly.cloud_cover[idx];
  const precipitation_in = hourly.precipitation[idx];
  const pressure_hpa = hourly.pressure_msl[idx];

  return {
    temp_f: Math.round(temp_f),
    wind_speed_mph: Math.round(wind_speed_mph),
    wind_direction_deg: Math.round(wind_direction_deg),
    wind_gusts_mph: Math.round(wind_gusts_mph),
    cloud_cover_pct: Math.round(cloud_cover_pct),
    precipitation_in: Math.round(precipitation_in * 100) / 100,
    pressure_hpa: Math.round(pressure_hpa * 10) / 10,
    condition: deriveCondition(cloud_cover_pct, precipitation_in, wind_gusts_mph),
    pressure_trend: derivePressureTrend(hourly.pressure_msl, idx),
  };
}

export async function fetchForecastWeather(
  lat: number,
  lng: number,
  targetDate: Date,
): Promise<Omit<CatchWeather, 'moon_phase' | 'water_temp_f'>> {
  return fetchWeatherForCatch(lat, lng, targetDate);
}

export function windDirectionToCompass(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(deg / 22.5) % 16;
  return dirs[idx];
}

export function conditionLabel(c: WeatherCondition): string {
  switch (c) {
    case 'clear': return 'Clear';
    case 'partly_cloudy': return 'Partly Cloudy';
    case 'overcast': return 'Overcast';
    case 'rain': return 'Rain';
    case 'storm': return 'Storm';
  }
}

export function pressureTrendSymbol(t: PressureTrend): string {
  switch (t) {
    case 'rising': return '\u2191';
    case 'falling': return '\u2193';
    case 'stable': return '\u2192';
  }
}
