#!/usr/bin/env bash
#
# Lake Depth Tile Pipeline
# Processes GLOBathy raster → clipped per-lake → 1-ft contours → vector tiles
#
# Usage: ./process.sh [config.yaml]
#
set -euo pipefail

CONFIG="${1:-/pipeline/config.yaml}"

if [ ! -f "$CONFIG" ]; then
  echo "ERROR: Config file not found: $CONFIG"
  echo "Copy config.example.yaml to config.yaml and configure."
  exit 1
fi

# Parse config with Python (avoids yq dependency)
parse_config() {
  python3 -c "
import yaml, sys, json
with open('$CONFIG') as f:
    cfg = yaml.safe_load(f)
print(json.dumps(cfg))
"
}

CONFIG_JSON=$(parse_config)

GLOBATHY_RASTER=$(echo "$CONFIG_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['globathy_raster'])")
OUTPUT_DIR=$(echo "$CONFIG_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['output_dir'])")
CONTOUR_INTERVAL=$(echo "$CONFIG_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('contour_interval_ft', 1))")
MAJOR_INTERVAL=$(echo "$CONFIG_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('major_contour_interval_ft', 5))")
MIN_ZOOM=$(echo "$CONFIG_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('min_zoom', 8))")
MAX_ZOOM=$(echo "$CONFIG_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('max_zoom', 16))")
LAKES_JSON=$(echo "$CONFIG_JSON" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('lakes', [])))")

if [ ! -f "$GLOBATHY_RASTER" ]; then
  echo "ERROR: GLOBathy raster not found: $GLOBATHY_RASTER"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

LAKE_COUNT=$(echo "$LAKES_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "=== Lake Depth Tile Pipeline ==="
echo "Raster:    $GLOBATHY_RASTER"
echo "Output:    $OUTPUT_DIR"
echo "Contours:  ${CONTOUR_INTERVAL}ft (major every ${MAJOR_INTERVAL}ft)"
echo "Zooms:     $MIN_ZOOM - $MAX_ZOOM"
echo "Lakes:     $LAKE_COUNT"
echo ""

ALL_GEOJSON_FILES=""

for i in $(seq 0 $((LAKE_COUNT - 1))); do
  LAKE_ID=$(echo "$LAKES_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)[$i]['id'])")
  LAKE_NAME=$(echo "$LAKES_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)[$i]['name'])")
  BOUNDARY=$(echo "$LAKES_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)[$i]['boundary_geojson'])")
  LAKE_INTERVAL=$(echo "$LAKES_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)[$i].get('contour_interval_ft', $CONTOUR_INTERVAL))")

  echo "--- Processing: $LAKE_NAME ($LAKE_ID) ---"

  if [ ! -f "$BOUNDARY" ]; then
    echo "  WARN: Boundary not found: $BOUNDARY — skipping"
    continue
  fi

  LAKE_DIR="$OUTPUT_DIR/$LAKE_ID"
  mkdir -p "$LAKE_DIR"

  # Step 1: Clip raster to lake boundary
  echo "  [1/4] Clipping raster to lake boundary..."
  CLIPPED="$LAKE_DIR/clipped.tif"
  gdalwarp \
    -cutline "$BOUNDARY" \
    -crop_to_cutline \
    -dstnodata -9999 \
    -co COMPRESS=LZW \
    -co TILED=YES \
    "$GLOBATHY_RASTER" \
    "$CLIPPED" \
    -overwrite -q

  # Step 2: Convert depth from meters to feet
  echo "  [2/4] Converting depth meters → feet..."
  DEPTH_FT="$LAKE_DIR/depth_ft.tif"
  gdal_calc.py \
    -A "$CLIPPED" \
    --outfile="$DEPTH_FT" \
    --calc="A * 3.28084" \
    --NoDataValue=-9999 \
    --co=COMPRESS=LZW \
    --co=TILED=YES \
    --overwrite -q

  # Step 3: Generate contours
  echo "  [3/4] Generating ${LAKE_INTERVAL}ft contour lines..."
  CONTOURS_RAW="$LAKE_DIR/contours_raw.gpkg"
  CONTOURS_GEOJSON="$LAKE_DIR/contours.geojson"

  gdal_contour \
    -a depth_ft \
    -i "$LAKE_INTERVAL" \
    -f GPKG \
    "$DEPTH_FT" \
    "$CONTOURS_RAW"

  # Add metadata: is_major flag, lake_id
  ogr2ogr \
    -f GeoJSON \
    -sql "SELECT depth_ft, CASE WHEN CAST(depth_ft AS INTEGER) % $MAJOR_INTERVAL = 0 THEN 1 ELSE 0 END AS is_major, '$LAKE_ID' AS lake_id FROM contour" \
    "$CONTOURS_GEOJSON" \
    "$CONTOURS_RAW" \
    -overwrite

  FEATURE_COUNT=$(ogrinfo -so "$CONTOURS_GEOJSON" contour 2>/dev/null | grep "Feature Count" | awk '{print $3}' || echo "?")
  echo "  Generated $FEATURE_COUNT contour features"

  ALL_GEOJSON_FILES="$ALL_GEOJSON_FILES $CONTOURS_GEOJSON"

  # Also create a depth raster tile (MBTiles) for point-query sampling
  echo "  [4/4] Creating depth raster MBTiles for point queries..."
  DEPTH_MBTILES="$LAKE_DIR/depth_raster.mbtiles"
  gdal_translate \
    -of MBTiles \
    -co TILE_FORMAT=PNG \
    "$DEPTH_FT" \
    "$DEPTH_MBTILES" \
    -overwrite -q 2>/dev/null || true

  if [ -f "$DEPTH_MBTILES" ]; then
    gdaladdo "$DEPTH_MBTILES" 2 4 8 16 -q 2>/dev/null || true
  fi

  echo "  Done: $LAKE_NAME"
  echo ""
done

# Step 5: Merge all lake contours into vector tiles with tippecanoe
if [ -n "$ALL_GEOJSON_FILES" ]; then
  echo "=== Building vector tileset (tippecanoe) ==="
  VECTOR_MBTILES="$OUTPUT_DIR/depth-contours.mbtiles"

  # shellcheck disable=SC2086
  tippecanoe \
    -o "$VECTOR_MBTILES" \
    --force \
    --name="Lake Depth Contours" \
    --description="GLOBathy-derived bathymetric contours" \
    --layer=depth_contours \
    --minimum-zoom="$MIN_ZOOM" \
    --maximum-zoom="$MAX_ZOOM" \
    --simplification=4 \
    --detect-shared-borders \
    --coalesce-densest-as-needed \
    --extend-zooms-if-still-dropping \
    $ALL_GEOJSON_FILES

  echo "Vector tiles: $VECTOR_MBTILES"

  # Generate tileserver-gl config
  cat > "$OUTPUT_DIR/tileserver-config.json" <<TSCFG
{
  "options": {
    "paths": {
      "mbtiles": "/data/output"
    }
  },
  "data": {
    "depth-contours": {
      "mbtiles": "depth-contours.mbtiles"
    }
  }
}
TSCFG

  echo "Tileserver config: $OUTPUT_DIR/tileserver-config.json"
fi

echo ""
echo "=== Pipeline complete ==="
echo "Output directory: $OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "  1. Start tileserver-gl: docker compose up tileserver"
echo "  2. Start API server:    docker compose up api"
echo "  3. Tiles available at:  http://localhost:8080/data/depth-contours/{z}/{x}/{y}.pbf"
