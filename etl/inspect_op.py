import pandas as pd
import glob

csv_paths = glob.glob("../Données sources/Base_OP_2025_Nationale.csv")
if not csv_paths:
    print("OP file not found!")
    exit(1)

path = csv_paths[0]
print(f"Reading {path}...")
df = pd.read_csv(path, sep=';', encoding='latin1')
print("Unique agglomerations containing Paris or Ile or France:")
paris_agglos = df[df['agglomeration'].str.contains('Paris|Ile|France|Hauts|Seine|Val|Oise|Essonne|Marne|Yvelines', case=False, na=False)]['agglomeration'].unique()
print(paris_agglos)
print(f"Total rows: {len(df)}")

