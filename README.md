# Strike Intel

Fishing-intelligence PWA for Lake Texoma. React + Vite frontend, Node/Express tile server, Firebase for auth + Firestore, Cloud Run for the backend.

- **Live app:** https://strike-intel.web.app
- **Backend API:** https://strike-intel-api-1030405922800.us-central1.run.app (called via `/api/*` same-origin rewrite — don't hit directly from the app)
- **Firebase console:** https://console.firebase.google.com/project/strike-intel
- **GCP console:** https://console.cloud.google.com/run?project=strike-intel

---

## Architecture at a glance

```
Browser (https://strike-intel.web.app)
 │
 ├── /                   → Firebase Hosting → dist/ (React PWA, MapLibre, MapTiler topo)
 ├── /api/**             → Firebase rewrite → Cloud Run (strike-intel-api, us-central1)
 │                         └── Express server → better-sqlite3 MBTiles + GeoJSON
 └── Firestore / Auth    → Firebase SDK directly (anonymous auth, `catches` subcollections)
```

**Why the `/api` rewrite trick:** the frontend calls `/api/...` same-origin, Firebase Hosting proxies it to Cloud Run. Result — no CORS, no separate backend URL to configure per env.

**Why Cloud Run `min-instances=0`:** scales to zero when idle → $0 while nobody's using it. Cold start is ~1s for the 19MB container.

---

## Project layout

```
.
├── src/                          # Frontend (React 19 + TS + Vite 7)
│   ├── pages/                    # HomePage, MapPage, CatchesPage
│   ├── components/
│   │   ├── map/                  # MapLibre container, catch pins, pattern layers
│   │   ├── catch/                # LogCatchForm (with EXIF extraction), CatchDetailSheet
│   │   ├── pattern/              # "Find similar spots" panel
│   │   └── weather/              # Solunar timeline
│   ├── services/
│   │   ├── firebase.ts           # SDK init + anonymous auth
│   │   ├── tileServer.ts         # Resolves the /api base URL per env
│   │   ├── exif.ts               # Extracts GPS/timestamp from uploaded photos
│   │   ├── lakeGrid.ts           # Fetches depth grid for pattern matching
│   │   ├── spotCharacteristics.ts
│   │   ├── weather.ts            # Open-Meteo fetch + normalization
│   │   ├── solunar.ts            # Moon / solunar tables
│   │   ├── patternEngine.ts      # Score candidate spots vs. a catch
│   │   └── conditionsMatcher.ts
│   ├── hooks/                    # useCatches, useGeolocation
│   └── store/                    # Zustand (selectedLake, pendingPin, mapCenter/Zoom, ...)
│
├── server/                       # Backend — deployed to Cloud Run
│   ├── src/index.js              # Express app; all routes mounted at /api
│   ├── data/
│   │   ├── tiles/                # <lake>.mbtiles (vector contours)
│   │   └── processed/<lake>/     # boundary.geojson, contours.geojson,
│   │                             # depth_points.geojson, metadata.json
│   ├── Dockerfile                # node:20-bookworm-slim, npm ci --omit=dev
│   └── .dockerignore             # excludes build-time-only data
│
├── firebase.json                 # Hosting config + /api rewrite to Cloud Run
├── .firebaserc                   # Project alias → strike-intel
├── .env                          # Firebase client config + (optional) overrides
└── .env.example
```

---

## Local development

Two processes — frontend on `:5173`, backend on `:3001`.

```bash
# Terminal 1 — backend (tile server)
cd server
npm install
node src/index.js

# Terminal 2 — frontend (Vite)
npm install
npm run dev -- --host     # --host is required so your phone can hit the LAN IP
```

The frontend's [`src/services/tileServer.ts`](src/services/tileServer.ts) auto-resolves:
- `http://localhost:3001/api` when running on `localhost`
- `http://<LAN-IP>:3001/api` when accessed from a phone via the LAN IP
- `/api` same-origin in production (Firebase rewrite handles it)

Override with `VITE_TILE_SERVER` in [.env](.env) if needed.

### Testing on a phone on the same Wi-Fi
1. Run both servers as above.
2. Get your Mac's LAN IP: `ipconfig getifaddr en0` (e.g. `192.168.1.175`).
3. Open `http://<LAN-IP>:5173` on the phone.
4. macOS may prompt to allow Node through the firewall — approve.

### Photo GPS testing
Android **strips GPS from photos by default**. Enable in Camera → Settings → "Save location" / "Location tags" / "Geotagging" AND grant precise location permission to Camera. Existing photos don't get GPS retroactively — take a new photo after enabling.

---

## Deploying updates

### Frontend only (most common — any UI change)

```bash
npm run build && firebase deploy --only hosting
```

- `npm run build` = `tsc -b && vite build`. **tsc runs in strict mode** (`noUnusedLocals`, `noUnusedParameters`); unused imports/vars will block the build. Prefix intentionally-unused variables with `_`.
- Hosting deploy is ~20 seconds.
- Cache-Control is already set: `/assets/**` is immutable (hashed filenames), `/index.html` is `no-cache`.

### Backend only (server code or data changes)

```bash
gcloud run deploy strike-intel-api \
  --source server \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=3 \
  --memory=512Mi \
  --cpu=1 \
  --project=strike-intel
```

- Cloud Build rebuilds the container from [`server/Dockerfile`](server/Dockerfile), pushes to Artifact Registry, rolls out the new revision. Takes 1-3 minutes.
- Traffic shifts to the new revision automatically. Rollback via `gcloud run services update-traffic strike-intel-api --to-revisions=<prev-rev>=100`.

### Both

```bash
gcloud run deploy strike-intel-api --source server --region us-central1 --project=strike-intel \
  && npm run build && firebase deploy --only hosting
```

### Smoke tests after deploy

```bash
# Frontend served
curl -sI https://strike-intel.web.app | head -3

# API routed through the hosting rewrite
curl -s https://strike-intel.web.app/api/lakes
curl -s -o /dev/null -w "%{http_code}\n" "https://strike-intel.web.app/api/boundary?lake=lake-texoma"
```

---

## First-time setup (if cloning fresh or on a new machine)

1. **Tools:**
   ```bash
   brew install --cask google-cloud-sdk   # gcloud
   npm i -g firebase-tools                # already in package.json but handy globally
   ```
2. **Auth:**
   ```bash
   gcloud auth login
   gcloud config set project strike-intel
   firebase login
   ```
3. **Create `.env`** — copy from `.env.example`, then paste Firebase Web App config from Firebase console → Project Settings → General → Your apps.

### If Cloud Run deploy fails with `PERMISSION_DENIED`
New GCP projects sometimes lack the right IAM bindings on the default Compute SA. These were granted during initial setup:
```bash
SA="1030405922800-compute@developer.gserviceaccount.com"
for role in cloudbuild.builds.builder storage.admin artifactregistry.writer logging.logWriter; do
  gcloud projects add-iam-policy-binding strike-intel --member="serviceAccount:$SA" --role="roles/$role"
done
```

---

## Environment variables

All client-side keys are prefixed `VITE_` (inlined into the bundle — never put secrets here).

| Key | Purpose |
|---|---|
| `VITE_FIREBASE_*` | Firebase Web SDK config (API key, auth domain, project ID, etc.) |
| `VITE_MAPTILER_KEY` | MapTiler basemap tiles |
| `VITE_NAVIONICS_KEY` | (optional) Navionics overlay |
| `VITE_TILE_SERVER` | Override tile-server URL (blank = auto-detect; see `tileServer.ts`) |

Server has no env vars beyond `PORT` (auto-set by Cloud Run to `8080`).

---

## Data pipeline (how tiles + depth data are made)

**Source:** TWDB (Texas Water Development Board) bathymetric shapefiles. Those lived in `server/data/shapefiles/` during initial processing and have since been removed to save disk (47GB). Re-download from TWDB if adding new lakes.

**Per lake, the runtime needs these files:**
- `server/data/tiles/<lake>.mbtiles` — vector contour tiles (built with tippecanoe)
- `server/data/processed/<lake>/boundary.geojson` — lake polygon
- `server/data/processed/<lake>/contours.geojson` — raw contour lines (filtered at request time by bbox)
- `server/data/processed/<lake>/depth_points.geojson` — sampled depth points (spatial-indexed at server startup)
- `server/data/processed/<lake>/metadata.json`

Currently shipping: `lake-texoma` only (~19MB total).

---

## Adding a new lake

1. Get TWDB shapefile + depth raster for the target lake.
2. Process: clip to boundary, generate `depth_points.geojson`, `contours.geojson`, `boundary.geojson` (GDAL + tippecanoe pipeline lives outside this repo — re-create or recover when needed).
3. Drop output into `server/data/tiles/<lake>.mbtiles` and `server/data/processed/<lake>/`.
4. Add the lake to the frontend list in [`src/pages/HomePage.tsx`](src/pages/HomePage.tsx) (`DEMO_LAKES`).
5. Redeploy backend — the server auto-discovers lakes from `server/data/tiles/`.

---

## Backend API reference

All routes mounted under `/api` (via Express Router in [`server/src/index.js`](server/src/index.js)). Also served directly on the Cloud Run service URL for debugging, but **the app uses `/api/...` via Firebase rewrite**.

| Route | Purpose |
|---|---|
| `GET /` | Health check |
| `GET /api/lakes` | List available lakes and their capabilities |
| `GET /api/tiles/:lake/:z/:x/:y.pbf` | Vector contour tiles (from MBTiles) |
| `GET /api/depth?lat=X&lng=Y&lake=ID` | Depth at a single point (IDW-interpolated from nearest 6) |
| `GET /api/depth/area?lake=ID&bbox=W,S,E,N&resolution=0.001` | Depth grid over a bbox |
| `GET /api/contours?lake=ID&bbox=W,S,E,N` | Contour GeoJSON (bbox-filtered) |
| `GET /api/boundary?lake=ID` | Lake boundary GeoJSON |

---

## Costs

Everything sits in the GCP/Firebase free tier at personal scale:

| Service | Free tier / month | Notes |
|---|---|---|
| Firebase Hosting | 10 GB storage, 360 MB/day transfer | Plenty for a PWA of this size |
| Cloud Run | 2M requests, 180k vCPU-sec, 360k GiB-sec | `min-instances=0` means $0 while idle |
| Firestore | 50k reads/day, 20k writes/day, 1 GiB storage | Anonymous-auth catches are light |
| Artifact Registry | 0.5 GB | Container image is ~100 MB |

If you outgrow the free tier, the biggest lever is Firestore reads — consider caching with React Query's `staleTime` (already in place for some calls).

---

## Gotchas encountered so far

- **Android strips photo GPS by default** — must enable "Save location" in Camera app. See "Photo GPS testing" above.
- **iOS Safari + HEIC:** `exifr` generally reads HEIC EXIF via ArrayBuffer, but some images have no GPS if Camera wasn't granted location. The form surfaces a `[debug]` line showing what tags were extracted.
- **React 19 + `useRef`:** strict TS requires an explicit initial value — `useRef<T>()` no longer compiles, use `useRef<T | undefined>(undefined)`.
- **`noUnusedLocals` + `_` prefix:** the underscore convention only silences `noUnusedParameters`, not `noUnusedLocals`. Delete dead locals instead.
- **Firebase rewrites + Cloud Run:** rewrite passes the full URL path through, so server routes must include the `/api` prefix (handled by mounting an Express Router at `/api`).
