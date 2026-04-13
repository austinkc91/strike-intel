/**
 * Query depth and structure characteristics at a specific location
 * from the tile server, for enriching catch records.
 */

import type { CatchCharacteristics, GeoPoint } from '../types';

const TILE_SERVER = import.meta.env.VITE_TILE_SERVER || 'http://localhost:3001';

interface DepthResult {
  depth_ft: number | null;
  distance_m: number;
  method?: string;
  neighbors?: number;
}

interface AreaPoint {
  lat: number;
  lng: number;
  depth_ft: number;
}

/**
 * Fetch spot characteristics at a given location by querying the tile server.
 * Returns depth, slope, and proximity metrics computed from surrounding depth data.
 */
export async function fetchSpotCharacteristics(
  lakeId: string,
  location: GeoPoint,
): Promise<CatchCharacteristics | null> {
  try {
    // Query depth at the exact point
    const depthRes = await fetch(
      `${TILE_SERVER}/depth?lat=${location.latitude}&lng=${location.longitude}&lake=${lakeId}`,
    );
    if (!depthRes.ok) return null;
    const depthData: DepthResult = await depthRes.json();

    if (depthData.depth_ft === null) return null;

    // Query a small area around the point for slope and structure analysis
    const radius = 0.005; // ~500m
    const bbox = [
      location.longitude - radius,
      location.latitude - radius,
      location.longitude + radius,
      location.latitude + radius,
    ].join(',');

    const areaRes = await fetch(
      `${TILE_SERVER}/depth/area?lake=${lakeId}&bbox=${bbox}&resolution=0.001`,
    );
    if (!areaRes.ok) {
      // Return just depth if area query fails
      return {
        depth_ft: depthData.depth_ft,
        slope_degrees: null,
        dropoffProximity: null,
        channelProximity: null,
        pointProximity: null,
        shorelineDistance: 0,
        windExposure: 0.5,
        nearestStructureType: null,
        nearestStructureDist: null,
      };
    }

    const areaData = await areaRes.json();
    const points: AreaPoint[] = areaData.points || [];

    if (points.length < 3) {
      return {
        depth_ft: depthData.depth_ft,
        slope_degrees: null,
        dropoffProximity: null,
        channelProximity: null,
        pointProximity: null,
        shorelineDistance: 0,
        windExposure: 0.5,
        nearestStructureType: null,
        nearestStructureDist: null,
      };
    }

    const DEG_TO_FT = 364000;
    const catchDepth = depthData.depth_ft;

    // Compute slope from nearest neighbors
    const slope = computeLocalSlope(location, points, DEG_TO_FT);

    // Find distance to significant dropoff (>10ft change)
    const dropoffDist = findDropoffDistance(location, catchDepth, points, DEG_TO_FT);

    // Find distance to channel (deepest 15% of surrounding points)
    const sortedByDepth = [...points].sort((a, b) => b.depth_ft - a.depth_ft);
    const channelThreshold = sortedByDepth[Math.floor(points.length * 0.15)]?.depth_ft ?? 30;
    const channelPoints = points.filter(p => p.depth_ft >= channelThreshold);
    const channelDist = nearestDist(location, channelPoints, DEG_TO_FT);

    // Find distance to shallow water (<5ft) as proxy for shoreline/points
    const shallowPoints = points.filter(p => p.depth_ft < 5 && p.depth_ft > 0);
    const shorelineDist = shallowPoints.length > 0
      ? nearestDist(location, shallowPoints, DEG_TO_FT)
      : radius * DEG_TO_FT;

    // Determine structure type
    const structureType = classifyStructure(catchDepth, slope, dropoffDist, channelDist);

    // Wind exposure: count water cells in surrounding area (more water = more exposed)
    const windExposure = points.length > 0 ? Math.min(1, points.length / 100) : 0.5;

    return {
      depth_ft: catchDepth,
      slope_degrees: Math.round(slope * 10) / 10,
      dropoffProximity: Math.round(dropoffDist),
      channelProximity: Math.round(channelDist),
      pointProximity: shallowPoints.length > 0
        ? Math.round(nearestDist(location, shallowPoints, DEG_TO_FT))
        : null,
      shorelineDistance: Math.round(shorelineDist),
      windExposure: Math.round(windExposure * 100) / 100,
      nearestStructureType: structureType,
      nearestStructureDist: null,
    };
  } catch (err) {
    console.error('[spotCharacteristics] Failed:', err);
    return null;
  }
}

function computeLocalSlope(
  center: GeoPoint,
  points: AreaPoint[],
  degToFt: number,
): number {
  // Find the 4 nearest points and compute max gradient
  const withDist = points.map(p => ({
    ...p,
    dist: Math.sqrt(
      ((p.lat - center.latitude) * degToFt) ** 2 +
      ((p.lng - center.longitude) * degToFt * 0.85) ** 2,
    ),
  }));

  withDist.sort((a, b) => a.dist - b.dist);
  const nearest = withDist.slice(0, 6);

  if (nearest.length < 2) return 0;

  const centerDepth = nearest[0].depth_ft;
  let maxGradient = 0;

  for (let i = 1; i < nearest.length; i++) {
    const n = nearest[i];
    if (n.dist < 10) continue; // skip overlapping points
    const gradient = Math.abs(centerDepth - n.depth_ft) / n.dist;
    maxGradient = Math.max(maxGradient, gradient);
  }

  return Math.atan(maxGradient) * (180 / Math.PI);
}

function findDropoffDistance(
  center: GeoPoint,
  centerDepth: number,
  points: AreaPoint[],
  degToFt: number,
): number {
  let minDist = Infinity;
  for (const p of points) {
    if (Math.abs(p.depth_ft - centerDepth) > 10) {
      const dist = Math.sqrt(
        ((p.lat - center.latitude) * degToFt) ** 2 +
        ((p.lng - center.longitude) * degToFt * 0.85) ** 2,
      );
      if (dist < minDist) minDist = dist;
    }
  }
  return minDist === Infinity ? 5000 : minDist;
}

function nearestDist(center: GeoPoint, targets: AreaPoint[], degToFt: number): number {
  let minDist = Infinity;
  for (const t of targets) {
    const dist = Math.sqrt(
      ((t.lat - center.latitude) * degToFt) ** 2 +
      ((t.lng - center.longitude) * degToFt * 0.85) ** 2,
    );
    if (dist < minDist) minDist = dist;
  }
  return minDist === Infinity ? 10000 : minDist;
}

function classifyStructure(
  depth: number,
  slope: number,
  dropoffDist: number,
  channelDist: number,
): 'hump' | 'point' | 'channel' | 'dropoff' | 'flat' | null {
  if (channelDist < 300) return 'channel';
  if (dropoffDist < 200 && slope > 10) return 'dropoff';
  if (slope > 8) return 'point';
  if (slope < 2 && depth > 10) return 'flat';
  if (depth < 15 && slope > 5) return 'hump';
  return null;
}
