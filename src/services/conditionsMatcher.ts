/**
 * Score how similar a past catch's conditions are to current/target conditions.
 * Used by "Best for Today" sorting on the Catches page.
 */

import type { CatchWeather } from '../types';

export interface ConditionsMatch {
  score: number;         // 0-1 overall similarity
  details: string[];     // Human-readable match highlights
}

interface DimResult {
  score: number;
  detail: string | null;
}

// Gaussian-like falloff: 1.0 at diff=0, drops smoothly.
function gaussian(diff: number, tolerance: number): number {
  return Math.exp(-0.5 * (diff / tolerance) ** 2);
}

// Circular distance for degrees / hours.
function circularDist(a: number, b: number, period: number): number {
  const d = Math.abs(a - b) % period;
  return Math.min(d, period - d);
}

function windLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function formatCondition(c: string): string {
  return c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function estimateIllumination(phase: string | null | undefined): number | null {
  if (!phase) return null;
  const p = phase.toLowerCase();
  if (p.includes('new')) return 0;
  if (p.includes('full')) return 1;
  if (p.includes('first quarter') || p.includes('last quarter') || p.includes('third quarter')) return 0.5;
  if (p.includes('waxing crescent') || p.includes('waning crescent')) return 0.15;
  if (p.includes('waxing gibbous') || p.includes('waning gibbous')) return 0.8;
  return null;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// ============================================================
// Per-dimension scorers. Each returns `null` if inputs are missing
// (dim skipped in weighted average — no false match from defaults).
// ============================================================

function scoreTemp(current: number, past: number | null | undefined): DimResult | null {
  if (!isNum(past)) return null;
  const diff = Math.abs(current - past);
  const s = gaussian(diff, 6);
  return { score: s, detail: `Temp ${Math.round(past)}°F (now ${Math.round(current)}°F)` };
}

function scoreWindSpeed(current: number, past: number | null | undefined): DimResult | null {
  if (!isNum(past)) return null;
  const diff = Math.abs(current - past);
  const s = gaussian(diff, 4);
  return { score: s, detail: `Wind ${Math.round(past)}mph (now ${Math.round(current)}mph)` };
}

function scoreWindDir(current: number, past: number | null | undefined): DimResult | null {
  if (!isNum(past)) return null;
  const diff = circularDist(current, past, 360);
  const s = gaussian(diff, 30);
  return { score: s, detail: `Wind from ${windLabel(past)} (now ${windLabel(current)})` };
}

function scorePressureTrend(
  current: string | null | undefined,
  past: string | null | undefined,
): DimResult | null {
  if (!past || !current) return null;
  if (current === past) {
    return { score: 1.0, detail: `Pressure ${past}` };
  }
  // Opposite trends (rising vs falling) should feel very different.
  return { score: 0.15, detail: `Pressure ${past} (now ${current})` };
}

function scoreCloudCover(current: number, past: number | null | undefined): DimResult | null {
  if (!isNum(past)) return null;
  const diff = Math.abs(current - past);
  const s = gaussian(diff, 20);
  return { score: s, detail: null };
}

function scoreCondition(
  current: string | null | undefined,
  past: string | null | undefined,
): DimResult | null {
  if (!current || !past) return null;
  if (current === past) {
    return { score: 1.0, detail: `${formatCondition(past)} (same)` };
  }
  const order = ['clear', 'partly_cloudy', 'overcast', 'rain', 'storm'];
  const ci = order.indexOf(current);
  const pi = order.indexOf(past);
  if (ci >= 0 && pi >= 0 && Math.abs(ci - pi) === 1) {
    return { score: 0.5, detail: null };
  }
  return { score: 0.1, detail: null };
}

function scoreMoon(currentIllum: number, pastPhase: string | null | undefined): DimResult | null {
  const pastIllum = estimateIllumination(pastPhase);
  if (pastIllum == null) return null;
  const diff = Math.abs(currentIllum - pastIllum);
  const s = gaussian(diff, 0.15);
  return { score: s, detail: `Moon ${pastPhase}` };
}

function scoreTimeOfDay(currentHour: number, pastHour: number): DimResult {
  const diff = circularDist(currentHour, pastHour, 24);
  const s = gaussian(diff, 1.5);
  return { score: s, detail: `${pastHour}:00 (now ${currentHour}:00)` };
}

function scoreSeason(currentMonth: number, pastMonth: number): DimResult {
  const diff = circularDist(currentMonth, pastMonth, 12);
  const s = gaussian(diff, 1.5);
  return { score: s, detail: null };
}

/**
 * Score how similar a past catch's weather was to current conditions.
 * Dims with missing past data are skipped entirely — they don't contribute
 * score OR weight — so scores reflect only information we actually have.
 */
export function matchConditions(
  currentWeather: CatchWeather,
  currentMoonIllum: number,
  currentTime: Date,
  pastWeather: CatchWeather,
  pastTime: Date,
): ConditionsMatch {
  const dims: { weight: number; result: DimResult | null }[] = [
    { weight: 1.0, result: scoreTemp(currentWeather.temp_f, pastWeather.temp_f) },
    { weight: 0.8, result: scoreWindSpeed(currentWeather.wind_speed_mph, pastWeather.wind_speed_mph) },
    { weight: 0.6, result: scoreWindDir(currentWeather.wind_direction_deg, pastWeather.wind_direction_deg) },
    { weight: 0.9, result: scorePressureTrend(currentWeather.pressure_trend, pastWeather.pressure_trend) },
    { weight: 0.4, result: scoreCloudCover(currentWeather.cloud_cover_pct, pastWeather.cloud_cover_pct) },
    { weight: 0.7, result: scoreCondition(currentWeather.condition, pastWeather.condition) },
    { weight: 0.5, result: scoreMoon(currentMoonIllum, pastWeather.moon_phase) },
    { weight: 0.6, result: scoreTimeOfDay(currentTime.getHours(), pastTime.getHours()) },
    { weight: 0.3, result: scoreSeason(currentTime.getMonth(), pastTime.getMonth()) },
  ];

  let weightedSum = 0;
  let totalWeight = 0;
  const detailedDims: { score: number; detail: string }[] = [];

  for (const { weight, result } of dims) {
    if (!result) continue; // missing data — skip entirely
    const s = Number.isFinite(result.score) ? result.score : 0;
    weightedSum += weight * s;
    totalWeight += weight;
    if (result.detail && s >= 0.6) {
      detailedDims.push({ score: s, detail: result.detail });
    }
  }

  // Highest-scoring details first so the most useful tags lead.
  detailedDims.sort((a, b) => b.score - a.score);

  return {
    score: totalWeight > 0 ? weightedSum / totalWeight : 0,
    details: detailedDims.slice(0, 4).map(d => d.detail),
  };
}
