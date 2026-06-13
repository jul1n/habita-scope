import os
import glob
import json
import pandas as pd
from pyproj import Transformer
from shapely.geometry import shape, Point, Polygon
from shapely.strtree import STRtree

def run_grid_etl():
    print("=== STARTING GRID PROCESSING ETL ===")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    sources_dir = os.path.abspath(os.path.join(script_dir, "../../Données sources"))
    processed_dir = os.path.abspath(os.path.join(script_dir, "../processed"))
    geom_dir = os.path.join(processed_dir, "geometries")
    
    os.makedirs(geom_dir, exist_ok=True)
    
    # 1. Load IDF communes geometries for spatial indexing
    print("Loading communes geometries...")
    geojson_files = glob.glob(os.path.join(geom_dir, "[0-9][0-9].geojson"))
    if not geojson_files:
        geojson_files = glob.glob(os.path.join(geom_dir, "*.geojson"))
        
    communes = []
    for filepath in geojson_files:
        dep_code = os.path.basename(filepath).split('.')[0]
        # Only process IDF departments (75, 77, 78, 91, 92, 93, 94, 95)
        if dep_code not in ['75', '77', '78', '91', '92', '93', '94', '95']:
            continue
            
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for feature in data['features']:
                geom = shape(feature['geometry'])
                code_commune = feature['properties']['code_commune']
                communes.append({
                    'code_commune': code_commune,
                    'departement': dep_code,
                    'geometry': geom
                })
                
    print(f"Loaded {len(communes)} communes of Île-de-France.")
    
    if not communes:
        print("Error: No communes loaded. Run the main ETL first.")
        return
        
    # Build spatial index (R-tree) of communes
    commune_geoms = [c['geometry'] for c in communes]
    tree = STRtree(commune_geoms)
    
    # 2. Setup Coordinate Transformer (EPSG:3035 to EPSG:4326)
    transformer = Transformer.from_crs("EPSG:3035", "EPSG:4326", always_xy=True)
    
    # 3. Read the Filosofi 1km Grid CSV
    grid_csv = os.path.join(sources_dir, "carreaux_nivNaturel_met.csv")
    print(f"Reading {grid_csv}...")
    
    # Read in chunks to keep memory footprint small
    chunk_size = 20000
    reader = pd.read_csv(grid_csv, chunksize=chunk_size)
    
    # We will group grid features by department
    grid_by_dep = {dep: [] for dep in ['75', '77', '78', '91', '92', '93', '94', '95']}
    
    processed_count = 0
    mapped_count = 0
    
    for chunk in reader:
        processed_count += len(chunk)
        print(f"Processing row {processed_count}...")
        
        for idx, row in chunk.iterrows():
            id_car = str(row['idcar_nat'])
            try:
                parts = id_car.split('m')
                coords_str = parts[1]
                n_str, e_str = coords_str.split('E')
                n_val = float(n_str.replace('N', ''))
                e_val = float(e_str)
                res = float(row['tmaille'])
            except Exception:
                continue
                
            centroid_x = e_val + res / 2.0
            centroid_y = n_val + res / 2.0
            
            lon_c, lat_c = transformer.transform(centroid_x, centroid_y)
            
            if not (1.4 <= lon_c <= 3.6 and 48.1 <= lat_c <= 49.2):
                continue
                
            centroid_point = Point(lon_c, lat_c)
            
            candidates_idx = tree.query(centroid_point)
            matching_commune = None
            
            for c_idx in candidates_idx:
                comm = communes[c_idx]
                if comm['geometry'].contains(centroid_point):
                    matching_commune = comm
                    break
                    
            if matching_commune:
                mapped_count += 1
                dep = matching_commune['departement']
                code_com = matching_commune['code_commune']
                
                p1_x, p1_y = transformer.transform(e_val, n_val)
                p2_x, p2_y = transformer.transform(e_val + res, n_val)
                p3_x, p3_y = transformer.transform(e_val + res, n_val + res)
                p4_x, p4_y = transformer.transform(e_val, n_val + res)
                
                coords = [
                    [round(p1_x, 5), round(p1_y, 5)],
                    [round(p2_x, 5), round(p2_y, 5)],
                    [round(p3_x, 5), round(p3_y, 5)],
                    [round(p4_x, 5), round(p4_y, 5)],
                    [round(p1_x, 5), round(p1_y, 5)]
                ]
                
                feature = {
                    'type': 'Feature',
                    'properties': {
                        'id': id_car,
                        'code_commune': code_com,
                        'pop': int(row['ind']) if not pd.isna(row['ind']) else 0,
                        'pauv': int(row['men_pauv']) if not pd.isna(row['men_pauv']) else 0,
                        'soc': int(row['log_soc']) if not pd.isna(row['log_soc']) else 0,
                        'snv': (float(row['ind_snv']) / float(row['ind'])) if not pd.isna(row['ind_snv']) and not pd.isna(row['ind']) and float(row['ind']) > 0 else 0.0
                    },
                    'geometry': {
                        'type': 'Polygon',
                        'coordinates': [coords]
                    }
                }
                grid_by_dep[dep].append(feature)

    print(f"Mapped {mapped_count} cells to Île-de-France communes.")
    
    for dep, features in grid_by_dep.items():
        output_path = os.path.join(geom_dir, f"grid_{dep}.geojson")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump({
                'type': 'FeatureCollection',
                'features': features
            }, f)
        print(f"Saved {len(features)} grid cells to {output_path}")
        
    print("=== GRID PROCESSING COMPLETED SUCCESSFULLY ===")

if __name__ == '__main__':
    run_grid_etl()
