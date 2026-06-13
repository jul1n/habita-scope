-- Initial database schema for Logement App
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS indicateurs_communes_idf (
    code_commune VARCHAR(5) PRIMARY KEY,
    nom_commune VARCHAR(150) NOT NULL,
    departement VARCHAR(3) NOT NULL,
    epci VARCHAR(150),
    zone_abc VARCHAR(2),
    zone_sociale VARCHAR(50),
    logements_sociaux_total INTEGER DEFAULT 0,
    logements_plai INTEGER DEFAULT 0,
    logements_plus INTEGER DEFAULT 0,
    logements_pls INTEGER DEFAULT 0,
    logements_t1 INTEGER DEFAULT 0,
    logements_t2 INTEGER DEFAULT 0,
    logements_t3 INTEGER DEFAULT 0,
    logements_t4 INTEGER DEFAULT 0,
    logements_t5_plus INTEGER DEFAULT 0,
    demandes_total INTEGER DEFAULT 0,
    attributions_total INTEGER DEFAULT 0,
    ratio_demandes_attributions DOUBLE PRECISION DEFAULT 0.0,
    taux_sru DOUBLE PRECISION,
    commune_deficitaire_sru BOOLEAN DEFAULT FALSE,
    loyer_prive_m2 DOUBLE PRECISION,
    geometry GEOMETRY(MultiPolygon, 4326)
);

CREATE INDEX IF NOT EXISTS idx_indicateurs_communes_idf_geom ON indicateurs_communes_idf USING gist(geometry);
CREATE INDEX IF NOT EXISTS idx_indicateurs_communes_idf_dept ON indicateurs_communes_idf(departement);
