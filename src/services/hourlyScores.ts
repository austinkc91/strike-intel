/**
 * Hour-by-hour fishing score for a single chosen day. Powers the trip
 * planner's hourly chart and best-window detection.
 *
 * Uses the same Open-Meteo hourly arrays as computeWeeklyForecast (cached
 * via weatherDerive.fetchOpenMeteoHourly) so opening the trip planner after
 * the home page costs zero extra network.
 */

import {
  scoreFishingDay,
  type Species,
  type FishScoreResult,
  type Briefing,
} from './fishScoring';
import { getDayInfo, hoursOfDay } from './astronomy';
import { getSolunarWindows, isInFeedingWindow } from './solunar';
import {
  bucketHourlyByDay,
  deriveCondition,
  derivePressureTrend,
  fetchOpenMeteoHourly,
  pressureRate3h,
} from './weatherDerive';
import type { CatchWeather } from '../types';

export interface HourScore {
  hour: number;          // 0-23 local
  date: Date;            // exact local timestamp for this hour
  score: number;
  label: FishScoreResult['label'];
  color: string;
  inFeedingWindow: 'major' | 'minor' | 'none';
  rep: CatchWeather;
  briefing: Briefing[];
  hasHazard: boolean;
}

export interface BestWindow {
  startHour: number;     // 0-23 local
  endHour: number;       // inclusive
  avgScore: number;
  peakHour: number;
  topBriefing: string | null;
}

/**
 * Score every hour from sunrise-1 to sunset+1 on the given day, using real
 * solunar feeding windows and per-hour weather + pressure trend.
 */
export async function computeHourlyScores(
  lat: number,
  lng: number,
  species: Species,
  day: Date,
  waterTempF: number | null,
): Promise<HourScore[]> {
  const data = await fetchOpenMeteoHourly(lat, lng);
  if (data.time.length === 0) return [];

  const dayKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
  const buckets = bucketHourlyByDay(data.time);
  const bucket = buckets.get(dayKey);
  if (!bucket) return [];

  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const info = getDayInfo(dayStart, lat, lng);
  const sunriseHour = hoursOfDay(info.sunrise);
  const sunsetHour = hoursOfDay(info.sunset);
  const solunar = getSolunarWindows(dayStart, lat, lng);

  const startHour = Math.max(0, Math.floor(sunriseHour) - 1);
  const endHour = Math.min(23, Math.ceil(sunsetHour) + 1);

  const out: HourScore[] = [];
  for (let h = startHour; h <= endHour; h++) {
    const idx = bucket.idxStart + h;
    if (idx > bucket.idxEnd || idx >= data.time.length) continue;

    const cloud = data.cloud_cover[idx] ?? 0;
    const precip = data.precipitation[idx] ?? 0;
    const gust = data.wind_gusts_10m[idx] ?? 0;
    const hourTime = new Date(data.time[idx]);

    const rep: CatchWeather = {
      temp_f: data.temperature_2m[idx] ?? 0,
      wind_speed_mph: data.wind_speed_10m[idx] ?? 0,
      wind_direction_deg: data.wind_direction_10m[idx] ?? 0,
      wind_gusts_mph: gust,
      cloud_cover_pct: cloud,
      precipitation_in: precip,
      pressure_hpa: data.pressure_msl[idx] ?? 1013,
      condition: deriveCondition(cloud, precip, gust),
      pressure_trend: derivePressureTrend(data.pressure_msl, idx),
      moon_phase: null as unknown as string,
      water_temp_f: waterTempF,
    };

    const feeding = isInFeedingWindow(hourTime, solunar.windows);

    const r = scoreFishingDay({
      species,
      weather: rep,
      pressureTrendRate: pressureRate3h(data.pressure_msl, idx),
      solunarRating: solunar.rating,
      inFeedingWindow: feeding.period,
      moonIllumination: info.moonIllumination,
      now: hourTime,
      sunriseHour,
      sunsetHour,
    });

    out.push({
      hour: h,
      date: hourTime,
      score: r.score,
      label: r.label,
      color: r.color,
      inFeedingWindow: feeding.period,
      rep,
      briefing: r.briefing,
      hasHazard: r.hasHazard,
    });
  }

  return out;
}

/**
 * Collapse the hourly score curve into 1–N "best windows" — contiguous runs
 * of hours where the score is high relative to the rest of the day. We take
 * runs at or above max(60, dayMax - 8), bridge runs separated by ≤1 hour, and
 * rank by avg score.
 */
export function findBestWindows(hours: HourScore[], maxWindows: number = 3): BestWindow[] {
  if (hours.length === 0) return [];

  const dayMax = Math.max(...hours.map((h) => h.score));
  const cutoff = Math.max(60, dayMax - 8);

  // Find raw runs over the cutoff
  type Run = { startIdx: number; endIdx: number };
  const runs: Run[] = [];
  let i = 0;
  while (i < hours.length) {
    if (hours[i].score >= cutoff) {
      const start = i;
      while (i + 1 < hours.length && hours[i + 1].score >= cutoff) i++;
      runs.push({ startIdx: start, endIdx: i });
    }
    i++;
  }

  // Bridge runs separated by ≤1 hour gap
  const merged: Run[] = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (prev && hours[r.startIdx].hour - hours[prev.endIdx].hour <= 2) {
      prev.endIdx = r.endIdx;
    } else {
      merged.push({ ...r });
    }
  }

  const windows: BestWindow[] = merged.map((r) => {
    const slice = hours.slice(r.startIdx, r.endIdx + 1);
    const sum = slice.reduce((s, h) => s + h.score, 0);
    const avg = sum / slice.length;
    const peak = slice.reduce((best, h) => (h.score > best.score ? h : best), slice[0]);
    return {
      startHour: hours[r.startIdx].hour,
      endHour: hours[r.endIdx].hour,
      avgScore: Math.round(avg),
      peakHour: peak.hour,
      topBriefing: peak.briefing[0]?.text ?? null,
    };
  });

  windows.sort((a, b) => b.avgScore - a.avgScore);
  return windows.slice(0, maxWindows);
}
