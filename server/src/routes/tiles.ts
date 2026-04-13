import { Router } from 'express';

export function tilesRouter(tileserverUrl: string): Router {
  const router = Router();

  // GET /tiles/:z/:x/:y.pbf — proxy to tileserver-gl
  router.get('/:z/:x/:y.pbf', async (req, res) => {
    const { z, x, y } = req.params;

    const url = `${tileserverUrl}/data/depth-contours/${z}/${x}/${y}.pbf`;

    try {
      const upstream = await fetch(url);

      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }

      const buffer = await upstream.arrayBuffer();

      res.set({
        'Content-Type': 'application/x-protobuf',
        'Content-Encoding': upstream.headers.get('content-encoding') || 'identity',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });

      res.send(Buffer.from(buffer));
    } catch (err) {
      console.error(`Tile proxy error [${z}/${x}/${y}]:`, err);
      res.status(502).json({ error: 'Tileserver unavailable' });
    }
  });

  // TileJSON metadata endpoint
  router.get('/metadata', async (_req, res) => {
    const url = `${tileserverUrl}/data/depth-contours.json`;

    try {
      const upstream = await fetch(url);
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      const meta = await upstream.json();
      res.json(meta);
    } catch (err) {
      console.error('TileJSON proxy error:', err);
      res.status(502).json({ error: 'Tileserver unavailable' });
    }
  });

  return router;
}
