// ----------------------------------------------------
// GLOBAL STATE
// ----------------------------------------------------
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : ''; // Empty for relative calls when deployed behind Nginx

let map = null;
let communesData = []; // Light JSON commune indicator list
let communesGeoJSON = null; // GeoJSON shapes
let globalStats = null;
let selectedCommuneCode = null;

// Chart.js Instances
let fundingChartInstance = null;
let typologyChartInstance = null;

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
        
        // 2. Initialize MapLibre
        initMap();
        
        // 3. Populate Simulator Select Options
        populateCommuneDropdown();
        
        // 4. Hide Map Loader Overlay once loaded
        document.getElementById("map-loading").classList.add("hidden");
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
    // Buttons
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.remove("active");
    });
    // Find clicked button
    const activeBtn = Array.from(document.querySelectorAll(".tab-btn")).find(btn => 
        btn.getAttribute("onclick").includes(tabId)
    );
    if (activeBtn) activeBtn.classList.add("active");

    // Content panels
    document.getElementById("tab-filters").classList.remove("active");
    document.getElementById("tab-simulator").classList.remove("active");
    document.getElementById(`tab-${tabId}`).classList.add("active");
}

// ----------------------------------------------------
// MAPLIBRE GL JS CARTOGRAPHY
// ----------------------------------------------------
function initMap() {
    map = new maplibregl.Map({
        container: 'map',
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [2.3522, 48.8566], // Center on Paris
        zoom: 9,
        minZoom: 8,
        maxZoom: 13
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-left');

    map.on('load', async () => {
        // Fetch GeoJSON shapes
        try {
            const response = await fetch(`${API_BASE_URL}/communes/geojson`);
            communesGeoJSON = await response.json();
            
            // Enrich GeoJSON properties with communal indicator data for fast client-side styling
            const indicatorsMap = {};
            communesData.forEach(c => {
                indicatorsMap[c.code_commune] = c;
            });
            
            communesGeoJSON.features.forEach(f => {
                const code = f.properties.code_commune;
                const data = indicatorsMap[code];
                if (data) {
                    f.properties = { ...f.properties, ...data };
                } else {
                    f.properties.logements_sociaux_total = 0;
                    f.properties.ratio_demandes_attributions = 0;
                    f.properties.loyer_prive_m2 = 15;
                    f.properties.nom_commune = "Inconnue";
                }
            });

            // Add source
            map.addSource('communes-idf', {
                type: 'geojson',
                data: communesGeoJSON
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
                    // For GeoJSON features, ID is often indices if not explicitly set
                    hoveredFeatureId = e.features[0].id || e.features[0].properties.code_commune;
                    
                    // Workaround: set state on feature with matching code_commune
                    // Find actual feature ID in source (which MapLibre maps internally)
                    // If no explicit ID, MapLibre assigns internal id which is in e.features[0].id
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

        } catch (e) {
            console.error("Failed to load map data layers:", e);
        }
    });
}

// ----------------------------------------------------
// THEMATIC COLOR MAP EXPRESSIONS
// ----------------------------------------------------
function getMapColorExpression(mode) {
    if (mode === 'tension') {
        return [
            'interpolate',
            ['linear'],
            ['get', 'ratio_demandes_attributions'],
            0, '#4ade80',    // Vert (Faible tension: < 5)
            5, '#4ade80',
            15, '#a3e635',   // Vert-Jaune (5 - 15)
            30, '#f59e0b',   // Orange (15 - 30)
            60, '#f97316',   // Orange foncé (30 - 60)
            120, '#ef4444',  // Rouge (60 - 120)
            200, '#b91c1c'   // Rouge foncé (120+)
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
            labels.innerHTML = '<span>Faible (< 5)</span><span>Moyenne (30)</span><span>Critique (120+)</span>';
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
    
    // Build MapLibre filter expression
    let expressions = ['all'];
    
    if (depVal) {
        expressions.push(['==', ['get', 'departement'], depVal]);
    }
    
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
    
    // Toggle badges
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
    
    // Inject comment
    document.getElementById("result-comment").innerText = result.commentaire;
    
    // Inject ceilings
    document.getElementById("ceil-plai").innerText = result.plafond_plai.toLocaleString('fr-FR');
    document.getElementById("ceil-plus").innerText = result.plafond_plus.toLocaleString('fr-FR');
    document.getElementById("ceil-pls").innerText = result.plafond_pls.toLocaleString('fr-FR');
    document.getElementById("ceil-lli").innerText = result.plafond_lli.toLocaleString('fr-FR');
    
    // Scroll simulation panel to results
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Automatically fly map and open detailed commune sheet
    if (map) {
        showCommuneDetails(document.getElementById("sim-commune").value);
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
        
        // Show panel
        const panel = document.getElementById("details-panel");
        panel.classList.remove("hidden");
        
        // Fill fields
        document.getElementById("det-nom").innerText = c.nom_commune;
        document.getElementById("det-zone").innerText = `Zone ${c.zone_abc}`;
        document.getElementById("det-code").innerText = c.code_commune;
        document.getElementById("det-dep").innerText = c.departement;
        document.getElementById("det-epci").innerText = c.epci || "Non rattaché";
        document.getElementById("det-sociaux").innerText = c.logements_sociaux_total.toLocaleString('fr-FR');
        document.getElementById("det-ratio").innerText = c.ratio_demandes_attributions.toFixed(1);
        document.getElementById("det-demandes").innerText = c.demandes_total.toLocaleString('fr-FR');
        document.getElementById("det-attributions").innerText = c.attributions_total.toLocaleString('fr-FR');
        
        // Clean SRU Label
        const sruSpan = document.getElementById("det-sru");
        if (c.taux_sru !== null) {
            const pct = (c.taux_sru * 100).toFixed(1);
            sruSpan.innerText = `${pct}% ${c.commune_deficitaire_sru ? '(Déficitaire)' : '(Conforme)'}`;
            sruSpan.className = c.commune_deficitaire_sru ? 'sru-status deficit' : 'sru-status ok';
        } else {
            sruSpan.innerText = "Non concerné (Art L302-5)";
            sruSpan.className = 'sru-status ok';
        }
        
        // Rents
        document.getElementById("rent-prive").innerText = c.loyer_prive_m2.toFixed(2);
        
        // Build / Update Charts
        buildCharts(c);
        
        // Zoom/Center Map on clicked Commune
        if (map && communesGeoJSON) {
            const feature = communesGeoJSON.features.find(f => f.properties.code_commune === code_commune);
            if (feature && feature.geometry) {
                // Compute bounds or center
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

// Simple polygon centroid calculation
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
    // 1. Funding Types (Doughnut)
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

    // 2. Room size Typologies (Bar)
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
