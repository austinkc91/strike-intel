import { Router } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

interface ContourFeature {
  type: 'Feature';
  geometry: GeoJSON.Geometry;
  properties: {
    depth_ft: number;
    is_major: number;
    lake_id: string;
  };
}

export function contoursRouter(dataDir: string): Router {
  const router = Router();

  // GET /contours?bbox=-98.0,30.2,-97.5,30.6&lake=lake-travis&min_depth=0&max_depth=100
  router.get('/', (req, res) => {
    const bboxStr = req.query.bbox as string;
    const lakeId = req.query.lake as string;
    const minDepth = parseFloat((req.query.min_depth as string) || '0');
    const maxDepth = parseFloat((req.query.max_depth as string) || '9999');

    if (!bboxStr) {
      res.status(400).json({ error: 'bbox query param required (west,south,east,north)' });
      return;
    }

    const parts = bboxStr.split(',').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
      res.status(400).json({ error: 'bbox must be west,south,east,north (numeric)' });
      return;
    }

    const [west, south, east, north] = parts;

    // Find contour GeoJSON files
    const contourFiles: string[] = [];

    if (lakeId) {
      const geojsonPath = path.join(dataDir, lakeId, 'contours.geojson');
      if (fs.existsSync(geojsonPath)) {
        contourFiles.push(geojsonPath);
      } else {
        res.status(404).json({ error: `No contour data for lake: ${lakeId}` });
        return;
      }
    } else {
      // Search all lake directories
      const entries = fs.readdirSync(dataDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const geojsonPath = path.join(dataDir, entry.name, 'contours.geojson');
          if (fs.existsSync(geojsonPath)) {
            contourFiles.push(geojsonPath);
          }
        }
      }
    }

    if (contourFiles.length === 0) {
      res.json({
        type: 'FeatureCollection',
        features: [],
        bbox: [west, south, east, north],
      });
      return;
    }

    const features: ContourFeature[] = [];

    for (const filePath of contourFiles) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const geojson = JSON.parse(raw) as GeoJSON.FeatureCollection;

        for (const feature of geojson.features) {
          const depth = feature.properties?.depth_ft ?? 0;

          // Depth range filter
          if (depth < minDepth || depth > maxDepth) continue;

          // Bbox filter — check if any coordinate falls within bounds
          if (featureIntersectsBbox(feature.geometry, west, south, east, north)) {
            features.push(feature as ContourFeature);
          }
        }
      } catch (err) {
        console.error(`Error reading contours from ${filePath}:`, err);
      }
    }

    res.json({
      type: 'FeatureCollection',
      features,
      bbox: [west, south, east, north],
      count: features.length,
    });
  });

  return router;
}

function featureIntersectsBbox(
  geometry: GeoJSON.Geometry,
  west: number,
  south: number,
  east: number,
  north: number,
): boolean {
  const coords = extractCoords(geometry);
  return coords.some(
    ([lng, lat]) => lng >= west && lng <= east && lat >= south && lat <= north,
  );
}

function extractCoords(geometry: GeoJSON.Geometry): number[][] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates as number[]];
    case 'LineString':
      return geometry.coordinates as number[][];
    case 'Polygon':
      return (geometry.coordinates as number[][][]).flat();
    case 'MultiPoint':
      return geometry.coordinates as number[][];
    case 'MultiLineString':
      return (geometry.coordinates as number[][][]).flat();
    case 'MultiPolygon':
      return (geometry.coordinates as number[][][][]).flat(2);
    default:
      return [];
  }
}
