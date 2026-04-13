#!/usr/bin/env python3
"""
Extract depth points from TWDB shapefiles for all processed lakes.
Handles various field name conventions across different survey years.
"""

import json
import os
import subprocess
import sys
import tempfile

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHAPEFILE_DIR = os.path.join(BASE_DIR, "server/data/shapefiles")
OUTPUT_DIR = os.path.join(BASE_DIR, "server/data/processed")

# Known elevation field names across TWDB surveys
ELEVATION_FIELDS = [
    "Pre_Elevat", "Current_El", "current_el", "corr_curre",
    "ZVAL", "ELEVATION", "ElevFT88", "ElevFT29", "Elevm88",
    "current_su", "lake_eleva", "pre_impoun",
]

# Map TWDB zip names to app lake IDs
LAKE_MAP = {
    "AlanHenry": "lake-alan-henry",
    "Belton": "lake-belton",
    "BobSandlin": "lake-bob-sandlin",
    "Bridgeport": "lake-bridgeport",
    "Buchanan": "lake-buchanan",
    "CedarCreek": "cedar-creek",
    "ChokeCanyon": "choke-canyon",
    "Conroe": "lake-conroe",
    "EagleMountain": "eagle-mountain",
    "Fork": "lake-fork",
    "Granbury": "lake-granbury",
    "Houston": "lake-houston",
    "JoePool": "joe-pool",
    "LBJ": "lake-lbj",
    "Lavon": "lake-lavon",
    "Lewisville": "lake-lewisville",
    "Livingston": "lake-livingston",
    "RayRoberts": "lake-ray-roberts",
    "Texoma": "lake-texoma",
    "Travis": "lake-travis",
}


def find_point_shapefiles(work_dir):
    """Find all point shapefiles in a TWDB extract directory."""
    candidates = []
    for root, dirs, files in os.walk(work_dir):
        for f in files:
            if f.endswith('.shp'):
                path = os.path.join(root, f)
                lower = f.lower()
                # Skip contour, boundary, land, line shapefiles
                if any(x in lower for x in ['cont', 'lake', 'land', 'poly', 'bound', 'shore', 'island']):
                    continue
                # Check if it's a point shapefile
                result = subprocess.run(
                    ['ogrinfo', '-so', path, f[:-4]],
                    capture_output=True, text=True
                )
                if 'Point' in result.stdout:
                    # Get feature count
                    for line in result.stdout.split('\n'):
                        if 'Feature Count' in line:
                            count = int(line.split(':')[1].strip())
                            candidates.append((path, f[:-4], count))
                            break
    # Sort by feature count, prefer survey points over interpolated
    candidates.sort(key=lambda x: (-x[2] if 'interp' not in x[0].lower() else -x[2] + 1))
    return candidates


def detect_elevation_field(shp_path, layer_name):
    """Detect which field contains elevation data."""
    result = subprocess.run(
        ['ogrinfo', shp_path, layer_name, '-fid', '0'],
        capture_output=True, text=True
    )

    found_fields = {}
    for line in result.stdout.split('\n'):
        for field in ELEVATION_FIELDS:
            if f'{field} (' in line or f'{field} =' in line:
                # Extract the value
                parts = line.split('=')
                if len(parts) >= 2:
                    try:
                        val = float(parts[-1].strip())
                        found_fields[field] = val
                    except ValueError:
                        pass

    if not found_fields:
        # Check for Z coordinate in 3D points
        for line in result.stdout.split('\n'):
            if 'POINT Z' in line:
                return '_Z_COORD_'

    # Prefer current elevation fields
    priority = ['current_el', 'corr_curre', 'Current_El', 'current_su',
                'ElevFT88', 'Pre_Elevat', 'ZVAL', 'ELEVATION', 'pre_impoun']
    for p in priority:
        if p in found_fields:
            return p

    # Return first found
    if found_fields:
        return list(found_fields.keys())[0]

    return None


def extract_points(lake_name, lake_id):
    """Extract depth points for a lake."""
    zip_file = os.path.join(SHAPEFILE_DIR, f"{lake_name}.zip")
    out_dir = os.path.join(OUTPUT_DIR, lake_id)
    out_file = os.path.join(out_dir, "depth_points.geojson")

    # Skip if already has good depth points
    if os.path.exists(out_file):
        try:
            with open(out_file) as f:
                data = json.load(f)
            if len(data.get('features', [])) > 10:
                print(f"  SKIP {lake_name}: already has {len(data['features'])} depth points")
                return True
        except:
            pass

    if not os.path.exists(zip_file):
        print(f"  SKIP {lake_name}: no zip file")
        return False

    # Unzip to temp
    work_dir = os.path.join(SHAPEFILE_DIR, "_work", lake_name)
    os.makedirs(work_dir, exist_ok=True)
    subprocess.run(['unzip', '-qo', zip_file, '-d', work_dir], capture_output=True)

    # Find point shapefiles
    candidates = find_point_shapefiles(work_dir)
    if not candidates:
        print(f"  SKIP {lake_name}: no point shapefiles found")
        return False

    # Try each candidate until we get depth data
    for shp_path, layer_name, count in candidates:
        elev_field = detect_elevation_field(shp_path, layer_name)
        if not elev_field:
            continue

        print(f"  {lake_name}: using {os.path.basename(shp_path)} ({count} pts, field={elev_field})")

        # Convert to GeoJSON with sampling for large datasets
        tmp_geojson = os.path.join(out_dir, "_tmp_points.geojson")

        sample_rate = max(1, count // 50000)  # Target ~50k points max

        if sample_rate > 1:
            cmd = [
                'ogr2ogr', '-f', 'GeoJSON', '-t_srs', 'EPSG:4326',
                '-lco', 'COORDINATE_PRECISION=6',
                tmp_geojson, shp_path,
                '-sql', f'SELECT * FROM "{layer_name}" WHERE FID % {sample_rate} = 0'
            ]
        else:
            cmd = [
                'ogr2ogr', '-f', 'GeoJSON', '-t_srs', 'EPSG:4326',
                '-lco', 'COORDINATE_PRECISION=6',
                tmp_geojson, shp_path
            ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            # Try without SQL
            cmd = [
                'ogr2ogr', '-f', 'GeoJSON', '-t_srs', 'EPSG:4326',
                '-lco', 'COORDINATE_PRECISION=6',
                tmp_geojson, shp_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                continue

        # Process the GeoJSON
        try:
            with open(tmp_geojson) as f:
                data = json.load(f)

            features = data.get('features', [])
            if not features:
                os.remove(tmp_geojson)
                continue

            # Extract elevations
            elevations = []
            for feat in features:
                props = feat.get('properties', {})
                geom = feat.get('geometry', {})

                elev = None
                if elev_field == '_Z_COORD_':
                    coords = geom.get('coordinates', [])
                    if len(coords) >= 3:
                        elev = coords[2]
                else:
                    elev = props.get(elev_field)

                if elev is not None:
                    try:
                        elev = float(elev)
                        # If elevation is in meters (< 200 typically), convert to feet
                        # TWDB Texas surveys are typically in feet (200-800 range)
                        if elev < 100 and 'Elevm' in elev_field:
                            elev = elev * 3.28084
                        elevations.append(elev)
                    except (ValueError, TypeError):
                        pass

            if not elevations:
                os.remove(tmp_geojson)
                continue

            surface_elev = max(elevations)
            min_elev = min(elevations)
            depth_range = surface_elev - min_elev

            print(f"    Surface: {surface_elev:.1f} ft, Depth range: 0-{depth_range:.1f} ft")

            # Build simplified output
            simplified = []
            for feat in features:
                props = feat.get('properties', {})
                geom = feat.get('geometry', {})
                coords = geom.get('coordinates', [])

                elev = None
                if elev_field == '_Z_COORD_':
                    if len(coords) >= 3:
                        elev = coords[2]
                else:
                    elev = props.get(elev_field)

                if elev is not None:
                    try:
                        elev = float(elev)
                        if elev < 100 and 'Elevm' in elev_field:
                            elev = elev * 3.28084
                        depth = round(surface_elev - elev, 1)
                        if depth >= 0:
                            simplified.append({
                                "type": "Feature",
                                "properties": {
                                    "depth_ft": depth,
                                    "elevation_ft": round(elev, 1)
                                },
                                "geometry": {
                                    "type": "Point",
                                    "coordinates": [round(coords[0], 6), round(coords[1], 6)]
                                }
                            })
                    except (ValueError, TypeError):
                        pass

            data['features'] = simplified
            with open(out_file, 'w') as f:
                json.dump(data, f)

            os.remove(tmp_geojson)
            print(f"    Saved {len(simplified)} depth points")
            return True

        except Exception as e:
            print(f"    Error: {e}")
            if os.path.exists(tmp_geojson):
                os.remove(tmp_geojson)
            continue

    return False


def main():
    single = sys.argv[1] if len(sys.argv) > 1 else None

    for lake_name, lake_id in sorted(LAKE_MAP.items()):
        if single and lake_name != single:
            continue
        extract_points(lake_name, lake_id)

    # Print summary
    print("\n=== DEPTH POINT SUMMARY ===")
    for lake_name, lake_id in sorted(LAKE_MAP.items()):
        out_file = os.path.join(OUTPUT_DIR, lake_id, "depth_points.geojson")
        if os.path.exists(out_file):
            try:
                with open(out_file) as f:
                    data = json.load(f)
                count = len(data.get('features', []))
                if count > 10:
                    print(f"  {lake_id}: {count:,} points")
                else:
                    print(f"  {lake_id}: {count} points (INSUFFICIENT)")
            except:
                print(f"  {lake_id}: ERROR reading file")
        else:
            print(f"  {lake_id}: NO DATA")


if __name__ == '__main__':
    main()
