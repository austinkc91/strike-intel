// Catch enrichment — pull weather, water temp, spot characteristics, solunar
// for a given catch and patch the Firestore doc. Shared by:
//   - the post-save hook in MapPage (fires for every new/edited catch)
//   - the backfill service (fills in catches that pre-date enrichment or
//     where the original fetch failed)
//
// All four data fetches honor the catch's recorded `timestamp`, so a
// backdated log gets the historical conditions, not "now."

import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { fetchWeatherForCatch } from './weather';
import { fetchSpotCharacteristics } from './spotCharacteristics';
import { fetchWaterTempNearAt } from './waterTemp';
import { getMoonPhase } from './moonPhase';
import { getSolunarWindows, isInFeedingWindow } from './solunar';
import type { GeoPoint } from '../types';

export interface EnrichCatchResult {
  wroteWeather: boolean;
  wroteCharacteristics: boolean;
  wroteSolunar: boolean;
  waterTempF: number | null;
}

/**
 * Run the full enrichment pipeline for a single catch and write the result
 * back to Firestore. Returns a summary describing which fields were written
 * (lets callers like the backfill service track partial successes).
 *
 * Failures in any single fetch are logged but don't abort the others — a
 * catch with weather but no water temp is still better than no enrichment.
 */
export async function enrichCatchById(
  lakeId: string,
  catchId: string,
  location: GeoPoint,
  timestamp: Date,
  lakeUsgsStationId: string | null,
): Promise<EnrichCatchResult> {
  const catchRef = doc(db, 'lakes', lakeId, 'catches', catchId);

  console.log('[enrichCatch] START', catchId, {
    timestamp: timestamp.toISOString(),
    lat: location.latitude,
    lng: location.longitude,
  });

  const [weather, characteristics, waterTemp] = await Promise.all([
    fetchWeatherForCatch(location.latitude, location.longitude, timestamp).catch((e) => {
      console.warn('[enrichCatch] weather fetch failed:', e);
      return null;
    }),
    fetchSpotCharacteristics(lakeId, location).catch((e) => {
      console.warn('[enrichCatch] spot characteristics fetch failed:', e);
      return null;
    }),
    fetchWaterTempNearAt(location.latitude, location.longitude, timestamp, lakeUsgsStationId).catch((e) => {
      console.warn('[enrichCatch] water temp fetch failed:', e);
      return null;
    }),
  ]);

  const moon = getMoonPhase(timestamp);
  const solunar = getSolunarWindows(timestamp, location.latitude, location.longitude);
  const feedingStatus = isInFeedingWindow(timestamp, solunar.windows);

  const updates: Record<string, unknown> = {
    solunar: { period: feedingStatus.period, minutesToWindow: feedingStatus.minutesToWindow },
  };

  if (weather) {
    updates.weather = {
      ...weather,
      moon_phase: moon.phase,
      water_temp_f: waterTemp?.temp_f ?? null,
    };
  }
  if (characteristics) {
    updates.characteristics = characteristics;
  }

  await updateDoc(catchRef, updates);
  console.log('[enrichCatch] WROTE', catchId, 'fields:', Object.keys(updates));

  return {
    wroteWeather: !!weather,
    wroteCharacteristics: !!characteristics,
    wroteSolunar: true,
    waterTempF: waterTemp?.temp_f ?? null,
  };
}

/**
 * Patch only the water temp on an already-enriched catch. Used by the
 * backfill flow when `weather` is populated but `water_temp_f` is null
 * (e.g. USGS was unreachable when the catch was first enriched).
 *
 * Returns the temp written, or null if USGS still has nothing.
 */
export async function backfillWaterTempOnly(
  lakeId: string,
  catchId: string,
  location: GeoPoint,
  timestamp: Date,
  existingWeather: Record<string, unknown>,
  lakeUsgsStationId: string | null,
): Promise<number | null> {
  const result = await fetchWaterTempNearAt(
    location.latitude,
    location.longitude,
    timestamp,
    lakeUsgsStationId,
  ).catch(() => null);

  if (!result) return null;

  const catchRef = doc(db, 'lakes', lakeId, 'catches', catchId);
  await updateDoc(catchRef, {
    weather: { ...existingWeather, water_temp_f: result.temp_f },
  });
  return result.temp_f;
}
