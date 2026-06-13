import os
import json
import glob
import pandas as pd
import duckdb
import openpyxl
import geojson

# Define constants
IDF_DEPS = {'75', '77', '78', '91', '92', '93', '94', '95'}

# Rent estimation helper based on Department and Zone ABC
def estimate_private_rent(row):
    dep = row.get('departement')
    zone = row.get('zone_abc')
    
    # Base rents per zone
    if zone == 'A_bis' or zone == 'Abis':
        base = 28.0
        if dep == '75':
            return 33.5  # Paris proper
        return 26.5      # High-end suburbs (Boulogne, Neuilly, Vincennes, etc.)
    elif zone == 'A':
        return 22.0
    elif zone == 'B1':
        return 17.5
    elif zone == 'B2':
        return 13.5
    else:
        return 11.0

def run_etl():
    print("=== STARTING ETL PIPELINE ===")
    
    # Paths relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    sources_dir = os.path.abspath(os.path.join(script_dir, "../../Données sources"))
    processed_dir = os.path.abspath(os.path.join(script_dir, "../processed"))
    
    os.makedirs(processed_dir, exist_ok=True)

    
    # 1. Load Zonage ABC
    print("1/6 Loading ABC Zoning...")
    abc_path = glob.glob(f"{sources_dir}/liste-des-communes-zonage-abc-5-septembre-2025.csv")[0]
    df_abc = pd.read_csv(abc_path, sep=';', encoding='latin1')
    # CODGEO;DEP;LIBGEO;Zonage en vigueur depuis le 5 septembre 2025
    df_abc['code_commune'] = df_abc['CODGEO'].astype(str).str.zfill(5)
    df_abc['departement'] = df_abc['DEP'].astype(str).str.zfill(2)
    # Filter IDF
    df_abc = df_abc[df_abc['departement'].isin(IDF_DEPS)]
    df_abc = df_abc.rename(columns={
        'Zonage en vigueur depuis le 5 septembre 2025': 'zone_abc',
        'LIBGEO': 'nom_commune'
    })[['code_commune', 'nom_commune', 'departement', 'zone_abc']]
    print(f"Loaded {len(df_abc)} communes in Île-de-France.")
    
    # Determine Zone Sociale (Zone 1 bis = Paris + limitrophes, Zone 1 = rest of IDF)
    # Paris limitrophes communes list (simple check for 75, or adjacent communes in 92, 93, 94)
    # Let's consider 75 as Paris and others in zone A bis as "Paris + communes limitrophes" or "IDF hors Paris"
    def determine_zone_sociale(row):
        dep = row['departement']
        # Zone 1 bis is Paris (75) + limitrophes. In our LLI, A_bis contains Paris and limitrophes.
        if dep == '75':
            return "Paris"
        elif row['zone_abc'] in ['A_bis', 'Abis']:
            return "Paris et communes limitrophes"
        else:
            return "Île-de-France hors Paris"
            
    df_abc['zone_sociale'] = df_abc.apply(determine_zone_sociale, axis=1)

    # 2. Load SRU Data
    print("2/6 Loading SRU Data...")
    sru_path = glob.glob(f"{sources_dir}/donnees-sru-data-gouv-2025-v2.csv")[0]
    df_sru = pd.read_csv(sru_path, sep=';', encoding='latin1')
    # Code_INSEE_commune;Taux_SRU_au_01_01_2024;commune_deficitaire
    df_sru['code_commune'] = df_sru['Code_INSEE_commune'].astype(str).str.zfill(5)
    
    # Clean Taux SRU: convert '26,10%' to 0.261
    def clean_taux_sru(val):
        if pd.isna(val):
            return None
        val_str = str(val).replace(',', '.').replace('%', '').strip()
        try:
            return float(val_str) / 100.0
        except ValueError:
            return None
            
    df_sru['taux_sru'] = df_sru['Taux_SRU_au_01_01_2024'].apply(clean_taux_sru)
    df_sru['commune_deficitaire_sru'] = df_sru['commune_deficitaire'].apply(lambda x: True if str(x).strip() in ['1', 'Oui', '1.0'] else False)
    
    df_sru = df_sru[['code_commune', 'taux_sru', 'commune_deficitaire_sru']]
    
    # 3. Load Demands & Attributions (Excel)
    print("3/6 Loading Demands and Attributions...")
    dem_path = glob.glob(f"{sources_dir}/socle_demandes_attributions_2024.xlsx")[0]
    wb = openpyxl.load_workbook(dem_path, data_only=True, read_only=True)
    sheet = wb['Ensemble']
    
    dem_data = []
    # Row 3 contains headers. Row 4 starts data.
    rows_iter = sheet.iter_rows(values_only=True)
    next(rows_iter)  # Skip row 1
    next(rows_iter)  # Skip row 2
    headers = next(rows_iter)  # Headers row
    
    def clean_numeric(val):
        if val is None:
            return 0
        if isinstance(val, (int, float)):
            return int(val)
        val_str = str(val).strip().replace(' ', '')
        if not val_str or val_str in ['-', 'Secretstat.', 'secret', 'Secret']:
            return 0
        try:
            return int(float(val_str.replace(',', '.')))
        except ValueError:
            return 0

    for r in rows_iter:
        if r[0] == 'Commune':
            code = str(r[1]).zfill(5)
            if code.startswith('75'):
                code = '75056'
            # Filter IDF
            dep = str(r[3]).zfill(2)
            if dep in IDF_DEPS:
                # Column 9: total demands, Column 13: total attributions, Column 6: EPCI
                dem_data.append({
                    'code_commune': code,
                    'epci': r[6],
                    'demandes_total': clean_numeric(r[9]),
                    'attributions_total': clean_numeric(r[13])
                })
                
    df_dem = pd.DataFrame(dem_data)
    # Handle duplicates (e.g. multiple rows for same commune code if any)
    df_dem = df_dem.groupby('code_commune').agg({
        'epci': 'first',
        'demandes_total': 'sum',
        'attributions_total': 'sum'
    }).reset_index()
    
    # Ratio Demandes / Attributions
    df_dem['ratio_demandes_attributions'] = df_dem.apply(
        lambda r: float(r['demandes_total']) / float(r['attributions_total']) if r['attributions_total'] > 0 else float(r['demandes_total']),
        axis=1
    )

    
    # 4. Load & Aggregate RPLS using DuckDB
    print("4/6 Aggregating RPLS data using DuckDB (Very Fast)...")
    rpls_path = glob.glob(f"{sources_dir}/Donnees-detaillees-au-logement-du-repertoire-des-logements-locatifs-des-bailleurs-sociau.2025-01.csv")[0]
    
    con = duckdb.connect()
    # Filter for IDF directly in SQL query to minimize memory
    rpls_agg_query = f"""
        SELECT 
            CASE WHEN DEPCOM LIKE '75%' THEN '75056' ELSE LPAD(CAST(DEPCOM AS VARCHAR), 5, '0') END as code_commune,
            COUNT(*) as logements_sociaux_total,
            SUM(CASE WHEN FINAN_CODE = '11' THEN 1 ELSE 0 END) as logements_plai,
            SUM(CASE WHEN FINAN_CODE IN ('12', '13', '52') THEN 1 ELSE 0 END) as logements_plus,
            SUM(CASE WHEN FINAN_CODE = '14' THEN 1 ELSE 0 END) as logements_pls,
            SUM(CASE WHEN TRY_CAST(NBPIECE AS INTEGER) = 1 THEN 1 ELSE 0 END) as logements_t1,
            SUM(CASE WHEN TRY_CAST(NBPIECE AS INTEGER) = 2 THEN 1 ELSE 0 END) as logements_t2,
            SUM(CASE WHEN TRY_CAST(NBPIECE AS INTEGER) = 3 THEN 1 ELSE 0 END) as logements_t3,
            SUM(CASE WHEN TRY_CAST(NBPIECE AS INTEGER) = 4 THEN 1 ELSE 0 END) as logements_t4,
            SUM(CASE WHEN TRY_CAST(NBPIECE AS INTEGER) >= 5 THEN 1 ELSE 0 END) as logements_t5_plus
        FROM read_csv_auto('{rpls_path}', encoding='ISO_8859_1', all_varchar=True)
        WHERE DEP_CODE IN ('75', '77', '78', '91', '92', '93', '94', '95')
        GROUP BY code_commune
    """
    df_rpls = con.execute(rpls_agg_query).df()
    print(f"RPLS aggregated for {len(df_rpls)} communes.")
    
    # 5. Load GeoJSON Communes (simplify coordinates to round 5 to save space)
    print("5/6 Loading and simplifying GeoJSON communes...")
    geojson_path = glob.glob(f"{sources_dir}/communes-5m.geojson")[0]
    with open(geojson_path, 'r', encoding='utf-8') as f:
        geo_data = json.load(f)
        
    filtered_features = []
    for feature in geo_data['features']:
        props = feature['properties']
        code_commune = str(props.get('code', '')).zfill(5)
        if code_commune.startswith('75') and code_commune != '75056':
            continue
        dep = str(props.get('departement', '')).zfill(2)
        if dep in IDF_DEPS:
            # Round coordinates to 5 decimal places (approx. 1 meter precision) to reduce file size significantly
            geom = feature['geometry']
            if geom and 'coordinates' in geom:
                def round_coords(coords):
                    if isinstance(coords[0], (int, float)):
                        return [round(coords[0], 5), round(coords[1], 5)]
                    return [round_coords(c) for c in coords]
                geom['coordinates'] = round_coords(geom['coordinates'])
                
            filtered_features.append({
                'type': 'Feature',
                'properties': {
                    'code_commune': code_commune
                },
                'geometry': geom
            })
            
    print(f"Filtered {len(filtered_features)} commune shapes in IDF.")
    
    # Save the simplified GeoJSON for frontend direct consumption
    frontend_geojson_path = f"{processed_dir}/communes_idf.geojson"
    with open(frontend_geojson_path, 'w', encoding='utf-8') as f:
        json.dump({
            'type': 'FeatureCollection',
            'features': filtered_features
        }, f)
    print(f"Simplified GeoJSON saved to {frontend_geojson_path}")
    
    # Map geometries to a dataframe for merge
    geom_map = {f['properties']['code_commune']: json.dumps(f['geometry']) for f in filtered_features}
    
    # 6. Merge everything
    print("6/6 Consolidating indicator tables...")
    # Start with all ABC communes in IDF
    df_final = df_abc.merge(df_dem, on='code_commune', how='left')
    df_final = df_final.merge(df_rpls, on='code_commune', how='left')
    df_final = df_final.merge(df_sru, on='code_commune', how='left')
    
    # Fill NAs
    fill_zero_cols = [
        'logements_sociaux_total', 'logements_plai', 'logements_plus', 'logements_pls',
        'logements_t1', 'logements_t2', 'logements_t3', 'logements_t4', 'logements_t5_plus',
        'demandes_total', 'attributions_total', 'ratio_demandes_attributions'
    ]
    df_final[fill_zero_cols] = df_final[fill_zero_cols].fillna(0)
    df_final['commune_deficitaire_sru'] = df_final['commune_deficitaire_sru'].fillna(False)
    
    # Estimate private rents
    df_final['loyer_prive_m2'] = df_final.apply(estimate_private_rent, axis=1)
    
    # Map geometry
    df_final['geometry_json'] = df_final['code_commune'].map(geom_map)
    
    # Convert numerical types
    for c in fill_zero_cols:
        if c != 'ratio_demandes_attributions':
            df_final[c] = df_final[c].astype(int)
            
    # Save Parquet
    parquet_path = f"{processed_dir}/indicateurs_communes_idf.parquet"
    df_final.to_parquet(parquet_path, index=False)
    print(f"Consolidated indicators saved to {parquet_path} ({len(df_final)} rows).")
    
    # Insert to database (Local SQLite if POSTGRES_URL not provided)
    default_db_path = os.path.abspath(os.path.join(processed_dir, 'logement.db')).replace('\\', '/')
    db_url = os.environ.get('DATABASE_URL', f'sqlite:///{default_db_path}')
    print(f"Loading data into database ({db_url.split('@')[-1] if '@' in db_url else db_url})...")

    
    from sqlalchemy import create_engine, text
    engine = create_engine(db_url)
    
    # For SQLite, we store geometry as text or skip geometry column in standard table
    is_sqlite = db_url.startswith('sqlite')
    
    # Prepare data for db insertion
    db_df = df_final.copy()
    if is_sqlite:
        # Save geometry_json as text column, drop raw geometry column for standard sqlite compatibility
        db_df['geometry'] = db_df['geometry_json']
        db_df = db_df.drop(columns=['geometry_json'])
    else:
        # PostGIS handling
        # We will insert standard columns first, then update geometry using ST_GeomFromGeoJSON
        db_df = db_df.drop(columns=['geometry_json'])
        
    db_df.to_sql('indicateurs_communes_idf', con=engine, if_exists='replace', index=False)
    
    # PostGIS geometry update if postgres
    if not is_sqlite:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE indicateurs_communes_idf DROP COLUMN IF EXISTS geometry;"))
            conn.execute(text("ALTER TABLE indicateurs_communes_idf ADD COLUMN geometry GEOMETRY(MultiPolygon, 4326);"))
            # Add spatial index
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_indicateurs_communes_idf_geom ON indicateurs_communes_idf USING gist(geometry);"))
            
            # Update geometries from geom_map
            for code, geom_str in geom_map.items():
                conn.execute(
                    text("""
                        UPDATE indicateurs_communes_idf 
                        SET geometry = ST_Multi(ST_GeomFromGeoJSON(:geom)) 
                        WHERE code_commune = :code
                    """),
                    {"geom": geom_str, "code": code}
                )
                
    print("Database loading completed successfully!")
    print("=== ETL PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == '__main__':
    run_etl()
