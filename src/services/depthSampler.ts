// Depth sampler: queries depth at any lat/lng from DEM tiles
// Uses canvas-based sampling of Terrain-RGB encoded tiles

let cachedCanvas: HTMLCanvasElement | null = null;
let cachedCtx: CanvasRenderingContext2D | null = null;

function getCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!cachedCanvas || !cachedCtx) {
    cachedCanvas = document.createElement('canvas');
    cachedCanvas.width = 256;
    cachedCanvas.height = 256;
    cachedCtx = cachedCanvas.getContext('2d', { willReadFrequently: true })!;
  }
  return { canvas: cachedCanvas, ctx: cachedCtx };
}

// Decode Terrarium encoding: elevation = (R * 256 + G + B / 256) - 32768
function decodeTerrariumPixel(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

// Convert lat/lng to tile x/y at a given zoom
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number; px: number; py: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);

  // Pixel position within the tile (0-255)
  const px = Math.floor((((lng + 180) / 360) * n - x) * 256);
  const py = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n - y) * 256);

  return { x, y, px, py };
}

const tileCache = new Map<string, ImageData | null>();

async function loadTile(url: string): Promise<ImageData | null> {
  if (tileCache.has(url)) return tileCache.get(url)!;

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Tile load failed'));
      img.src = url;
    });

    const { ctx } = getCanvas();
    ctx.drawImage(img, 0, 0, 256, 256);
    const imageData = ctx.getImageData(0, 0, 256, 256);
    tileCache.set(url, imageData);
    return imageData;
  } catch {
    tileCache.set(url, null);
    return null;
  }
}

export async function sampleDepth(
  lat: number,
  lng: number,
  tileUrlTemplate: string,
  zoom: number = 14,
): Promise<number | null> {
  const { x, y, px, py } = latLngToTile(lat, lng, zoom);
  const url = tileUrlTemplate
    .replace('{z}', zoom.toString())
    .replace('{x}', x.toString())
    .replace('{y}', y.toString());

  const imageData = await loadTile(url);
  if (!imageData) return null;

  const idx = (py * 256 + px) * 4;
  const r = imageData.data[idx];
  const g = imageData.data[idx + 1];
  const b = imageData.data[idx + 2];

  const elevationM = decodeTerrariumPixel(r, g, b);

  // For lake bathymetry, depth is typically negative elevation
  // Convert meters to feet
  const depthFt = Math.abs(elevationM) * 3.28084;

  return Math.round(depthFt * 10) / 10;
}

export function clearTileCache(): void {
  tileCache.clear();
}
