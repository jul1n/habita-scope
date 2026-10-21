import re
import os
import json
from functools import lru_cache
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ----------------------------------------------------
# DATABASE SETUP
# ----------------------------------------------------
# Resolve database URL relative to this script
backend_dir = os.path.dirname(os.path.abspath(__file__))
default_db_path = os.path.abspath(os.path.join(backend_dir, "../processed/logement.db")).replace('\\', '/')
DATABASE_URL = os.environ.get('DATABASE_URL', f'sqlite:///{default_db_path}')

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Helper to get DB Session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ----------------------------------------------------
# CEILINGS LOAD
# ----------------------------------------------------
# Load resource ceilings JSON
ceilings_file = os.path.abspath(os.path.join(backend_dir, "../etl/plafonds_ressources.json"))
try:
    with open(ceilings_file, 'r', encoding='utf-8') as f:
        CEILINGS_DATA = json.load(f)
except FileNotFoundError:
    # Fallback to hardcoded values if file isn't created yet or missing
    CEILINGS_DATA = {
        "annee": 2024,
        "social": {
            "zone_sociale": "Ile-de-France",
            "plafonds": {
                "PLAI": {"1_personne": 14329, "2_personnes": 23371, "3_personnes": 30635, "4_personnes": 33534, "5_personnes": 39898, "6_personnes": 44899, "par_personne_supp": 4573},
                "PLUS": {"1_personne": 26044, "2_personnes": 38952, "3_personnes": 46823, "4_personnes": 56532, "5_personnes": 66496, "6_personnes": 74832, "par_personne_supp": 8319},
                "PLS": {"1_personne": 33857, "2_personnes": 50638, "3_personnes": 60870, "4_personnes": 73492, "5_personnes": 86445, "6_personnes": 97282, "par_personne_supp": 10815}
            }
        },
        "intermediaire_lli": {
            "zones": {
                "A_bis": {"1_personne": 43475, "2_personnes": 64976, "3_personnes": 80816, "4_personnes": 93556, "5_personnes": 110753, "6_personnes": 124630, "par_personne_supp": 13886},
                "A": {"1_personne": 43475, "2_personnes": 64976, "3_personnes": 80816, "4_personnes": 93556, "5_personnes": 110753, "6_personnes": 124630, "par_personne_supp": 13886},
                "B1": {"1_personne": 35435, "2_personnes": 47321, "3_personnes": 56905, "4_personnes": 68699, "5_personnes": 80816, "6_personnes": 91078, "par_personne_supp": 10161},
                "B2": {"1_personne": 31892, "2_personnes": 42588, "3_personnes": 51215, "4_personnes": 61830, "5_personnes": 72735, "6_personnes": 82043, "par_personne_supp": 9142},
                "C": {"1_personne": 31892, "2_personnes": 42588, "3_personnes": 51215, "4_personnes": 61830, "5_personnes": 72735, "6_personnes": 82043, "par_personne_supp": 9142}
            }
        }
    }

# ----------------------------------------------------
# PYDANTIC MODEL SCHEMAS
# ----------------------------------------------------
class CommuneLight(BaseModel):
    code_commune: str
    nom_commune: str
    departement: str
    epci: Optional[str] = None
    zone_abc: Optional[str] = None
    zone_sociale: Optional[str] = None
    logements_sociaux_total: int
    demandes_total: int
    attributions_total: int
    ratio_demandes_attributions: float
    taux_sru: Optional[float] = None
    commune_deficitaire_sru: bool
    loyer_prive_m2: Optional[float] = None
    loyer_max_plai: Optional[float] = None
    loyer_max_plus: Optional[float] = None
    loyer_max_pls: Optional[float] = None
    prix_achat_m2_median: Optional[float] = None
    prix_achat_m2_moyen: Optional[float] = None

class CommuneDetail(CommuneLight):
    logements_plai: int
    logements_plus: int
    logements_pls: int
    logements_t1: int
    logements_t2: int
    logements_t3: int
    logements_t4: int
    logements_t5_plus: int
    logements_manquants_sru: Optional[int] = None

class SimulationInput(BaseModel):
    adults: int = Field(..., ge=1, description="Nombre d'adultes")
    children: int = Field(0, ge=0, description="Nombre d'enfants")
    jeune_menage: bool = Field(False, description="Jeune ménage (couple sans enfant somme âges < 55 ans)")
    handicap: bool = Field(False, description="Personne en situation de handicap (surclassement)")
    parent_isole: bool = Field(False, description="Parent isolé (famille monoparentale)")
    revenu_fiscal: float = Field(..., ge=0, description="Revenu Fiscal de Référence annuel en €")
    code_commune: str = Field(..., description="Code INSEE de la commune souhaitée")
    typologie: str = Field("T2", pattern=r"^[Tt][1-5]\+?$", description="Typologie recherchée (T1, T2, T3, T4, T5+)")

class EligibilityResult(BaseModel):
    eligible_plai: bool
    eligible_plus: bool
    eligible_pls: bool
    eligible_lli: bool
    plafond_plai: float
    plafond_plus: float
    plafond_pls: float
    plafond_lli: float
    commune_name: str
    zone_abc: str
    tension_locale: float
    disponibilite_relative: str
    commentaire: str

# ----------------------------------------------------
# FASTAPI APP CREATION
# ----------------------------------------------------
app = FastAPI(
    title="API Logement Social & Intermédiaire Île-de-France",
    description="API permettant d'identifier la tension locale sur le logement et d'évaluer l'éligibilité aux dispositifs PLAI, PLUS, PLS, et LLI.",
    version="1.0.0"
)

# Enable CORS for frontend integration
# Origines autorisées (séparées par des virgules). L'API est publique et sans cookie :
# pas de credentials, méthodes limitées à ce qu'elle expose réellement.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# Helper function to convert DB Row to Dict
def row_to_dict(row):
    return dict(row._mapping) if hasattr(row, '_mapping') else dict(row)

# ----------------------------------------------------
# API ENDPOINTS
# ----------------------------------------------------
@app.get("/communes", response_model=List[CommuneLight])
def get_communes(db: Session = Depends(get_db)):
    """Retourne la liste simplifiée de toutes les communes d'IDF (sans géométrie)."""
    query = text("""
        SELECT code_commune, nom_commune, departement, epci, zone_abc, zone_sociale, 
               logements_sociaux_total, demandes_total, attributions_total, 
               ratio_demandes_attributions, taux_sru, commune_deficitaire_sru, loyer_prive_m2,
               loyer_max_plai, loyer_max_plus, loyer_max_pls, prix_achat_m2_median, prix_achat_m2_moyen
        FROM indicateurs_communes_idf
        ORDER BY nom_commune
    """)
    result = db.execute(query).fetchall()
    return [row_to_dict(r) for r in result]

@lru_cache(maxsize=32)
def load_geojson_file(path: str):
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

_DEP_RE = re.compile(r"^(\d{2,3}|2[AB])$", re.IGNORECASE)

def _clean_dep(dep_code: str) -> str:
    """Code département strict (01-95, 2A/2B, 971-976) : refuse tout autre format."""
    dep = dep_code.zfill(2)
    if not _DEP_RE.match(dep):
        raise HTTPException(status_code=400, detail="Code département invalide.")
    return dep.upper()

@app.get("/communes/geojson/{dep_code}")
def get_communes_geojson(dep_code: str, response: Response):
    """Retourne la géométrie simplifiée de toutes les communes d'un département."""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    dep_clean = _clean_dep(dep_code)
    geojson_path = os.path.abspath(os.path.join(backend_dir, f"../processed/geometries/{dep_clean}.geojson"))
    data = load_geojson_file(geojson_path)
    if data is None:
        raise HTTPException(status_code=404, detail=f"GeoJSON file for department {dep_clean} not found.")
    return data

@app.get("/communes/grid-geojson/{dep_code}")
def get_grid_geojson(dep_code: str, response: Response):
    """Retourne les carreaux Filosofi 1km pour un département."""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    dep_clean = _clean_dep(dep_code)
    geojson_path = os.path.abspath(os.path.join(backend_dir, f"../processed/geometries/grid_{dep_clean}.geojson"))
    data = load_geojson_file(geojson_path)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Grid GeoJSON file for department {dep_clean} not found.")
    return data

@app.get("/communes/{code_commune}", response_model=CommuneDetail)
def get_commune(code_commune: str, db: Session = Depends(get_db)):
    """Retourne les indicateurs détaillés d'une commune spécifique."""
    query = text("""
        SELECT *
        FROM indicateurs_communes_idf
        WHERE code_commune = :code
    """)
    result = db.execute(query, {"code": code_commune.zfill(5)}).fetchone()
    if not result:
        raise HTTPException(status_code=404, detail=f"Commune {code_commune} introuvable.")
    
    commune_dict = row_to_dict(result)
    taux_sru = commune_dict.get('taux_sru')
    sociaux = commune_dict.get('logements_sociaux_total') or 0
    if taux_sru and taux_sru > 0 and taux_sru < 0.25:
        res_principales = sociaux / taux_sru
        target_sociaux = res_principales * 0.25
        manquants = max(0, int(target_sociaux - sociaux))
        commune_dict['logements_manquants_sru'] = manquants
    else:
        commune_dict['logements_manquants_sru'] = 0
        
    return commune_dict

@app.get("/indicateurs")
def get_global_indicators(db: Session = Depends(get_db)):
    """Retourne des statistiques globales consolidées pour l'Île-de-France."""
    query = text("""
        SELECT 
            SUM(logements_sociaux_total) as total_logements_sociaux,
            SUM(demandes_total) as total_demandes,
            SUM(attributions_total) as total_attributions,
            AVG(ratio_demandes_attributions) as moyenne_tension,
            SUM(CASE WHEN commune_deficitaire_sru = 1 THEN 1 ELSE 0 END) as communes_deficitaire_sru,
            COUNT(*) as total_communes
        FROM indicateurs_communes_idf
    """)
    res = db.execute(query).fetchone()
    return row_to_dict(res)

@app.get("/plafonds")
def get_regulatory_ceilings():
    """Retourne les grilles réglementaires des plafonds de ressources (social et LLI)."""
    return CEILINGS_DATA

@app.post("/eligibilite", response_model=EligibilityResult)
def simulate_eligibility(input_data: SimulationInput, db: Session = Depends(get_db)):
    """Simule l'éligibilité théorique d'un ménage."""
    # 1. Fetch target commune data
    query = text("""
        SELECT nom_commune, zone_abc, ratio_demandes_attributions, zone_sociale,
               logements_plai, logements_plus, logements_pls, logements_sociaux_total,
               logements_t1, logements_t2, logements_t3, logements_t4, logements_t5_plus
        FROM indicateurs_communes_idf
        WHERE code_commune = :code
    """)
    commune = db.execute(query, {"code": input_data.code_commune.zfill(5)}).fetchone()
    if not commune:
        raise HTTPException(status_code=404, detail=f"Commune {input_data.code_commune} introuvable.")
        
    commune_dict = row_to_dict(commune)
    zone_abc = commune_dict['zone_abc'] or "B1"
    zone_sociale = commune_dict.get('zone_sociale', 'Province')
    
    # 2. Determine Household Category index (1 to 6+)
    # Base size of household
    household_size = input_data.adults + input_data.children
    
    # Base category mapping
    category = 1
    if input_data.adults == 1 and input_data.children == 0:
        category = 1
    elif input_data.adults == 2 and input_data.children == 0:
        # HLM Rules: young couple without child is category 3
        if input_data.jeune_menage:
            category = 3
        else:
            category = 2
    else:
        # Parents isolés (monoparental) or standard couples
        # Category 3: 3 persons (or 2 persons + 1 child)
        # Category 4: 4 persons
        # Category 5: 5 persons
        # Category 6: 6 persons
        # Category > 6: 6 + additional
        category = min(6, household_size)
        if household_size > 6:
            category = household_size
            
    # Handicap surclass card rules
    if input_data.handicap:
        category += 1
        
    # 3. Lookup HLM (Social) Ceilings
    is_idf = (zone_sociale != "Province")
    social_grid_key = "IDF" if is_idf else "province"
    social_ceilings = CEILINGS_DATA['social']['zones'][social_grid_key]
    
    def get_social_ceiling(grid_name, cat):
        grid = social_ceilings[grid_name]
        if cat <= 6:
            cat_keys = ["1_personne", "2_personnes", "3_personnes", "4_personnes", "5_personnes", "6_personnes"]
            return grid[cat_keys[cat - 1]]
        else:
            # Over 6 persons
            excess = cat - 6
            return grid["6_personnes"] + excess * grid["par_personne_supp"]
            
    plai_max = get_social_ceiling("PLAI", category)
    plus_max = get_social_ceiling("PLUS", category)
    pls_max = get_social_ceiling("PLS", category)
    
    # 4. Lookup LLI (Intermediate) Ceilings
    # Clean LLI zone key (A_bis / A / B1 / B2 / C)
    lli_zone_key = zone_abc.replace(" ", "_")
    if lli_zone_key not in CEILINGS_DATA['intermediaire_lli']['zones']:
        # Fallback to A if not matched
        lli_zone_key = "A"
        
    lli_grid = CEILINGS_DATA['intermediaire_lli']['zones'][lli_zone_key]
    
    def get_lli_ceiling(grid, cat):
        if cat <= 6:
            cat_keys = ["1_personne", "2_personnes", "3_personnes", "4_personnes", "5_personnes", "6_personnes"]
            return grid[cat_keys[cat - 1]]
        else:
            excess = cat - 6
            return grid["6_personnes"] + excess * grid["par_personne_supp"]
            
    lli_max = get_lli_ceiling(lli_grid, category)
    
    # 5. Evaluate Eligibility
    eligible_plai = input_data.revenu_fiscal <= plai_max
    eligible_plus = input_data.revenu_fiscal <= plus_max
    eligible_pls = input_data.revenu_fiscal <= pls_max
    eligible_lli = input_data.revenu_fiscal <= lli_max
    
    # 6. Analyze typologies availability
    # T1 to T5+
    typo_search = input_data.typologie.lower().replace('+', '_plus')
    typo_col = f"logements_{typo_search}"
    units_available = commune_dict.get(typo_col, 0)
    total_soc = commune_dict.get('logements_sociaux_total', 1) or 1
    
    share = (units_available / total_soc) if total_soc > 0 else 0
    if share > 0.35:
        disponibilite = "Élevée (représente plus de 35% du parc social local)"
    elif share > 0.15:
        disponibilite = "Moyenne"
    elif share > 0:
        disponibilite = "Faible"
    else:
        disponibilite = "Très faible ou Aucun logement de ce type enregistré"
        
    # 7. Generate Comment
    comment_parts = []
    if eligible_plai:
        comment_parts.append("Votre revenu vous rend éligible aux logements très sociaux (PLAI), destinés aux ménages en situation de précarité.")
    elif eligible_plus:
        comment_parts.append("Vous êtes éligible au logement social classique (PLUS). Cela correspond à la majorité des logements HLM.")
    elif eligible_pls:
        comment_parts.append("Vous êtes éligible au logement social financé en PLS (loyer intermédiaire du parc social).")
    elif eligible_lli:
        comment_parts.append("Vous n'êtes pas éligible au logement social classique, mais vos revenus vous permettent d'accéder au Logement Locatif Intermédiaire (LLI).")
    else:
        comment_parts.append("Vos revenus dépassent les plafonds réglementaires pour le logement social et intermédiaire en Île-de-France.")
        
    tension = commune_dict['ratio_demandes_attributions']
    if tension > 15:
        comment_parts.append(f"Attention, la commune de {commune_dict['nom_commune']} est en zone de très forte tension ({tension:.1f} demandes pour 1 attribution). Le délai d'attente réel sera probablement très long.")
    elif tension > 5:
        comment_parts.append(f"La tension est modérée sur cette commune ({tension:.1f} demandes pour 1 attribution).")
    else:
        comment_parts.append("La tension locale est faible, favorisant une attribution plus rapide.")
        
    # Return response payload
    return EligibilityResult(
        eligible_plai=eligible_plai,
        eligible_plus=eligible_plus,
        eligible_pls=eligible_pls,
        eligible_lli=eligible_lli,
        plafond_plai=plai_max,
        plafond_plus=plus_max,
        plafond_pls=pls_max,
        plafond_lli=lli_max,
        commune_name=commune_dict['nom_commune'],
        zone_abc=zone_abc,
        tension_locale=tension,
        disponibilite_relative=disponibilite,
        commentaire=" ".join(comment_parts)
    )
