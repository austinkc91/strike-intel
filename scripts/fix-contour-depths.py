#!/usr/bin/env python3
"""
Fix contour data for all lakes:
1. Convert elevation values to depth (surface - elevation)
2. For lakes with only 5ft contours, generate 1ft contours from depth points using GDAL
3. Re-generate vector tiles
"""

import json
import os
import subprocess
import sys
import tempfile

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCESSED_DIR = os.path.join(BASE_DIR, "server/data/processed")
TILES_DIR = os.path.join(BASE_DIR, "server/data/tiles")

# Surface elevations per lake (from depth point analysis)
# These are the max elevation values = lake surface level
SURFACE_ELEVATIONS = {}


def get_surface_elevation(lake_id):
    """Get surface elevation from depth_points.geojson."""
    if lake_id in SURFACE_ELEVATIONS:
        return SURFACE_ELEVATIONS[lake_id]

    points_file = os.path.join(PROCESSED_DIR, lake_id, "depth_points.geojson")
    if not os.path.exists(points_file):
        return None

    with open(points_file) as f:
        data = json.load(f)

    if not data.get("features"):
        return None

    elevations = []
    for feat in data["features"]:
        elev = feat["properties"].get("elevation_ft")
        if elev is not None:
            elevations.append(elev)

    if not elevations:
        return None

    surface = max(elevations)
    SURFACE_ELEVATIONS[lake_id] = surface
    return surface


def fix_contour_elevations(lake_id):
    """Convert contour elevation values to depth values."""
    contour_file = os.path.join(PROCESSED_DIR, lake_id, "contours.geojson")
    if not os.path.exists(contour_file):
        print(f"  {lake_id}: no contours.geojson")
        return False

    surface = get_surface_elevation(lake_id)
    if surface is None:
        print(f"  {lake_id}: no surface elevation found")
        return False

    with open(contour_file) as f:
        data = json.load(f)

    features = data.get("features", [])
    if not features:
        print(f"  {lake_id}: no contour features")
        return False

    # Check if contours are already depth (values near 0-100) or elevation (values 100-2000+)
    sample_vals = []
    for feat in features[:20]:
        val = (feat["properties"].get("depth_ft")
               or feat["properties"].get("CONTOUR")
               or feat["properties"].get("ANNO")
               or feat["properties"].get("Contour")
               or 0)
        sample_vals.append(val)

    avg_val = sum(sample_vals) / max(len(sample_vals), 1)

    # If average value > 100, these are likely elevations, not depths
    if avg_val > 100:
        print(f"  {lake_id}: converting elevation→depth (surface={surface:.0f}ft, avg contour={avg_val:.0f}ft)")
        is_elevation = True
    else:
        print(f"  {lake_id}: contours appear to already be depth values (avg={avg_val:.0f}ft)")
        is_elevation = False

    # Determine contour interval
    contour_vals = set()
    for feat in features:
        val = (feat["properties"].get("CONTOUR")
               or feat["properties"].get("ANNO")
               or feat["properties"].get("Contour")
               or feat["properties"].get("depth_ft")
               or 0)
        contour_vals.add(val)

    sorted_vals = sorted(contour_vals)
    if len(sorted_vals) >= 2:
        intervals = [sorted_vals[i+1] - sorted_vals[i] for i in range(min(10, len(sorted_vals)-1))]
        interval = min(i for i in intervals if i > 0) if any(i > 0 for i in intervals) else 5
    else:
        interval = 5

    print(f"  {lake_id}: contour interval={interval}ft, {len(features)} features")

    # Update features
    for feat in features:
        raw_val = (feat["properties"].get("CONTOUR")
                   or feat["properties"].get("ANNO")
                   or feat["properties"].get("Contour")
                   or feat["properties"].get("depth_ft")
                   or 0)

        if is_elevation:
            depth = round(surface - raw_val, 1)
        else:
            depth = raw_val

        # Clamp to >= 0
        depth = max(0, depth)

        feat["properties"]["depth_ft"] = depth
        feat["properties"]["elevation_ft"] = raw_val if is_elevation else round(surface - depth, 1)
        feat["properties"]["level"] = 1 if depth % 10 == 0 else 0
        feat["properties"]["major"] = 1 if depth % 10 == 0 else 0

    with open(contour_file, "w") as f:
        json.dump(data, f)

    return interval


def generate_fine_contours(lake_id, target_interval=2):
    """
    Generate finer contour lines from depth points using GDAL.
    1. Rasterize depth points to a grid
    2. Run gdal_contour to generate contour lines
    """
    points_file = os.path.join(PROCESSED_DIR, lake_id, "depth_points.geojson")
    if not os.path.exists(points_file):
        print(f"  {lake_id}: no depth points for fine contour generation")
        return False

    surface = get_surface_elevation(lake_id)
    if surface is None:
        return False

    print(f"  {lake_id}: generating {target_interval}ft contours from depth points...")

    out_dir = os.path.join(PROCESSED_DIR, lake_id)
    tmp_raster = os.path.join(out_dir, "_tmp_depth.tif")
    tmp_contour = os.path.join(out_dir, "_tmp_contours.geojson")

    # Step 1: Get bounds from depth points
    with open(points_file) as f:
        data = json.load(f)

    lngs = [f["geometry"]["coordinates"][0] for f in data["features"]]
    lats = [f["geometry"]["coordinates"][1] for f in data["features"]]
    west, east = min(lngs), max(lngs)
    south, north = min(lats), max(lats)

    # Step 2: Create a temporary CSV for gdal_grid
    csv_file = os.path.join(out_dir, "_tmp_points.csv")
    vrt_file = os.path.join(out_dir, "_tmp_points.vrt")

    with open(csv_file, "w") as f:
        f.write("lng,lat,depth\n")
        for feat in data["features"]:
            coords = feat["geometry"]["coordinates"]
            depth = feat["properties"]["depth_ft"]
            f.write(f"{coords[0]},{coords[1]},{depth}\n")

    # Create VRT for GDAL
    vrt_content = f"""<OGRVRTDataSource>
  <OGRVRTLayer name="_tmp_points">
    <SrcDataSource>{csv_file}</SrcDataSource>
    <GeometryType>wkbPoint</GeometryType>
    <LayerSRS>EPSG:4326</LayerSRS>
    <GeometryField encoding="PointFromColumns" x="lng" y="lat" z="depth"/>
  </OGRVRTLayer>
</OGRVRTDataSource>"""

    with open(vrt_file, "w") as f:
        f.write(vrt_content)

    # Step 3: Rasterize points to grid using gdal_grid (IDW interpolation)
    # Resolution: ~30m ≈ 0.0003 degrees
    res = 0.0003
    width = int((east - west) / res) + 1
    height = int((north - south) / res) + 1

    # Cap size to avoid memory issues
    if width * height > 5000000:
        res = max((east - west), (north - south)) / 2000
        width = int((east - west) / res) + 1
        height = int((north - south) / res) + 1

    print(f"    Grid: {width}x{height} ({res:.5f}deg/pixel)")

    cmd = [
        "gdal_grid",
        "-a", "invdist:power=2.0:smoothing=0.0:radius1=0.005:radius2=0.005:max_points=12:min_points=1:nodata=-9999",
        "-zfield", "depth",
        "-outsize", str(width), str(height),
        "-txe", str(west), str(east),
        "-tye", str(south), str(north),
        "-of", "GTiff",
        "-ot", "Float32",
        "-co", "COMPRESS=LZW",
        vrt_file,
        tmp_raster,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        print(f"    gdal_grid failed: {result.stderr[:200]}")
        cleanup_tmp(out_dir)
        return False

    # Step 4: Generate contour lines
    cmd = [
        "gdal_contour",
        "-a", "depth_ft",
        "-i", str(target_interval),
        "-f", "GeoJSON",
        tmp_raster,
        tmp_contour,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        print(f"    gdal_contour failed: {result.stderr[:200]}")
        cleanup_tmp(out_dir)
        return False

    # Step 5: Post-process contours
    with open(tmp_contour) as f:
        contour_data = json.load(f)

    features = contour_data.get("features", [])
    print(f"    Generated {len(features)} contour lines at {target_interval}ft intervals")

    # Add level/major properties, filter out noise
    valid_features = []
    for feat in features:
        depth = feat["properties"].get("depth_ft", 0)
        if depth < 0:
            continue
        depth = round(depth)
        feat["properties"]["depth_ft"] = depth
        feat["properties"]["level"] = 1 if depth % 10 == 0 else 0
        feat["properties"]["major"] = 1 if depth % 10 == 0 else 0
        feat["properties"]["elevation_ft"] = round(surface - depth, 1)
        valid_features.append(feat)

    contour_data["features"] = valid_features

    # Replace the original contours
    contour_file = os.path.join(out_dir, "contours.geojson")
    with open(contour_file, "w") as f:
        json.dump(contour_data, f)

    print(f"    Saved {len(valid_features)} contour lines")

    cleanup_tmp(out_dir)
    return True


def cleanup_tmp(out_dir):
    """Remove temporary files."""
    for f in ["_tmp_depth.tif", "_tmp_contours.geojson", "_tmp_points.csv", "_tmp_points.vrt"]:
        path = os.path.join(out_dir, f)
        if os.path.exists(path):
            os.remove(path)


def regenerate_tiles(lake_id):
    """Re-generate vector tiles from updated contours."""
    contour_file = os.path.join(PROCESSED_DIR, lake_id, "contours.geojson")
    mbtiles_file = os.path.join(TILES_DIR, f"{lake_id}.mbtiles")

    if not os.path.exists(contour_file):
        return

    print(f"  {lake_id}: regenerating vector tiles...")
    cmd = [
        "tippecanoe",
        "-o", mbtiles_file,
        "-z", "16",
        "-Z", "8",
        "--drop-densest-as-needed",
        "--extend-zooms-if-still-dropping",
        "-l", "contours",
        "--force",
        contour_file,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        print(f"    tippecanoe failed: {result.stderr[:200]}")
    else:
        size = os.path.getsize(mbtiles_file)
        print(f"    Tiles: {size / 1024 / 1024:.1f} MB")


def main():
    single = sys.argv[1] if len(sys.argv) > 1 else None

    lake_dirs = sorted(os.listdir(PROCESSED_DIR))

    for lake_id in lake_dirs:
        if single and lake_id != single:
            continue

        lake_dir = os.path.join(PROCESSED_DIR, lake_id)
        if not os.path.isdir(lake_dir):
            continue

        print(f"\n{'='*50}")
        print(f"  {lake_id}")
        print(f"{'='*50}")

        # Step 1: Fix elevation → depth conversion
        interval = fix_contour_elevations(lake_id)

        # Step 2: If contour interval > 2ft, generate finer contours from depth points
        if interval and interval > 2:
            generate_fine_contours(lake_id, target_interval=2)

        # Step 3: Re-generate vector tiles
        regenerate_tiles(lake_id)

    print("\n\nDone! Restart the tile server to pick up changes.")


if __name__ == "__main__":
    main()
