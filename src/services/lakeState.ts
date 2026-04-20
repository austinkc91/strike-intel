/**
 * USACE Lake state for Lake Texoma (project DENI at Denison Dam).
 *
 * Pulls elevation + reservoir outflow from the USACE CWMS Data API
 * (cwms-data.usace.army.mil), which exposes hourly time-series for every
 * Corps reservoir with `Access-Control-Allow-Origin: *` — no backend
 * proxy required.
 *
 * For striper anglers on Texoma the discharge below the dam is the single
 * most actionable signal. When generation kicks on, fish stack up in the
 * tailrace and the bite turns on through the lower lake.
 */

const CDA_BASE = 'https://cwms-data.usace.army.mil/cwms-data/timeseries';

// Time-series names confirmed live (April 2026).
const TS_ELEV = 'DENI.Elev.Inst.1Hour.0.Ccp-Rev';                       // ft
const TS_FLOW = 'DENI.Flow-Res Out.Inst.1Hour.0.Rev-Regi-Flowgroup';    // cfs (auto-converted)

export interface LakeStateSnapshot {
  /** Pool elevation in feet, latest reading. */
  elevation_ft: number;
  /** ft change vs ~24h ago. Positive = rising. */
  elevation24hDelta_ft: number;
  /** ft change vs ~7d ago. Positive = rising. */
  elevation7dDelta_ft: number;
  /** Latest outflow at the dam in cubic feet per second. */
  releaseFlow_cfs: number;
  /** Mean outflow over the last 6 hours in cfs. */
  releaseAvg6h_cfs: number;
  /** True when current outflow is materially above minimum-flow baseline
   *  (~50 cfs at Texoma). When true, generation is likely on and stripers
   *  feed below the dam. */
  generating: boolean;
  /** Trend of release over last 6 hours. */
  releaseTrend: 'climbing' | 'falling' | 'steady';
  /** Timestamp of the freshest reading we used. */
  asOf: Date;
}

interface CdaTsResponse {
  units: string;
  values: Array<[number, number, number]>; // [epochMs, value, quality]
}

async function fetchTs(name: string, beginIso: string, endIso: string): Promise<CdaTsResponse | null> {
  const url = new URL(CDA_BASE);
  url.searchParams.set('office', 'SWT');
  url.searchParams.set('name', name);
  url.searchParams.set('begin', beginIso);
  url.searchParams.set('end', endIso);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return (await res.json()) as CdaTsResponse;
  } catch {
    return null;
  }
}

function lastValid(values: Array<[number, number, number]>): [number, number] | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i][1];
    if (Number.isFinite(v)) return [values[i][0], v];
  }
  return null;
}

function valueAtOrBefore(
  values: Array<[number, number, number]>,
  targetMs: number,
): number | null {
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const [ms, v] of values) {
    if (!Number.isFinite(v)) continue;
    if (ms > targetMs) continue;
    const diff = targetMs - ms;
    if (diff < bestDiff) { bestDiff = diff; best = v; }
  }
  return best;
}

let cached: { data: LakeStateSnapshot; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — USACE refreshes hourly

export async function fetchLakeStateTexoma(): Promise<LakeStateSnapshot | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  const now = Date.now();
  // Pull the last 8 days of elevation so we can compute 24h + 7d deltas
  // and the last 8 hours of outflow so we can spot rising/falling release.
  const elevBegin = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
  const flowBegin = new Date(now - 8 * 60 * 60 * 1000).toISOString();
  const end = new Date(now + 60 * 60 * 1000).toISOString(); // small forward window

  const [elev, flow] = await Promise.all([
    fetchTs(TS_ELEV, elevBegin, end),
    fetchTs(TS_FLOW, flowBegin, end),
  ]);

  if (!elev || !flow) return null;

  const elevLast = lastValid(elev.values);
  const flowLast = lastValid(flow.values);
  if (!elevLast || !flowLast) return null;

  const [asOfMs, elevation_ft] = elevLast;
  const [, releaseFlow_cfs] = flowLast;

  const elevAt24hAgo = valueAtOrBefore(elev.values, asOfMs - 24 * 60 * 60 * 1000);
  const elevAt7dAgo = valueAtOrBefore(elev.values, asOfMs - 7 * 24 * 60 * 60 * 1000);

  // Mean of the most recent 6 hourly samples.
  const recentFlow = flow.values.slice(-6).map((v) => v[1]).filter(Number.isFinite);
  const releaseAvg6h_cfs = recentFlow.length > 0
    ? recentFlow.reduce((s, v) => s + v, 0) / recentFlow.length
    : releaseFlow_cfs;

  // Trend: compare last hour to 6 hours ago.
  const flow6hAgo = valueAtOrBefore(flow.values, asOfMs - 6 * 60 * 60 * 1000);
  let releaseTrend: LakeStateSnapshot['releaseTrend'] = 'steady';
  if (flow6hAgo != null && Math.abs(releaseFlow_cfs - flow6hAgo) > Math.max(50, flow6hAgo * 0.15)) {
    releaseTrend = releaseFlow_cfs > flow6hAgo ? 'climbing' : 'falling';
  }

  // Texoma's minimum baseline release is ~20-50 cfs. Anything well above
  // that (~500+) implies generation. Pick a conservative threshold so we
  // don't flag a tiny fluctuation as generation.
  const generating = releaseFlow_cfs > 500;

  const snapshot: LakeStateSnapshot = {
    elevation_ft: Math.round(elevation_ft * 100) / 100,
    elevation24hDelta_ft: elevAt24hAgo != null ? Math.round((elevation_ft - elevAt24hAgo) * 100) / 100 : 0,
    elevation7dDelta_ft: elevAt7dAgo != null ? Math.round((elevation_ft - elevAt7dAgo) * 100) / 100 : 0,
    releaseFlow_cfs: Math.round(releaseFlow_cfs),
    releaseAvg6h_cfs: Math.round(releaseAvg6h_cfs),
    generating,
    releaseTrend,
    asOf: new Date(asOfMs),
  };

  cached = { data: snapshot, fetchedAt: Date.now() };
  return snapshot;
}
