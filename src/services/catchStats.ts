/**
 * Aggregate analytics over a user's catches. Every aggregate is computed
 * client-side from the same `catches` array Firestore returns — no extra
 * fetches. Designed to be cheap (single pass) so it can recompute on
 * every Catches-page render without choking.
 */

import type { Catch } from '../types';

export interface SpeciesTotals {
  species: string;
  count: number;
  withWeight: number;        // count where weight is recorded
  avgWeight_lbs: number | null;
  maxWeight_lbs: number | null;
  withLength: number;
  avgLength_in: number | null;
  maxLength_in: number | null;
  firstCatch: Date | null;
  lastCatch: Date | null;
}

export interface HourBucket {
  hour: number;              // 0-23 local
  count: number;
}

export interface MonthBucket {
  month: number;             // 0-11
  count: number;
}

export interface LurePerformance {
  lure: string;
  count: number;
  avgWeight_lbs: number | null;
  topSpecies: string | null;
}

export interface ConditionsProfile {
  count: number;
  avgTempF: number | null;
  avgWindMph: number | null;
  topWindCompass: string | null;
  topPressureTrend: string | null;
  topMoonPhase: string | null;
  topCondition: string | null;
}

export interface DayActivity {
  /** YYYY-MM-DD local. */
  key: string;
  date: Date;
  count: number;
}

export interface CatchStats {
  total: number;
  bySpecies: SpeciesTotals[];      // sorted by count desc
  byHour: HourBucket[];            // length 24
  byMonth: MonthBucket[];          // length 12
  topLures: LurePerformance[];     // sorted by count desc, top 5
  conditionsBySpecies: Map<string, ConditionsProfile>; // per species
  recentActivity: DayActivity[];   // last 90 days
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function compass(deg: number): string {
  return COMPASS[Math.round(deg / 22.5) % 16];
}

function topMode<T extends string>(items: (T | null | undefined)[]): T | null {
  const counts = new Map<T, number>();
  for (const it of items) {
    if (!it) continue;
    counts.set(it, (counts.get(it) ?? 0) + 1);
  }
  let best: T | null = null;
  let bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return best;
}

function avg(nums: number[]): number | null {
  const valid = nums.filter(Number.isFinite);
  if (valid.length === 0) return null;
  return valid.reduce((s, n) => s + n, 0) / valid.length;
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function computeCatchStats(catches: Catch[]): CatchStats {
  const total = catches.length;

  // Bucket by species
  const speciesMap = new Map<string, Catch[]>();
  const lureMap = new Map<string, Catch[]>();
  const hourCounts = new Array(24).fill(0);
  const monthCounts = new Array(12).fill(0);
  const dayMap = new Map<string, { date: Date; count: number }>();

  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

  for (const c of catches) {
    const ts = c.timestamp?.toDate?.();
    if (ts) {
      hourCounts[ts.getHours()]++;
      monthCounts[ts.getMonth()]++;

      if (ts.getTime() >= ninetyDaysAgo) {
        const key = localDateKey(ts);
        const existing = dayMap.get(key);
        if (existing) existing.count++;
        else {
          const dateOnly = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate());
          dayMap.set(key, { date: dateOnly, count: 1 });
        }
      }
    }

    const sp = c.species ?? 'Unknown';
    if (!speciesMap.has(sp)) speciesMap.set(sp, []);
    speciesMap.get(sp)!.push(c);

    if (c.lure) {
      if (!lureMap.has(c.lure)) lureMap.set(c.lure, []);
      lureMap.get(c.lure)!.push(c);
    }
  }

  // Per-species totals + best conditions
  const bySpecies: SpeciesTotals[] = [];
  const conditionsBySpecies = new Map<string, ConditionsProfile>();

  for (const [species, list] of speciesMap) {
    const weights = list.map((c) => c.weight_lbs).filter((n): n is number => typeof n === 'number');
    const lengths = list.map((c) => c.length_in).filter((n): n is number => typeof n === 'number');
    const timestamps = list.map((c) => c.timestamp?.toDate?.()).filter((d): d is Date => !!d);
    timestamps.sort((a, b) => a.getTime() - b.getTime());

    bySpecies.push({
      species,
      count: list.length,
      withWeight: weights.length,
      avgWeight_lbs: weights.length ? Math.round((weights.reduce((s, n) => s + n, 0) / weights.length) * 10) / 10 : null,
      maxWeight_lbs: weights.length ? Math.max(...weights) : null,
      withLength: lengths.length,
      avgLength_in: lengths.length ? Math.round((lengths.reduce((s, n) => s + n, 0) / lengths.length) * 10) / 10 : null,
      maxLength_in: lengths.length ? Math.max(...lengths) : null,
      firstCatch: timestamps[0] ?? null,
      lastCatch: timestamps[timestamps.length - 1] ?? null,
    });

    const withWeather = list.filter((c) => c.weather);
    if (withWeather.length > 0) {
      const winds = withWeather.map((c) => c.weather!.wind_direction_deg);
      const compassValues = winds.map(compass);
      const profile: ConditionsProfile = {
        count: withWeather.length,
        avgTempF: avg(withWeather.map((c) => c.weather!.temp_f)),
        avgWindMph: avg(withWeather.map((c) => c.weather!.wind_speed_mph)),
        topWindCompass: topMode(compassValues),
        topPressureTrend: topMode(withWeather.map((c) => c.weather!.pressure_trend as string)),
        topMoonPhase: topMode(withWeather.map((c) => c.weather!.moon_phase)),
        topCondition: topMode(withWeather.map((c) => c.weather!.condition as string)),
      };
      conditionsBySpecies.set(species, profile);
    }
  }

  bySpecies.sort((a, b) => b.count - a.count);

  // Top lures
  const topLures: LurePerformance[] = [];
  for (const [lure, list] of lureMap) {
    const weights = list.map((c) => c.weight_lbs).filter((n): n is number => typeof n === 'number');
    const speciesCounts = new Map<string, number>();
    for (const c of list) {
      const s = c.species ?? 'Unknown';
      speciesCounts.set(s, (speciesCounts.get(s) ?? 0) + 1);
    }
    let topSpecies: string | null = null;
    let topN = 0;
    for (const [s, n] of speciesCounts) if (n > topN) { topSpecies = s; topN = n; }

    topLures.push({
      lure,
      count: list.length,
      avgWeight_lbs: weights.length ? Math.round((weights.reduce((s, n) => s + n, 0) / weights.length) * 10) / 10 : null,
      topSpecies,
    });
  }
  topLures.sort((a, b) => b.count - a.count);

  // Recent activity (last 90 days)
  const recentActivity: DayActivity[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = localDateKey(d);
    const bucket = dayMap.get(key);
    recentActivity.push({ key, date: d, count: bucket?.count ?? 0 });
  }

  return {
    total,
    bySpecies,
    byHour: hourCounts.map((count, hour) => ({ hour, count })),
    byMonth: monthCounts.map((count, month) => ({ month, count })),
    topLures: topLures.slice(0, 5),
    conditionsBySpecies,
    recentActivity,
  };
}
