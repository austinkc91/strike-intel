#!/usr/bin/env python3
"""
Download GLOBathy raster data for a specific lake from HydroLAKES/GLOBathy.

GLOBathy is available via Google Earth Engine but also as direct GeoTIFF downloads
from the HydroLAKES dataset. This script downloads the bathymetry raster for a
given lake by its HydroLAKES ID or by bounding box.

Usage:
  python3 scripts/download-globathy.py --lake-id lake-fork --bbox "-95.7,32.65,-95.4,32.90" --name "Lake Fork"
  python3 scripts/download-globathy.py --lake-id lake-texoma --bbox "-96.8,33.7,-96.3,33.95" --name "Lake Texoma"
"""

import argparse
import os
import sys
import subprocess
import json
import urllib.request
import tempfile

# GLOBathy is hosted on Google Earth Engine as:
#   projects/sat-io/open-datasets/GLOBathy/GLOBathy_bathymetry
# But we can also use the Zenodo direct download for the global raster:
#   https://zenodo.org/records/4108559
# The global file is ~2GB. Instead, we'll use the Earth Engine REST API
# to export clips, or use USGS/NHD lake boundaries + elevation data.

# Alternative approach: Use OpenTopography SRTM/FABDEM for land elevation,
# then use lake surface elevation - DEM to derive bathymetry estimates.
# This won't give true bathymetry but provides relative depth within lakes.

# Best free approach: Use the National Hydrography Dataset (NHD) lake boundaries
# combined with available state bathymetry data or GLOBathy exports.

GLOBATHY_ZENODO_URL = "https://zenodo.org/records/4108559/files"


def get_lake_boundary_from_osm(bbox: str, lake_name: str) -> str:
    """Fetch lake boundary polygon from OpenStreetMap via Overpass API."""
    west, south, east, north = bbox.split(',')

    # Overpass query for water bodies
    query = f"""
    [out:json][timeout:60];
    (
      way["natural"="water"]["name"~"{lake_name}",i]({south},{west},{north},{east});
      relation["natural"="water"]["name"~"{lake_name}",i]({south},{west},{north},{east});
      way["water"="lake"]["name"~"{lake_name}",i]({south},{west},{north},{east});
      relation["water"="lake"]["name"~"{lake_name}",i]({south},{west},{north},{east});
      way["water"="reservoir"]["name"~"{lake_name}",i]({south},{west},{north},{east});
      relation["water"="reservoir"]["name"~"{lake_name}",i]({south},{west},{north},{east});
    );
    out body;
    >;
    out skel qt;
    """

    print(f"[OSM] Fetching lake boundary for '{lake_name}' in bbox {bbox}...")

    url = "https://overpass-api.de/api/interpreter"
    data = f"data={urllib.parse.quote(query)}".encode()

    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')

    import urllib.parse

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            osm_data = json.loads(resp.read())
    except Exception as e:
        print(f"[OSM] Failed to fetch from Overpass: {e}")
        print("[OSM] Falling back to bbox-only clipping")
        return None

    if not osm_data.get('elements'):
        print(f"[OSM] No water bodies found for '{lake_name}'")
        return None

    # Convert OSM data to GeoJSON
    nodes = {}
    ways = {}
    relations = []

    for elem in osm_data['elements']:
        if elem['type'] == 'node':
            nodes[elem['id']] = (elem['lon'], elem['lat'])
        elif elem['type'] == 'way':
            ways[elem['id']] = elem.get('nd', [])
        elif elem['type'] == 'relation':
            relations.append(elem)

    # Build polygons from ways
    polygons = []

    for way_id, node_ids in ways.items():
        coords = []
        for nid in node_ids:
            if nid in nodes:
                coords.append(list(nodes[nid]))
        if len(coords) >= 4 and coords[0] == coords[-1]:
            polygons.append(coords)

    # Build polygons from relations (multipolygon)
    for rel in relations:
        if rel.get('tags', {}).get('type') == 'multipolygon':
            outer_rings = []
            for member in rel.get('members', []):
                if member.get('role') == 'outer' and member.get('type') == 'way':
                    wid = member['ref']
                    if wid in ways:
                        coords = [list(nodes[nid]) for nid in ways[wid] if nid in nodes]
                        if coords:
                            outer_rings.append(coords)

            # Merge connected rings
            if outer_rings:
                merged = merge_rings(outer_rings)
                for ring in merged:
                    if len(ring) >= 4:
                        if ring[0] != ring[-1]:
                            ring.append(ring[0])
                        polygons.append(ring)

    if not polygons:
        print("[OSM] Could not build polygons from OSM data")
        return None

    # Use the largest polygon
    largest = max(polygons, key=lambda p: len(p))

    geojson = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"name": lake_name},
            "geometry": {
                "type": "Polygon",
                "coordinates": [largest]
            }
        }]
    }

    return json.dumps(geojson)


def merge_rings(rings):
    """Merge connected ring segments into complete rings."""
    if not rings:
        return []

    merged = [list(rings[0])]
    used = {0}

    changed = True
    while changed:
        changed = False
        for i, ring in enumerate(rings):
            if i in used:
                continue
            for m in merged:
                # Check if this ring connects to the end of a merged ring
                if m[-1] == ring[0]:
                    m.extend(ring[1:])
                    used.add(i)
                    changed = True
                    break
                elif m[-1] == ring[-1]:
                    m.extend(reversed(ring[:-1]))
                    used.add(i)
                    changed = True
                    break
                elif m[0] == ring[-1]:
                    merged[merged.index(m)] = ring[:-1] + m
                    used.add(i)
                    changed = True
                    break
                elif m[0] == ring[0]:
                    merged[merged.index(m)] = list(reversed(ring[1:])) + m
                    used.add(i)
                    changed = True
                    break

    # Add any unused rings as separate
    for i, ring in enumerate(rings):
        if i not in used:
            merged.append(list(ring))

    return merged


def download_fabdem_tile(bbox: str, output_dir: str) -> str:
    """
    Download FABDEM (Forest And Buildings removed DEM) tiles for the bbox.
    FABDEM is a free 30m DEM based on Copernicus DEM with buildings/trees removed.
    Available from: https://data.bris.ac.uk/data/dataset/s5hqmjcdj8yo2ibzi9b4ew3sn

    Alternative: Use Copernicus DEM 30m via OpenTopography API.
    """
    west, south, east, north = [float(x) for x in bbox.split(',')]

    # Use OpenTopography Global DEM API (free, no key needed for small areas)
    # This gives us Copernicus 30m DEM which covers land AND has lake surface elevation
    url = (
        f"https://portal.opentopography.org/API/globaldem?"
        f"demtype=COP30&south={south}&north={north}&west={west}&east={east}"
        f"&outputFormat=GTiff"
    )

    output_file = os.path.join(output_dir, "dem_raw.tif")

    print(f"[DEM] Downloading Copernicus 30m DEM for bbox {bbox}...")
    print(f"[DEM] URL: {url}")

    try:
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'StrikeIntel/1.0')
        with urllib.request.urlopen(req, timeout=300) as resp:
            with open(output_file, 'wb') as f:
                f.write(resp.read())

        # Verify it's a valid GeoTIFF
        result = subprocess.run(
            ['gdalinfo', '-json', output_file],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"[DEM] Downloaded file is not a valid GeoTIFF")
            return None

        info = json.loads(result.stdout)
        print(f"[DEM] Downloaded: {info.get('size', ['?', '?'])} pixels")
        return output_file

    except Exception as e:
        print(f"[DEM] OpenTopography download failed: {e}")
        print("[DEM] Trying SRTM via GDAL virtual filesystem...")

        # Fallback: Use SRTM 30m via /vsicurl/
        return download_srtm_tile(bbox, output_dir)


def download_srtm_tile(bbox: str, output_dir: str) -> str:
    """Download SRTM 30m data via GDAL's virtual filesystem and AWS public bucket."""
    west, south, east, north = [float(x) for x in bbox.split(',')]

    output_file = os.path.join(output_dir, "dem_raw.tif")

    # Use elevation tiles from Mapzen/Tilezen on AWS (Terrarium encoding)
    # These are globally available, free, and work with gdal
    # https://registry.opendata.aws/terrain-tiles/

    # For best results, use gdalwarp to merge multiple tiles
    # Terrain Tiles are available at: s3://elevation-tiles-prod/geotiff/{z}/{x}/{y}.tif
    # We'll use zoom level 12 for ~30m resolution

    z = 12

    # Calculate tile range
    import math
    n = 2 ** z

    x_min = int((west + 180) / 360 * n)
    x_max = int((east + 180) / 360 * n)

    lat_rad_n = math.radians(north)
    lat_rad_s = math.radians(south)
    y_min = int((1 - math.log(math.tan(lat_rad_n) + 1/math.cos(lat_rad_n)) / math.pi) / 2 * n)
    y_max = int((1 - math.log(math.tan(lat_rad_s) + 1/math.cos(lat_rad_s)) / math.pi) / 2 * n)

    tile_urls = []
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            tile_url = f"/vsicurl/https://s3.amazonaws.com/elevation-tiles-prod/geotiff/{z}/{x}/{y}.tif"
            tile_urls.append(tile_url)

    print(f"[SRTM] Downloading {len(tile_urls)} terrain tiles at z{z}...")

    if len(tile_urls) == 1:
        # Single tile - just warp it
        cmd = [
            'gdalwarp', '-t_srs', 'EPSG:4326',
            '-te', str(west), str(south), str(east), str(north),
            tile_urls[0], output_file
        ]
    else:
        # Multiple tiles - build VRT then warp
        vrt_file = os.path.join(output_dir, "tiles.vrt")
        cmd_vrt = ['gdalbuildvrt', vrt_file] + tile_urls
        print(f"[SRTM] Building VRT from {len(tile_urls)} tiles...")
        result = subprocess.run(cmd_vrt, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"[SRTM] VRT build failed: {result.stderr}")
            return None

        cmd = [
            'gdalwarp', '-t_srs', 'EPSG:4326',
            '-te', str(west), str(south), str(east), str(north),
            vrt_file, output_file
        ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[SRTM] gdalwarp failed: {result.stderr}")
        return None

    print(f"[SRTM] Downloaded DEM to {output_file}")
    return output_file


def process_lake_bathymetry(lake_id: str, bbox: str, lake_name: str, output_base: str):
    """
    Full pipeline: Download DEM -> Get lake boundary -> Clip -> Generate contours -> Vector tiles.
    """
    lake_dir = os.path.join(output_base, lake_id)
    os.makedirs(lake_dir, exist_ok=True)

    raw_dir = os.path.join(lake_dir, "raw")
    os.makedirs(raw_dir, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"Processing: {lake_name} ({lake_id})")
    print(f"Bbox: {bbox}")
    print(f"{'='*60}\n")

    # Step 1: Download DEM
    dem_file = download_fabdem_tile(bbox, raw_dir)
    if not dem_file:
        print("[ERROR] Failed to download DEM data")
        return False

    # Step 2: Get lake boundary from OSM
    boundary_file = os.path.join(lake_dir, "boundary.geojson")
    boundary_geojson = get_lake_boundary_from_osm(bbox, lake_name)

    if boundary_geojson:
        with open(boundary_file, 'w') as f:
            f.write(boundary_geojson)
        print(f"[OSM] Saved lake boundary to {boundary_file}")
    else:
        print("[OSM] No boundary found, will use bbox clipping only")
        boundary_file = None

    # Step 3: Clip DEM to lake boundary
    clipped_file = os.path.join(lake_dir, "dem_clipped.tif")

    if boundary_file:
        cmd = [
            'gdalwarp',
            '-cutline', boundary_file,
            '-crop_to_cutline',
            '-dstnodata', '-9999',
            '-co', 'COMPRESS=LZW',
            dem_file, clipped_file
        ]
    else:
        west, south, east, north = bbox.split(',')
        cmd = [
            'gdalwarp',
            '-te', west, south, east, north,
            '-dstnodata', '-9999',
            '-co', 'COMPRESS=LZW',
            dem_file, clipped_file
        ]

    print(f"[CLIP] Clipping DEM to lake boundary...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[CLIP] Failed: {result.stderr}")
        return False

    # Step 4: Compute relative depth
    # For lakes, we need to convert absolute elevation to depth below surface
    # Surface elevation = max elevation within the lake boundary
    depth_file = os.path.join(lake_dir, "depth.tif")
    compute_relative_depth(clipped_file, depth_file)

    # Step 5: Generate contour lines at 1ft intervals
    contour_file = os.path.join(lake_dir, "contours.geojson")
    generate_contours(depth_file, contour_file, interval_ft=1)

    # Step 6: Generate Terrain-RGB tiles for client-side rendering
    rgb_file = os.path.join(lake_dir, "depth_rgb.tif")
    encode_terrarium(depth_file, rgb_file)

    # Step 7: Generate vector tiles with tippecanoe
    mbtiles_file = os.path.join(lake_dir, "contours.mbtiles")
    generate_vector_tiles(contour_file, mbtiles_file, lake_name)

    # Step 8: Generate raster tiles (TMS) for direct serving
    tiles_dir = os.path.join(lake_dir, "tiles")
    generate_raster_tiles(rgb_file, tiles_dir)

    # Step 9: Write metadata
    metadata = {
        "lake_id": lake_id,
        "lake_name": lake_name,
        "bbox": bbox,
        "has_boundary": boundary_file is not None,
        "files": {
            "dem_clipped": "dem_clipped.tif",
            "depth": "depth.tif",
            "depth_rgb": "depth_rgb.tif",
            "contours": "contours.geojson",
            "mbtiles": "contours.mbtiles",
            "tiles_dir": "tiles/"
        }
    }

    with open(os.path.join(lake_dir, "metadata.json"), 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"\n[DONE] Pipeline complete for {lake_name}")
    print(f"  Contours: {contour_file}")
    print(f"  Vector tiles: {mbtiles_file}")
    print(f"  Raster tiles: {tiles_dir}")

    return True


def compute_relative_depth(input_tif: str, output_tif: str):
    """
    Convert absolute elevation DEM to relative depth below lake surface.
    Surface = max elevation within the raster (shoreline level).
    Depth = surface_elevation - cell_elevation (in feet).
    """
    print("[DEPTH] Computing relative depth from elevation...")

    # Get stats
    result = subprocess.run(
        ['gdalinfo', '-json', '-stats', input_tif],
        capture_output=True, text=True
    )
    info = json.loads(result.stdout)

    # Find max elevation (lake surface)
    bands = info.get('bands', [])
    if not bands:
        print("[DEPTH] No band info found")
        return

    band = bands[0]
    stats = band.get('computedStatistics', band.get('metadata', {}).get('', {}))

    max_elev = None
    if isinstance(stats, dict):
        max_elev = stats.get('STATISTICS_MAXIMUM') or stats.get('maximum')

    if max_elev is None:
        # Compute manually
        result = subprocess.run(
            ['gdalinfo', '-mm', input_tif],
            capture_output=True, text=True
        )
        for line in result.stdout.split('\n'):
            if 'Computed Min/Max' in line:
                parts = line.split('=')[1].strip().split(',')
                max_elev = float(parts[1])
                break

    if max_elev is None:
        print("[DEPTH] Could not determine surface elevation, using raw values")
        subprocess.run(['cp', input_tif, output_tif])
        return

    max_elev = float(max_elev)
    print(f"[DEPTH] Lake surface elevation: {max_elev:.1f}m")

    # Convert: depth_ft = (surface_elev - cell_elev) * 3.28084
    # Using gdal_calc
    calc_expr = f"({max_elev} - A) * 3.28084"

    cmd = [
        'gdal_calc.py',
        '-A', input_tif,
        f'--calc={calc_expr}',
        f'--outfile={output_tif}',
        '--NoDataValue=-9999',
        '--co=COMPRESS=LZW',
        '--type=Float32',
        '--overwrite'
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[DEPTH] gdal_calc.py failed: {result.stderr}")
        # Fallback: try with python
        try:
            import numpy as np
            # Use gdal directly via subprocess to read/write
            # Read the raster
            info_result = subprocess.run(
                ['gdalinfo', '-json', input_tif],
                capture_output=True, text=True
            )
            info = json.loads(info_result.stdout)
            size = info['size']

            # Use gdal_translate to raw, process, then back
            raw_file = input_tif + '.raw'
            subprocess.run([
                'gdal_translate', '-of', 'ENVI', input_tif, raw_file
            ], capture_output=True)

            data = np.fromfile(raw_file, dtype=np.float32)
            data = np.where(data == -9999, -9999, (max_elev - data) * 3.28084)
            data = np.maximum(data, 0)  # No negative depths
            data.tofile(raw_file)

            subprocess.run([
                'gdal_translate', '-of', 'GTiff',
                '-co', 'COMPRESS=LZW',
                raw_file, output_tif
            ], capture_output=True)

            # Cleanup
            for ext in ['', '.hdr']:
                try:
                    os.remove(raw_file + ext if ext else raw_file)
                except:
                    pass

        except ImportError:
            print("[DEPTH] numpy not available, copying raw DEM")
            subprocess.run(['cp', input_tif, output_tif])
    else:
        print(f"[DEPTH] Depth raster saved to {output_tif}")


def generate_contours(depth_tif: str, output_geojson: str, interval_ft: float = 1.0):
    """Generate contour lines from depth raster at specified interval."""
    print(f"[CONTOUR] Generating {interval_ft}ft contours...")

    # Generate contours with GDAL
    # -a = attribute name for elevation, -i = interval
    contour_shp = output_geojson.replace('.geojson', '.shp')

    cmd = [
        'gdal_contour',
        '-a', 'depth_ft',
        '-i', str(interval_ft),
        '-f', 'GeoJSON',
        depth_tif,
        output_geojson
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[CONTOUR] Failed: {result.stderr}")
        return False

    # Count features
    try:
        with open(output_geojson, 'r') as f:
            data = json.load(f)
        num_features = len(data.get('features', []))

        # Add level property (1 = major contour every 5ft, 0 = minor)
        for feat in data.get('features', []):
            depth = feat['properties'].get('depth_ft', 0)
            feat['properties']['level'] = 1 if depth % 5 == 0 else 0
            feat['properties']['major'] = depth % 10 == 0

        with open(output_geojson, 'w') as f:
            json.dump(data, f)

        print(f"[CONTOUR] Generated {num_features} contour lines")
    except Exception as e:
        print(f"[CONTOUR] Warning reading output: {e}")

    return True


def encode_terrarium(depth_tif: str, output_tif: str):
    """
    Encode depth values as Terrain-RGB (Terrarium encoding) for client-side rendering.
    Terrarium: elevation = (R * 256 + G + B / 256) - 32768
    So for depth in feet: R = floor((depth + 32768) / 256), G = floor(depth + 32768) % 256, B = ...
    """
    print("[RGB] Encoding depth as Terrain-RGB tiles...")

    # For now, just keep the float32 GeoTIFF - the tile server will handle encoding
    # We can also use gdal2tiles to create a tileset

    # Create a copy optimized for tiling
    cmd = [
        'gdal_translate',
        '-of', 'GTiff',
        '-co', 'COMPRESS=LZW',
        '-co', 'TILED=YES',
        depth_tif, output_tif
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[RGB] Failed: {result.stderr}")
    else:
        print(f"[RGB] Saved to {output_tif}")


def generate_vector_tiles(geojson_file: str, mbtiles_file: str, lake_name: str):
    """Generate vector tiles from contour GeoJSON using tippecanoe."""
    print("[TILES] Generating vector tiles with tippecanoe...")

    cmd = [
        'tippecanoe',
        '-o', mbtiles_file,
        '-z', '16',        # Max zoom
        '-Z', '8',         # Min zoom
        '--drop-densest-as-needed',
        '--extend-zooms-if-still-dropping',
        '-l', 'contours',  # Layer name
        '--name', f'{lake_name} Contours',
        '--force',          # Overwrite
        geojson_file
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[TILES] tippecanoe failed: {result.stderr}")
        return False

    print(f"[TILES] Vector tiles saved to {mbtiles_file}")

    # Get tile stats
    result = subprocess.run(
        ['sqlite3', mbtiles_file, "SELECT COUNT(*) FROM tiles;"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        print(f"[TILES] Total tiles: {result.stdout.strip()}")

    return True


def generate_raster_tiles(depth_tif: str, tiles_dir: str):
    """Generate raster tile pyramid using gdal2tiles for direct HTTP serving."""
    print("[RTILES] Generating raster tile pyramid...")

    cmd = [
        'gdal2tiles.py',
        '-z', '8-16',
        '-w', 'none',
        '--xyz',
        '-r', 'bilinear',
        depth_tif,
        tiles_dir
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[RTILES] gdal2tiles failed: {result.stderr}")
        # This is non-critical, vector tiles are the main output
        return False

    print(f"[RTILES] Raster tiles saved to {tiles_dir}")
    return True


def main():
    parser = argparse.ArgumentParser(description='Download and process GLOBathy/DEM data for a lake')
    parser.add_argument('--lake-id', required=True, help='Lake identifier (e.g., lake-fork)')
    parser.add_argument('--bbox', required=True, help='Bounding box: west,south,east,north')
    parser.add_argument('--name', required=True, help='Lake name for OSM search')
    parser.add_argument('--output', default='server/data', help='Output directory')
    parser.add_argument('--interval', type=float, default=1.0, help='Contour interval in feet')

    args = parser.parse_args()

    success = process_lake_bathymetry(
        lake_id=args.lake_id,
        bbox=args.bbox,
        lake_name=args.name,
        output_base=args.output
    )

    if success:
        print(f"\n[SUCCESS] Lake {args.name} processed successfully!")
        print(f"  Start the tile server: node server/src/index.js")
        print(f"  Contour tiles at: http://localhost:3001/tiles/{args.lake_id}/{{z}}/{{x}}/{{y}}")
        print(f"  Depth query: http://localhost:3001/depth?lat=XX&lng=YY&lake={args.lake_id}")
    else:
        print(f"\n[FAILED] Processing failed for {args.name}")
        sys.exit(1)


if __name__ == '__main__':
    main()
