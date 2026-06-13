import json

path = "../Données sources/communes-5m.geojson"
print(f"Reading first feature of {path}...")
with open(path, 'r', encoding='utf-8') as f:
    # Read first part of the file to extract the first feature properties
    # Since it's a huge file, we can read it line by line or search for the first feature
    data = ""
    for line in f:
        data += line
        if '"properties"' in line or 'properties' in line:
            # Keep reading until we get the full first feature
            if len(data) > 50000:
                break
    
    # Let's write a simpler way: parse the first 100000 bytes
    f.seek(0)
    chunk = f.read(100000)
    # Print the start of the file
    print(chunk[:1000])
