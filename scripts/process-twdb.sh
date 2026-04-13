#!/bin/zsh
# Process TWDB shapefiles into GeoJSON + vector tiles for Strike Intel
# Usage: ./scripts/process-twdb.sh [lake_name]
#   If lake_name provided, processes only that lake. Otherwise processes all.

set -e

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SHAPEFILE_DIR="$BASE_DIR/server/data/shapefiles"
OUTPUT_DIR="$BASE_DIR/server/data/processed"
TILES_DIR="$BASE_DIR/server/data/tiles"

mkdir -p "$OUTPUT_DIR" "$TILES_DIR"

# Lake ID mapping (TWDB name → app lake ID)
get_lake_id() {
  case "$1" in
    AlanHenry) echo "lake-alan-henry" ;;
    Belton) echo "lake-belton" ;;
    BobSandlin) echo "lake-bob-sandlin" ;;
    Bridgeport) echo "lake-bridgeport" ;;
    Buchanan) echo "lake-buchanan" ;;
    CedarCreek) echo "cedar-creek" ;;
    ChokeCanyon) echo "choke-canyon" ;;
    Conroe) echo "lake-conroe" ;;
    EagleMountain) echo "eagle-mountain" ;;
    Fork) echo "lake-fork" ;;
    Granbury) echo "lake-granbury" ;;
    Houston) echo "lake-houston" ;;
    JoePool) echo "joe-pool" ;;
    LBJ) echo "lake-lbj" ;;
    Lavon) echo "lake-lavon" ;;
    Lewisville) echo "lake-lewisville" ;;
    Livingston) echo "lake-livingston" ;;
    RayRoberts) echo "lake-ray-roberts" ;;
    Texoma) echo "lake-texoma" ;;
    Travis) echo "lake-travis" ;;
    *) echo "$1" ;;
  esac
}

process_lake() {
  local name="$1"
  local zip_file="$SHAPEFILE_DIR/${name}.zip"
  local lake_id="$(get_lake_id "$name")"

  if [ ! -f "$zip_file" ]; then
    echo "SKIP: No zip file for $name"
    return
  fi

  echo ""
  echo "============================================"
  echo "Processing: $name → $lake_id"
  echo "============================================"

  local work_dir="$SHAPEFILE_DIR/_work/$name"
  local out_dir="$OUTPUT_DIR/$lake_id"
  mkdir -p "$work_dir" "$out_dir"

  # Unzip
  echo "[1/5] Unzipping..."
  unzip -qo "$zip_file" -d "$work_dir"

  # Find contour shapefiles (try 2ft first, then 5ft, then any *cont*)
  local contour_shp=""
  contour_shp=$(find "$work_dir" -name "*2ftcont*" -name "*.shp" | head -1)
  if [ -z "$contour_shp" ]; then
    contour_shp=$(find "$work_dir" -name "*5ftcont*" -name "*.shp" | head -1)
  fi
  if [ -z "$contour_shp" ]; then
    contour_shp=$(find "$work_dir" -iname "*cont*" -name "*.shp" | head -1)
  fi

  # Find depth points shapefile
  local points_shp=""
  points_shp=$(find "$work_dir" -name "*SDIPoints*" -name "*.shp" | head -1)
  if [ -z "$points_shp" ]; then
    points_shp=$(find "$work_dir" -name "*SDI*" -name "*.shp" | head -1)
  fi
  if [ -z "$points_shp" ]; then
    points_shp=$(find "$work_dir" -name "*interp*" -name "*.shp" | head -1)
  fi

  # Find lake boundary shapefile
  local boundary_shp=""
  boundary_shp=$(find "$work_dir" -name "*Lake*83*" -name "*.shp" | head -1)
  if [ -z "$boundary_shp" ]; then
    boundary_shp=$(find "$work_dir" -iname "*lake*" -name "*.shp" | head -1)
  fi

  # Process contours
  if [ -n "$contour_shp" ]; then
    echo "[2/5] Converting contours → GeoJSON (reprojecting to WGS84)..."
    ogr2ogr \
      -f GeoJSON \
      -t_srs EPSG:4326 \
      -lco COORDINATE_PRECISION=6 \
      "$out_dir/contours.geojson" \
      "$contour_shp" \
      2>/dev/null

    # Add level property for major/minor contour styling
    python3 -c "
import json, sys
with open('$out_dir/contours.geojson', 'r') as f:
    data = json.load(f)
for feat in data.get('features', []):
    elev = feat['properties'].get('CONTOUR') or feat['properties'].get('Contour') or feat['properties'].get('ELEVATION') or 0
    feat['properties']['depth_ft'] = elev
    feat['properties']['level'] = 1 if elev % 10 == 0 else 0
    feat['properties']['major'] = 1 if elev % 10 == 0 else 0
with open('$out_dir/contours.geojson', 'w') as f:
    json.dump(data, f)
print(f'  Contours: {len(data[\"features\"])} features')
" 2>/dev/null || echo "  Warning: Could not add level properties"
  else
    echo "[2/5] SKIP: No contour shapefile found"
  fi

  # Process depth points (sample to reduce file size — keep every Nth point)
  if [ -n "$points_shp" ]; then
    echo "[3/5] Converting depth points → GeoJSON..."

    # Get point count
    local point_count
    point_count=$(ogrinfo -so "$points_shp" $(basename "${points_shp%.shp}") 2>/dev/null | grep "Feature Count" | awk '{print $3}')
    echo "  Raw points: $point_count"

    # For large point sets, we'll create a sampled version for the depth grid
    # and use ogr2ogr SQL to reproject and select needed fields
    local layer_name
    layer_name=$(basename "${points_shp%.shp}")

    ogr2ogr \
      -f GeoJSON \
      -t_srs EPSG:4326 \
      -lco COORDINATE_PRECISION=6 \
      "$out_dir/depth_points.geojson" \
      "$points_shp" \
      -sql "SELECT * FROM \"$layer_name\" WHERE FID % 10 = 0" \
      2>/dev/null || \
    ogr2ogr \
      -f GeoJSON \
      -t_srs EPSG:4326 \
      -lco COORDINATE_PRECISION=6 \
      "$out_dir/depth_points.geojson" \
      "$points_shp" \
      2>/dev/null

    # Extract depth values and convert elevation to depth
    python3 << PYEOF
import json
try:
    with open("${out_dir}/depth_points.geojson", "r") as f:
        data = json.load(f)

    features = data.get("features", [])
    if not features:
        print("  No depth point features found")
    else:
        # Find the surface elevation (max elevation = shoreline)
        elevations = []
        for feat in features:
            props = feat.get("properties", {})
            elev = props.get("Pre_Elevat") or props.get("Current_El") or props.get("ELEVATION")
            if elev is not None:
                elevations.append(float(elev))

        if elevations:
            surface_elev = max(elevations)
            print(f"  Surface elevation: {surface_elev:.1f} ft")
            print(f"  Min elevation: {min(elevations):.1f} ft")
            print(f"  Depth range: 0 - {surface_elev - min(elevations):.1f} ft")

            # Convert to depth and simplify properties
            simplified = []
            for feat in features:
                props = feat.get("properties", {})
                elev = props.get("Pre_Elevat") or props.get("Current_El") or props.get("ELEVATION")
                if elev is not None:
                    depth = round(surface_elev - float(elev), 1)
                    if depth >= 0:
                        coords = feat["geometry"]["coordinates"]
                        simplified.append({
                            "type": "Feature",
                            "properties": {
                                "depth_ft": depth,
                                "elevation_ft": round(float(elev), 1)
                            },
                            "geometry": {
                                "type": "Point",
                                "coordinates": [round(coords[0], 6), round(coords[1], 6)]
                            }
                        })

            data["features"] = simplified
            with open("${out_dir}/depth_points.geojson", "w") as f:
                json.dump(data, f)
            print(f"  Saved {len(simplified)} depth points")
        else:
            print("  No elevation values found in properties")
except Exception as e:
    print(f"  Warning: {e}")
PYEOF
  else
    echo "[3/5] SKIP: No depth points shapefile found"
  fi

  # Process lake boundary
  if [ -n "$boundary_shp" ]; then
    echo "[4/5] Converting lake boundary → GeoJSON..."
    ogr2ogr \
      -f GeoJSON \
      -t_srs EPSG:4326 \
      -lco COORDINATE_PRECISION=6 \
      "$out_dir/boundary.geojson" \
      "$boundary_shp" \
      2>/dev/null
  else
    echo "[4/5] SKIP: No boundary shapefile found"
  fi

  # Generate vector tiles from contours
  if [ -f "$out_dir/contours.geojson" ]; then
    echo "[5/5] Generating vector tiles with tippecanoe..."
    tippecanoe \
      -o "$TILES_DIR/${lake_id}.mbtiles" \
      -z 16 \
      -Z 8 \
      --drop-densest-as-needed \
      --extend-zooms-if-still-dropping \
      -l contours \
      --name "${name} Contours" \
      --force \
      "$out_dir/contours.geojson" \
      2>/dev/null

    echo "  Tiles: $TILES_DIR/${lake_id}.mbtiles"
  else
    echo "[5/5] SKIP: No contours to tile"
  fi

  # Write metadata
  python3 -c "
import json, os, glob
meta = {
    'lake_id': '$lake_id',
    'twdb_name': '$name',
    'has_contours': os.path.exists('$out_dir/contours.geojson'),
    'has_depth_points': os.path.exists('$out_dir/depth_points.geojson'),
    'has_boundary': os.path.exists('$out_dir/boundary.geojson'),
    'has_tiles': os.path.exists('$TILES_DIR/${lake_id}.mbtiles'),
}
with open('$out_dir/metadata.json', 'w') as f:
    json.dump(meta, f, indent=2)
"

  # Cleanup work directory to save space
  rm -rf "$work_dir"

  echo "[DONE] $name → $out_dir"
}

# Main
if [ -n "$1" ]; then
  process_lake "$1"
else
  for zip_file in "$SHAPEFILE_DIR"/*.zip; do
    name=$(basename "${zip_file%.zip}")
    process_lake "$name"
  done
fi

echo ""
echo "============================================"
echo "All lakes processed!"
echo "Processed data: $OUTPUT_DIR"
echo "Vector tiles: $TILES_DIR"
echo "============================================"
