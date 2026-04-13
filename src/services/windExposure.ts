import * as turf from '@turf/turf';

// Calculate wind fetch distance - how far wind travels over open water
// before hitting shoreline. Longer fetch = more exposed = rougher water.

export function calculateWindExposure(
  point: [number, number], // [lng, lat]
  windDirectionDeg: number,
  shorelinePolygon: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  maxFetchMiles: number = 10,
): number {
  // Wind direction is where it comes FROM, so the fetch ray goes
  // in the opposite direction (upwind)
  const upwindBearing = (windDirectionDeg + 180) % 360;

  // Cast a ray from the point in the upwind direction
  const startPoint = turf.point(point);
  const endPoint = turf.destination(startPoint, maxFetchMiles, upwindBearing, {
    units: 'miles',
  });

  const ray = turf.lineString([point, endPoint.geometry.coordinates as [number, number]]);

  // Find where the ray intersects the shoreline
  const intersections = turf.lineIntersect(ray, shorelinePolygon as any);

  if (intersections.features.length === 0) {
    // No intersection = maximum fetch (open water in that direction)
    return 1.0;
  }

  // Find the nearest intersection point
  let minDist = Infinity;
  for (const intersection of intersections.features) {
    const dist = turf.distance(startPoint, intersection, { units: 'miles' });
    if (dist < minDist) {
      minDist = dist;
    }
  }

  // Normalize: 0 = on shore, 1 = max fetch
  return Math.min(1, minDist / maxFetchMiles);
}

// Pre-compute wind exposure for 8 cardinal directions
export function calculateWindExposureAll8(
  point: [number, number],
  shorelinePolygon: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  maxFetchMiles: number = 10,
): Record<string, number> {
  const directions: Record<string, number> = {
    N: 0, NE: 45, E: 90, SE: 135,
    S: 180, SW: 225, W: 270, NW: 315,
  };

  const result: Record<string, number> = {};
  for (const [dir, deg] of Object.entries(directions)) {
    result[dir] = calculateWindExposure(point, deg, shorelinePolygon, maxFetchMiles);
  }
  return result;
}

// Get the wind exposure for a specific wind direction by interpolating
// between the two nearest pre-computed cardinal directions
export function getWindExposureForDirection(
  windDeg: number,
  precomputed: Record<string, number>,
): number {
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const cardinalDegs = [0, 45, 90, 135, 180, 225, 270, 315];

  // Normalize wind direction
  const deg = ((windDeg % 360) + 360) % 360;

  // Find the two bracketing cardinals
  let lowerIdx = 0;
  for (let i = 0; i < cardinalDegs.length; i++) {
    if (cardinalDegs[i] <= deg) lowerIdx = i;
  }
  const upperIdx = (lowerIdx + 1) % cardinalDegs.length;

  const lowerDeg = cardinalDegs[lowerIdx];
  let upperDeg = cardinalDegs[upperIdx];
  if (upperDeg <= lowerDeg) upperDeg += 360;

  const range = upperDeg - lowerDeg;
  const t = range > 0 ? (deg - lowerDeg) / range : 0;

  const lowerVal = precomputed[cardinals[lowerIdx]] ?? 0.5;
  const upperVal = precomputed[cardinals[upperIdx]] ?? 0.5;

  return lowerVal + t * (upperVal - lowerVal);
}
