import type { DepthQueryResult, ContourQueryResult, TileMetadata } from '../types/depth';

const DEPTH_API_URL = import.meta.env.VITE_DEPTH_API_URL || 'http://localhost:3001';

/**
 * Query depth at a specific lat/lng coordinate
 */
export async function queryDepth(
  lat: number,
  lng: number,
  lakeId: string,
): Promise<DepthQueryResult> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lng: lng.toString(),
    lake: lakeId,
  });

  const res = await fetch(`${DEPTH_API_URL}/depth?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Depth query failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Query contour lines within a bounding box
 */
export async function queryContours(
  bbox: [number, number, number, number],
  lakeId?: string,
  minDepth?: number,
  maxDepth?: number,
): Promise<ContourQueryResult> {
  const params = new URLSearchParams({
    bbox: bbox.join(','),
  });

  if (lakeId) params.set('lake', lakeId);
  if (minDepth !== undefined) params.set('min_depth', minDepth.toString());
  if (maxDepth !== undefined) params.set('max_depth', maxDepth.toString());

  const res = await fetch(`${DEPTH_API_URL}/contours?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Contour query failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Get tile metadata (TileJSON)
 */
export async function getTileMetadata(): Promise<TileMetadata> {
  const res = await fetch(`${DEPTH_API_URL}/tiles/metadata`);
  if (!res.ok) {
    throw new Error(`Tile metadata fetch failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Build the vector tile URL template for MapLibre
 */
export function getVectorTileUrl(): string {
  return `${DEPTH_API_URL}/tiles/{z}/{x}/{y}.pbf`;
}
