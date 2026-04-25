// One-time backfill: fill in environmental snapshots on catches that
// pre-date the post-save enrichment hook, or where the original USGS /
// weather fetch failed silently.
//
// Two cases handled:
//   1. weather == null            → run the full enrichment pipeline
//   2. weather.water_temp_f null  → only patch water temp (cheaper, more
//                                    likely to succeed against USGS dv)

import type { Catch } from '../types';
import { enrichCatchById, backfillWaterTempOnly } from './catchEnrichment';

export interface BackfillProgress {
  total: number;
  processed: number;
  fullEnriched: number;
  waterTempOnly: number;
  unresolved: number;
}

export interface BackfillSummary extends BackfillProgress {
  durationMs: number;
}

const THROTTLE_MS = 200;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Walk every catch in the lake and patch missing condition fields. Pass
 * `onProgress` to drive a UI counter — fired after each catch processes.
 *
 * Runs serially (with a small delay) rather than parallel: USGS rate-limits
 * aggressive callers, and most users have <200 catches so the full sweep
 * finishes in under a minute.
 */
export async function backfillCatches(
  lakeId: string,
  lakeUsgsStationId: string | null,
  catches: Catch[],
  onProgress?: (progress: BackfillProgress) => void,
): Promise<BackfillSummary> {
  const start = Date.now();
  const candidates = catches.filter((c) =>
    !c.weather || c.weather.water_temp_f == null,
  );

  const progress: BackfillProgress = {
    total: candidates.length,
    processed: 0,
    fullEnriched: 0,
    waterTempOnly: 0,
    unresolved: 0,
  };

  for (const c of candidates) {
    const ts = c.timestamp?.toDate?.() ?? new Date();
    try {
      if (!c.weather) {
        const result = await enrichCatchById(lakeId, c.id, c.location, ts, lakeUsgsStationId);
        if (result.wroteWeather) progress.fullEnriched += 1;
        else progress.unresolved += 1;
      } else {
        const temp = await backfillWaterTempOnly(
          lakeId,
          c.id,
          c.location,
          ts,
          c.weather as unknown as Record<string, unknown>,
          lakeUsgsStationId,
        );
        if (temp != null) progress.waterTempOnly += 1;
        else progress.unresolved += 1;
      }
    } catch (err) {
      console.warn('[backfillCatches] failed for', c.id, err);
      progress.unresolved += 1;
    }
    progress.processed += 1;
    onProgress?.({ ...progress });
    await sleep(THROTTLE_MS);
  }

  const summary: BackfillSummary = { ...progress, durationMs: Date.now() - start };
  console.log('[backfillCatches] done', summary);
  return summary;
}
