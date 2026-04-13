import express from 'express';
import cors from 'cors';
import { depthRouter } from './routes/depth.js';
import { tilesRouter } from './routes/tiles.js';
import { contoursRouter } from './routes/contours.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const TILESERVER_URL = process.env.TILESERVER_URL || 'http://tileserver:8080';
const DATA_DIR = process.env.DATA_DIR || '/data/output';

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'strike-intel-depth-server' });
});

// Mount routes
app.use('/depth', depthRouter(DATA_DIR));
app.use('/tiles', tilesRouter(TILESERVER_URL));
app.use('/contours', contoursRouter(DATA_DIR));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Depth API server listening on :${PORT}`);
  console.log(`  Tileserver: ${TILESERVER_URL}`);
  console.log(`  Data dir:   ${DATA_DIR}`);
  console.log(`  Endpoints:`);
  console.log(`    GET /depth?lat=...&lng=...&lake=...`);
  console.log(`    GET /tiles/:z/:x/:y.pbf`);
  console.log(`    GET /contours?bbox=...&lake=...`);
});
