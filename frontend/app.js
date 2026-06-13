// ----------------------------------------------------
// GLOBAL STATE & CONSTANTS
// ----------------------------------------------------
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : '';

let map = null;
let communesData = []; // Light JSON commune indicator list
let communesGeoJSON = null; // GeoJSON shapes currently loaded
let gridGeoJSON = null; // 1km Grid cells GeoJSON currently loaded
let globalStats = null;
let selectedCommuneCode = null;

let selectedDeps = ['75']; // Array of selected department codes

// Chart.js Instances
let fundingChartInstance = null;
let typologyChartInstance = null;
let compareCommunes = [];
let compareChart = null;

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
    
    // Close suggestions and multiselect when clicking outside
    document.addEventListener("click", (e) => {
        const multiselect = document.getElementById("dep-multiselect");
        if (multiselect && !multiselect.contains(e.target)) {
            const dropdown = document.getElementById("dep-suggestions");
            if (dropdown) dropdown.classList.add("hidden");
        }
    });
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
        
        // 4. Initialize Autocomplete Search Bar
        initAutocompleteSearch();
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
    const data = await res.json();
    communesData = data.filter(c => c.code_commune !== '75056');
    
    // Set initial SRU stats
    let totalAssujetties = 0;
    let totalDeficitaires = 0;
    communesData.forEach(c => {
        if (c.taux_sru !== null) {
            totalAssujetties++;
            if (c.commune_deficitaire_sru) totalDeficitaires++;
        }
    });
    document.getElementById("stat-sru-deficit").innerText = totalAssujetties > 0 ? `${totalDeficitaires} / ${totalAssujetties} communes` : "0 / 0";
}

function toggleMultiselect() {
    const dropdown = document.getElementById("dep-suggestions");
    if (dropdown) dropdown.classList.toggle("hidden");
}

function populateDepartmentDropdown() {
    const dropdown = document.getElementById("dep-suggestions");
    if (!dropdown) return;
    dropdown.innerHTML = ''; // Clear suggestions
    
    // Add Master toggle option
    const masterDiv = document.createElement("div");
    masterDiv.className = "multiselect-item master-toggle";
    masterDiv.innerHTML = `
        <label>
            <input type="checkbox" id="dep-toggle-all">
            <strong>France entière</strong>
        </label>
    `;
    dropdown.appendChild(masterDiv);

    // Add IDF Region toggle option
    const idfDiv = document.createElement("div");
    idfDiv.className = "multiselect-item master-toggle";
    idfDiv.innerHTML = `
        <label>
            <input type="checkbox" id="dep-toggle-idf">
            <strong>Région Île-de-France</strong>
        </label>
    `;
    dropdown.appendChild(idfDiv);
    
    // Extract unique departments from the dataset
    const deps = [...new Set(communesData.map(c => c.departement))].sort((a, b) => a.localeCompare(b));
    
    deps.forEach(d => {
        const div = document.createElement("div");
        div.className = "multiselect-item";
        const name = DEP_NAMES[d] ? `${d} - ${DEP_NAMES[d]}` : `${d}`;
        div.innerHTML = `
            <label>
                <input type="checkbox" value="${d}" class="dep-check" ${selectedDeps.includes(d) ? 'checked' : ''}>
                <span>${name}</span>
            </label>
        `;
        dropdown.appendChild(div);
    });
    
    // Update placeholder text
    updateMultiselectPlaceholder();
    
    // Wire up events
    const toggleAllCheckbox = document.getElementById("dep-toggle-all");
    const toggleIdfCheckbox = document.getElementById("dep-toggle-idf");
    const depCheckboxes = dropdown.querySelectorAll(".dep-check");
    const idfDeps = ['75', '77', '78', '91', '92', '93', '94', '95'];
    
    // Initial sync
    const checkAllInitial = Array.from(depCheckboxes).every(c => c.checked);
    toggleAllCheckbox.checked = checkAllInitial;
    
    const checkIdfInitial = idfDeps.every(dep => {
        const cb = Array.from(depCheckboxes).find(c => c.value === dep);
        return cb && cb.checked;
    });
    toggleIdfCheckbox.checked = checkIdfInitial;
    
    toggleAllCheckbox.addEventListener("change", (e) => {
        const isChecked = e.target.checked;
        depCheckboxes.forEach(cb => {
            cb.checked = isChecked;
        });
        toggleIdfCheckbox.checked = isChecked;
        updateSelectedDepsFromCheckboxes();
    });

    toggleIdfCheckbox.addEventListener("change", (e) => {
        const isChecked = e.target.checked;
        depCheckboxes.forEach(cb => {
            if (idfDeps.includes(cb.value)) {
                cb.checked = isChecked;
            }
        });
        if (!isChecked) {
            toggleAllCheckbox.checked = false;
        } else {
            const allChecked = Array.from(depCheckboxes).every(c => c.checked);
            toggleAllCheckbox.checked = allChecked;
        }
        updateSelectedDepsFromCheckboxes();
    });
    
    depCheckboxes.forEach(cb => {
        cb.addEventListener("change", () => {
            if (!cb.checked) {
                toggleAllCheckbox.checked = false;
                if (idfDeps.includes(cb.value)) {
                    toggleIdfCheckbox.checked = false;
                }
            } else {
                const allChecked = Array.from(depCheckboxes).every(c => c.checked);
                toggleAllCheckbox.checked = allChecked;
                
                const allIdfChecked = idfDeps.every(dep => {
                    const cBox = Array.from(depCheckboxes).find(c => c.value === dep);
                    return cBox && cBox.checked;
                });
                toggleIdfCheckbox.checked = allIdfChecked;
            }
            updateSelectedDepsFromCheckboxes();
        });
    });
}

function updateMultiselectPlaceholder() {
    const placeholder = document.querySelector(".multiselect-placeholder");
    if (!placeholder) return;
    
    const idfDeps = ['75', '77', '78', '91', '92', '93', '94', '95'];
    const allDeps = [...new Set(communesData.map(c => c.departement))];
    
    if (selectedDeps.length === 0) {
        placeholder.innerText = "Sélectionnez les départements...";
    } else if (selectedDeps.length === 1) {
        const dep = selectedDeps[0];
        placeholder.innerText = DEP_NAMES[dep] ? `${dep} - ${DEP_NAMES[dep]}` : `${dep}`;
    } else if (selectedDeps.length === allDeps.length) {
        placeholder.innerText = "France entière";
    } else if (selectedDeps.length === idfDeps.length && idfDeps.every(dep => selectedDeps.includes(dep))) {
        placeholder.innerText = "Région Île-de-France";
    } else {
        placeholder.innerText = `${selectedDeps.length} départements sélectionnés`;
    }
}

function updateSelectedDepsFromCheckboxes() {
    const dropdown = document.getElementById("dep-suggestions");
    const checkedBoxes = Array.from(dropdown.querySelectorAll(".dep-check:checked"));
    selectedDeps = checkedBoxes.map(cb => cb.value);
    
    updateMultiselectPlaceholder();
    loadDepartmentsGeometry(selectedDeps);
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
// DYNAMIC GEOJSON LAYER LOADER FOR MULTIPLE DEPARTMENTS
// ----------------------------------------------------
async function loadDepartmentsGeometry(depCodes) {
    if (!map) return;
    
    if (depCodes.length === 0) {
        // Clear map data
        const source = map.getSource('communes-idf');
        if (source) {
            source.setData({ type: 'FeatureCollection', features: [] });
        }
        return;
    }
    
    const allDeps = [...new Set(communesData.map(c => c.departement))];
    if (depCodes.length === allDeps.length) {
        await loadAllFranceGeometry();
        return;
    }
    
    // Show loading spinner
    document.getElementById("map-loading").classList.remove("hidden");
    const loadingText = document.getElementById("map-loading").querySelector("p");
    loadingText.innerText = `Chargement des départements (${depCodes.join(', ')})...`;
    
    try {
        // Fetch all selected geometries concurrently (communes and grid cells)
        const fetchPromises = depCodes.map(dep => 
            fetch(`${API_BASE_URL}/communes/geojson/${dep}?v=1.1`)
                .then(res => res.ok ? res.json() : null)
                .catch(() => null)
        );
        const fetchGridPromises = depCodes.map(dep => 
            fetch(`${API_BASE_URL}/communes/grid-geojson/${dep}?v=1.1`)
                .then(res => res.ok ? res.json() : null)
                .catch(() => null)
        );
        
        const results = await Promise.all(fetchPromises);
        const gridResults = await Promise.all(fetchGridPromises);
        
        // Combine features
        let combinedFeatures = [];
        const indicatorsMap = {};
        
        communesData.forEach(c => {
            if (depCodes.includes(c.departement)) {
                indicatorsMap[c.code_commune] = c;
            }
        });
        
        results.forEach((geojson, idx) => {
            const depCode = depCodes[idx];
            if (geojson && geojson.features) {
                geojson.features.forEach(f => {
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
                        f.properties.departement = depCode;
                    }
                });
                combinedFeatures = combinedFeatures.concat(geojson.features);
            }
        });
        
        communesGeoJSON = {
            type: 'FeatureCollection',
            features: combinedFeatures
        };
        
        // Combine grid features
        let combinedGridFeatures = [];
        gridResults.forEach(geojson => {
            if (geojson && geojson.features) {
                combinedGridFeatures = combinedGridFeatures.concat(geojson.features);
            }
        });
        gridGeoJSON = {
            type: 'FeatureCollection',
            features: combinedGridFeatures
        };
        
        const source = map.getSource('communes-idf');
        if (source) {
            source.setData(communesGeoJSON);
        }
        
        const gridSource = map.getSource('grid-cells');
        if (gridSource) {
            gridSource.setData(gridGeoJSON);
        }
        
        const isGridVisible = document.getElementById("toggle-grid-layer").checked;
        if (isGridVisible) {
            updateGridColoration();
        } else {
            updateMapColoration();
        }
        
        fitMapToGeoJSON();
        
        // Update Stats
        let depTotalCommunes = 0;
        let depTotalLogements = 0;
        let depTotalTensionSum = 0;
        let depTensionCommuneCount = 0;
        let depSruAssujetties = 0;
        let depSruDeficitaires = 0;
        
        communesData.forEach(c => {
            if (depCodes.includes(c.departement)) {
                depTotalCommunes++;
                depTotalLogements += c.logements_sociaux_total || 0;
                if (c.demandes_total > 0) {
                    depTotalTensionSum += c.ratio_demandes_attributions || 0;
                    depTensionCommuneCount++;
                }
                if (c.taux_sru !== null) {
                    depSruAssujetties++;
                    if (c.commune_deficitaire_sru) {
                        depSruDeficitaires++;
                    }
                }
            }
        });
        
        const avgTension = depTensionCommuneCount > 0 ? (depTotalTensionSum / depTensionCommuneCount).toFixed(1) : "N/A";
        
        document.getElementById("stat-communes").innerText = depTotalCommunes.toLocaleString('fr-FR');
        document.getElementById("stat-logements").innerText = depTotalLogements.toLocaleString('fr-FR');
        document.getElementById("stat-tension").innerText = depTensionCommuneCount > 0 ? `${avgTension} demandes / attrib.` : "N/A";
        document.getElementById("stat-sru-deficit").innerText = depSruAssujetties > 0 ? `${depSruDeficitaires} / ${depSruAssujetties} communes` : "0 / 0";
        
        // Re-apply current map filters
        applyFilters();
        
    } catch (e) {
        console.error("Failed to load multiple geometries:", e);
    } finally {
        document.getElementById("map-loading").classList.add("hidden");
        loadingText.innerText = "Chargement de la carte et des communes de France...";
    }
}

async function loadDepartmentGeometry(depCode) {
    selectedDeps = [depCode];
    
    // Sync checkboxes
    const dropdown = document.getElementById("dep-suggestions");
    if (dropdown) {
        dropdown.querySelectorAll(".dep-check").forEach(cb => {
            cb.checked = (cb.value === depCode);
        });
        const toggleAll = document.getElementById("dep-toggle-all");
        if (toggleAll) toggleAll.checked = false;
    }
    
    updateMultiselectPlaceholder();
    await loadDepartmentsGeometry(selectedDeps);
}

async function loadAllFranceGeometry() {
    if (!map) return;
    
    document.getElementById("map-loading").classList.remove("hidden");
    const loadingText = document.getElementById("map-loading").querySelector("p");
    loadingText.innerText = "Chargement de la France entière (peut prendre quelques secondes)...";
    
    try {
        const deps = [...new Set(communesData.map(c => c.departement))].sort((a, b) => a.localeCompare(b));
        
        const fetchPromises = deps.map(dep => 
            fetch(`${API_BASE_URL}/communes/geojson/${dep}?v=1.1`)
                .then(res => res.ok ? res.json() : null)
                .catch(() => null)
        );
        const fetchGridPromises = deps.map(dep => 
            fetch(`${API_BASE_URL}/communes/grid-geojson/${dep}?v=1.1`)
                .then(res => res.ok ? res.json() : null)
                .catch(() => null)
        );
        
        const results = await Promise.all(fetchPromises);
        const gridResults = await Promise.all(fetchGridPromises);
        
        let allFeatures = [];
        const indicatorsMap = {};
        communesData.forEach(c => {
            indicatorsMap[c.code_commune] = c;
        });
        
        results.forEach((geojson, idx) => {
            const depCode = deps[idx];
            if (geojson && geojson.features) {
                geojson.features.forEach(f => {
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
                        f.properties.departement = depCode;
                    }
                });
                allFeatures = allFeatures.concat(geojson.features);
            }
        });
        
        communesGeoJSON = {
            type: 'FeatureCollection',
            features: allFeatures
        };
        
        // Combine grid features
        let allGridFeatures = [];
        gridResults.forEach(geojson => {
            if (geojson && geojson.features) {
                allGridFeatures = allGridFeatures.concat(geojson.features);
            }
        });
        gridGeoJSON = {
            type: 'FeatureCollection',
            features: allGridFeatures
        };
        
        const source = map.getSource('communes-idf');
        if (source) {
            source.setData(communesGeoJSON);
        }
        
        const gridSource = map.getSource('grid-cells');
        if (gridSource) {
            gridSource.setData(gridGeoJSON);
        }
        
        const isGridVisible = document.getElementById("toggle-grid-layer").checked;
        if (isGridVisible) {
            updateGridColoration();
        } else {
            updateMapColoration();
        }
        
        map.easeTo({
            center: [2.2137, 46.2276],
            zoom: 5.8,
            duration: 1000
        });
        
        if (globalStats) {
            document.getElementById("stat-communes").innerText = globalStats.total_communes.toLocaleString('fr-FR');
            document.getElementById("stat-logements").innerText = globalStats.total_logements_sociaux.toLocaleString('fr-FR');
            document.getElementById("stat-tension").innerText = `${globalStats.moyenne_tension.toFixed(1)} demandes / attrib.`;
            
            // Count SRU deficit nationally
            let totalAssujetties = 0;
            let totalDeficitaires = 0;
            communesData.forEach(c => {
                if (c.taux_sru !== null) {
                    totalAssujetties++;
                    if (c.commune_deficitaire_sru) totalDeficitaires++;
                }
            });
            document.getElementById("stat-sru-deficit").innerText = totalAssujetties > 0 ? `${totalDeficitaires} / ${totalAssujetties} communes` : "0 / 0";
            
            // Re-apply filters
            applyFilters();
        }
        
    } catch (e) {
        console.error("Failed to load France geometry:", e);
    } finally {
        document.getElementById("map-loading").classList.add("hidden");
        loadingText.innerText = "Chargement de la carte et des communes de France...";
    }
}

function fitMapToGeoJSON() {
    if (!communesGeoJSON || communesGeoJSON.features.length === 0) return;
    
    // Custom bounding boxes for DROMs to ensure crisp island-centered zooming
    const DROM_BOUNDS = {
        '971': [[-61.85, 15.8], [-60.95, 16.55]], // Guadeloupe
        '972': [[-61.25, 14.35], [-60.75, 14.9]], // Martinique
        '973': [[-54.6, 2.1], [-51.6, 5.8]],     // Guyane
        '974': [[55.2, -21.4], [55.9, -20.8]],    // La Réunion
        '976': [[45.0, -13.0], [45.3, -12.6]]     // Mayotte
    };

    if (selectedDeps.length === 1 && DROM_BOUNDS[selectedDeps[0]]) {
        map.fitBounds(DROM_BOUNDS[selectedDeps[0]], {
            padding: 40,
            maxZoom: 11
        });
        return;
    }
    
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

        // Add grid cells source
        map.addSource('grid-cells', {
            type: 'geojson',
            data: { type: "FeatureCollection", features: [] }
        });

        // Add grid cells fill layer
        map.addLayer({
            id: 'grid-cells-fill',
            type: 'fill',
            source: 'grid-cells',
            layout: {
                'visibility': 'none'
            },
            paint: {
                'fill-color': '#334155',
                'fill-opacity': 0.75
            }
        });

        // Add grid cells line layer
        map.addLayer({
            id: 'grid-cells-line',
            type: 'line',
            source: 'grid-cells',
            layout: {
                'visibility': 'none'
            },
            paint: {
                'line-color': '#f8fafc',
                'line-width': 0.5,
                'line-opacity': 0.3
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

        // Grid cells interactions
        map.on('click', 'grid-cells-fill', (e) => {
            if (e.features.length > 0) {
                const code = e.features[0].properties.code_commune;
                showCommuneDetails(code);
            }
        });

        map.on('mouseenter', 'grid-cells-fill', () => {
            map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'grid-cells-fill', () => {
            map.getCanvas().style.cursor = '';
        });
    });
}



function getPropNameForMode(mode) {
    if (mode === 'tension') return 'ratio_demandes_attributions';
    if (mode === 'social_share') return 'logements_sociaux_total';
    if (mode === 'loyer') return 'loyer_prive_m2';
    if (mode === 'loyer_social_plus') return 'loyer_max_plus';
    if (mode === 'loyer_social_pls') return 'loyer_max_pls';
    if (mode === 'sru_rate') return 'taux_sru';
    if (mode === 'prix_achat') return 'prix_achat_m2_median';
    return null;
}

function getMinMaxForMode(mode) {
    if (!communesGeoJSON || !communesGeoJSON.features || communesGeoJSON.features.length === 0) {
        return null;
    }
    const prop = getPropNameForMode(mode);
    if (!prop) return null;

    let values = communesGeoJSON.features
        .map(f => f.properties[prop])
        .filter(v => v !== undefined && v !== null);

    if (values.length === 0) return null;

    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    
    return { min: minVal, max: maxVal, prop: prop };
}

function getMapColorExpression(mode) {
    const range = getMinMaxForMode(mode);
    if (!range) {
        return '#334155';
    }

    const { min: minVal, max: maxVal, prop } = range;

    if (minVal === maxVal) {
        if (mode === 'tension') return '#4ade80';
        if (mode === 'social_share') return '#6366f1';
        if (mode === 'loyer') return '#10b981';
        if (mode === 'loyer_social_plus') return '#a7f3d0';
        if (mode === 'loyer_social_pls') return '#fed7aa';
        if (mode === 'sru_rate') return '#22c55e';
        if (mode === 'prix_achat') return '#a855f7';
    }

    const diff = maxVal - minVal;
    const step = (pct) => minVal + diff * pct;

    if (mode === 'tension') {
        return [
            'interpolate', ['linear'], ['coalesce', ['get', prop], 0],
            minVal, '#4ade80',
            step(0.25), '#a3e635',
            step(0.5), '#f59e0b',
            step(0.75), '#f97316',
            maxVal, '#ef4444'
        ];
    } else if (mode === 'social_share') {
        return [
            'interpolate', ['linear'], ['coalesce', ['get', prop], 0],
            minVal, '#1e293b',
            step(0.25), '#6366f1',
            step(0.5), '#4f46e5',
            step(0.75), '#4338ca',
            maxVal, '#38bdf8'
        ];
    } else if (mode === 'loyer') {
        return [
            'interpolate', ['linear'], ['coalesce', ['get', prop], 0],
            minVal, '#10b981',
            step(0.25), '#84cc16',
            step(0.5), '#f59e0b',
            step(0.75), '#f97316',
            maxVal, '#ec4899'
        ];
    } else if (mode === 'loyer_social_plus') {
        return [
            'interpolate', ['linear'], ['coalesce', ['get', prop], 0],
            minVal, '#a7f3d0',
            step(0.33), '#34d399',
            step(0.66), '#059669',
            maxVal, '#064e3b'
        ];
    } else if (mode === 'loyer_social_pls') {
        return [
            'interpolate', ['linear'], ['coalesce', ['get', prop], 0],
            minVal, '#fed7aa',
            step(0.33), '#fb923c',
            step(0.66), '#ea580c',
            maxVal, '#7c2d12'
        ];
    } else if (mode === 'sru_rate') {
        return [
            'case',
            ['==', ['coalesce', ['get', prop], -1], -1], '#334155',
            [
                'interpolate', ['linear'], ['get', prop],
                minVal, '#ef4444',
                step(0.33), '#f59e0b',
                step(0.66), '#a3e635',
                maxVal, '#22c55e'
            ]
        ];
    } else if (mode === 'prix_achat') {
        return [
            'interpolate', ['linear'], ['coalesce', ['get', prop], 0],
            minVal, '#10b981',
            step(0.25), '#38bdf8',
            step(0.5), '#6366f1',
            step(0.75), '#a855f7',
            maxVal, '#ec4899'
        ];
    }

    return '#334155';
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
        
        const range = getMinMaxForMode(colorMode);
        let legendHTML = '';
        
        if (range) {
            const { min, max } = range;
            const diff = max - min;
            const step = (pct) => min + diff * pct;
            
            if (colorMode === 'tension') {
                title.innerText = "Légende : Tension locale";
                grad.classList.add("tension-grad");
                legendHTML = `<div style="display: flex; justify-content: space-between; width: 100%;">
                    <span>Faible (${min.toFixed(0)})</span>
                    <span>Moyenne (${step(0.5).toFixed(0)})</span>
                    <span>Critique (${max.toFixed(0)}+)</span>
                </div>`;
            } else if (colorMode === 'social_share') {
                title.innerText = "Légende : Logements Sociaux";
                grad.classList.add("social-grad");
                legendHTML = `<div style="display: flex; justify-content: space-between; width: 100%;">
                    <span>Min (${min.toLocaleString()})</span>
                    <span>Moy (${Math.round(step(0.5)).toLocaleString()})</span>
                    <span>Max (${Math.round(max).toLocaleString()})</span>
                </div>`;
            } else if (colorMode === 'loyer') {
                title.innerText = "Légende : Loyer privé (€/m²)";
                grad.classList.add("loyer-grad");
                legendHTML = `<div style="display: flex; justify-content: space-between; width: 100%;">
                    <span>Min (${min.toFixed(1)}€)</span>
                    <span>Moy (${step(0.5).toFixed(1)}€)</span>
                    <span>Max (${max.toFixed(1)}€)</span>
                </div>`;
            } else if (colorMode === 'loyer_social_plus') {
                title.innerText = "Légende : Loyer Max PLUS (€/m²)";
                grad.classList.add("loyer-social-plus-grad");
                legendHTML = `<div style="display: flex; justify-content: space-between; width: 100%;">
                    <span>Min (${min.toFixed(2)}€)</span>
                    <span>Moy (${step(0.5).toFixed(2)}€)</span>
                    <span>Max (${max.toFixed(2)}€)</span>
                </div>`;
            } else if (colorMode === 'loyer_social_pls') {
                title.innerText = "Légende : Loyer Max PLS (€/m²)";
                grad.classList.add("loyer-social-pls-grad");
                legendHTML = `<div style="display: flex; justify-content: space-between; width: 100%;">
                    <span>Min (${min.toFixed(2)}€)</span>
                    <span>Moy (${step(0.5).toFixed(2)}€)</span>
                    <span>Max (${max.toFixed(2)}€)</span>
                </div>`;
            } else if (colorMode === 'sru_rate') {
                title.innerText = "Légende : Taux de Log. Sociaux (SRU)";
                grad.classList.add("sru-rate-grad");
                legendHTML = `<div style="display: flex; justify-content: space-between; width: 100%;">
                    <span>Min (${(min * 100).toFixed(1)}%)</span>
                    <span>Moy (${(step(0.5) * 100).toFixed(1)}%)</span>
                    <span>Max (${(max * 100).toFixed(1)}%)</span>
                </div>`;
            } else if (colorMode === 'prix_achat') {
                title.innerText = "Légende : Prix d'achat m² (DVF)";
                grad.classList.add("buy-grad");
                legendHTML = `<div style="display: flex; justify-content: space-between; width: 100%;">
                    <span>Min (${Math.round(min).toLocaleString()}€)</span>
                    <span>Moy (${Math.round(step(0.5)).toLocaleString()}€)</span>
                    <span>Max (${Math.round(max).toLocaleString()}€)</span>
                </div>`;
            }
        } else {
            // Fallback static if no range is ready
            if (colorMode === 'tension') {
                title.innerText = "Légende : Tension locale";
                grad.classList.add("tension-grad");
                legendHTML = '<div style="display: flex; justify-content: space-between; width: 100%;"><span>Faible (&lt; 5)</span><span>Moyenne (30)</span><span>Critique (120+)</span></div>';
            } else if (colorMode === 'social_share') {
                title.innerText = "Légende : Logements Sociaux";
                grad.classList.add("social-grad");
                legendHTML = '<span>0 log.</span><span>1 000 log.</span><span>2 500+ log.</span>';
            } else if (colorMode === 'loyer') {
                title.innerText = "Légende : Loyer privé (€/m²)";
                grad.classList.add("loyer-grad");
                legendHTML = '<div style="display: flex; justify-content: space-between; width: 100%;"><span>Tr. Éco (&lt;12€)</span><span>Moy (18€)</span><span>Tr. Élevé (26€+)</span></div>';
            } else if (colorMode === 'loyer_social_plus') {
                title.innerText = "Légende : Loyer Max PLUS (€/m²)";
                grad.classList.add("loyer-social-plus-grad");
                legendHTML = '<span>Zone III (6.01€)</span><span>Zone II (6.49€)</span><span>Zone I (7.40€)</span><span>Zone I bis (7.85€)</span>';
            } else if (colorMode === 'loyer_social_pls') {
                title.innerText = "Légende : Loyer Max PLS (€/m²)";
                grad.classList.add("loyer-social-pls-grad");
                legendHTML = '<span>Zone C/B2 (~9€)</span><span>Zone B1 (10.17€)</span><span>Zone A (11.80€)</span><span>Zone A bis (15.32€)</span>';
            } else if (colorMode === 'sru_rate') {
                title.innerText = "Légende : Taux de Log. Sociaux (SRU)";
                grad.classList.add("sru-rate-grad");
                legendHTML = '<div style="display: flex; justify-content: space-between; width: 100%;"><span>Déficitaire (&lt;10%)</span><span>Moyen (15%)</span><span>Conforme (25%+)</span></div>';
            } else if (colorMode === 'prix_achat') {
                title.innerText = "Légende : Prix d'achat m² (DVF)";
                grad.classList.add("buy-grad");
                legendHTML = '<div style="display: flex; justify-content: space-between; width: 100%;"><span>Abordable (&lt;2 000€)</span><span>Moyen (5 000€)</span><span>Élevé (10 000€+)</span></div>';
            }
        }
        
        labels.innerHTML = legendHTML;
    }
}

// ----------------------------------------------------
// MAP FILTER SYSTEM
// ----------------------------------------------------
function applyFilters() {
    if (!map || !map.getLayer('communes-fill')) return;
    
    const abcVal = document.getElementById("filter-abc").value;
    const tensionVal = document.getElementById("filter-tension").value;
    const sruDeficitOnly = document.getElementById("filter-sru-deficit").checked;
    
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
    
    if (sruDeficitOnly) {
        expressions.push(['==', ['get', 'commune_deficitaire_sru'], true]);
    }
    
    // Apply filter or clear
    if (expressions.length > 1) {
        map.setFilter('communes-fill', expressions);
    } else {
        map.setFilter('communes-fill', null);
    }
    
    updateSruDeficitList();
}

function updateSruDeficitList() {
    const sruDeficitOnly = document.getElementById("filter-sru-deficit").checked;
    const listContainer = document.getElementById("sru-deficit-list-box");
    const listElement = document.getElementById("sru-deficit-list");
    const titleElement = document.getElementById("sru-deficit-list-title");
    
    if (!sruDeficitOnly) {
        listContainer.classList.add("hidden");
        return;
    }
    
    listContainer.classList.remove("hidden");
    listElement.innerHTML = '';
    
    if (!communesGeoJSON || !communesGeoJSON.features) return;
    
    const abcVal = document.getElementById("filter-abc").value;
    const tensionVal = document.getElementById("filter-tension").value;
    
    let filteredCommunes = communesGeoJSON.features
        .map(f => f.properties)
        .filter(p => {
            if (!p.commune_deficitaire_sru) return false;
            if (abcVal && p.zone_abc !== abcVal) return false;
            if (tensionVal) {
                const tension = p.ratio_demandes_attributions;
                if (tensionVal === 'faible' && tension >= 5) return false;
                if (tensionVal === 'moderee' && (tension < 5 || tension >= 15)) return false;
                if (tensionVal === 'forte' && (tension < 15 || tension >= 30)) return false;
                if (tensionVal === 'critique' && tension < 30) return false;
            }
            return true;
        });
        
    filteredCommunes.sort((a, b) => a.nom_commune.localeCompare(b.nom_commune));
    
    titleElement.innerText = `Communes déficitaires (${filteredCommunes.length})`;
    
    if (filteredCommunes.length === 0) {
        listElement.innerHTML = '<div style="color: #64748b; padding: 4px; text-align: center;">Aucune commune déficitaire</div>';
        return;
    }
    
    filteredCommunes.forEach(c => {
        const item = document.createElement("div");
        item.style.padding = "6px";
        item.style.cursor = "pointer";
        item.style.borderRadius = "4px";
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        item.style.transition = "background-color 0.2s";
        item.innerHTML = `
            <span><strong>${c.nom_commune}</strong> (${c.departement})</span>
            <span style="color: #ef4444; font-weight: bold;">${(c.taux_sru * 100).toFixed(1)}%</span>
        `;
        item.addEventListener("mouseenter", () => {
            item.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
        });
        item.addEventListener("mouseleave", () => {
            item.style.backgroundColor = "";
        });
        item.addEventListener("click", () => {
            showCommuneDetails(c.code_commune);
        });
        listElement.appendChild(item);
    });
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
        
        // Also fetch the commune data for rent comparison
        const communeRes = await fetch(`${API_BASE_URL}/communes/${codeCommune}`);
        const communeData = await communeRes.json();
        
        displaySimulationResult(result, communeData, typologie, revenuFiscal);
    } catch (err) {
        console.error("Simulation failed:", err);
        alert(`Erreur de simulation: ${err.message}`);
    }
}

function displaySimulationResult(result, communeData, typologie, revenuFiscal) {
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
    
    // Rent & Budget Diagnostics
    const monthlyIncome = revenuFiscal / 12;
    const monthlyBudget = monthlyIncome * 0.33;
    
    let surface = 45;
    if (typologie === 'T1') surface = 30;
    else if (typologie === 'T2') surface = 45;
    else if (typologie === 'T3') surface = 65;
    else if (typologie === 'T4') surface = 80;
    else if (typologie === 'T5+') surface = 95;
    
    const rentPrive = surface * (communeData.loyer_prive_m2 || 0);
    const rentPlai = result.eligible_plai && communeData.loyer_max_plai ? surface * communeData.loyer_max_plai : null;
    const rentPlus = result.eligible_plus && communeData.loyer_max_plus ? surface * communeData.loyer_max_plus : null;
    const rentPls = result.eligible_pls && communeData.loyer_max_pls ? surface * communeData.loyer_max_pls : null;
    
    const getDiagnosticHTML = (label, rent, eligible) => {
        if (!eligible || rent === null || rent === 0) return '';
        const effortRate = (rent / monthlyIncome) * 100;
        let statusText = 'Confortable (< 25%)';
        let styleBg = 'rgba(74, 222, 128, 0.1)';
        let styleBorder = '1px solid rgba(74, 222, 128, 0.2)';
        let styleColor = '#4ade80';
        
        if (effortRate > 33) {
            statusText = 'Risqué (> 33%)';
            styleBg = 'rgba(248, 113, 113, 0.1)';
            styleBorder = '1px solid rgba(248, 113, 113, 0.2)';
            styleColor = '#f87171';
        } else if (effortRate >= 25) {
            statusText = 'Limite (25% - 33%)';
            styleBg = 'rgba(245, 158, 11, 0.1)';
            styleBorder = '1px solid rgba(245, 158, 11, 0.2)';
            styleColor = '#f59e0b';
        }
        
        return `
            <div style="background-color: ${styleBg}; border: ${styleBorder}; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; justify-content: space-between; font-weight: 600;">
                    <span>${label}</span>
                    <span style="color: ${styleColor};">${statusText}</span>
                </div>
                <div style="display: flex; justify-content: space-between; color: #94a3b8; font-size: 11px;">
                    <span>Loyer : <strong>${Math.round(rent)} €/mois</strong> (${surface}m²)</span>
                    <span>Taux d'effort : <strong>${effortRate.toFixed(1)}%</strong></span>
                </div>
            </div>
        `;
    };
    
    const privateHTML = getDiagnosticHTML('Parc Privé Estimé', rentPrive, true);
    const plaiHTML = getDiagnosticHTML('Social PLAI (Très social)', rentPlai, result.eligible_plai);
    const plusHTML = getDiagnosticHTML('Social PLUS (HLM Standard)', rentPlus, result.eligible_plus);
    const plsHTML = getDiagnosticHTML('Social PLS (Social Sup)', rentPls, result.eligible_pls);
    
    const diagnosticContainer = document.getElementById("sim-budget-diagnostic");
    if (diagnosticContainer) {
        diagnosticContainer.innerHTML = `
            <h5 style="font-size: 11px; font-weight: 600; color: #94a3b8; margin-bottom: 6px;">Budget maximum recommandé (33%) : <span style="color: #f8fafc; font-size: 12px; font-weight: 700;">${Math.round(monthlyBudget)} €/mois</span></h5>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                ${privateHTML}
                ${plaiHTML}
                ${plusHTML}
                ${plsHTML}
            </div>
        `;
    }
    
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Extract department from selected commune code (first 2 digits)
    const targetCommuneCode = document.getElementById("sim-commune").value;
    const targetDep = targetCommuneCode.substring(0, 2);

    // Automatically load the department and select it in our checkbox selection
    if (!selectedDeps.includes(targetDep)) {
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
        
        const sruDeficitBox = document.getElementById("det-sru-deficit-box");
        if (c.logements_manquants_sru && c.logements_manquants_sru > 0) {
            document.getElementById("det-sru-manquants").innerText = c.logements_manquants_sru.toLocaleString('fr-FR');
            sruDeficitBox.classList.remove("hidden");
        } else {
            sruDeficitBox.classList.add("hidden");
        }
        
        document.getElementById("buy-median").innerText = c.prix_achat_m2_median ? Math.round(c.prix_achat_m2_median).toLocaleString('fr-FR') : "N/A";
        document.getElementById("rent-prive").innerText = c.loyer_prive_m2.toFixed(2);
        document.getElementById("rent-max-plai").innerText = c.loyer_max_plai ? c.loyer_max_plai.toFixed(2) : "-";
        document.getElementById("rent-max-plus").innerText = c.loyer_max_plus ? c.loyer_max_plus.toFixed(2) : "-";
        document.getElementById("rent-max-pls").innerText = c.loyer_max_pls ? c.loyer_max_pls.toFixed(2) : "-";
        
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

// ----------------------------------------------------
// AUTOCOMPLETE SEARCH LOGIC
// ----------------------------------------------------
function initAutocompleteSearch() {
    const searchInput = document.getElementById("search-commune");
    const suggestionsBox = document.getElementById("search-suggestions");
    
    if (!searchInput || !suggestionsBox) return;
    
    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        suggestionsBox.innerHTML = '';
        
        if (query.length < 2) {
            suggestionsBox.classList.add("hidden");
            return;
        }
        
        const matches = communesData
            .filter(c => {
                const normName = c.nom_commune.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return normName.includes(query) || c.code_commune.includes(query);
            })
            .slice(0, 10);
            
        if (matches.length === 0) {
            suggestionsBox.classList.add("hidden");
            return;
        }
        
        matches.forEach(c => {
            const div = document.createElement("div");
            div.className = "suggestion-item";
            div.innerText = `${c.nom_commune} (${c.departement})`;
            div.addEventListener("click", () => {
                searchInput.value = c.nom_commune;
                suggestionsBox.classList.add("hidden");
                
                // If department is not loaded, switch to it and load it
                if (!selectedDeps.includes(c.departement)) {
                    loadDepartmentGeometry(c.departement).then(() => {
                        showCommuneDetails(c.code_commune);
                    });
                } else {
                    showCommuneDetails(c.code_commune);
                }
            });
            suggestionsBox.appendChild(div);
        });
        
        suggestionsBox.classList.remove("hidden");
    });
    
    // Close suggestions when clicking outside
    document.addEventListener("click", (e) => {
        if (e.target !== searchInput && e.target !== suggestionsBox) {
            suggestionsBox.classList.add("hidden");
        }
    });
}

// ----------------------------------------------------
// FILOSOFI GRID CELL LAYER CONTROL
// ----------------------------------------------------
function toggleGridLayer() {
    const isChecked = document.getElementById("toggle-grid-layer").checked;
    const ctrlBox = document.getElementById("grid-control-box");
    
    if (ctrlBox) {
        if (isChecked) {
            ctrlBox.classList.remove("hidden");
        } else {
            ctrlBox.classList.add("hidden");
        }
    }
    
    if (map && map.getLayer('grid-cells-fill')) {
        map.setLayoutProperty('grid-cells-fill', 'visibility', isChecked ? 'visible' : 'none');
        map.setLayoutProperty('grid-cells-line', 'visibility', isChecked ? 'visible' : 'none');
        
        if (isChecked) {
            updateGridColoration();
        } else {
            // Restore regular commune coloration legend
            updateMapColoration();
        }
    }
}

function updateGridColoration() {
    if (!map || !map.getLayer('grid-cells-fill')) return;
    
    const mode = document.getElementById("grid-color-mode").value;
    const colorExpr = getGridColorExpression(mode);
    
    map.setPaintProperty('grid-cells-fill', 'fill-color', colorExpr);
    
    // Update Legend for grid cells
    const legend = document.getElementById("map-legend");
    const grad = legend.querySelector(".legend-gradient");
    const labels = legend.querySelector(".legend-labels");
    const title = legend.querySelector("h4");
    
    grad.className = "legend-gradient"; // Reset classes
    
    const range = getMinMaxForGridMode(mode);
    let legendHTML = '';
    
    if (range) {
        const { min, max } = range;
        const diff = max - min;
        const step = (pct) => min + diff * pct;
        
        if (mode === 'pop') {
            title.innerText = "Légende : Population (Carreau 1km²)";
            grad.classList.add("social-grad");
            legendHTML = `<div style="display: flex; justify-content: space-between; width: 100%;">
                <span>Min (${min.toLocaleString()})</span>
                <span>Moy (${Math.round(step(0.5)).toLocaleString()})</span>
                <span>Max (${Math.round(max).toLocaleString()})</span>
            </div>`;
        } else if (mode === 'pauv') {
            title.innerText = "Légende : Ménages Pauvres (Carreau 1km²)";
            grad.classList.add("tension-grad");
            legendHTML = `<div style="display: flex; justify-content: space-between; width: 100%;">
                <span>Min (${min.toFixed(0)})</span>
                <span>Moy (${step(0.5).toFixed(0)})</span>
                <span>Max (${max.toFixed(0)})</span>
            </div>`;
        } else if (mode === 'soc') {
            title.innerText = "Légende : Logements Sociaux (Carreau 1km²)";
            grad.classList.add("loyer-social-plus-grad");
            legendHTML = `<div style="display: flex; justify-content: space-between; width: 100%;">
                <span>Min (${min.toFixed(0)})</span>
                <span>Moy (${step(0.5).toFixed(0)})</span>
                <span>Max (${max.toFixed(0)})</span>
            </div>`;
        } else if (mode === 'snv') {
            title.innerText = "Légende : Niveau de vie moyen (Filosofi)";
            grad.classList.add("loyer-grad");
            legendHTML = `<div style="display: flex; justify-content: space-between; width: 100%;">
                <span>Min (${min.toLocaleString()}€)</span>
                <span>Moy (${Math.round(step(0.5)).toLocaleString()}€)</span>
                <span>Max (${Math.round(max).toLocaleString()}€)</span>
            </div>`;
        }
    }
    
    labels.innerHTML = legendHTML;
}

function getMinMaxForGridMode(mode) {
    if (!gridGeoJSON || !gridGeoJSON.features || gridGeoJSON.features.length === 0) {
        return null;
    }
    let values = gridGeoJSON.features
        .map(f => f.properties[mode])
        .filter(v => v !== undefined && v !== null);

    if (values.length === 0) return null;

    return { min: Math.min(...values), max: Math.max(...values) };
}

function getGridColorExpression(mode) {
    const range = getMinMaxForGridMode(mode);
    if (!range) return '#334155';
    
    const { min: minVal, max: maxVal } = range;
    if (minVal === maxVal) return '#6366f1';
    
    const diff = maxVal - minVal;
    const step = (pct) => minVal + diff * pct;
    
    if (mode === 'pop') {
        return [
            'interpolate', ['linear'], ['coalesce', ['get', 'pop'], 0],
            minVal, '#1e293b',
            step(0.25), '#6366f1',
            step(0.5), '#4f46e5',
            step(0.75), '#4338ca',
            maxVal, '#38bdf8'
        ];
    } else if (mode === 'pauv') {
        return [
            'interpolate', ['linear'], ['coalesce', ['get', 'pauv'], 0],
            minVal, '#4ade80',
            step(0.25), '#a3e635',
            step(0.5), '#f59e0b',
            step(0.75), '#f97316',
            maxVal, '#ef4444'
        ];
    } else if (mode === 'soc') {
        return [
            'interpolate', ['linear'], ['coalesce', ['get', 'soc'], 0],
            minVal, '#a7f3d0',
            step(0.33), '#34d399',
            step(0.66), '#059669',
            maxVal, '#064e3b'
        ];
    } else if (mode === 'snv') {
        return [
            'interpolate', ['linear'], ['coalesce', ['get', 'snv'], 0],
            minVal, '#10b981',
            step(0.25), '#84cc16',
            step(0.5), '#f59e0b',
            step(0.75), '#f97316',
            maxVal, '#ec4899'
        ];
    }
    return '#334155';
}

// ----------------------------------------------------
// COMPARATOR SYSTEM
// ----------------------------------------------------
async function addToCompare() {
    if (!selectedCommuneCode) {
        alert("Veuillez d'abord sélectionner une commune sur la carte ou via la recherche.");
        return;
    }
    
    if (compareCommunes.some(c => c.code_commune === selectedCommuneCode)) {
        alert("Cette commune est déjà dans le comparateur.");
        return;
    }
    
    if (compareCommunes.length >= 3) {
        alert("Vous pouvez comparer un maximum de 3 communes simultanément.");
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE_URL}/communes/${selectedCommuneCode}`);
        const c = await res.json();
        compareCommunes.push(c);
        updateCompareUI();
        
        // Automatically switch to compare tab
        switchTab('compare');
    } catch (e) {
        console.error("Failed to add to compare:", e);
    }
}

function removeFromCompare(code) {
    compareCommunes = compareCommunes.filter(c => c.code_commune !== code);
    updateCompareUI();
}

function updateCompareUI() {
    const emptyState = document.getElementById("compare-empty");
    const compareContent = document.getElementById("compare-content");
    const compareItems = document.getElementById("compare-items");
    const compareTable = document.getElementById("compare-table-data");
    
    if (compareCommunes.length === 0) {
        emptyState.classList.remove("hidden");
        compareContent.classList.add("hidden");
        return;
    }
    
    emptyState.classList.add("hidden");
    compareContent.classList.remove("hidden");
    
    // 1. Render Compare Items (Cards)
    compareItems.innerHTML = '';
    compareCommunes.forEach(c => {
        const card = document.createElement("div");
        card.className = "compare-item-card";
        card.innerHTML = `
            <button class="remove-btn" onclick="removeFromCompare('${c.code_commune}')">×</button>
            <h4>${c.nom_commune}</h4>
            <span style="font-size: 10px; color: #94a3b8;">(${c.departement})</span>
        `;
        compareItems.appendChild(card);
    });
    
    // 2. Render Compare Table
    let tableHTML = `
        <thead>
            <tr>
                <th style="width: 40%;">Indicateur</th>
                ${compareCommunes.map(c => `<th style="text-align: center; width: ${60 / compareCommunes.length}%;">${c.nom_commune}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            <tr>
                <td><strong>Zone réglementaire (ABC)</strong></td>
                ${compareCommunes.map(c => `<td style="text-align: center;">Zone ${c.zone_abc || 'C'}</td>`).join('')}
            </tr>
            <tr>
                <td><strong>Prix d'achat médian (DVF)</strong></td>
                ${compareCommunes.map(c => `<td style="text-align: center;">${c.prix_achat_m2_median ? Math.round(c.prix_achat_m2_median).toLocaleString('fr-FR') + ' €/m²' : 'N/A'}</td>`).join('')}
            </tr>
            <tr>
                <td><strong>Loyer privé moyen</strong></td>
                ${compareCommunes.map(c => `<td style="text-align: center;">${c.loyer_prive_m2 ? c.loyer_prive_m2.toFixed(2) + ' €/m²' : 'N/A'}</td>`).join('')}
            </tr>
            <tr>
                <td><strong>Loyer max PLAI (Très social)</strong></td>
                ${compareCommunes.map(c => `<td style="text-align: center;">${c.loyer_max_plai ? c.loyer_max_plai.toFixed(2) + ' €/m²' : '-'}</td>`).join('')}
            </tr>
            <tr>
                <td><strong>Loyer max PLUS (HLM Standard)</strong></td>
                ${compareCommunes.map(c => `<td style="text-align: center;">${c.loyer_max_plus ? c.loyer_max_plus.toFixed(2) + ' €/m²' : '-'}</td>`).join('')}
            </tr>
            <tr>
                <td><strong>Loyer max PLS (Social Sup)</strong></td>
                ${compareCommunes.map(c => `<td style="text-align: center;">${c.loyer_max_pls ? c.loyer_max_pls.toFixed(2) + ' €/m²' : '-'}</td>`).join('')}
            </tr>
            <tr>
                <td><strong>Taux de logements sociaux</strong></td>
                ${compareCommunes.map(c => {
                    if (c.taux_sru !== null) {
                        return `<td style="text-align: center;">${(c.taux_sru * 100).toFixed(1)}%</td>`;
                    }
                    return `<td style="text-align: center;">Non concerné</td>`;
                }).join('')}
            </tr>
            <tr>
                <td><strong>Statut SRU</strong></td>
                ${compareCommunes.map(c => {
                    if (c.taux_sru !== null) {
                        return `<td style="text-align: center; font-weight: bold; color: ${c.commune_deficitaire_sru ? '#f87171' : '#4ade80'};">${c.commune_deficitaire_sru ? 'Déficitaire' : 'Conforme'}</td>`;
                    }
                    return `<td style="text-align: center; color: #94a3b8;">Non concerné</td>`;
                }).join('')}
            </tr>
            <tr>
                <td><strong>Déficit SRU (manquants)</strong></td>
                ${compareCommunes.map(c => {
                    if (c.logements_manquants_sru && c.logements_manquants_sru > 0) {
                        return `<td style="text-align: center; color: #f87171; font-weight: bold;">${c.logements_manquants_sru.toLocaleString('fr-FR')}</td>`;
                    }
                    return `<td style="text-align: center; color: #4ade80;">0</td>`;
                }).join('')}
            </tr>
            <tr>
                <td><strong>Tension (demandes/attrib)</strong></td>
                ${compareCommunes.map(c => `<td style="text-align: center;">${c.ratio_demandes_attributions > 0 ? c.ratio_demandes_attributions.toFixed(1) : 'N/A'}</td>`).join('')}
            </tr>
        </tbody>
    `;
    compareTable.innerHTML = tableHTML;
    
    // 3. Render Compare Chart (Bar Chart)
    const ctx = document.getElementById("compareChart").getContext('2d');
    if (compareChart) {
        compareChart.destroy();
    }
    
    const labels = compareCommunes.map(c => c.nom_commune);
    const privateRents = compareCommunes.map(c => c.loyer_prive_m2 || 0);
    const plusRents = compareCommunes.map(c => c.loyer_max_plus || 0);
    const plsRents = compareCommunes.map(c => c.loyer_max_pls || 0);
    
    compareChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Privé',
                    data: privateRents,
                    backgroundColor: '#ec4899',
                    borderRadius: 4
                },
                {
                    label: 'PLUS (HLM)',
                    data: plusRents,
                    backgroundColor: '#6366f1',
                    borderRadius: 4
                },
                {
                    label: 'PLS (Social Sup)',
                    data: plsRents,
                    backgroundColor: '#38bdf8',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { size: 9 }, boxWidth: 10 }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 9 } } },
                y: { 
                    title: { display: true, text: 'Loyer théorique (€/m²)', color: '#94a3b8', font: { size: 9 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }, 
                    ticks: { color: '#94a3b8', font: { size: 9 } } 
                }
            }
        }
    });
}
