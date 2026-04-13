/**
 * Fetches real depth data from the tile server and builds a GridCell[]
 * for the pattern engine to match against.
 */

import type { GridCell } from './patternEngine';

const TILE_SERVER = import.meta.env.VITE_TILE_SERVER || 'http://localhost:3001';

interface DepthPoint {
  lat: number;
  lng: number;
  depth_ft: number;
}

interface BoundaryFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][];
  };
  properties: Record<string, unknown>;
}

/**
 * Fetch the depth grid and lake boundary from the tile server,
 * then compute derived fields (slope, distances) to build GridCells.
 */
export async function fetchLakeGrid(lakeId: string): Promise<GridCell[]> {
  // Fetch boundary to get lake extent
  const boundaryRes = await fetch(`${TILE_SERVER}/boundary?lake=${lakeId}`);
  if (!boundaryRes.ok) return [];
  const boundaryData = await boundaryRes.json();
  const boundary: BoundaryFeature = boundaryData.features?.[0];
  if (!boundary) return [];

  // Get bounding box from boundary
  const coords = boundary.geometry.type === 'Polygon'
    ? boundary.geometry.coordinates[0]
    : boundary.geometry.coordinates[0][0];

  const lngs = coords.map((c: number[]) => c[0]);
  const lats = coords.map((c: number[]) => c[1]);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const south = Math.min(...lats);
  const north = Math.max(...lats);

  // Fetch depth grid — use ~200m resolution for pattern matching
  const resolution = 0.002; // ~200m cells
  const bbox = `${west},${south},${east},${north}`;
  const depthRes = await fetch(
    `${TILE_SERVER}/depth/area?lake=${lakeId}&bbox=${bbox}&resolution=${resolution}`,
  );
  if (!depthRes.ok) return [];
  const depthData = await depthRes.json();
  const points: DepthPoint[] = depthData.points || [];

  if (points.length === 0) return [];

  // Build a lookup grid for computing slopes and distances
  const pointMap = new Map<string, DepthPoint>();
  for (const p of points) {
    pointMap.set(`${p.lat.toFixed(4)}_${p.lng.toFixed(4)}`, p);
  }

  // Find the deepest channel path (points in the top 10% depth)
  const sortedByDepth = [...points].sort((a, b) => b.depth_ft - a.depth_ft);
  const channelThreshold = sortedByDepth[Math.floor(points.length * 0.1)]?.depth_ft ?? 30;

  const channelPoints = points.filter(p => p.depth_ft >= channelThreshold);

  // Build boundary ring for shoreline distance
  const boundaryRing = coords.map((c: number[]) => ({ lng: c[0], lat: c[1] }));

  // Build grid cells
  const grid: GridCell[] = [];
  const DEG_TO_FT = 364000; // rough conversion at mid-latitudes

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.depth_ft < 1) continue; // skip dry land

    // Compute slope from neighbors
    const slope = computeSlope(p, pointMap, resolution, DEG_TO_FT);

    // Distance to nearest deep dropoff (>15ft change within ~200m)
    const dropoffDist = computeDropoffDist(p, pointMap, resolution, DEG_TO_FT);

    // Distance to channel (deepest 10%)
    const channelDist = nearestDist(p, channelPoints, DEG_TO_FT);

    // Distance to nearest point/peninsula (where shoreline changes direction rapidly)
    // Simplified: use distance to nearest shallow (<5ft) cell
    const shallowPoints = points.filter(pt => pt.depth_ft < 5 && pt.depth_ft > 0);
    const pointDist = nearestDist(p, shallowPoints.length > 0 ? shallowPoints.slice(0, 500) : [], DEG_TO_FT);

    // Distance to shoreline
    const shorelineDist = nearestBoundaryDist(p, boundaryRing, DEG_TO_FT);

    // Wind exposure: based on fetch distance (open water in each direction)
    const windExp = computeWindExposure(p, pointMap, resolution, 20);

    grid.push({
      id: i,
      lng: p.lng,
      lat: p.lat,
      depth_ft: p.depth_ft,
      slope_deg: slope,
      dropoffDist_ft: dropoffDist,
      channelDist_ft: channelDist,
      pointDist_ft: pointDist,
      shorelineDist_ft: shorelineDist,
      windExposure8: windExp,
    });
  }

  console.log(`[lakeGrid] Built ${grid.length} cells for ${lakeId} from ${points.length} depth points`);
  return grid;
}

function computeSlope(
  p: DepthPoint,
  pointMap: Map<string, DepthPoint>,
  res: number,
  degToFt: number,
): number {
  const neighbors = [
    pointMap.get(`${(p.lat + res).toFixed(4)}_${p.lng.toFixed(4)}`),
    pointMap.get(`${(p.lat - res).toFixed(4)}_${p.lng.toFixed(4)}`),
    pointMap.get(`${p.lat.toFixed(4)}_${(p.lng + res).toFixed(4)}`),
    pointMap.get(`${p.lat.toFixed(4)}_${(p.lng - res).toFixed(4)}`),
  ].filter(Boolean) as DepthPoint[];

  if (neighbors.length === 0) return 0;

  let maxGradient = 0;
  const cellDist = res * degToFt;
  for (const n of neighbors) {
    const gradient = Math.abs(p.depth_ft - n.depth_ft) / cellDist;
    maxGradient = Math.max(maxGradient, gradient);
  }

  // Convert gradient to degrees
  return Math.atan(maxGradient) * (180 / Math.PI);
}

function computeDropoffDist(
  p: DepthPoint,
  pointMap: Map<string, DepthPoint>,
  res: number,
  degToFt: number,
): number {
  // Search in expanding rings for a cell with >15ft depth difference
  for (let ring = 1; ring <= 5; ring++) {
    const offsets = ring * res;
    const dirs = [
      [0, offsets], [0, -offsets], [offsets, 0], [-offsets, 0],
      [offsets, offsets], [-offsets, offsets], [offsets, -offsets], [-offsets, -offsets],
    ];
    for (const [dlng, dlat] of dirs) {
      const n = pointMap.get(`${(p.lat + dlat).toFixed(4)}_${(p.lng + dlng).toFixed(4)}`);
      if (n && Math.abs(n.depth_ft - p.depth_ft) > 15) {
        return ring * res * degToFt;
      }
    }
  }
  return 5 * res * degToFt; // max search distance
}

function nearestDist(p: DepthPoint, targets: DepthPoint[], degToFt: number): number {
  let minDist = Infinity;
  for (const t of targets) {
    const dlat = (p.lat - t.lat) * degToFt;
    const dlng = (p.lng - t.lng) * degToFt * 0.85; // cos(lat) correction
    const dist = Math.sqrt(dlat * dlat + dlng * dlng);
    if (dist < minDist) minDist = dist;
  }
  return minDist === Infinity ? 10000 : minDist;
}

function nearestBoundaryDist(
  p: DepthPoint,
  ring: { lng: number; lat: number }[],
  degToFt: number,
): number {
  let minDist = Infinity;
  // Sample every 50th vertex for speed
  for (let i = 0; i < ring.length; i += 50) {
    const b = ring[i];
    const dlat = (p.lat - b.lat) * degToFt;
    const dlng = (p.lng - b.lng) * degToFt * 0.85;
    const dist = Math.sqrt(dlat * dlat + dlng * dlng);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

function computeWindExposure(
  p: DepthPoint,
  pointMap: Map<string, DepthPoint>,
  res: number,
  maxSteps: number,
): Record<string, number> {
  // For each cardinal direction, count how many consecutive water cells exist (fetch distance)
  const dirs: [string, number, number][] = [
    ['N', 0, 1], ['NE', 1, 1], ['E', 1, 0], ['SE', 1, -1],
    ['S', 0, -1], ['SW', -1, -1], ['W', -1, 0], ['NW', -1, 1],
  ];

  const result: Record<string, number> = {};
  for (const [name, dx, dy] of dirs) {
    let steps = 0;
    for (let s = 1; s <= maxSteps; s++) {
      const key = `${(p.lat + dy * s * res).toFixed(4)}_${(p.lng + dx * s * res).toFixed(4)}`;
      if (pointMap.has(key)) {
        steps = s;
      } else {
        break;
      }
    }
    result[name] = steps / maxSteps; // 0 = sheltered, 1 = fully exposed
  }
  return result;
}
