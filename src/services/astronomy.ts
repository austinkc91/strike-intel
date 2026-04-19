import SunCalc from 'suncalc';

/**
 * Wrapper around suncalc for the astronomy values the app uses repeatedly.
 * All times are returned as Date objects in the client's local zone.
 */

export interface DayInfo {
  sunrise: Date;
  sunset: Date;
  solarNoon: Date;
  moonrise: Date | null;    // may be null on days with no moonrise
  moonset: Date | null;
  moonTransit: Date;        // moon overhead
  moonUnderfoot: Date;      // moon underfoot (transit + 12h, wrapped to same day if possible)
  moonIllumination: number; // 0..1
}

/**
 * Returns sun + moon times for a given date and location.
 * `date` is used only for the day; the time component is ignored.
 */
export function getDayInfo(date: Date, lat: number, lng: number): DayInfo {
  const sunTimes = SunCalc.getTimes(date, lat, lng);
  const moonTimes = SunCalc.getMoonTimes(date, lat, lng, false);
  const illum = SunCalc.getMoonIllumination(date);

  // SunCalc doesn't give us moon transit directly; derive it by scanning
  // a 24-hour window for peak altitude (1-minute resolution is overkill;
  // 15-minute sweep then refine).
  const moonTransit = findMoonTransit(date, lat, lng);
  const underfoot = new Date(moonTransit.getTime() + 12 * 60 * 60 * 1000);
  // Keep underfoot on the same date when possible by shifting back a day if
  // it overflows beyond midnight.
  if (underfoot.getDate() !== date.getDate()) {
    const earlier = new Date(moonTransit.getTime() - 12 * 60 * 60 * 1000);
    // Use whichever underfoot lands within the requested day
    if (earlier.getDate() === date.getDate()) {
      return {
        sunrise: sunTimes.sunrise,
        sunset: sunTimes.sunset,
        solarNoon: sunTimes.solarNoon,
        moonrise: moonTimes.rise ?? null,
        moonset: moonTimes.set ?? null,
        moonTransit,
        moonUnderfoot: earlier,
        moonIllumination: illum.fraction,
      };
    }
  }

  return {
    sunrise: sunTimes.sunrise,
    sunset: sunTimes.sunset,
    solarNoon: sunTimes.solarNoon,
    moonrise: moonTimes.rise ?? null,
    moonset: moonTimes.set ?? null,
    moonTransit,
    moonUnderfoot: underfoot,
    moonIllumination: illum.fraction,
  };
}

function findMoonTransit(date: Date, lat: number, lng: number): Date {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  let bestAlt = -Infinity;
  let bestTime = dayStart;
  // Coarse scan at 15 min
  for (let m = 0; m < 24 * 60; m += 15) {
    const t = new Date(dayStart.getTime() + m * 60 * 1000);
    const pos = SunCalc.getMoonPosition(t, lat, lng);
    if (pos.altitude > bestAlt) {
      bestAlt = pos.altitude;
      bestTime = t;
    }
  }
  // Refine at 1 min around the best time
  const refineStart = new Date(bestTime.getTime() - 15 * 60 * 1000);
  const refineEnd = new Date(bestTime.getTime() + 15 * 60 * 1000);
  for (let t = refineStart.getTime(); t <= refineEnd.getTime(); t += 60 * 1000) {
    const when = new Date(t);
    const pos = SunCalc.getMoonPosition(when, lat, lng);
    if (pos.altitude > bestAlt) {
      bestAlt = pos.altitude;
      bestTime = when;
    }
  }
  return bestTime;
}

/** Returns fractional hours since midnight of `d` for a given instant. */
export function hoursOfDay(d: Date): number {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}
