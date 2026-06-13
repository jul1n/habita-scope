# CartoLogement - Observatoire & Simulateur (Île-de-France)

CartoLogement est une application web d'analyse, de cartographie et de simulation de l'éligibilité au logement social (PLAI, PLUS, PLS) et intermédiaire (LLI) en Île-de-France au niveau communal.

L'objectif est d'identifier les zones de forte tension immobilière et de simuler l'éligibilité théorique d'un ménage en fonction de sa composition et de son revenu fiscal de référence (RFR).

## Structure du Projet

```text
/logement-app
├── /raw            # Dossier pour les fichiers sources bruts (XLSX, CSV, GeoJSON)
├── /processed      # Fichiers nettoyés (Parquet, GeoJSON IDF simplifié, SQLite local)
├── /etl            # Scripts Python d'importation et d'agrégation de données
├── /sql            # Schéma initial d'initialisation de PostgreSQL/PostGIS
├── /backend        # API FastAPI (Python)
├── /frontend       # Interface cartographique (HTML5, Vanilla CSS/JS, MapLibre GL JS, Chart.js)
├── nginx.conf      # Configuration Nginx pour le reverse proxy Docker
├── docker-compose.yml
└── README.md
```

## Données sources (V1)
L'application V1 consolide les sources de données suivantes :
1. **RPLS 2025** (`Donnees-detaillees-au-logement-du-repertoire-des-logements-locatifs-des-bailleurs-sociau.2025-01.csv`) : Agrégation des typologies (T1 à T5+) et financements sociaux par commune.
2. **Demandes & Attributions 2024** (`socle_demandes_attributions_2024.xlsx`) : Identification du volume des demandes, des attributions réelles et du ratio de tension par commune.
3. **Zonage ABC 2025** (`liste-des-communes-zonage-abc-5-septembre-2025.csv`) : Classement réglementaire de la tension immobilière.
4. **Loi SRU 2025** (`donnees-sru-data-gouv-2025-v2.csv`) : Identification du taux de logement social obligatoire et des communes déficitaires.
5. **Géométries** (`communes-5m.geojson`) : Limites communales simplifiées par l'ETL pour garantir l'affichage ultra-fluide de la carte sur mobile et desktop.
6. **Plafonds Réglementaires** (`etl/plafonds_ressources.json`) : Grilles réglementaires officielles d'éligibilité pour les dispositifs PLAI/PLUS/PLS et LLI.

## Installation & Lancement local

### 1. Préparation de l'environnement Python
Installez les dépendances nécessaires à l'ETL et au backend :
```bash
pip install pandas duckdb openpyxl fastapi uvicorn pydantic sqlalchemy geojson psycopg2-binary pyarrow
```

### 2. Exécution du Pipeline ETL
Le script ETL filtre automatiquement les données brutes à l'échelle nationale pour n'extraire que le périmètre de l'Île-de-France. Il utilise **DuckDB** pour agréger les 3.5 Go de données RPLS en moins de 10 secondes et simplifie le GeoJSON.

Depuis la racine du projet :
```bash
python etl/etl_pipeline.py
```
Cela génère :
- `processed/indicateurs_communes_idf.parquet` (données tabulaires consolidées)
- `processed/communes_idf.geojson` (cartes simplifiées pour MapLibre)
- `processed/logement.db` (base de données locale SQLite de développement)

### 3. Démarrage de l'API Backend
Lancez le serveur FastAPI de développement :
```bash
cd backend
python -m uvicorn main:app --reload
```
L'API sera disponible sur `http://127.0.0.1:8000`. L'interface de documentation interactive Swagger est accessible sur `http://127.0.0.1:8000/docs`.

### 4. Démarrage du Frontend
Comme l'interface est codée en HTML/JS natif, vous pouvez simplement ouvrir le fichier `frontend/index.html` dans votre navigateur ou le servir avec un serveur HTTP minimaliste :
```bash
cd frontend
python -m http.server 8080
```
Ouvrez ensuite `http://127.0.0.1:8080` dans votre navigateur.

---

## Déploiement en Production (VPS avec Docker)

Le déploiement est automatisé via Docker Compose, associant PostGIS (base de données géographique), FastAPI, et Nginx pour servir le frontend statique et relayer les appels API vers le conteneur backend.

### 1. Configuration
Vérifiez les variables d'environnement dans `docker-compose.yml`. Si vous utilisez PostGIS en production, l'ETL se connectera à la base PostgreSQL à la place du SQLite local en définissant la variable d'environnement :
```bash
export DATABASE_URL=postgresql://postgres:password123@localhost:5432/logement
```

### 2. Lancement des conteneurs
Depuis le répertoire racine :
```bash
docker compose up -d --build
```
- L'interface web est accessible sur le port HTTP standard **80**.
- La base PostGIS persiste ses données dans le volume Docker `pgdata`.
