// Core pattern matching engine
// Compares a reference catch's "spot signature" against an analysis grid
// to find similar fishing spots on the lake.

import { getWindExposureForDirection } from './windExposure';

// ============================================================
// Types
// ============================================================

export interface SpotSignature {
  depth: number;              // 0-1 normalized
  depthChange: number;        // 0-1 — how much depth changes nearby (structure transition)
  slope: number;              // 0-1 normalized
  dropoffProximity: number;   // 0-1 (1 = closest)
  channelProximity: number;   // 0-1
  pointProximity: number;     // 0-1
  shorelineDistance: number;   // 0-1
  windExposure: number;       // 0-1
  windAdvantage: number;      // 0-1 — windward shore bonus (bait pushed here)
  timeOfDay: number;          // 0-1
  season: number;             // 0-1
  moonPhase: number;          // 0-1 (illumination)
}

export interface PatternWeights {
  depth: number;
  depthChange: number;
  slope: number;
  dropoffProximity: number;
  channelProximity: number;
  pointProximity: number;
  shorelineDistance: number;
  windExposure: number;
  windAdvantage: number;
  timeOfDay: number;
  season: number;
  moonPhase: number;
}

export const DEFAULT_WEIGHTS: PatternWeights = {
  depth: 1.0,
  depthChange: 0.8,
  slope: 0.7,
  dropoffProximity: 0.9,
  channelProximity: 0.6,
  pointProximity: 0.5,
  shorelineDistance: 0.4,
  windExposure: 0.6,
  windAdvantage: 0.7,
  timeOfDay: 0.3,
  season: 0.5,
  moonPhase: 0.2,
};

// ============================================================
// Species-specific weight profiles
// ============================================================

export const SPECIES_WEIGHTS: Record<string, Partial<PatternWeights>> = {
  'Largemouth Bass': {
    depth: 0.8,
    depthChange: 1.0,
    slope: 0.8,
    dropoffProximity: 1.0,
    channelProximity: 0.4,
    pointProximity: 0.9,
    shorelineDistance: 0.7,
    windExposure: 0.5,
    windAdvantage: 0.8,
  },
  'Smallmouth Bass': {
    depth: 0.9,
    depthChange: 1.0,
    slope: 0.9,
    dropoffProximity: 1.0,
    channelProximity: 0.5,
    pointProximity: 0.8,
    shorelineDistance: 0.5,
    windExposure: 0.6,
    windAdvantage: 0.7,
  },
  'Striped Bass': {
    depth: 1.0,
    depthChange: 0.7,
    slope: 0.4,
    dropoffProximity: 0.6,
    channelProximity: 1.0,
    pointProximity: 0.3,
    shorelineDistance: 0.2,
    windExposure: 0.8,
    windAdvantage: 0.6,
  },
  'Walleye': {
    depth: 1.0,
    depthChange: 0.9,
    slope: 0.6,
    dropoffProximity: 0.8,
    channelProximity: 0.7,
    pointProximity: 0.6,
    shorelineDistance: 0.3,
    windExposure: 0.7,
    windAdvantage: 0.8,
  },
  'Crappie': {
    depth: 0.9,
    depthChange: 0.6,
    slope: 0.3,
    dropoffProximity: 0.5,
    channelProximity: 0.7,
    pointProximity: 0.4,
    shorelineDistance: 0.6,
    windExposure: 0.3,
    windAdvantage: 0.4,
  },
  'Channel Catfish': {
    depth: 0.8,
    depthChange: 0.5,
    slope: 0.3,
    dropoffProximity: 0.4,
    channelProximity: 1.0,
    pointProximity: 0.2,
    shorelineDistance: 0.3,
    windExposure: 0.4,
    windAdvantage: 0.3,
  },
  'Bluegill': {
    depth: 0.6,
    depthChange: 0.4,
    slope: 0.3,
    dropoffProximity: 0.3,
    channelProximity: 0.2,
    pointProximity: 0.5,
    shorelineDistance: 0.9,
    windExposure: 0.3,
    windAdvantage: 0.5,
  },
};

// Map fishScoring.Species short keys to the SPECIES_WEIGHTS display-name keys
// so the trip planner can reuse the same weight profiles without duplicating.
const SPECIES_KEY_ALIAS: Record<string, string> = {
  striper: 'Striped Bass',
  largemouth: 'Largemouth Bass',
  smallmouth: 'Smallmouth Bass',
  walleye: 'Walleye',
  crappie: 'Crappie',
  catfish: 'Channel Catfish',
  bluegill: 'Bluegill',
};

export function getSpeciesWeights(species: string | null): PatternWeights {
  if (!species) return { ...DEFAULT_WEIGHTS };
  const key = SPECIES_WEIGHTS[species] ? species : SPECIES_KEY_ALIAS[species];
  const overrides = key ? SPECIES_WEIGHTS[key] : undefined;
  if (!overrides) return { ...DEFAULT_WEIGHTS };
  return { ...DEFAULT_WEIGHTS, ...overrides };
}

// ============================================================
// Time-of-day depth adjustment
// ============================================================

/**
 * Fish move shallower at dawn/dusk and deeper midday.
 * Returns a multiplier to adjust the target depth comparison.
 * < 1 = fish are shallower than recorded, > 1 = deeper.
 */
function timeDepthFactor(hour: number): number {
  // Dawn (5-7): fish shallow → factor 0.7
  // Morning (7-10): transitioning → factor 0.85
  // Midday (10-15): deep → factor 1.15
  // Afternoon (15-18): transitioning → factor 0.9
  // Dusk (18-20): fish shallow → factor 0.7
  // Night (20-5): variable → factor 0.9
  if (hour >= 5 && hour < 7) return 0.7;
  if (hour >= 7 && hour < 10) return 0.85;
  if (hour >= 10 && hour < 15) return 1.15;
  if (hour >= 15 && hour < 18) return 0.9;
  if (hour >= 18 && hour < 20) return 0.7;
  return 0.9;
}

// ============================================================
// Grid cell type
// ============================================================

export interface GridCell {
  id: number;
  lng: number;
  lat: number;
  depth_ft: number;
  slope_deg: number;
  dropoffDist_ft: number;
  channelDist_ft: number;
  pointDist_ft: number;
  shorelineDist_ft: number;
  windExposure8: Record<string, number>;
}

export interface MatchResult {
  cellId: number;
  lng: number;
  lat: number;
  score: number;
  signature: SpotSignature;
  /** True when this is the cell anchoring the reference signature — i.e.
   *  the user's own catch spot. Lets the UI flag it as "Your spot" so the
   *  user doesn't think the engine is just suggesting somewhere they've
   *  already fished. */
  isOrigin?: boolean;
}

export interface NormRanges {
  maxDepth: number;
  maxSlope: number;
  maxDropoffDist: number;
  maxChannelDist: number;
  maxPointDist: number;
  maxShorelineDist: number;
  maxDepthChange: number;
}

// ============================================================
// Normalization
// ============================================================

function normalize(value: number, max: number): number {
  if (max <= 0) return 0.5;
  return Math.min(1, Math.max(0, value / max));
}

function inverseNormalize(value: number, max: number): number {
  return 1 - normalize(value, max);
}

/**
 * Crepuscular-aware time-of-day similarity. Maps a timestamp to a 0–1 score
 * representing closeness to the nearest sunrise/sunset peak. 1.0 at the
 * peak, gaussian falloff to ~0 about 5h away. So a 5:30am catch and a 7pm
 * catch both score near 1.0 — they're equivalent fishing times even though
 * a naive (hours / 24) treatment would say they're 56% of the day apart.
 *
 * Defaults to 6 / 19 if the caller doesn't have local sunrise/sunset.
 */
function crepuscularTimeNorm(
  date: Date,
  sunriseHour: number = 6,
  sunsetHour: number = 19,
): number {
  const h = date.getHours() + date.getMinutes() / 60;
  // Wrap-aware distance to either crepuscular peak.
  const dWrap = (a: number, b: number) => {
    const d = Math.abs(a - b) % 24;
    return Math.min(d, 24 - d);
  };
  const dist = Math.min(dWrap(h, sunriseHour), dWrap(h, sunsetHour));
  // Gaussian-ish: 1.0 at peak, drops to ~0.13 by 6h away.
  return Math.exp(-0.5 * (dist / 3) ** 2);
}

function seasonNorm(date: Date): number {
  return date.getMonth() / 12;
}

// ============================================================
// Depth change computation — structure transition metric
// ============================================================

/**
 * Compute how much depth changes around a cell by looking at neighbors.
 * High value = near a structure transition (ledge, dropoff, hump edge).
 */
function computeDepthChange(
  cell: GridCell,
  depthLookup: Map<string, number>,
  spacing: number,
): number {
  let maxChange = 0;
  const offsets = [
    [0, spacing], [0, -spacing], [spacing, 0], [-spacing, 0],
    [spacing, spacing], [-spacing, spacing], [spacing, -spacing], [-spacing, -spacing],
  ];
  for (const [dlng, dlat] of offsets) {
    const key = `${(cell.lat + dlat).toFixed(3)}_${(cell.lng + dlng).toFixed(3)}`;
    const neighborDepth = depthLookup.get(key);
    if (neighborDepth !== undefined) {
      maxChange = Math.max(maxChange, Math.abs(cell.depth_ft - neighborDepth));
    }
  }
  return maxChange;
}

// ============================================================
// Wind advantage scoring
// ============================================================

/**
 * Score how advantageous the current wind is for this spot.
 * Windward shores (wind blowing INTO the shore) score higher —
 * wind pushes baitfish and creates current that attracts predators.
 */
function computeWindAdvantage(
  windDeg: number,
  windExposure8: Record<string, number>,
  shorelineDist_ft: number,
  maxShorelineDist: number,
): number {
  // Get exposure from the wind direction (how much open water upwind)
  const upwindExposure = getWindExposureForDirection(windDeg, windExposure8);
  // Get exposure from the lee side (downwind)
  const downwindDeg = (windDeg + 180) % 360;
  const downwindExposure = getWindExposureForDirection(downwindDeg, windExposure8);

  // Windward advantage: high upwind fetch + low downwind fetch = wind hitting shore
  // This means bait gets pushed into this area
  const windwardScore = upwindExposure * (1 - downwindExposure);

  // Closer to shore amplifies the wind effect
  const shoreBonus = 1 - normalize(shorelineDist_ft, maxShorelineDist);
  const amplified = windwardScore * (0.5 + 0.5 * shoreBonus);

  return Math.min(1, amplified);
}

// ============================================================
// Signature building
// ============================================================

export function buildSignature(
  depth_ft: number,
  slope_deg: number,
  dropoffDist_ft: number,
  channelDist_ft: number,
  pointDist_ft: number,
  shorelineDist_ft: number,
  windExposure: number,
  timestamp: Date,
  moonIllumination: number,
  ranges: NormRanges,
  depthChange_ft: number = 0,
  windAdvantage: number = 0.5,
  sunriseHour: number = 6,
  sunsetHour: number = 19,
): SpotSignature {
  return {
    depth: normalize(depth_ft, ranges.maxDepth),
    depthChange: normalize(depthChange_ft, ranges.maxDepthChange),
    slope: normalize(slope_deg, ranges.maxSlope),
    dropoffProximity: inverseNormalize(dropoffDist_ft, ranges.maxDropoffDist),
    channelProximity: inverseNormalize(channelDist_ft, ranges.maxChannelDist),
    pointProximity: inverseNormalize(pointDist_ft, ranges.maxPointDist),
    shorelineDistance: normalize(shorelineDist_ft, ranges.maxShorelineDist),
    windExposure,
    windAdvantage,
    timeOfDay: crepuscularTimeNorm(timestamp, sunriseHour, sunsetHour),
    season: seasonNorm(timestamp),
    moonPhase: moonIllumination,
  };
}

export function buildCellSignature(
  cell: GridCell,
  windDeg: number,
  timestamp: Date,
  moonIllumination: number,
  ranges: NormRanges,
  depthChangeLookup: Map<number, number>,
  sunriseHour: number = 6,
  sunsetHour: number = 19,
): SpotSignature {
  const windExp = getWindExposureForDirection(windDeg, cell.windExposure8);
  const depthChange = depthChangeLookup.get(cell.id) ?? 0;
  const windAdv = computeWindAdvantage(windDeg, cell.windExposure8, cell.shorelineDist_ft, ranges.maxShorelineDist);

  // NOTE: We deliberately do NOT apply timeDepthFactor here. Previously this
  // function multiplied cell.depth_ft by a time-of-day factor while
  // buildSignature left the reference depth raw, creating an unfair
  // mismatch (the candidates were time-shifted but the reference wasn't).
  // findSimilarSpots now applies the shift symmetrically at compare time
  // using the ratio between target hour and reference hour.
  return {
    depth: normalize(cell.depth_ft, ranges.maxDepth),
    depthChange: normalize(depthChange, ranges.maxDepthChange),
    slope: normalize(cell.slope_deg, ranges.maxSlope),
    dropoffProximity: inverseNormalize(cell.dropoffDist_ft, ranges.maxDropoffDist),
    channelProximity: inverseNormalize(cell.channelDist_ft, ranges.maxChannelDist),
    pointProximity: inverseNormalize(cell.pointDist_ft, ranges.maxPointDist),
    shorelineDistance: normalize(cell.shorelineDist_ft, ranges.maxShorelineDist),
    windExposure: windExp,
    windAdvantage: windAdv,
    timeOfDay: crepuscularTimeNorm(timestamp, sunriseHour, sunsetHour),
    season: seasonNorm(timestamp),
    moonPhase: moonIllumination,
  };
}

// ============================================================
// Similarity scoring
// ============================================================

export function similarityScore(
  reference: SpotSignature,
  candidate: SpotSignature,
  weights: PatternWeights,
): number {
  const dims: (keyof SpotSignature)[] = [
    'depth', 'depthChange', 'slope', 'dropoffProximity', 'channelProximity',
    'pointProximity', 'shorelineDistance', 'windExposure', 'windAdvantage',
    'timeOfDay', 'season', 'moonPhase',
  ];

  let sumSquared = 0;
  let totalWeight = 0;

  for (const dim of dims) {
    const diff = reference[dim] - candidate[dim];
    const w = weights[dim];
    sumSquared += w * diff * diff;
    totalWeight += w;
  }

  if (totalWeight === 0) return 0;
  return 1 - Math.sqrt(sumSquared / totalWeight);
}

// ============================================================
// Main matching function
// ============================================================

export function computeDepthChangeLookup(grid: GridCell[]): Map<number, number> {
  const depthLookup = new Map<string, number>();
  for (const cell of grid) {
    depthLookup.set(`${cell.lat.toFixed(3)}_${cell.lng.toFixed(3)}`, cell.depth_ft);
  }
  const spacing = 0.002; // match grid resolution
  const depthChangeLookup = new Map<number, number>();
  for (const cell of grid) {
    depthChangeLookup.set(cell.id, computeDepthChange(cell, depthLookup, spacing));
  }
  return depthChangeLookup;
}

export function findNearestCell(grid: GridCell[], lat: number, lng: number): GridCell | null {
  if (grid.length === 0) return null;
  let best: GridCell | null = null;
  let bestDistSq = Infinity;
  for (const cell of grid) {
    const dLat = cell.lat - lat;
    const dLng = cell.lng - lng;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestDistSq) {
      bestDistSq = d;
      best = cell;
    }
  }
  return best;
}

export interface FindSimilarSpotsOptions {
  /** Cell ID of the reference catch (when known). Results from this cell
   *  are flagged with `isOrigin: true` so the UI can mark them. */
  originCellId?: number | null;
  /** When the reference signature was sampled. Used together with the
   *  search `timestamp` to apply a symmetric depth-time shift on the
   *  reference's depth dim — preventing the dawn-vs-noon depth mismatch
   *  bug. Defaults to the search timestamp (no shift). */
  referenceTimestamp?: Date;
  sunriseHour?: number;
  sunsetHour?: number;
}

export function findSimilarSpots(
  referenceSignature: SpotSignature,
  grid: GridCell[],
  windDeg: number,
  timestamp: Date,
  moonIllumination: number,
  ranges: NormRanges,
  weights: PatternWeights = DEFAULT_WEIGHTS,
  threshold: number = 0.85,
  options: FindSimilarSpotsOptions = {},
): MatchResult[] {
  const depthChangeLookup = computeDepthChangeLookup(grid);

  const sunriseHour = options.sunriseHour ?? 6;
  const sunsetHour = options.sunsetHour ?? 19;
  const refTs = options.referenceTimestamp ?? timestamp;

  // Symmetric depth-time shift: scale the reference depth dim by the ratio
  // of expected fish-depth at the search hour vs the reference hour. Fish
  // move shallower at dawn/dusk, deeper midday — so a 7am catch (factor
  // 0.85) compared against noon candidates (factor 1.15) needs the
  // reference bumped up by 1.15/0.85 ≈ 1.35× to cancel the time bias.
  const targetDepthFactor = timeDepthFactor(timestamp.getHours());
  const refDepthFactor = timeDepthFactor(refTs.getHours());
  const depthRatio = targetDepthFactor / refDepthFactor;
  const adjustedRef: SpotSignature = depthRatio === 1
    ? referenceSignature
    : {
        ...referenceSignature,
        depth: Math.min(1, Math.max(0, referenceSignature.depth * depthRatio)),
      };

  // Filter out very shallow cells (< 3ft) — not fishable
  const fishableCells = grid.filter(c => c.depth_ft >= 3);

  const results: MatchResult[] = [];
  for (const cell of fishableCells) {
    const cellSig = buildCellSignature(
      cell, windDeg, timestamp, moonIllumination, ranges, depthChangeLookup,
      sunriseHour, sunsetHour,
    );
    const score = similarityScore(adjustedRef, cellSig, weights);

    if (score >= threshold) {
      results.push({
        cellId: cell.id,
        lng: cell.lng,
        lat: cell.lat,
        score,
        signature: cellSig,
        isOrigin: options.originCellId != null && cell.id === options.originCellId,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// ============================================================
// Norm ranges (now includes depthChange)
// ============================================================

export function computeNormRanges(grid: GridCell[]): NormRanges {
  // Estimate max depth change from the data
  const depthLookup = new Map<string, number>();
  for (const cell of grid) {
    depthLookup.set(`${cell.lat.toFixed(3)}_${cell.lng.toFixed(3)}`, cell.depth_ft);
  }

  let maxDC = 1;
  const spacing = 0.002;
  for (const cell of grid) {
    const dc = computeDepthChange(cell, depthLookup, spacing);
    if (dc > maxDC) maxDC = dc;
  }

  return {
    maxDepth: Math.max(1, ...grid.map((c) => c.depth_ft)),
    maxSlope: Math.max(1, ...grid.map((c) => c.slope_deg)),
    maxDropoffDist: Math.max(1, ...grid.map((c) => c.dropoffDist_ft)),
    maxChannelDist: Math.max(1, ...grid.map((c) => c.channelDist_ft)),
    maxPointDist: Math.max(1, ...grid.map((c) => c.pointDist_ft)),
    maxShorelineDist: Math.max(1, ...grid.map((c) => c.shorelineDist_ft)),
    maxDepthChange: maxDC,
  };
}

// ============================================================
// Hotspot clustering (#10)
// ============================================================

export interface HotspotZone {
  id: number;
  centerLng: number;
  centerLat: number;
  avgScore: number;
  topScore: number;
  count: number;
  radius_deg: number; // approximate zone radius
  topResult: MatchResult;
  /** True if any result in the cluster is the user's reference catch cell —
   *  lets the map style this zone distinctly so the user knows "your spot"
   *  is in here. */
  containsOrigin: boolean;
}

/**
 * Cluster individual match results into hotspot zones.
 * Uses simple grid-based clustering — groups nearby results.
 */
export function clusterHotspots(
  results: MatchResult[],
  clusterRadius: number = 0.005, // ~500m
): HotspotZone[] {
  if (results.length === 0) return [];

  // Grid-based clustering
  const clusters = new Map<string, MatchResult[]>();

  for (const r of results) {
    const key = `${Math.round(r.lat / clusterRadius)}_${Math.round(r.lng / clusterRadius)}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(r);
  }

  const zones: HotspotZone[] = [];
  let id = 0;

  for (const members of clusters.values()) {
    if (members.length === 0) continue;

    const avgLat = members.reduce((s, m) => s + m.lat, 0) / members.length;
    const avgLng = members.reduce((s, m) => s + m.lng, 0) / members.length;
    const avgScore = members.reduce((s, m) => s + m.score, 0) / members.length;
    const topResult = members.reduce((best, m) => m.score > best.score ? m : best, members[0]);

    // Compute radius from spread of points
    let maxDist = 0;
    for (const m of members) {
      const dist = Math.sqrt((m.lat - avgLat) ** 2 + (m.lng - avgLng) ** 2);
      if (dist > maxDist) maxDist = dist;
    }

    zones.push({
      id: id++,
      centerLng: avgLng,
      centerLat: avgLat,
      avgScore,
      topScore: topResult.score,
      count: members.length,
      containsOrigin: members.some((m) => m.isOrigin),
      radius_deg: Math.max(clusterRadius * 0.4, maxDist),
      topResult,
    });
  }

  // Sort by top score
  zones.sort((a, b) => b.topScore - a.topScore);
  return zones;
}

// Keep generateDemoGrid for backwards compatibility (unused but harmless)
export function generateDemoGrid(): GridCell[] {
  return [];
}

// ============================================================
// Default signatures — used by the Trip Planner when the user has no logged
// catches yet. Per-species seed targets adapted to the day's conditions so
// even a brand-new user gets a sensible starting list of spots.
// ============================================================

export interface DayConditions {
  airTempF: number;
  waterTempF: number | null;
  windSpeedMph: number;
  cloudCoverPct: number;
}

interface DefaultSeed {
  depthFt: number;          // target seed depth
  slopeDeg: number;
  dropoffDistFt: number;    // smaller = closer = stronger preference
  channelDistFt: number;
  pointDistFt: number;
  shorelineDistFt: number;
  windExposure: number;
  windAdvantage: number;
}

// Tuned for deep Texas reservoirs (e.g. Texoma). Starting depths sit in the
// 12–18 ft band that covers a striper's main-lake structure preference and a
// largemouth's classic point/dropoff window. Easy to retune from feedback.
const DEFAULT_SEEDS: Record<string, DefaultSeed> = {
  striper:    { depthFt: 25, slopeDeg: 4, dropoffDistFt: 200, channelDistFt: 150, pointDistFt: 600, shorelineDistFt: 1200, windExposure: 0.7, windAdvantage: 0.6 },
  largemouth: { depthFt: 12, slopeDeg: 6, dropoffDistFt: 150, channelDistFt: 600, pointDistFt: 200, shorelineDistFt: 400,  windExposure: 0.5, windAdvantage: 0.7 },
  smallmouth: { depthFt: 15, slopeDeg: 8, dropoffDistFt: 100, channelDistFt: 500, pointDistFt: 200, shorelineDistFt: 500,  windExposure: 0.6, windAdvantage: 0.7 },
  crappie:    { depthFt: 14, slopeDeg: 3, dropoffDistFt: 250, channelDistFt: 300, pointDistFt: 400, shorelineDistFt: 700,  windExposure: 0.3, windAdvantage: 0.4 },
  walleye:    { depthFt: 18, slopeDeg: 5, dropoffDistFt: 150, channelDistFt: 250, pointDistFt: 350, shorelineDistFt: 800,  windExposure: 0.6, windAdvantage: 0.7 },
  catfish:    { depthFt: 22, slopeDeg: 3, dropoffDistFt: 300, channelDistFt: 100, pointDistFt: 700, shorelineDistFt: 900,  windExposure: 0.4, windAdvantage: 0.3 },
  bluegill:   { depthFt: 6,  slopeDeg: 3, dropoffDistFt: 600, channelDistFt: 1000, pointDistFt: 500, shorelineDistFt: 150, windExposure: 0.3, windAdvantage: 0.5 },
};

const COLD_OPTIMUM_LOW: Record<string, number> = {
  striper: 60, largemouth: 65, smallmouth: 60, crappie: 58, walleye: 60, catfish: 70, bluegill: 65,
};

/**
 * Build a SpotSignature from the per-species default seed, nudged by today's
 * conditions: bright/hot pushes deeper; cold water pushes shallower (sun-
 * warmed flats); wind direction is handled by findSimilarSpots' wind arg.
 */
export function defaultSignatureFor(
  species: string,
  conditions: DayConditions,
  timestamp: Date,
  moonIllumination: number,
  ranges: NormRanges,
): SpotSignature {
  const seed = DEFAULT_SEEDS[species] ?? DEFAULT_SEEDS.largemouth;
  let depth = seed.depthFt;

  // Bright + hot midday → push deeper to find the cooler thermocline edge
  if (conditions.cloudCoverPct < 25 && conditions.airTempF > 85) {
    depth += 5;
  }
  // Cold water (below species' optimum) → fish are likely shallower on
  // sun-warmed flats. Don't push shallower than 4 ft.
  const coldLow = COLD_OPTIMUM_LOW[species] ?? 65;
  if (conditions.waterTempF != null && conditions.waterTempF < coldLow) {
    depth = Math.max(4, depth - 4);
  }

  return buildSignature(
    depth,
    seed.slopeDeg,
    seed.dropoffDistFt,
    seed.channelDistFt,
    seed.pointDistFt,
    seed.shorelineDistFt,
    seed.windExposure,
    timestamp,
    moonIllumination,
    ranges,
    /* depthChange_ft */ 4, // mid-range structure transition
    seed.windAdvantage,
  );
}
