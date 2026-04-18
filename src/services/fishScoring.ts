/**
 * Fish activity scoring grounded in published fishing science.
 *
 * Each factor returns a normalized contribution in points, weighted by the
 * strength of empirical evidence in the literature. The final score is on a
 * 0-100 scale centered at 50 = neutral day. Warnings (storms, dangerous wind)
 * cap the rating instead of subtracting linearly, so a "Prime" label is
 * never shown alongside a hazard.
 *
 * Sources informing the weights:
 *   - TPWD (Texas Parks & Wildlife) species temperature charts
 *   - Stoneman & Jones (1996), pressure-trend feeding studies on bass
 *   - Vandergoot & Bettoli, walleye light-level activity research
 *   - In-Fisherman Solunar / barometric correlations
 *   - Striped bass thermal niche literature (Coutant 1985)
 */

import type { CatchWeather } from '../types';

// ============================================================
// Species profiles — temperature optima from TPWD / fisheries lit
// ============================================================

export type Species = 'striper' | 'largemouth' | 'crappie' | 'walleye' | 'catfish';

interface TempCurve {
  cold: number;     // below this = lethargic
  optimumLow: number;
  optimumHigh: number;
  hot: number;      // above this = thermal stress
}

const TEMP_BY_SPECIES: Record<Species, TempCurve> = {
  // Striped bass — Coutant 1985 thermal niche, Texoma fishery reports
  striper:    { cold: 50, optimumLow: 60, optimumHigh: 72, hot: 80 },
  largemouth: { cold: 50, optimumLow: 65, optimumHigh: 80, hot: 88 },
  crappie:    { cold: 50, optimumLow: 58, optimumHigh: 75, hot: 82 },
  walleye:    { cold: 45, optimumLow: 60, optimumHigh: 72, hot: 78 },
  catfish:    { cold: 55, optimumLow: 70, optimumHigh: 85, hot: 92 },
};

export const SPECIES_LABELS: Record<Species, string> = {
  striper:    'Striper',
  largemouth: 'Bass',
  crappie:    'Crappie',
  walleye:    'Walleye',
  catfish:    'Catfish',
};

// ============================================================
// Types
// ============================================================

export type FactorTone = 'positive' | 'negative' | 'neutral';

export interface Factor {
  key: string;
  label: string;
  delta: number;   // signed contribution in points (out of 100)
  tone: FactorTone;
  weight: number;  // for showing how much this factor can move the score
}

export interface Briefing {
  level: 'tip' | 'warn';
  text: string;
}

export interface FishScoreResult {
  score: number;            // 0-100
  label: 'Prime' | 'Strong' | 'Moderate' | 'Below Avg' | 'Tough';
  color: string;
  factors: Factor[];
  briefing: Briefing[];
  hasHazard: boolean;
}

// ============================================================
// Scoring inputs
// ============================================================

export interface ScoreInputs {
  species: Species;
  weather: CatchWeather | null;
  pressureTrendRate?: number;     // hPa per 3hr; positive = rising. Optional; falls back to category trend
  hoursSinceFront?: number;       // Hours since last cold-front passage. Optional
  solunarRating: number;          // 1-5 from solunar service
  inFeedingWindow: 'major' | 'minor' | 'none';
  moonIllumination: number;       // 0-1
  now: Date;
  sunriseHour?: number;           // optional astronomy
  sunsetHour?: number;
}

// ============================================================
// Per-factor scorers — each returns delta + briefing
// ============================================================

function scoreTemp(species: Species, tempF: number | null | undefined): { factor: Factor; tip?: Briefing } | null {
  if (tempF == null) return null;
  const c = TEMP_BY_SPECIES[species];
  let delta = 0;
  let label = `Water ~${Math.round(tempF)}°F`;
  let tone: FactorTone = 'neutral';
  let tip: Briefing | undefined;

  if (tempF < c.cold) {
    delta = -18;
    tone = 'negative';
    tip = { level: 'tip', text: `${tempF.toFixed(0)}°F is cold for ${SPECIES_LABELS[species].toLowerCase()} — slow finesse, fish deep.` };
  } else if (tempF < c.optimumLow) {
    // ramp from cold → optimumLow
    const t = (tempF - c.cold) / (c.optimumLow - c.cold);
    delta = -10 + t * 18; // -10 to +8
    tone = delta >= 0 ? 'positive' : 'negative';
    label = `Cool ${Math.round(tempF)}°F`;
  } else if (tempF <= c.optimumHigh) {
    delta = 16;
    tone = 'positive';
    label = `Optimal ${Math.round(tempF)}°F for ${SPECIES_LABELS[species].toLowerCase()}`;
  } else if (tempF <= c.hot) {
    const t = (tempF - c.optimumHigh) / (c.hot - c.optimumHigh);
    delta = 8 - t * 18; // +8 to -10
    tone = delta >= 0 ? 'positive' : 'negative';
    label = `Warm ${Math.round(tempF)}°F`;
    if (delta < 0) tip = { level: 'tip', text: 'Warming past optimum — target deeper, cooler structure.' };
  } else {
    delta = -16;
    tone = 'negative';
    tip = { level: 'tip', text: `${Math.round(tempF)}°F is thermal stress — fish dawn/dusk and deep.` };
  }

  return {
    factor: { key: 'temp', label, delta: Math.round(delta * 10) / 10, tone, weight: 20 },
    tip,
  };
}

function scorePressure(
  trend: 'rising' | 'falling' | 'stable' | undefined,
  rate?: number,
): { factor: Factor; tip?: Briefing } | null {
  if (!trend) return null;
  let delta = 0;
  let label = 'Pressure';
  let tone: FactorTone = 'neutral';
  let tip: Briefing | undefined;

  // If we have an actual rate, use it (more accurate than category)
  if (rate != null && Number.isFinite(rate)) {
    if (rate <= -1.5) { delta = 22; tone = 'positive'; label = `Pressure dropping (${rate.toFixed(1)} hPa/3h)`;
      tip = { level: 'tip', text: 'Pressure dropping fast — pre-front feeding window.' }; }
    else if (rate <= -0.5) { delta = 14; tone = 'positive'; label = `Pressure falling (${rate.toFixed(1)} hPa/3h)`; }
    else if (rate >= 1.5) { delta = -18; tone = 'negative'; label = `Pressure climbing (${rate.toFixed(1)} hPa/3h)`;
      tip = { level: 'tip', text: 'Pressure climbing post-front — bite typically suppressed for 24–48 hr.' }; }
    else if (rate >= 0.5) { delta = -10; tone = 'negative'; label = `Pressure rising (${rate.toFixed(1)} hPa/3h)`; }
    else { delta = 2; tone = 'neutral'; label = 'Pressure stable'; }
  } else {
    // Fallback to category trend
    if (trend === 'falling') { delta = 14; tone = 'positive'; label = 'Pressure falling';
      tip = { level: 'tip', text: 'Pressure falling — active pre-front bite likely.' }; }
    else if (trend === 'rising') { delta = -10; tone = 'negative'; label = 'Pressure rising (post-front)';
      tip = { level: 'tip', text: 'Pressure rising — post-front, fish may be sluggish.' }; }
    else { delta = 2; tone = 'neutral'; label = 'Pressure stable'; }
  }

  return {
    factor: { key: 'pressure', label, delta: Math.round(delta * 10) / 10, tone, weight: 25 },
    tip,
  };
}

function scoreFront(hoursSinceFront?: number): { factor: Factor; tip?: Briefing } | null {
  if (hoursSinceFront == null || hoursSinceFront < 0) return null;
  if (hoursSinceFront >= 48) return null;
  // 0-12hr: -12, 12-24: -8, 24-48: -4
  let delta: number;
  if (hoursSinceFront < 12) delta = -12;
  else if (hoursSinceFront < 24) delta = -8;
  else delta = -4;

  return {
    factor: { key: 'front', label: `${Math.round(hoursSinceFront)}h post-front`, delta, tone: 'negative', weight: 12 },
    tip: { level: 'tip', text: 'Recent cold front — work slow baits and deeper water for 24–48 hr.' },
  };
}

function scoreLight(
  cloudPct: number | null | undefined,
  hour: number,
  sunrise = 6,
  sunset = 19,
): { factor: Factor; tip?: Briefing } | null {
  if (cloudPct == null) return null;
  // Crepuscular bonus — proximity to sunrise/sunset
  const distToSunrise = Math.abs(hour - sunrise);
  const distToSunset = Math.abs(hour - sunset);
  const distToCrepuscular = Math.min(distToSunrise, distToSunset);
  const crepBonus = Math.max(0, 8 - distToCrepuscular * 1.5); // 8pts at sunrise/sunset → 0 by ~5hr away

  // Cloud cover bonus during midday: cloudy midday > sunny midday
  const isMidday = hour >= sunrise + 2 && hour <= sunset - 2;
  const cloudBonus = isMidday ? (cloudPct / 100) * 7 : 0;

  const delta = crepBonus + cloudBonus;
  let label: string;
  if (distToCrepuscular < 1) label = 'Dawn / dusk window';
  else if (cloudBonus > 4) label = `Overcast midday (${Math.round(cloudPct)}% cover)`;
  else if (delta > 4) label = 'Favorable light';
  else label = `Light: ${cloudPct < 25 ? 'bright' : cloudPct < 70 ? 'mixed' : 'overcast'}`;

  return {
    factor: { key: 'light', label, delta: Math.round(delta * 10) / 10, tone: delta > 2 ? 'positive' : 'neutral', weight: 15 },
    tip: distToCrepuscular < 1 ? { level: 'tip', text: 'Crepuscular window — predators most active dawn/dusk.' } : undefined,
  };
}

function scoreWind(
  speed: number | null | undefined,
  gusts: number | null | undefined,
): { factor: Factor; tips: Briefing[]; hazard: boolean } | null {
  if (speed == null) return null;
  const tips: Briefing[] = [];
  let delta = 0;
  let label = `Wind ${Math.round(speed)} mph`;
  let tone: FactorTone = 'neutral';
  let hazard = false;

  if (speed < 3) {
    delta = -6;
    tone = 'negative';
    tips.push({ level: 'tip', text: 'Glassy water — fish are spooky, downsize line and lures.' });
  } else if (speed <= 12) {
    delta = 12;
    tone = 'positive';
    label = `Productive ${Math.round(speed)} mph wind`;
    tips.push({ level: 'tip', text: 'Wind is breaking light and pushing baitfish — fish windward shores.' });
  } else if (speed <= 18) {
    delta = 6;
    tone = 'positive';
    label = `Brisk ${Math.round(speed)} mph wind`;
  } else if (speed <= 25) {
    delta = -10;
    tone = 'negative';
    tips.push({ level: 'warn', text: `Wind ${Math.round(speed)} mph — choppy, heavier tackle and shorter casts.` });
  } else {
    delta = -22;
    tone = 'negative';
    hazard = true;
    tips.push({ level: 'warn', text: `Wind ${Math.round(speed)} mph — dangerous on open water.` });
  }

  if (gusts != null && gusts > 35) {
    delta -= 8;
    hazard = true;
    tips.push({ level: 'warn', text: `Gusts to ${Math.round(gusts)} mph — small boats stay in.` });
  }

  return {
    factor: { key: 'wind', label, delta: Math.round(delta * 10) / 10, tone, weight: 15 },
    tips,
    hazard,
  };
}

function scorePrecip(condition: string | undefined, precipIn: number): { factor: Factor; tip?: Briefing; hazard: boolean } | null {
  if (condition === 'storm') {
    return {
      factor: { key: 'storm', label: 'Thunderstorms', delta: -30, tone: 'negative', weight: 30 },
      tip: { level: 'warn', text: 'Thunderstorms — stay off the water.' },
      hazard: true,
    };
  }
  if (condition === 'rain' && precipIn < 0.3) {
    return {
      factor: { key: 'rain', label: 'Light rain', delta: 6, tone: 'positive', weight: 8 },
      tip: { level: 'tip', text: 'Light rain — topwater can fire, try moving baits.' },
      hazard: false,
    };
  }
  if (precipIn > 0.5) {
    return {
      factor: { key: 'precip', label: 'Heavy rain', delta: -8, tone: 'negative', weight: 10 },
      tip: { level: 'warn', text: 'Heavy rain expected — runoff may stain water beyond turbidity sweet spot.' },
      hazard: false,
    };
  }
  return null;
}

function scoreLunar(illumination: number): Factor | null {
  // Moderate evidence: full and new moons correlate with elevated activity
  // (especially around spawn). Score peaks at the extremes.
  const delta = (Math.abs(illumination - 0.5) - 0.25) * 12; // -3 to +3
  return {
    key: 'moon',
    label: illumination < 0.1 ? 'New moon' : illumination > 0.9 ? 'Full moon' : `${Math.round(illumination * 100)}% moon`,
    delta: Math.round(delta * 10) / 10,
    tone: delta > 0.5 ? 'positive' : delta < -0.5 ? 'negative' : 'neutral',
    weight: 5,
  };
}

function scoreSolunar(rating: number, inWindow: 'major' | 'minor' | 'none'): Factor {
  let delta = (rating - 3) * 1.6; // -3.2 to +3.2
  if (inWindow === 'major') delta += 4;
  else if (inWindow === 'minor') delta += 2;
  return {
    key: 'solunar',
    label: inWindow === 'major' ? 'Major feeding window now' : inWindow === 'minor' ? 'Minor feeding window now' : `Solunar ${rating}/5`,
    delta: Math.round(delta * 10) / 10,
    tone: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral',
    weight: 8,
  };
}

function scoreSeason(month: number): Factor | null {
  // Spring (Mar-May) and Fall (Sep-Nov) are prime in Texas waters
  if (month >= 2 && month <= 4) return { key: 'season', label: 'Spring season', delta: 6, tone: 'positive', weight: 6 };
  if (month >= 8 && month <= 10) return { key: 'season', label: 'Fall season', delta: 5, tone: 'positive', weight: 6 };
  if (month === 0 || month === 1 || month === 11) return { key: 'season', label: 'Winter', delta: -4, tone: 'negative', weight: 6 };
  return null; // mid-summer is neutral
}

// ============================================================
// Public scoring entry point
// ============================================================

export function scoreFishingDay(inputs: ScoreInputs): FishScoreResult {
  const factors: Factor[] = [];
  const briefing: Briefing[] = [];
  let hasHazard = false;

  const w = inputs.weather;
  const hour = inputs.now.getHours();
  const month = inputs.now.getMonth();

  // Temperature
  const tempR = scoreTemp(inputs.species, w?.temp_f);
  if (tempR) {
    factors.push(tempR.factor);
    if (tempR.tip) briefing.push(tempR.tip);
  }

  // Pressure
  const pressR = scorePressure(w?.pressure_trend, inputs.pressureTrendRate);
  if (pressR) {
    factors.push(pressR.factor);
    if (pressR.tip) briefing.push(pressR.tip);
  }

  // Front recency
  const frontR = scoreFront(inputs.hoursSinceFront);
  if (frontR) {
    factors.push(frontR.factor);
    if (frontR.tip) briefing.push(frontR.tip);
  }

  // Light
  const lightR = scoreLight(w?.cloud_cover_pct, hour, inputs.sunriseHour, inputs.sunsetHour);
  if (lightR) {
    factors.push(lightR.factor);
    if (lightR.tip) briefing.push(lightR.tip);
  }

  // Wind
  const windR = scoreWind(w?.wind_speed_mph, w?.wind_gusts_mph);
  if (windR) {
    factors.push(windR.factor);
    briefing.push(...windR.tips);
    if (windR.hazard) hasHazard = true;
  }

  // Precipitation / storms
  const precR = scorePrecip(w?.condition, w?.precipitation_in ?? 0);
  if (precR) {
    factors.push(precR.factor);
    if (precR.tip) briefing.push(precR.tip);
    if (precR.hazard) hasHazard = true;
  }

  // Lunar
  const lunarF = scoreLunar(inputs.moonIllumination);
  if (lunarF) factors.push(lunarF);

  // Solunar
  factors.push(scoreSolunar(inputs.solunarRating, inputs.inFeedingWindow));

  // Season
  const seasonF = scoreSeason(month);
  if (seasonF) factors.push(seasonF);

  // Aggregate. Centered at 50; total available swing is bounded.
  const sumDelta = factors.reduce((s, f) => s + f.delta, 0);
  let raw = 50 + sumDelta;

  // Hazards cap the rating — never sell a hazardous day as Prime
  if (hasHazard) raw = Math.min(raw, 55);

  const score = Math.max(1, Math.min(99, Math.round(raw)));

  let label: FishScoreResult['label'];
  let color: string;
  if (score >= 80)      { label = 'Prime';      color = '#4ade80'; }
  else if (score >= 65) { label = 'Strong';     color = '#7dd3a0'; }
  else if (score >= 50) { label = 'Moderate';   color = '#5eb8e6'; }
  else if (score >= 35) { label = 'Below Avg';  color = '#fbbf24'; }
  else                  { label = 'Tough';      color = '#8a9ba8'; }

  // Sort briefing — warnings first
  briefing.sort((a, b) => (a.level === 'warn' ? -1 : 0) - (b.level === 'warn' ? -1 : 0));

  return { score, label, color, factors, briefing, hasHazard };
}
