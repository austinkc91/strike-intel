import * as turf from '@turf/turf';
import type { StructureType } from '../types';

export interface DetectedStructure {
  type: StructureType;
  center: [number, number]; // [lng, lat]
  geometry: GeoJSON.Geometry;
  depth_range: [number, number]; // [min_ft, max_ft]
  label: string;
}

interface GridCell {
  lng: number;
  lat: number;
  depth: number; // feet, positive = deeper
  slope: number; // degrees
}

// Compute slope (gradient) from surrounding depth values
export function computeSlope(
  depth: number,
  neighbors: number[],
  cellSizeMeters: number,
): number {
  if (neighbors.length === 0) return 0;
  const maxDiff = Math.max(...neighbors.map((n) => Math.abs(n - depth)));
  // Convert depth difference (feet) to meters, compute angle
  const diffMeters = maxDiff * 0.3048;
  return Math.atan2(diffMeters, cellSizeMeters) * (180 / Math.PI);
}

// Detect drop-offs: areas where slope exceeds threshold
export function detectDropoffs(
  grid: GridCell[],
  slopeThreshold: number = 15, // degrees
): DetectedStructure[] {
  const dropoffs: DetectedStructure[] = [];
  const steep = grid.filter((c) => c.slope >= slopeThreshold);

  if (steep.length === 0) return [];

  // Cluster nearby steep cells
  const clusters = clusterPoints(
    steep.map((c) => [c.lng, c.lat] as [number, number]),
    0.0005, // ~50m clustering distance in degrees
  );

  for (const cluster of clusters) {
    if (cluster.length < 2) continue;
    const depths = cluster.map((idx) => steep[idx].depth);
    const center = centroid(cluster.map((idx) => [steep[idx].lng, steep[idx].lat] as [number, number]));

    dropoffs.push({
      type: 'dropoff',
      center,
      geometry: turf.point(center).geometry,
      depth_range: [Math.min(...depths), Math.max(...depths)],
      label: `Drop-off ${Math.round(Math.min(...depths))}-${Math.round(Math.max(...depths))}ft`,
    });
  }

  return dropoffs;
}

// Detect flats: large areas with minimal slope
export function detectFlats(
  grid: GridCell[],
  slopeThreshold: number = 3,
  minClusterSize: number = 5,
): DetectedStructure[] {
  const flats: DetectedStructure[] = [];
  const flat = grid.filter((c) => c.slope <= slopeThreshold && c.depth > 2);

  if (flat.length < minClusterSize) return [];

  const clusters = clusterPoints(
    flat.map((c) => [c.lng, c.lat] as [number, number]),
    0.001,
  );

  for (const cluster of clusters) {
    if (cluster.length < minClusterSize) continue;
    const depths = cluster.map((idx) => flat[idx].depth);
    const center = centroid(cluster.map((idx) => [flat[idx].lng, flat[idx].lat] as [number, number]));
    const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;

    flats.push({
      type: 'flat',
      center,
      geometry: turf.point(center).geometry,
      depth_range: [Math.min(...depths), Math.max(...depths)],
      label: `Flat ~${Math.round(avgDepth)}ft`,
    });
  }

  return flats;
}

// Detect humps: isolated shallow areas surrounded by deeper water
export function detectHumps(
  grid: GridCell[],
  depthDiffThreshold: number = 5, // feet shallower than surroundings
): DetectedStructure[] {
  const humps: DetectedStructure[] = [];

  // Find local minima in depth (shallowest spots)
  for (const cell of grid) {
    const nearby = grid.filter(
      (c) =>
        c !== cell &&
        Math.abs(c.lng - cell.lng) < 0.002 &&
        Math.abs(c.lat - cell.lat) < 0.002,
    );

    if (nearby.length < 4) continue;

    const avgSurroundingDepth =
      nearby.reduce((s, c) => s + c.depth, 0) / nearby.length;

    if (avgSurroundingDepth - cell.depth >= depthDiffThreshold) {
      humps.push({
        type: 'hump',
        center: [cell.lng, cell.lat],
        geometry: turf.point([cell.lng, cell.lat]).geometry,
        depth_range: [cell.depth, avgSurroundingDepth],
        label: `Hump ${Math.round(cell.depth)}ft (${Math.round(avgSurroundingDepth)}ft around)`,
      });
    }
  }

  return humps;
}

// Detect points: convex shoreline features
export function detectPoints(
  shoreline: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): DetectedStructure[] {
  const points: DetectedStructure[] = [];
  const coords = getCoordinates(shoreline);

  for (let i = 2; i < coords.length - 2; i++) {
    const prev = coords[i - 2];
    const curr = coords[i];
    const next = coords[i + 2];

    // Calculate angle at this vertex
    const angle = calculateAngle(prev, curr, next);

    // Sharp convex angles (< 120 degrees) indicate points
    if (angle < 120 && angle > 30) {
      points.push({
        type: 'point',
        center: curr as [number, number],
        geometry: turf.point(curr).geometry,
        depth_range: [0, 0],
        label: 'Point',
      });
    }
  }

  // Deduplicate nearby points
  return deduplicateStructures(points, 0.002);
}

// Run all detectors
export function detectAllStructures(
  grid: GridCell[],
  shoreline: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null,
): DetectedStructure[] {
  const structures: DetectedStructure[] = [];

  structures.push(...detectDropoffs(grid));
  structures.push(...detectFlats(grid));
  structures.push(...detectHumps(grid));

  if (shoreline) {
    structures.push(...detectPoints(shoreline));
  }

  return structures;
}

// ---- Utility functions ----

function clusterPoints(
  points: [number, number][],
  threshold: number,
): number[][] {
  const visited = new Set<number>();
  const clusters: number[][] = [];

  for (let i = 0; i < points.length; i++) {
    if (visited.has(i)) continue;
    visited.add(i);
    const cluster = [i];

    for (let j = i + 1; j < points.length; j++) {
      if (visited.has(j)) continue;
      const dist = Math.sqrt(
        Math.pow(points[i][0] - points[j][0], 2) +
        Math.pow(points[i][1] - points[j][1], 2),
      );
      if (dist < threshold) {
        cluster.push(j);
        visited.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function centroid(points: [number, number][]): [number, number] {
  const sumLng = points.reduce((s, p) => s + p[0], 0);
  const sumLat = points.reduce((s, p) => s + p[1], 0);
  return [sumLng / points.length, sumLat / points.length];
}

function getCoordinates(
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): number[][] {
  if (feature.geometry.type === 'Polygon') {
    return feature.geometry.coordinates[0];
  }
  // MultiPolygon: use the largest ring
  let longest: number[][] = [];
  for (const polygon of feature.geometry.coordinates) {
    if (polygon[0].length > longest.length) {
      longest = polygon[0];
    }
  }
  return longest;
}

function calculateAngle(
  a: number[],
  b: number[],
  c: number[],
): number {
  const ab = [a[0] - b[0], a[1] - b[1]];
  const cb = [c[0] - b[0], c[1] - b[1]];
  const dot = ab[0] * cb[0] + ab[1] * cb[1];
  const magAB = Math.sqrt(ab[0] * ab[0] + ab[1] * ab[1]);
  const magCB = Math.sqrt(cb[0] * cb[0] + cb[1] * cb[1]);
  if (magAB === 0 || magCB === 0) return 180;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

function deduplicateStructures(
  structures: DetectedStructure[],
  threshold: number,
): DetectedStructure[] {
  const result: DetectedStructure[] = [];
  for (const s of structures) {
    const isDupe = result.some(
      (r) =>
        Math.abs(r.center[0] - s.center[0]) < threshold &&
        Math.abs(r.center[1] - s.center[1]) < threshold,
    );
    if (!isDupe) result.push(s);
  }
  return result;
}
