import duckdb
import glob

# Find the file path
csv_paths = glob.glob("../Données sources/Donnees-detaillees-au-logement-du-repertoire-des-logements-locatifs-des-bailleurs-sociau.2025-01.csv")
if not csv_paths:
    print("RPLS file not found!")
    exit(1)

path = csv_paths[0]
print(f"Reading {path}...")
con = duckdb.connect()

# Query unique funding codes and labels
res = con.execute(f"""
    SELECT FINAN_CODE, FINAN_LIBELLE, COUNT(*)
    FROM '{path}'
    GROUP BY FINAN_CODE, FINAN_LIBELLE
    ORDER BY FINAN_CODE
""").fetchall()

print("--- FUNDING TYPES ---")
for r in res:
    print(r)
