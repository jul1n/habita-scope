// ----------------------------------------------------
// GLOBAL STATE & CONSTANTS
// ----------------------------------------------------
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : '';

let map = null;
let communesData = []; // Light JSON commune indicator list
let communesGeoJSON = null; // GeoJSON shapes currently loaded
let globalStats = null;
let selectedCommuneCode = null;

// Chart.js Instances
let fundingChartInstance = null;
let typologyChartInstance = null;

const DEP_NAMES = {
    '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence', '05': 'Hautes-Alpes',
    '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes', '09': 'Ariège', '10': 'Aube',
    '11': 'Aude', '12': 'Aveyron', '13': 'Bouches-du-Rhône', '14': 'Calvados', '15': 'Cantal',
    '16': 'Charente', '17': 'Charente-Maritime', '18': 'Cher', '19': 'Corrèze', '2A': 'Corse-du-Sud',
    '2B': 'Haute-Corse', '21': "Côte-d'Or", '22': "Côtes-d'Armor", '23': 'Creuse', '24': 'Dordogne',
    '25': 'Doubs', '26': 'Drôme', '27': 'Eure', '28': 'Eure-et-Loir', '29': 'Finistère',
    '30': 'Gard', '31': 'Haute-Garonne', '32': 'Gers', '33': 'Gironde', '34': 'Hérault',
    '35': 'Ille-et-Vilaine', '36': 'Indre', '37': 'Indre-et-Loire', '38': 'Isère', '39': 'Jura',
    '40': 'Landes', '41': 'Loir-et-Cher', '42': 'Loire', '43': 'Haute-Loire', '44': 'Loire-Atlantique',
    '45': 'Loiret', '46': 'Lot', '47': 'Lot-et-Garonne', '48': 'Lozère', '49': 'Maine-et-Loire',
    '50': 'Manche', '51': 'Marne', '52': 'Haute-Marne', '53': 'Mayenne', '54': 'Meurthe-et-Moselle',
    '55': 'Meuse', '56': 'Morbihan', '57': 'Moselle', '58': 'Nièvre', '59': 'Nord',
    '60': 'Oise', '61': 'Orne', '62': 'Pas-de-Calais', '63': 'Puy-de-Dôme', '64': 'Pyrénées-Atlantiques',
    '65': 'Hautes-Pyrénées', '66': 'Pyrénées-Orientales', '67': 'Bas-Rhin', '68': 'Haut-Rhin', '69': 'Rhône',
    '70': 'Haute-Saône', '71': 'Saône-et-Loire', '72': 'Sarthe', '73': 'Savoie', '74': 'Haute-Savoie',
    '75': 'Paris', '76': 'Seine-Maritime', '77': 'Seine-et-Marne', '78': 'Yvelines', '79': 'Deux-Sèvres',
    '80': 'Somme', '81': 'Tarn', '82': 'Tarn-et-Garonne', '83': 'Var', '84': 'Vaucluse',
    '85': 'Vendée', '86': 'Vienne', '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne',
    '90': 'Territoire de Belfort', '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne',
    '95': "Val-d'Oise", '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane', '974': 'La Réunion',
    '976': 'Mayotte'
};

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

async function initApp() {
    try {
        // 1. Fetch Global Stats & Communes List
        await fetchGlobalStats();
        await fetchCommunesList();
        
        // 2. Populate Dropdowns
        populateDepartmentDropdown();
        populateCommuneDropdown();
        
        // 3. Initialize MapLibre
        initMap();
    } catch (err) {
        console.error("Error during application initialization:", err);
        alert("Erreur lors de l'initialisation de l'application. Vérifiez que l'API backend tourne.");
    }
}

// ----------------------------------------------------
// API CALLS
// ----------------------------------------------------
async function fetchGlobalStats() {
    try {
        const res = await fetch(`${API_BASE_URL}/indicateurs`);
        globalStats = await res.json();
        
        // Set header stats
        document.getElementById("stat-communes").innerText = globalStats.total_communes.toLocaleString('fr-FR');
        document.getElementById("stat-logements").innerText = globalStats.total_logements_sociaux.toLocaleString('fr-FR');
        document.getElementById("stat-tension").innerText = `${globalStats.moyenne_tension.toFixed(1)} demandes / attrib.`;
    } catch (e) {
        console.error("Failed to fetch global stats:", e);
    }
}

async function fetchCommunesList() {
    const res = await fetch(`${API_BASE_URL}/communes`);
    communesData = await res.json();
}

function populateDepartmentDropdown() {
    const select = document.getElementById("filter-dep");
    select.innerHTML = ''; // Clear hardcoded ones
    
    // Extract unique departments from the dataset
    const deps = [...new Set(communesData.map(c => c.departement))].sort((a, b) => a.localeCompare(b));
    
    deps.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d;
        const name = DEP_NAMES[d] ? `${d} - ${DEP_NAMES[d]}` : `${d}`;
        opt.innerText = name;
        if (d === '75') {
            opt.selected = true; // Default to Paris
        }
        select.appendChild(opt);
    });
}

function populateCommuneDropdown() {
    const select = document.getElementById("sim-commune");
    select.innerHTML = '<option value="">Sélectionnez une commune...</option>';
    
    // Sort communes alphabetically
    const sorted = [...communesData].sort((a, b) => a.nom_commune.localeCompare(b.nom_commune));
    sorted.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.code_commune;
        opt.innerText = `${c.nom_commune} (${c.departement})`;
        select.appendChild(opt);
    });
}

// ----------------------------------------------------
// TAB MANAGEMENT
// ----------------------------------------------------
function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.remove("active");
    });
    const activeBtn = Array.from(document.querySelectorAll(".tab-btn")).find(btn => 
        btn.getAttribute("onclick").includes(tabId)
    );
    if (activeBtn) activeBtn.classList.add("active");

    document.getElementById("tab-filters").classList.remove("active");
    document.getElementById("tab-simulator").classList.remove("active");
    document.getElementById(`tab-${tabId}`).classList.add("active");
}

// ----------------------------------------------------
// DYNAMIC GEOJSON LAYER LOADER
// ----------------------------------------------------
async function loadDepartmentGeometry(depCode) {
    if (!map) return;
    
    // Show loading spinner
    document.getElementById("map-loading").classList.remove("hidden");
    
    try {
        const response = await fetch(`${API_BASE_URL}/communes/geojson/${depCode}`);
        if (!response.ok) {
            throw new Error(`Department geometry ${depCode} not found on server.`);
        }
        communesGeoJSON = await response.json();
        
        // Join tabular indicators with GeoJSON properties
        const indicatorsMap = {};
        communesData.forEach(c => {
            if (c.departement === depCode) {
                indicatorsMap[c.code_commune] = c;
            }
        });
        
        communesGeoJSON.features.forEach(f => {
            const code = f.properties.code_commune;
            const data = indicatorsMap[code];
            if (data) {
                f.properties = { ...f.properties, ...data };
            } else {
                f.properties.logements_sociaux_total = 0;
                f.properties.demandes_total = 0;
                f.properties.ratio_demandes_attributions = 0;
                f.properties.loyer_prive_m2 = 12;
                f.properties.nom_commune = "Inconnue";
            }
        });

        // Set source data
        const source = map.getSource('communes-idf');
        if (source) {
            source.setData(communesGeoJSON);
        }
        
        // Zoom and center map bounds to fit the loaded department
        fitMapToGeoJSON();
        
    } catch (e) {
        console.error("Failed to load department geometry:", e);
    } finally {
        document.getElementById("map-loading").classList.add("hidden");
    }
}

function fitMapToGeoJSON() {
    if (!communesGeoJSON || communesGeoJSON.features.length === 0) return;
    
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    
    communesGeoJSON.features.forEach(f => {
        if (!f.geometry || !f.geometry.coordinates) return;
        
        const processCoords = (coords) => {
            if (typeof coords[0] === 'number') {
                const x = coords[0];
                const y = coords[1];
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            } else {
                coords.forEach(processCoords);
            }
        };
        
        processCoords(f.geometry.coordinates);
    });
    
    if (minX < maxX && minY < maxY) {
        map.fitBounds([minX, minY, maxX, maxY], {
            padding: 40,
            maxZoom: 11
        });
    }
}

// ----------------------------------------------------
// MAPLIBRE GL JS CARTOGRAPHY
// ----------------------------------------------------
function initMap() {
    map = new maplibregl.Map({
        container: 'map',
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [2.3522, 48.8566], // Default center Paris
        zoom: 9,
        minZoom: 4,
        maxZoom: 14
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-left');

    map.on('load', async () => {
        // Add empty source first
        map.addSource('communes-idf', {
            type: 'geojson',
            data: { type: "FeatureCollection", features: [] }
        });

        // Add fill layer
        map.addLayer({
            id: 'communes-fill',
            type: 'fill',
            source: 'communes-idf',
            paint: {
                'fill-color': getMapColorExpression('tension'),
                'fill-opacity': 0.65
            }
        });

        // Add outline layer for hover highlight
        map.addLayer({
            id: 'communes-line',
            type: 'line',
            source: 'communes-idf',
            paint: {
                'line-color': '#38bdf8',
                'line-width': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    2,
                    0.3
                ],
                'line-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    0.9,
                    0.3
                ]
            }
        });

        // Load default department (75 - Paris)
        await loadDepartmentGeometry('75');

        // Interaction events
        let hoveredFeatureId = null;

        map.on('mousemove', 'communes-fill', (e) => {
            if (e.features.length > 0) {
                if (hoveredFeatureId !== null) {
                    map.setFeatureState(
                        { source: 'communes-idf', id: hoveredFeatureId },
                        { hover: false }
                    );
                }
                if (e.features[0].id !== undefined) {
                    map.setFeatureState(
                        { source: 'communes-idf', id: e.features[0].id },
                        { hover: true }
                    );
                    hoveredFeatureId = e.features[0].id;
                }
            }
        });

        map.on('mouseleave', 'communes-fill', () => {
            if (hoveredFeatureId !== null) {
                map.setFeatureState(
                    { source: 'communes-idf', id: hoveredFeatureId },
                    { hover: false }
                );
            }
            hoveredFeatureId = null;
        });

        map.on('click', 'communes-fill', (e) => {
            if (e.features.length > 0) {
                const code = e.features[0].properties.code_commune;
                showCommuneDetails(code);
            }
        });
    });
}

// ----------------------------------------------------
// THEMATIC COLOR MAP EXPRESSIONS
// ----------------------------------------------------
function getMapColorExpression(mode) {
    if (mode === 'tension') {
        return [
            'case',
            ['==', ['coalesce', ['get', 'demandes_total'], 0], 0], '#334155',
            ['<', ['get', 'ratio_demandes_attributions'], 5], '#4ade80',
            ['<', ['get', 'ratio_demandes_attributions'], 15], '#a3e635',
            ['<', ['get', 'ratio_demandes_attributions'], 30], '#f59e0b',
            ['<', ['get', 'ratio_demandes_attributions'], 60], '#f97316',
            ['<', ['get', 'ratio_demandes_attributions'], 120], '#ef4444',
            '#b91c1c'
        ];
    } else if (mode === 'social_share') {
        return [
            'interpolate',
            ['linear'],
            ['get', 'logements_sociaux_total'],
            0, '#1e293b',       // Deep grey (no social housing)
            100, '#6366f1',     // Indigo
            2500, '#38bdf8'     // Bright Blue (High volume)
        ];
    } else if (mode === 'loyer') {
        return [
            'interpolate',
            ['linear'],
            ['get', 'loyer_prive_m2'],
            10, '#10b981',   // Green (Inexpensive, ~11 €/m²)
            18, '#f59e0b',   // Amber (~17-18 €/m²)
            30, '#ec4899'    // Pink (High, 30+ €/m²)
        ];
    }
}

function updateMapColoration() {
    const colorMode = document.querySelector('input[name="map-color"]:checked').value;
    if (map && map.getLayer('communes-fill')) {
        map.setPaintProperty('communes-fill', 'fill-color', getMapColorExpression(colorMode));
        
        // Update Legend
        const legend = document.getElementById("map-legend");
        const grad = legend.querySelector(".legend-gradient");
        const labels = legend.querySelector(".legend-labels");
        const title = legend.querySelector("h4");
        
        grad.className = "legend-gradient"; // Reset classes
        
        if (colorMode === 'tension') {
            title.innerText = "Légende : Tension locale";
            grad.classList.add("tension-grad");
            labels.innerHTML = '<div style="display: flex; justify-content: space-between; width: 100%;"><span>Faible (&lt; 5)</span><span>Moyenne (30)</span><span>Critique (120+)</span></div><div style="text-align: center; margin-top: 6px; color: #94a3b8; font-size: 9px;">⬜ Gris : Données indisponibles (Hors IDF)</div>';
        } else if (colorMode === 'social_share') {
            title.innerText = "Légende : Logements Sociaux";
            grad.classList.add("social-grad");
            labels.innerHTML = '<span>0 log.</span><span>1 000 log.</span><span>2 500+ log.</span>';
        } else if (colorMode === 'loyer') {
            title.innerText = "Légende : Loyer privé (€/m²)";
            grad.classList.add("loyer-grad");
            labels.innerHTML = '<span>Économique (11€)</span><span>Moyen (18€)</span><span>Élevé (30€+)</span>';
        }
    }
}

// ----------------------------------------------------
// MAP FILTER SYSTEM
// ----------------------------------------------------
function applyFilters() {
    if (!map || !map.getLayer('communes-fill')) return;
    
    const depVal = document.getElementById("filter-dep").value;
    const abcVal = document.getElementById("filter-abc").value;
    const tensionVal = document.getElementById("filter-tension").value;
    
    // Check if department changed
    if (depVal && communesGeoJSON && communesGeoJSON.features.length > 0) {
        const currentGeomDep = communesGeoJSON.features[0].properties.departement;
        if (currentGeomDep !== depVal) {
            // Dynamically load the shapes of the newly selected department
            loadDepartmentGeometry(depVal);
            return;
        }
    }
    
    // Build MapLibre filter expression
    let expressions = ['all'];
    
    if (abcVal) {
        expressions.push(['==', ['get', 'zone_abc'], abcVal]);
    }
    
    if (tensionVal) {
        if (tensionVal === 'faible') {
            expressions.push(['<', ['get', 'ratio_demandes_attributions'], 5]);
        } else if (tensionVal === 'moderee') {
            expressions.push(['all', 
                ['>=', ['get', 'ratio_demandes_attributions'], 5],
                ['<', ['get', 'ratio_demandes_attributions'], 15]
            ]);
        } else if (tensionVal === 'forte') {
            expressions.push(['all', 
                ['>=', ['get', 'ratio_demandes_attributions'], 15],
                ['<', ['get', 'ratio_demandes_attributions'], 30]
            ]);
        } else if (tensionVal === 'critique') {
            expressions.push(['>=', ['get', 'ratio_demandes_attributions'], 30]);
        }
    }
    
    // Apply filter or clear
    if (expressions.length > 1) {
        map.setFilter('communes-fill', expressions);
    } else {
        map.setFilter('communes-fill', null);
    }
}

// ----------------------------------------------------
// SIMULATOR RUNNER
// ----------------------------------------------------
async function runSimulation(event) {
    event.preventDefault();
    
    const adults = parseInt(document.getElementById("sim-adults").value);
    const children = parseInt(document.getElementById("sim-children").value);
    const jeuneMenage = document.getElementById("sim-jeune-menage").checked;
    const handicap = document.getElementById("sim-handicap").checked;
    const parentIsole = document.getElementById("sim-parent-isole").checked;
    const revenuFiscal = parseFloat(document.getElementById("sim-rfr").value);
    const codeCommune = document.getElementById("sim-commune").value;
    const typologie = document.getElementById("sim-typo").value;
    
    if (!codeCommune) {
        alert("Veuillez choisir une commune pour la simulation.");
        return;
    }
    
    const payload = {
        adults,
        children,
        jeune_menage: jeuneMenage,
        handicap,
        parent_isole: parentIsole,
        revenu_fiscal: revenuFiscal,
        code_commune: codeCommune,
        typologie
    };
    
    try {
        const res = await fetch(`${API_BASE_URL}/eligibilite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.detail || "Simulation error");
        }
        
        const result = await res.json();
        displaySimulationResult(result);
    } catch (err) {
        console.error("Simulation failed:", err);
        alert(`Erreur de simulation: ${err.message}`);
    }
}

function displaySimulationResult(result) {
    const resultBox = document.getElementById("simulation-result");
    resultBox.classList.remove("hidden");
    
    const setupBadge = (id, isEligible) => {
        const badge = document.getElementById(id);
        const icon = badge.querySelector(".badge-icon");
        if (isEligible) {
            badge.classList.add("eligible");
            icon.innerText = "✔️";
        } else {
            badge.classList.remove("eligible");
            icon.innerText = "❌";
        }
    };
    
    setupBadge("badge-plai", result.eligible_plai);
    setupBadge("badge-plus", result.eligible_plus);
    setupBadge("badge-pls", result.eligible_pls);
    setupBadge("badge-lli", result.eligible_lli);
    
    document.getElementById("result-comment").innerText = result.commentaire;
    
    document.getElementById("ceil-plai").innerText = result.plafond_plai.toLocaleString('fr-FR');
    document.getElementById("ceil-plus").innerText = result.plafond_plus.toLocaleString('fr-FR');
    document.getElementById("ceil-pls").innerText = result.plafond_pls.toLocaleString('fr-FR');
    document.getElementById("ceil-lli").innerText = result.plafond_lli.toLocaleString('fr-FR');
    
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Extract department from selected commune code (first 2 digits)
    const targetCommuneCode = document.getElementById("sim-commune").value;
    const targetDep = targetCommuneCode.substring(0, 2);
    
    // Automatically select the department in the filter select dropdown and load geometry if different
    const depSelect = document.getElementById("filter-dep");
    if (depSelect.value !== targetDep) {
        depSelect.value = targetDep;
        loadDepartmentGeometry(targetDep).then(() => {
            showCommuneDetails(targetCommuneCode);
        });
    } else {
        showCommuneDetails(targetCommuneCode);
    }
}

// ----------------------------------------------------
// COMMUNE DETAILED PANEL & CHARTS
// ----------------------------------------------------
async function showCommuneDetails(code_commune) {
    selectedCommuneCode = code_commune;
    
    try {
        const res = await fetch(`${API_BASE_URL}/communes/${code_commune}`);
        const c = await res.json();
        
        const panel = document.getElementById("details-panel");
        panel.classList.remove("hidden");
        
        document.getElementById("det-nom").innerText = c.nom_commune;
        document.getElementById("det-zone").innerText = `Zone ${c.zone_abc}`;
        document.getElementById("det-code").innerText = c.code_commune;
        document.getElementById("det-dep").innerText = c.departement;
        document.getElementById("det-epci").innerText = c.epci || "Non renseigné";
        document.getElementById("det-sociaux").innerText = c.logements_sociaux_total.toLocaleString('fr-FR');
        document.getElementById("det-ratio").innerText = c.ratio_demandes_attributions > 0 ? c.ratio_demandes_attributions.toFixed(1) : "N/A";
        document.getElementById("det-demandes").innerText = c.demandes_total > 0 ? c.demandes_total.toLocaleString('fr-FR') : "N/A (Hors IdF)";
        document.getElementById("det-attributions").innerText = c.attributions_total > 0 ? c.attributions_total.toLocaleString('fr-FR') : "N/A (Hors IdF)";
        
        const sruSpan = document.getElementById("det-sru");
        if (c.taux_sru !== null) {
            const pct = (c.taux_sru * 100).toFixed(1);
            sruSpan.innerText = `${pct}% ${c.commune_deficitaire_sru ? '(Déficitaire)' : '(Conforme)'}`;
            sruSpan.className = c.commune_deficitaire_sru ? 'sru-status deficit' : 'sru-status ok';
        } else {
            sruSpan.innerText = "Non concerné (Art L302-5)";
            sruSpan.className = 'sru-status ok';
        }
        
        document.getElementById("rent-prive").innerText = c.loyer_prive_m2.toFixed(2);
        
        buildCharts(c);
        
        // Fly map to selected commune
        if (map && communesGeoJSON) {
            const feature = communesGeoJSON.features.find(f => f.properties.code_commune === code_commune);
            if (feature && feature.geometry) {
                const coords = feature.geometry.coordinates;
                let center = null;
                if (feature.geometry.type === 'Polygon') {
                    center = getPolygonCenter(coords[0]);
                } else if (feature.geometry.type === 'MultiPolygon') {
                    center = getPolygonCenter(coords[0][0]);
                }
                
                if (center) {
                    map.easeTo({
                        center: center,
                        zoom: 11.5,
                        duration: 1000
                    });
                }
            }
        }
        
    } catch (e) {
        console.error("Error displaying commune details:", e);
    }
}

function closeDetailsPanel() {
    document.getElementById("details-panel").classList.add("hidden");
    selectedCommuneCode = null;
}

function getPolygonCenter(pts) {
    let x = 0, y = 0;
    pts.forEach(p => {
        x += p[0];
        y += p[1];
    });
    return [x / pts.length, y / pts.length];
}

// ----------------------------------------------------
// CHART.JS CONSTRUCTORS
// ----------------------------------------------------
function buildCharts(c) {
    const fundingCtx = document.getElementById('fundingChart').getContext('2d');
    if (fundingChartInstance) fundingChartInstance.destroy();
    
    const totalSocio = c.logements_plai + c.logements_plus + c.logements_pls;
    const unknownSocial = Math.max(0, c.logements_sociaux_total - totalSocio);
    
    fundingChartInstance = new Chart(fundingCtx, {
        type: 'doughnut',
        data: {
            labels: ['PLAI (Très social)', 'PLUS (Standard)', 'PLS (Intermédiaire HLM)', 'Autres financements'],
            datasets: [{
                data: [c.logements_plai, c.logements_plus, c.logements_pls, unknownSocial],
                backgroundColor: ['#ef4444', '#6366f1', '#38bdf8', '#475569'],
                borderWidth: 1,
                borderColor: '#1e293b'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { size: 9 }, boxWidth: 10 }
                }
            }
        }
    });

    const typoCtx = document.getElementById('typologyChart').getContext('2d');
    if (typologyChartInstance) typologyChartInstance.destroy();
    
    typologyChartInstance = new Chart(typoCtx, {
        type: 'bar',
        data: {
            labels: ['T1', 'T2', 'T3', 'T4', 'T5+'],
            datasets: [{
                label: 'Nombre de logements',
                data: [c.logements_t1, c.logements_t2, c.logements_t3, c.logements_t4, c.logements_t5_plus],
                backgroundColor: 'rgba(56, 189, 248, 0.4)',
                borderColor: '#38bdf8',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 9 } } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 9 } } }
            }
        }
    });
}
