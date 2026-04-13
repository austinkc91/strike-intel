// Core pattern matching engine
// Compares a reference catch's "spot signature" against an analysis grid
// to find similar fishing spots on the lake.

import { getWindExposureForDirection } from './windExposure';

export interface SpotSignature {
  depth: number;              // 0-1 normalized
  slope: number;              // 0-1 normalized
  dropoffProximity: number;   // 0-1 (1 = closest)
  channelProximity: number;   // 0-1
  pointProximity: number;     // 0-1
  shorelineDistance: number;   // 0-1
  windExposure: number;       // 0-1
  timeOfDay: number;          // 0-1
  season: number;             // 0-1
  moonPhase: number;          // 0-1 (illumination)
}

export interface PatternWeights {
  depth: number;
  slope: number;
  dropoffProximity: number;
  channelProximity: number;
  pointProximity: number;
  shorelineDistance: number;
  windExposure: number;
  timeOfDay: number;
  season: number;
  moonPhase: number;
}

export const DEFAULT_WEIGHTS: PatternWeights = {
  depth: 1.0,
  slope: 0.7,
  dropoffProximity: 0.9,
  channelProximity: 0.6,
  pointProximity: 0.5,
  shorelineDistance: 0.4,
  windExposure: 0.8,
  timeOfDay: 0.3,
  season: 0.5,
  moonPhase: 0.2,
};

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
  windExposure8: Record<string, number>; // pre-computed for 8 directions
}

export interface MatchResult {
  cellId: number;
  lng: number;
  lat: number;
  score: number;      // 0-1 where 1 = identical
  signature: SpotSignature;
}

// Normalization ranges (set per lake)
export interface NormRanges {
  maxDepth: number;
  maxSlope: number;
  maxDropoffDist: number;
  maxChannelDist: number;
  maxPointDist: number;
  maxShorelineDist: number;
}

function normalize(value: number, max: number): number {
  if (max <= 0) return 0.5;
  return Math.min(1, Math.max(0, value / max));
}

function inverseNormalize(value: number, max: number): number {
  // Closer = higher score
  return 1 - normalize(value, max);
}

function timeOfDayNorm(date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60;
  return hours / 24;
}

function seasonNorm(date: Date): number {
  const month = date.getMonth(); // 0-11
  // 0=winter, 0.25=spring, 0.5=summer, 0.75=fall
  return month / 12;
}

// Build a spot signature from raw values
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
): SpotSignature {
  return {
    depth: normalize(depth_ft, ranges.maxDepth),
    slope: normalize(slope_deg, ranges.maxSlope),
    dropoffProximity: inverseNormalize(dropoffDist_ft, ranges.maxDropoffDist),
    channelProximity: inverseNormalize(channelDist_ft, ranges.maxChannelDist),
    pointProximity: inverseNormalize(pointDist_ft, ranges.maxPointDist),
    shorelineDistance: normalize(shorelineDist_ft, ranges.maxShorelineDist),
    windExposure,
    timeOfDay: timeOfDayNorm(timestamp),
    season: seasonNorm(timestamp),
    moonPhase: moonIllumination,
  };
}

// Build a signature for a grid cell
export function buildCellSignature(
  cell: GridCell,
  windDeg: number,
  timestamp: Date,
  moonIllumination: number,
  ranges: NormRanges,
): SpotSignature {
  const windExp = getWindExposureForDirection(windDeg, cell.windExposure8);

  return {
    depth: normalize(cell.depth_ft, ranges.maxDepth),
    slope: normalize(cell.slope_deg, ranges.maxSlope),
    dropoffProximity: inverseNormalize(cell.dropoffDist_ft, ranges.maxDropoffDist),
    channelProximity: inverseNormalize(cell.channelDist_ft, ranges.maxChannelDist),
    pointProximity: inverseNormalize(cell.pointDist_ft, ranges.maxPointDist),
    shorelineDistance: normalize(cell.shorelineDist_ft, ranges.maxShorelineDist),
    windExposure: windExp,
    timeOfDay: timeOfDayNorm(timestamp),
    season: seasonNorm(timestamp),
    moonPhase: moonIllumination,
  };
}

// Core similarity scoring: weighted Euclidean distance
export function similarityScore(
  reference: SpotSignature,
  candidate: SpotSignature,
  weights: PatternWeights,
): number {
  const dims: (keyof SpotSignature)[] = [
    'depth', 'slope', 'dropoffProximity', 'channelProximity',
    'pointProximity', 'shorelineDistance', 'windExposure',
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

  // 1 = identical, 0 = maximally different
  return 1 - Math.sqrt(sumSquared / totalWeight);
}

// Run pattern match across entire grid
export function findSimilarSpots(
  referenceSignature: SpotSignature,
  grid: GridCell[],
  windDeg: number,
  timestamp: Date,
  moonIllumination: number,
  ranges: NormRanges,
  weights: PatternWeights = DEFAULT_WEIGHTS,
  threshold: number = 0.7,
): MatchResult[] {
  const results: MatchResult[] = [];

  for (const cell of grid) {
    const cellSig = buildCellSignature(cell, windDeg, timestamp, moonIllumination, ranges);
    const score = similarityScore(referenceSignature, cellSig, weights);

    if (score >= threshold) {
      results.push({
        cellId: cell.id,
        lng: cell.lng,
        lat: cell.lat,
        score,
        signature: cellSig,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results;
}

// Compute normalization ranges from a grid
export function computeNormRanges(grid: GridCell[]): NormRanges {
  return {
    maxDepth: Math.max(1, ...grid.map((c) => c.depth_ft)),
    maxSlope: Math.max(1, ...grid.map((c) => c.slope_deg)),
    maxDropoffDist: Math.max(1, ...grid.map((c) => c.dropoffDist_ft)),
    maxChannelDist: Math.max(1, ...grid.map((c) => c.channelDist_ft)),
    maxPointDist: Math.max(1, ...grid.map((c) => c.pointDist_ft)),
    maxShorelineDist: Math.max(1, ...grid.map((c) => c.shorelineDist_ft)),
  };
}

// Seed-based pseudo-random for consistent results
function seededRandom(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

// Generate a demo grid for testing with realistic lake-like depth data
export function generateDemoGrid(
  centerLng: number,
  centerLat: number,
  radiusDeg: number = 0.08,
  spacing: number = 0.002,
): GridCell[] {
  const grid: GridCell[] = [];
  let id = 0;

  // Use an irregular lake shape (multiple overlapping ellipses)
  const lobes = [
    { cx: 0, cy: 0, rx: 1.0, ry: 0.7, maxDepth: 60 },
    { cx: -0.4, cy: 0.3, rx: 0.5, ry: 0.8, maxDepth: 45 },
    { cx: 0.3, cy: -0.4, rx: 0.6, ry: 0.5, maxDepth: 50 },
    { cx: 0.5, cy: 0.2, rx: 0.4, ry: 0.6, maxDepth: 35 },
    { cx: -0.3, cy: -0.5, rx: 0.5, ry: 0.4, maxDepth: 40 },
  ];

  // Channel running through the lake (old river bed)
  const channelCenterX = 0.05;

  for (let lng = centerLng - radiusDeg; lng <= centerLng + radiusDeg; lng += spacing) {
    for (let lat = centerLat - radiusDeg; lat <= centerLat + radiusDeg; lat += spacing) {
      const nx = (lng - centerLng) / radiusDeg;
      const ny = (lat - centerLat) / radiusDeg;

      // Check if point is inside any lobe
      let bestDepthFactor = 0;
      let maxDepthHere = 0;
      let isInLake = false;

      for (const lobe of lobes) {
        const dx = (nx - lobe.cx) / lobe.rx;
        const dy = (ny - lobe.cy) / lobe.ry;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) {
          isInLake = true;
          const factor = 1 - dist;
          if (factor > bestDepthFactor) {
            bestDepthFactor = factor;
            maxDepthHere = lobe.maxDepth;
          }
        }
      }

      if (!isInLake) continue;

      // Channel bonus: deeper near the old river channel
      const channelDist = Math.abs(nx - channelCenterX);
      const channelBonus = channelDist < 0.15 ? (1 - channelDist / 0.15) * 15 : 0;

      // Terrain noise for humps, ridges, flats
      const noise1 = seededRandom(lng * 500, lat * 500) * 8 - 4;
      const noise2 = Math.sin(lng * 800) * Math.cos(lat * 600) * 6;

      const depth_ft = Math.max(1,
        bestDepthFactor * maxDepthHere + channelBonus + noise1 + noise2,
      );

      // Compute slope from depth gradient (approximate)
      const slope_deg = channelDist < 0.2
        ? 8 + seededRandom(lng * 100, lat * 100) * 12
        : bestDepthFactor < 0.3
          ? 10 + seededRandom(lng * 200, lat * 200) * 15
          : seededRandom(lng * 300, lat * 300) * 5;

      // Distances
      const shorelineDist_ft = bestDepthFactor * 3000;
      const dropoffDist_ft = Math.abs(bestDepthFactor - 0.3) * 2000 + seededRandom(lng * 50, lat * 50) * 200;
      const channelDist_ft = channelDist * radiusDeg * 364000; // approx feet
      const pointDist_ft = seededRandom(lng * 77, lat * 77) * 4000;

      // Wind exposure: edges more exposed, coves sheltered
      const exposure = bestDepthFactor < 0.5 ? 0.3 + seededRandom(lng * 33, lat * 33) * 0.3 : 0.5 + seededRandom(lng * 44, lat * 44) * 0.5;

      grid.push({
        id: id++,
        lng,
        lat,
        depth_ft,
        slope_deg,
        dropoffDist_ft,
        channelDist_ft,
        pointDist_ft,
        shorelineDist_ft,
        windExposure8: {
          N: exposure * (0.8 + seededRandom(lng, lat + 1) * 0.4),
          NE: exposure * (0.8 + seededRandom(lng + 1, lat + 1) * 0.4),
          E: exposure * (0.8 + seededRandom(lng + 2, lat) * 0.4),
          SE: exposure * (0.8 + seededRandom(lng + 1, lat - 1) * 0.4),
          S: exposure * (0.8 + seededRandom(lng, lat - 1) * 0.4),
          SW: exposure * (0.8 + seededRandom(lng - 1, lat - 1) * 0.4),
          W: exposure * (0.8 + seededRandom(lng - 2, lat) * 0.4),
          NW: exposure * (0.8 + seededRandom(lng - 1, lat + 1) * 0.4),
        },
      });
    }
  }

  return grid;
}
