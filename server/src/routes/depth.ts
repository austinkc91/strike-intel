import { Router } from 'express';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export function depthRouter(dataDir: string): Router {
  const router = Router();

  // GET /depth?lat=30.5&lng=-97.8&lake=lake-travis
  router.get('/', (req, res) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const lakeId = req.query.lake as string;

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: 'lat and lng query params required (numeric)' });
      return;
    }

    if (!lakeId) {
      res.status(400).json({ error: 'lake query param required' });
      return;
    }

    // Try the feet-converted raster first, fall back to clipped raster
    const depthFtPath = path.join(dataDir, lakeId, 'depth_ft.tif');
    const clippedPath = path.join(dataDir, lakeId, 'clipped.tif');

    let rasterPath: string;
    let isMeters: boolean;

    if (fs.existsSync(depthFtPath)) {
      rasterPath = depthFtPath;
      isMeters = false;
    } else if (fs.existsSync(clippedPath)) {
      rasterPath = clippedPath;
      isMeters = true;
    } else {
      res.status(404).json({ error: `No depth data for lake: ${lakeId}` });
      return;
    }

    try {
      // Use gdallocationinfo to sample the raster at exact lat/lng
      // -valonly returns just the value, -geoloc uses geographic coordinates
      const result = execSync(
        `gdallocationinfo -valonly -geoloc "${rasterPath}" ${lng} ${lat}`,
        { encoding: 'utf-8', timeout: 5000 },
      ).trim();

      if (!result || result === '' || result === 'nan') {
        res.status(404).json({
          error: 'No depth data at this location (outside lake boundary)',
          lat, lng, lake: lakeId,
        });
        return;
      }

      const rawValue = parseFloat(result);
      if (isNaN(rawValue) || rawValue <= -9999) {
        res.status(404).json({
          error: 'No depth data at this location (nodata pixel)',
          lat, lng, lake: lakeId,
        });
        return;
      }

      const depthFt = isMeters ? Math.abs(rawValue) * 3.28084 : Math.abs(rawValue);
      const depthM = isMeters ? Math.abs(rawValue) : Math.abs(rawValue) / 3.28084;

      res.json({
        lat,
        lng,
        lake: lakeId,
        depth_ft: Math.round(depthFt * 10) / 10,
        depth_m: Math.round(depthM * 10) / 10,
      });
    } catch (err) {
      console.error('Depth query error:', err);
      res.status(500).json({ error: 'Failed to query depth raster' });
    }
  });

  return router;
}
