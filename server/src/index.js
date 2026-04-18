const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

const api = express.Router();
app.use('/api', api);

// Health check for Cloud Run
app.get('/', (_req, res) => res.json({ ok: true, service: 'strike-intel-api' }));

// ============================================================
// Data directories
// ============================================================
const TILES_DIR = path.join(__dirname, '..', 'data', 'tiles');
const PROCESSED_DIR = path.join(__dirname, '..', 'data', 'processed');

// ============================================================
// Cache: loaded MBTiles databases and depth point indexes
// ============================================================
const tileDBs = {};       // lakeId → better-sqlite3 Database
const depthIndexes = {};   // lakeId → spatial grid of depth points

function getTileDB(lakeId) {
  if (tileDBs[lakeId]) return tileDBs[lakeId];

  const mbtilesPath = path.join(TILES_DIR, `${lakeId}.mbtiles`);
  if (!fs.existsSync(mbtilesPath)) return null;

  const db = new Database(mbtilesPath, { readonly: true });
  tileDBs[lakeId] = db;
  return db;
}

// ============================================================
// Spatial index for depth queries (simple grid-based)
// ============================================================
function loadDepthIndex(lakeId) {
  if (depthIndexes[lakeId]) return depthIndexes[lakeId];

  const pointsFile = path.join(PROCESSED_DIR, lakeId, 'depth_points.geojson');
  if (!fs.existsSync(pointsFile)) return null;

  console.log(`Loading depth index for ${lakeId}...`);
  const data = JSON.parse(fs.readFileSync(pointsFile, 'utf-8'));

  // Build a grid index (0.001 degree cells ≈ 100m)
  const CELL_SIZE = 0.001;
  const grid = {};
  let bounds = { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 };

  for (const feat of data.features) {
    const [lng, lat] = feat.geometry.coordinates;
    const depth = feat.properties.depth_ft;

    const cellKey = `${Math.floor(lat / CELL_SIZE)}_${Math.floor(lng / CELL_SIZE)}`;

    if (!grid[cellKey]) {
      grid[cellKey] = [];
    }
    grid[cellKey].push({ lat, lng, depth });

    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
  }

  const index = { grid, bounds, cellSize: CELL_SIZE, pointCount: data.features.length };
  depthIndexes[lakeId] = index;
  console.log(`  Loaded ${data.features.length} points for ${lakeId}`);
  return index;
}

// ============================================================
// API Routes
// ============================================================

// GET /lakes - list available lakes with data
api.get('/lakes', (req, res) => {
  const lakes = [];
  if (!fs.existsSync(PROCESSED_DIR)) return res.json(lakes);

  for (const dir of fs.readdirSync(PROCESSED_DIR)) {
    const metaFile = path.join(PROCESSED_DIR, dir, 'metadata.json');
    const depthFile = path.join(PROCESSED_DIR, dir, 'depth_points.geojson');
    const contourFile = path.join(PROCESSED_DIR, dir, 'contours.geojson');
    const tilesFile = path.join(TILES_DIR, `${dir}.mbtiles`);

    lakes.push({
      lake_id: dir,
      has_contours: fs.existsSync(contourFile),
      has_depth_points: fs.existsSync(depthFile),
      has_tiles: fs.existsSync(tilesFile),
    });
  }

  res.json(lakes);
});

// GET /tiles/:lakeId/:z/:x/:y.pbf - serve vector tiles from MBTiles
api.get('/tiles/:lakeId/:z/:x/:y.pbf', (req, res) => {
  const { lakeId, z, x, y } = req.params;
  const db = getTileDB(lakeId);

  if (!db) {
    return res.status(404).json({ error: `No tiles for lake: ${lakeId}` });
  }

  // MBTiles uses TMS y-coordinate (flipped)
  const tmsY = Math.pow(2, parseInt(z)) - 1 - parseInt(y);

  const row = db.prepare(
    'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?'
  ).get(parseInt(z), parseInt(x), tmsY);

  if (!row) {
    return res.status(204).send();
  }

  // Check if client accepts gzip — if not, decompress
  const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip');

  if (acceptsGzip) {
    res.set({
      'Content-Type': 'application/x-protobuf',
      'Content-Encoding': 'gzip',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });
    res.send(row.tile_data);
  } else {
    // Decompress for clients that don't handle gzip well
    zlib.gunzip(row.tile_data, (err, decompressed) => {
      if (err) {
        res.set({ 'Content-Type': 'application/x-protobuf', 'Content-Encoding': 'gzip', 'Access-Control-Allow-Origin': '*' });
        res.send(row.tile_data);
      } else {
        res.set({ 'Content-Type': 'application/x-protobuf', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' });
        res.send(decompressed);
      }
    });
  }
});

// GET /depth?lat=X&lng=Y&lake=lakeId - query depth at a point
api.get('/depth', (req, res) => {
  const { lat, lng, lake } = req.query;

  if (!lat || !lng || !lake) {
    return res.status(400).json({ error: 'Required: lat, lng, lake' });
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const index = loadDepthIndex(lake);

  if (!index) {
    return res.status(404).json({ error: `No depth data for lake: ${lake}` });
  }

  // Find nearest point using grid index
  const result = queryDepthAt(index, latNum, lngNum);

  if (!result) {
    return res.json({ depth_ft: null, distance_m: null, message: 'No depth data at this location' });
  }

  res.json(result);
});

// GET /depth/area?lake=X&bbox=west,south,east,north&resolution=N
// Returns a grid of depth values for pattern engine
api.get('/depth/area', (req, res) => {
  const { lake, bbox, resolution } = req.query;

  if (!lake || !bbox) {
    return res.status(400).json({ error: 'Required: lake, bbox (west,south,east,north)' });
  }

  const [west, south, east, north] = bbox.split(',').map(Number);
  const res_deg = parseFloat(resolution) || 0.001; // ~100m default

  const index = loadDepthIndex(lake);
  if (!index) {
    return res.status(404).json({ error: `No depth data for lake: ${lake}` });
  }

  const grid = [];
  for (let lat = south; lat <= north; lat += res_deg) {
    for (let lng = west; lng <= east; lng += res_deg) {
      const result = queryDepthAt(index, lat, lng);
      if (result && result.depth_ft !== null) {
        grid.push({
          lat: Math.round(lat * 1000000) / 1000000,
          lng: Math.round(lng * 1000000) / 1000000,
          depth_ft: result.depth_ft,
        });
      }
    }
  }

  res.json({
    lake_id: lake,
    bbox: { west, south, east, north },
    resolution_deg: res_deg,
    points: grid,
    count: grid.length,
  });
});

// GET /contours?lake=X&bbox=west,south,east,north - return contour GeoJSON in bbox
api.get('/contours', (req, res) => {
  const { lake, bbox } = req.query;

  if (!lake) {
    return res.status(400).json({ error: 'Required: lake' });
  }

  const contourFile = path.join(PROCESSED_DIR, lake, 'contours.geojson');
  if (!fs.existsSync(contourFile)) {
    return res.status(404).json({ error: `No contour data for lake: ${lake}` });
  }

  // Read and optionally filter by bbox
  const data = JSON.parse(fs.readFileSync(contourFile, 'utf-8'));

  if (bbox) {
    const [west, south, east, north] = bbox.split(',').map(Number);
    data.features = data.features.filter(feat => {
      const coords = feat.geometry.coordinates;
      // Check if any coordinate falls within bbox
      const flatCoords = feat.geometry.type === 'MultiLineString'
        ? coords.flat()
        : coords;

      return flatCoords.some(c => {
        const [lng, lat] = c;
        return lng >= west && lng <= east && lat >= south && lat <= north;
      });
    });
  }

  res.set({
    'Content-Type': 'application/geo+json',
    'Cache-Control': 'public, max-age=3600',
  });

  res.json(data);
});

// GET /boundary?lake=X - return lake boundary GeoJSON
api.get('/boundary', (req, res) => {
  const { lake } = req.query;
  if (!lake) return res.status(400).json({ error: 'Required: lake' });

  const boundaryFile = path.join(PROCESSED_DIR, lake, 'boundary.geojson');
  if (!fs.existsSync(boundaryFile)) {
    return res.status(404).json({ error: `No boundary for lake: ${lake}` });
  }

  res.set({ 'Content-Type': 'application/geo+json', 'Cache-Control': 'public, max-age=86400' });
  res.sendFile(boundaryFile);
});

// ============================================================
// Depth query helper (IDW interpolation from nearest points)
// ============================================================
function queryDepthAt(index, lat, lng) {
  const { grid, cellSize } = index;
  const cellX = Math.floor(lng / cellSize);
  const cellY = Math.floor(lat / cellSize);

  // Search in surrounding cells (3x3)
  let nearest = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const key = `${cellY + dy}_${cellX + dx}`;
      const points = grid[key];
      if (points) {
        for (const p of points) {
          const dist = haversineDistance(lat, lng, p.lat, p.lng);
          nearest.push({ ...p, distance: dist });
        }
      }
    }
  }

  if (nearest.length === 0) return null;

  // Sort by distance
  nearest.sort((a, b) => a.distance - b.distance);

  // If closest point is very near, just use it
  if (nearest[0].distance < 10) {
    return {
      depth_ft: nearest[0].depth,
      distance_m: Math.round(nearest[0].distance),
      method: 'nearest',
    };
  }

  // IDW interpolation from up to 6 nearest points
  const k = Math.min(6, nearest.length);
  let weightSum = 0;
  let depthSum = 0;

  for (let i = 0; i < k; i++) {
    const w = 1 / Math.pow(nearest[i].distance, 2);
    weightSum += w;
    depthSum += w * nearest[i].depth;
  }

  return {
    depth_ft: Math.round((depthSum / weightSum) * 10) / 10,
    distance_m: Math.round(nearest[0].distance),
    method: 'idw',
    neighbors: k,
  };
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// Start server
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  // List available lakes
  const lakes = fs.existsSync(TILES_DIR)
    ? fs.readdirSync(TILES_DIR).filter(f => f.endsWith('.mbtiles')).map(f => f.replace('.mbtiles', ''))
    : [];

  console.log(`\nStrike Intel Tile Server running on http://localhost:${PORT}`);
  console.log(`Available lakes (${lakes.length}):`);
  lakes.forEach(l => console.log(`  - ${l}`));
  console.log(`\nEndpoints (all prefixed with /api):`);
  console.log(`  GET /api/lakes                          - List available lakes`);
  console.log(`  GET /api/tiles/:lake/:z/:x/:y.pbf       - Vector contour tiles`);
  console.log(`  GET /api/depth?lat=X&lng=Y&lake=ID      - Depth at point`);
  console.log(`  GET /api/depth/area?lake=ID&bbox=W,S,E,N - Depth grid for area`);
  console.log(`  GET /api/contours?lake=ID&bbox=W,S,E,N  - Contour GeoJSON`);
  console.log(`  GET /api/boundary?lake=ID               - Lake boundary`);
  console.log('');
});
