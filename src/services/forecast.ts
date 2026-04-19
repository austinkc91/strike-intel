/**
 * Multi-day fishing forecast. Pulls 7 days of hourly weather from Open-Meteo,
 * picks each day's representative conditions, runs them through scoreFishingDay,
 * and returns a compact per-day summary for the Home page.
 */

import { scoreFishingDay, type Species, type FishScoreResult, type Factor, type Briefing } from './fishScoring';
import { getDayInfo, hoursOfDay } from './astronomy';
import {
  bucketHourlyByDay,
  deriveCondition,
  derivePressureTrend,
  fetchOpenMeteoHourly,
  pressureRate3h,
} from './weatherDerive';
import type { CatchWeather } from '../types';

export interface ForecastDay {
  date: Date;              // midnight local of the day
  score: number;
  label: FishScoreResult['label'];
  color: string;
  peakHour: number;        // hour of day best conditions hit (0-23)
  topBriefing: string | null;
  rep: CatchWeather;       // representative weather used for the day's score
  sunrise: Date;
  sunset: Date;
  factors: Factor[];       // signed contributions that produced `score`
  briefing: Briefing[];    // tips/warnings tied to this day's peak hour
  hasHazard: boolean;
}

/**
 * Fetch 7-day forecast and compute the per-day score, keyed off each day's
 * representative "peak window" — usually mid-morning or mid-afternoon depending
 * on when the best combination of light, pressure, and wind lines up.
 */
export async function computeWeeklyForecast(
  lat: number,
  lng: number,
  species: Species,
  waterTempF: number | null,
): Promise<ForecastDay[]> {
  const data = await fetchOpenMeteoHourly(lat, lng);
  const times = data.time;
  const temps = data.temperature_2m;
  const winds = data.wind_speed_10m;
  const windDirs = data.wind_direction_10m;
  const gusts = data.wind_gusts_10m;
  const clouds = data.cloud_cover;
  const precips = data.precipitation;
  const pressures = data.pressure_msl;

  if (times.length === 0) return [];

  const dayBuckets = bucketHourlyByDay(times);

  const results: ForecastDay[] = [];
  for (const { idxStart, idxEnd } of dayBuckets.values()) {
    const dayMid = new Date(times[Math.floor((idxStart + idxEnd) / 2)]);
    const dayStart = new Date(dayMid.getFullYear(), dayMid.getMonth(), dayMid.getDate());
    const info = getDayInfo(dayStart, lat, lng);

    // Pick the day's peak hour — the one whose score is highest when we
    // sample 3 candidate hours (dawn + midday + dusk) and pick the winner.
    const candidates = [
      Math.round(hoursOfDay(info.sunrise) + 0.5),  // just after sunrise
      12,                                           // solar-noon-ish
      Math.round(hoursOfDay(info.sunset) - 0.5),   // just before sunset
    ];
    let best: {
      score: number;
      label: FishScoreResult['label'];
      color: string;
      briefing: string | null;
      hour: number;
      rep: CatchWeather;
      factors: Factor[];
      fullBriefing: Briefing[];
      hasHazard: boolean;
    } | null = null;

    for (const h of candidates) {
      const globalIdx = idxStart + Math.max(0, Math.min(idxEnd - idxStart, h));
      if (globalIdx < 0 || globalIdx >= times.length) continue;

      const cloud = clouds[globalIdx] ?? 0;
      const precip = precips[globalIdx] ?? 0;
      const gust = gusts[globalIdx] ?? 0;

      const rep: CatchWeather = {
        temp_f: temps[globalIdx] ?? 0,
        wind_speed_mph: winds[globalIdx] ?? 0,
        wind_direction_deg: windDirs[globalIdx] ?? 0,
        wind_gusts_mph: gust,
        cloud_cover_pct: cloud,
        precipitation_in: precip,
        pressure_hpa: pressures[globalIdx] ?? 1013,
        condition: deriveCondition(cloud, precip, gust),
        pressure_trend: derivePressureTrend(pressures, globalIdx),
        moon_phase: null as unknown as string, // not used in scoring here
        water_temp_f: waterTempF,
      };

      // Rough feeding-window hint: we don't compute solunar per hour here;
      // pass 'none' and a middling 3/5 rating so the forecast leans on
      // weather + species temp + pressure rate to separate days.
      const r = scoreFishingDay({
        species,
        weather: rep,
        pressureTrendRate: pressureRate3h(pressures, globalIdx),
        solunarRating: 3,
        inFeedingWindow: 'none',
        moonIllumination: info.moonIllumination,
        now: new Date(times[globalIdx]),
        sunriseHour: hoursOfDay(info.sunrise),
        sunsetHour: hoursOfDay(info.sunset),
      });

      if (!best || r.score > best.score) {
        best = {
          score: r.score,
          label: r.label,
          color: r.color,
          briefing: r.briefing[0]?.text ?? null,
          hour: h,
          rep,
          factors: r.factors,
          fullBriefing: r.briefing,
          hasHazard: r.hasHazard,
        };
      }
    }

    if (best) {
      results.push({
        date: dayStart,
        score: best.score,
        label: best.label,
        color: best.color,
        peakHour: best.hour,
        topBriefing: best.briefing,
        rep: best.rep,
        sunrise: info.sunrise,
        sunset: info.sunset,
        factors: best.factors,
        briefing: best.fullBriefing,
        hasHazard: best.hasHazard,
      });
    }
  }

  return results;
}
