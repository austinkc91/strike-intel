// Solunar theory feeding window calculator
// Major periods: moon overhead (transit) and moon underfoot (opposite transit)
// Minor periods: moonrise and moonset
// Each window is approximately 1-2 hours
//
// Astronomy is computed via suncalc (see src/services/astronomy.ts) — accurate
// to within a minute for moonrise, moonset, and transit at any latitude.

import { getDayInfo } from './astronomy';

export interface SolunarWindow {
  start: Date;
  end: Date;
  type: 'major' | 'minor';
  label: string;
}

export interface SolunarDay {
  windows: SolunarWindow[];
  rating: number; // 1-5 (5 = best fishing, new/full moon)
}

export function getSolunarWindows(
  date: Date,
  latitude: number,
  longitude = -96.57, // default to Texoma longitude; callers should pass real lng
): SolunarDay {
  const info = getDayInfo(date, latitude, longitude);
  const moonTimes = {
    rise: info.moonrise,
    set: info.moonset,
    transit: info.moonTransit,
    underfoot: info.moonUnderfoot,
  };
  const windows: SolunarWindow[] = [];

  const majorDurationMs = 2 * 60 * 60 * 1000; // 2 hours
  const minorDurationMs = 1 * 60 * 60 * 1000; // 1 hour

  // Major: Moon overhead (transit)
  windows.push({
    start: new Date(moonTimes.transit.getTime() - majorDurationMs / 2),
    end: new Date(moonTimes.transit.getTime() + majorDurationMs / 2),
    type: 'major',
    label: 'Moon Overhead',
  });

  // Major: Moon underfoot
  windows.push({
    start: new Date(moonTimes.underfoot.getTime() - majorDurationMs / 2),
    end: new Date(moonTimes.underfoot.getTime() + majorDurationMs / 2),
    type: 'major',
    label: 'Moon Underfoot',
  });

  // Minor: Moonrise
  if (moonTimes.rise) {
    windows.push({
      start: new Date(moonTimes.rise.getTime() - minorDurationMs / 2),
      end: new Date(moonTimes.rise.getTime() + minorDurationMs / 2),
      type: 'minor',
      label: 'Moonrise',
    });
  }

  // Minor: Moonset
  if (moonTimes.set) {
    windows.push({
      start: new Date(moonTimes.set.getTime() - minorDurationMs / 2),
      end: new Date(moonTimes.set.getTime() + minorDurationMs / 2),
      type: 'minor',
      label: 'Moonset',
    });
  }

  // Filter to windows within the day (6am to 10pm)
  const dayStart = new Date(date);
  dayStart.setHours(5, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 0, 0, 0);

  const dayWindows = windows.filter(
    (w) => w.end.getTime() > dayStart.getTime() && w.start.getTime() < dayEnd.getTime(),
  );

  // Rating based on moon phase (new/full = 5, quarters = 3, crescents = 2)
  // Inline moon age calc to avoid circular dependency
  const knownNew = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
  const diffMs2 = date.getTime() - knownNew.getTime();
  let moonAge = (diffMs2 / (1000 * 60 * 60 * 24)) % 29.53058770576;
  if (moonAge < 0) moonAge += 29.53058770576;
  const moonPhase = moonAge < 1.85 || moonAge >= 27.68 ? 'new'
    : moonAge < 9.22 ? 'waxing_crescent_quarter'
    : moonAge < 12.91 ? 'waxing_gibbous'
    : moonAge < 16.61 ? 'full'
    : moonAge < 20.30 ? 'waning_gibbous'
    : 'waning_crescent_quarter';
  let rating: number;
  if (moonPhase === 'new' || moonPhase === 'full') {
    rating = 5;
  } else if (moonPhase === 'waxing_gibbous' || moonPhase === 'waning_gibbous') {
    rating = 4;
  } else if (moonPhase === 'waxing_crescent_quarter' || moonPhase === 'waning_crescent_quarter') {
    rating = 3;
  } else {
    rating = 2;
  }

  return { windows: dayWindows, rating };
}

export function isInFeedingWindow(
  timestamp: Date,
  windows: SolunarWindow[],
): { period: 'major' | 'minor' | 'none'; minutesToWindow: number } {
  for (const w of windows) {
    if (timestamp >= w.start && timestamp <= w.end) {
      return { period: w.type, minutesToWindow: 0 };
    }
  }

  // Find nearest window
  let minDist = Infinity;
  for (const w of windows) {
    const distToStart = Math.abs(w.start.getTime() - timestamp.getTime());
    const distToEnd = Math.abs(w.end.getTime() - timestamp.getTime());
    const dist = Math.min(distToStart, distToEnd);
    if (dist < minDist) {
      minDist = dist;
    }
  }

  return {
    period: 'none',
    minutesToWindow: Math.round(minDist / (1000 * 60)),
  };
}
