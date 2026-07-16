(() => {
const API_BASE = window.VEKIN_API_BASE || "http://localhost:8000";
const dateRangeStorageKey = "vekin-date-range";
const detailCharts = {};
const detailChartPalette = {
  green: "#1b7f5a",
  lightGreen: "#77a95d",
  yellow: "#d8c64b",
  amber: "#d99441",
  red: "#b8542f",
  blue: "#3b6f8f",
  slate: "#5f6f69",
  ink: "#dff7f5",
  muted: "#9fc7c8",
};
const bangkokBounds = [
  [13.494, 100.327],
  [13.955, 100.938],
];

if (typeof window.L === "undefined") {
  renderStaticPreview();
} else {
  bootLeafletPortal();
}

function formatNumber(value) {
  return value === null || value === undefined ? "--" : Number(value).toFixed(3);
}

function formatCompactNumber(value) {
  return value === null || value === undefined ? "--" : Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatSquareKilometers(value) {
  return value === null || value === undefined ? "--" : (Number(value) / 1_000_000).toFixed(2);
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function formatDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(value) {
  if (!value) return "0";
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? new Date(`${value.slice(0, 10)}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "0";
  return date.toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  return {
    startDate: formatDateInputValue(start),
    endDate: formatDateInputValue(end),
  };
}

function readStoredDateRange() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(dateRangeStorageKey) || "null");
    if (parsed?.startDate && parsed?.endDate) return parsed;
  } catch {
    return null;
  }
  return null;
}

function getActiveDateRange() {
  return {
    startDate: document.getElementById("date").value,
    endDate: document.getElementById("end-date").value,
  };
}

function syncDateRangeControls(range = getActiveDateRange()) {
  const rangeStart = document.getElementById("map-range-start");
  const rangeEnd = document.getElementById("map-range-end");
  if (rangeStart) rangeStart.value = range.startDate;
  if (rangeEnd) rangeEnd.value = range.endDate;
}

function setActiveDateRange(range) {
  document.getElementById("date").value = range.startDate;
  document.getElementById("end-date").value = range.endDate;
  syncDateRangeControls(range);
  saveActiveDateRange();
}

function saveActiveDateRange() {
  const range = getActiveDateRange();
  window.localStorage.setItem(dateRangeStorageKey, JSON.stringify(range));
  return range;
}

function appendDateRangeParams(params, range = getActiveDateRange()) {
  if (range.startDate) params.set("start_date", range.startDate);
  if (range.endDate) params.set("end_date", range.endDate);
  return params;
}

function formatOptionalNumber(value, digits = 3) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "0"
    : Number(value).toFixed(digits);
}

function formatOptionalCompact(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "0"
    : formatCompactNumber(value);
}

function formatOptionalSquareKilometers(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "0"
    : formatSquareKilometers(value);
}

function formatOptionalPercent(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "0"
    : `${formatNumber(value)}%`;
}

function formatRiverPresence(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "--";
}

function averageFinite(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function sumFinite(values) {
  return values
    .map(Number)
    .filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0);
}

function renderList(id, rows) {
  const node = document.getElementById(id);
  node.innerHTML = "";
  rows.forEach((row) => {
    const item = document.createElement("li");
    item.textContent = `${row.grid_id}: ${formatNumber(row.average_ndvi)}`;
    node.appendChild(item);
  });
}

function renderTrend(rows) {
  const node = document.getElementById("trend");
  node.innerHTML = "";
  const values = rows.map((row) => Number(row.average_ndvi)).filter(Number.isFinite);
  const max = Math.max(...values, 0.1);
  rows.forEach((row) => {
    const bar = document.createElement("span");
    const value = Number(row.average_ndvi);
    bar.style.height = `${Math.max(8, (value / max) * 70)}px`;
    bar.title = `${row.date}: ${formatNumber(value)}`;
    node.appendChild(bar);
  });
}

function setupMapPanelControls(mapInstance) {
  const mapCard = document.getElementById("map-card");
  const controlStack = document.getElementById("map-control-stack");
  const processForm = document.getElementById("process-form");
  const routeForm = document.getElementById("three-d-route-form");
  const show2dFormButton = document.getElementById("show-2d-gis-form");
  const show3dFormButton = document.getElementById("show-3d-ftf-form");
  const formClose = document.getElementById("close-process-form");
  const fullscreenToggle = document.getElementById("toggle-map-fullscreen");
  if (!mapCard || !controlStack || !processForm || !routeForm || !show2dFormButton || !show3dFormButton || !fullscreenToggle) return;

  const setButtonContent = (button, icon, label) => {
    button.innerHTML = `
      <span class="grid h-4 w-4 place-items-center rounded-sm border border-cyan-100/15 bg-slate-950/45 text-[9px] leading-none text-lime-200 transition group-hover:border-lime-200/35" aria-hidden="true">${icon}</span>
      <span>${label}</span>
    `;
  };

  const refreshMapSize = () => {
    if (mapInstance) {
      window.setTimeout(() => mapInstance.invalidateSize(), 80);
    }
  };

  const setActiveForm = (mode, returnFocus = false) => {
    const isHidden = mode === "hidden";
    const is2d = mode === "2d";
    const is3d = mode === "3d";
    controlStack.classList.toggle("process-form-collapsed", isHidden);
    controlStack.setAttribute("aria-hidden", String(isHidden));
    processForm.classList.toggle("hidden", !is2d);
    routeForm.classList.toggle("hidden", !is3d);
    processForm.setAttribute("aria-hidden", String(!is2d));
    routeForm.setAttribute("aria-hidden", String(!is3d));
    show2dFormButton.classList.toggle("is-active", is2d);
    show3dFormButton.classList.toggle("is-active", is3d);
    show2dFormButton.setAttribute("aria-pressed", String(is2d));
    show3dFormButton.setAttribute("aria-pressed", String(is3d));
    if (isHidden) {
      controlStack.setAttribute("inert", "");
    } else {
      controlStack.removeAttribute("inert");
    }
    if (returnFocus) {
      (is3d ? show3dFormButton : show2dFormButton).focus();
    }
  };

  show2dFormButton.addEventListener("click", () => {
    const isOpen = !processForm.classList.contains("hidden") && !controlStack.classList.contains("process-form-collapsed");
    setActiveForm(isOpen ? "hidden" : "2d", true);
  });

  show3dFormButton.addEventListener("click", () => {
    const isOpen = !routeForm.classList.contains("hidden") && !controlStack.classList.contains("process-form-collapsed");
    setActiveForm(isOpen ? "hidden" : "3d", true);
  });

  formClose?.addEventListener("click", () => setActiveForm("hidden", true));

  fullscreenToggle.addEventListener("click", () => {
    const isExpanded = mapCard.classList.toggle("map-card-expanded");
    setButtonContent(fullscreenToggle, isExpanded ? "x" : "[]", isExpanded ? "Exit" : "Fullscreen");
    fullscreenToggle.setAttribute("aria-expanded", String(isExpanded));
    refreshMapSize();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !controlStack.classList.contains("process-form-collapsed")) {
      setActiveForm("hidden", true);
      return;
    }
    if (event.key !== "Escape" || !mapCard.classList.contains("map-card-expanded")) return;
    mapCard.classList.remove("map-card-expanded");
    setButtonContent(fullscreenToggle, "[]", "Fullscreen");
    fullscreenToggle.setAttribute("aria-expanded", "false");
    refreshMapSize();
  });

  setActiveForm("2d");
}

function setupSelectedGridDetailTabs() {
  const tabs = Array.from(document.querySelectorAll("[data-grid-detail-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-grid-detail-panel]"));
  if (!tabs.length || !panels.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const selected = tab.dataset.gridDetailTab;
      tabs.forEach((candidate) => {
        const isActive = candidate === tab;
        candidate.classList.toggle("selected-grid-tab-active", isActive);
        candidate.setAttribute("aria-selected", String(isActive));
      });
      panels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.dataset.gridDetailPanel !== selected);
      });
      requestAnimationFrame(() => {
        Object.values(detailCharts).forEach((chart) => chart.resize());
      });
    });
  });
}

function renderStaticPreview() {
  const mapNode = document.getElementById("map");
  mapNode.classList.add("static-map");
  mapNode.innerHTML = `
    <div class="static-road road-a"></div>
    <div class="static-road road-b"></div>
    <div class="static-parcel parcel-a"></div>
    <div class="static-parcel parcel-b"></div>
    <div class="static-building building-a"></div>
    <div class="static-building building-b"></div>
    <div class="static-grid">
      ${Array.from({ length: 80 }, (_, index) => `<span style="--i:${index}"></span>`).join("")}
    </div>
    <div class="static-map-label">
      <strong>Bangkok NDVI Grid Preview</strong>
      <span>Leaflet map library is offline; live map controls will appear when the CDN is available.</span>
    </div>
  `;

  document.getElementById("status").textContent =
    "Frontend preview is running. Start the backend to process live Sentinel-2 NDVI.";
  document.getElementById("avg-ndvi").textContent = "0";
  document.getElementById("min-ndvi").textContent = "0";
  document.getElementById("max-ndvi").textContent = "0";
  document.getElementById("change-ndvi").textContent = "0";
  document.getElementById("bbox-label").textContent = "Draw mode needs the live Leaflet map.";
  document.getElementById("apply-bounds-button").addEventListener("click", () => {
    document.getElementById("status").textContent = "Bounds paste needs the live Leaflet map.";
  });
  renderList("lowest", [
    { grid_id: "0", average_ndvi: 0 },
    { grid_id: "0", average_ndvi: 0 },
    { grid_id: "0", average_ndvi: 0 },
  ]);
  renderList("highest", [
    { grid_id: "0", average_ndvi: 0 },
    { grid_id: "0", average_ndvi: 0 },
    { grid_id: "0", average_ndvi: 0 },
  ]);
  renderTrend([
    { date: "0", average_ndvi: 0 },
    { date: "0", average_ndvi: 0 },
    { date: "0", average_ndvi: 0 },
    { date: "0", average_ndvi: 0 },
  ]);
  setupMapPanelControls();
  setupSelectedGridDetailTabs();
}

function bootLeafletPortal() {
const map = L.map("map", { zoomControl: true }).fitBounds(bangkokBounds);
setupMapPanelControls(map);
setupSelectedGridDetailTabs();
map.createPane("contextPane");
map.getPane("contextPane").style.zIndex = 350;
map.createPane("ndviPane");
map.getPane("ndviPane").style.zIndex = 450;
map.createPane("selectionPane");
map.getPane("selectionPane").style.zIndex = 500;

const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 20,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const satellite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 20,
    attribution: "Tiles &copy; Esri",
  },
);

const contextLayerGroups = {
  "DEM / Elevation": L.layerGroup().addTo(map),
  "Land Cover": L.layerGroup().addTo(map),
};
const overlays = {
  "DEM / Elevation": contextLayerGroups["DEM / Elevation"],
  "Land Cover": contextLayerGroups["Land Cover"],
};
const layerControl = L.control.layers({ Streets: streets, Satellite: satellite }, overlays).addTo(map);

let selectedArea = null;
let drawMode = false;
let polygonDrawMode = false;
let firstCorner = null;
let polygonPoints = [];
let previewArea = null;
let previewPolygon = null;
let selectedGridLayer = null;
let changeDetectionLayer = null;
let gridLayerRequestId = 0;
let selectedGridTrendRequestId = 0;
let selectedGridWeatherRequestId = 0;
let currentGridFeatures = [];
let selectedGridTrendRows = [];
let selectedPopulationTrendRows = [];
let selectedLandCoverTrendRows = [];
const drawButton = document.getElementById("draw-box-button");
const drawPolygonButton = document.getElementById("draw-polygon-button");
const draw3dPolygonButton = document.getElementById("draw-3d-polygon-button");
const bboxLabel = document.getElementById("bbox-label");
const view3dTerrainButton = document.getElementById("view-3d-terrain");
const view3dGridButton = document.getElementById("view-3d-grid");
const addSupplyChainStopButton = document.getElementById("add-supply-chain-stop");
const clearSupplyChainButton = document.getElementById("clear-supply-chain");
const viewFarmToForkButton = document.getElementById("view-farm-to-fork");
const supplyChainList = document.getElementById("supply-chain-list");
const supplyChainCount = document.getElementById("supply-chain-count");
const supplyChainNameInput = document.getElementById("supply-chain-name");
const saveSupplyChainButton = document.getElementById("save-supply-chain");
const loadSupplyChainButton = document.getElementById("load-supply-chain");
const exportSupplyChainButton = document.getElementById("export-supply-chain");
const importSupplyChainButton = document.getElementById("import-supply-chain");
const importSupplyChainFileInput = document.getElementById("import-supply-chain-file");
const savedSupplyChainSelect = document.getElementById("saved-supply-chain-routes");
const buildingTypeSelect = document.getElementById("building-type");
const farmDataPanel = document.getElementById("farm-data-panel");
const farmNameInput = document.getElementById("farm-name");
const farmCowCountInput = document.getElementById("farm-cow-count");
const farmHerdTypeInput = document.getElementById("farm-herd-type");
const farmDailyOutputInput = document.getElementById("farm-daily-output");
const farmCo2eInput = document.getElementById("farm-co2e");
let latest3dContext = null;
let supplyChainStops = [];
let savedSupplyChainRouteCache = [];
let loadingSupplyChainRoutes = false;
let selectedSupplyChainStopIndex = null;
const supplyChainStorageKey = "vekin-supply-chain-routes";
const supplyChainBoundsPaddingRatio = 0.45;

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

function formatBounds(bounds) {
  const west = bounds.getWest().toFixed(4);
  const south = bounds.getSouth().toFixed(4);
  const east = bounds.getEast().toFixed(4);
  const north = bounds.getNorth().toFixed(4);
  return `W ${west}, S ${south}, E ${east}, N ${north}`;
}

function updateBboxReadout() {
  bboxLabel.textContent = selectedArea ? formatBounds(selectedArea.getBounds()) : "No area selected";
}

function selectedBuildingType() {
  return buildingTypeSelect?.value || "farm";
}

function numericInputValue(input) {
  const value = Number(input?.value);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeFarmMetrics(metrics = {}) {
  const cowCount = Number(metrics.cowCount);
  const dailyOutputKg = Number(metrics.dailyOutputKg);
  const co2eKgPerDay = Number(metrics.co2eKgPerDay);
  const herdType = ["dairy", "beef", "mixed"].includes(metrics.herdType) ? metrics.herdType : "mixed";
  const normalized = {
    herdType,
  };
  if (Number.isFinite(cowCount) && cowCount >= 0) normalized.cowCount = cowCount;
  if (Number.isFinite(dailyOutputKg) && dailyOutputKg >= 0) normalized.dailyOutputKg = dailyOutputKg;
  if (Number.isFinite(co2eKgPerDay) && co2eKgPerDay >= 0) normalized.co2eKgPerDay = co2eKgPerDay;
  return normalized;
}

function currentFarmMetrics() {
  return normalizeFarmMetrics({
    cowCount: numericInputValue(farmCowCountInput),
    herdType: farmHerdTypeInput?.value || "mixed",
    dailyOutputKg: numericInputValue(farmDailyOutputInput),
    co2eKgPerDay: numericInputValue(farmCo2eInput),
  });
}

function farmMetricsSummary(metrics) {
  if (!metrics) return "";
  const parts = [];
  if (Number.isFinite(Number(metrics.cowCount))) parts.push(`${Number(metrics.cowCount).toLocaleString()} cows`);
  if (metrics.herdType) parts.push(`${metrics.herdType} herd`);
  if (Number.isFinite(Number(metrics.co2eKgPerDay))) parts.push(`${Number(metrics.co2eKgPerDay).toLocaleString()} kg CO2e/day`);
  return parts.join(" · ");
}

function updateFarmDataPanel() {
  if (!farmDataPanel) return;
  farmDataPanel.classList.toggle("hidden", selectedBuildingType() !== "farm");
}

function supplyChainTypeLabel(type) {
  const labels = {
    farm: "Farm",
    "middle-man": "Middle man",
    processor: "Cooperative",
    cooperative: "Cooperative",
    warehouse: "Warehouse",
    retailer: "DPO",
    dpo: "DPO",
    "end-product": "End product destination",
  };
  return labels[type] || "Farm";
}

function routeDisplayName(route) {
  return route?.name || "Farm-to-fork route";
}

function routeOptionValue(route) {
  return `${route.source || "db"}:${route.id}`;
}

function routeFromOptionValue(value) {
  const [source, ...idParts] = String(value || "").split(":");
  return {
    source: source || "db",
    id: idParts.join(":"),
  };
}

function routeFileName(name) {
  const safeName = String(name || "farm-to-fork-route")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${safeName || "farm-to-fork-route"}.json`;
}

function readSavedSupplyChainRoutes() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(supplyChainStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSavedSupplyChainRoutes(routes) {
  window.localStorage.setItem(supplyChainStorageKey, JSON.stringify(routes));
}

function removeLocalSupplyChainRoute(route) {
  if (!route) return;
  const routes = localSupplyChainRoutes()
    .filter((candidate) => (
      candidate.id !== route.id
      && candidate.name.toLowerCase() !== route.name.toLowerCase()
    ));
  writeSavedSupplyChainRoutes(routes);
}

function currentRouteName() {
  return supplyChainNameInput?.value.trim() || `Farm-to-fork route ${new Date().toLocaleDateString()}`;
}

function normalizeSupplyChainStop(stop, index = 0) {
  if (!stop?.geometry || !isValidPolygonGeometry(stop.geometry)) return null;
  const type = stop.type || "farm";
  const normalized = {
    id: stop.clientStopId || stop.client_stop_id || stop.id || `stop-${Date.now()}-${index + 1}`,
    type,
    name: stop.name || supplyChainTypeLabel(type),
    geometry: stop.geometry,
  };
  if (type === "farm") {
    normalized.farmMetrics = normalizeFarmMetrics(stop.farmMetrics);
  }
  return normalized;
}

function normalizeSupplyChainRoute(route) {
  const stops = (route?.stops || [])
    .map((stop, index) => normalizeSupplyChainStop(stop, index))
    .filter(Boolean);
  if (!stops.length) return null;
  return {
    id: route.id || `route-${Date.now()}`,
    source: route.source || "db",
    name: routeDisplayName(route),
    updatedAt: route.updatedAt || route.updated_at || new Date().toISOString(),
    createdAt: route.createdAt || route.created_at,
    metadata: route.metadata || {},
    stops,
  };
}

function localSupplyChainRoutes() {
  return readSavedSupplyChainRoutes()
    .map((route) => normalizeSupplyChainRoute({ ...route, source: "local" }))
    .filter(Boolean);
}

function combinedSupplyChainRoutes() {
  const dbRoutes = savedSupplyChainRouteCache
    .map((route) => normalizeSupplyChainRoute({ ...route, source: "db" }))
    .filter(Boolean);
  const dbNames = new Set(dbRoutes.map((route) => route.name.toLowerCase()));
  const localRoutes = localSupplyChainRoutes()
    .filter((route) => !dbNames.has(route.name.toLowerCase()));
  return [...dbRoutes, ...localRoutes]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function renderSavedSupplyChainSelect(routes) {
  if (!savedSupplyChainSelect) return;
  const selected = savedSupplyChainSelect.value;
  savedSupplyChainSelect.innerHTML = '<option value="">Saved routes</option>';
  routes.forEach((route) => {
    const option = document.createElement("option");
    option.value = routeOptionValue(route);
    option.textContent = `${route.name} (${route.stops.length} stops${route.source === "local" ? ", local" : ""})`;
    savedSupplyChainSelect.appendChild(option);
  });
  if (routes.some((route) => routeOptionValue(route) === selected)) {
    savedSupplyChainSelect.value = selected;
  }
}

async function refreshSavedSupplyChainSelect({ refreshBackend = true } = {}) {
  renderSavedSupplyChainSelect(combinedSupplyChainRoutes());
  if (!refreshBackend || loadingSupplyChainRoutes) return;
  loadingSupplyChainRoutes = true;
  try {
    savedSupplyChainRouteCache = await fetchJson("/api/supply-chain/routes?limit=200");
    renderSavedSupplyChainSelect(combinedSupplyChainRoutes());
  } catch (error) {
    setStatus(`Saved routes are using browser storage because the database API is unavailable: ${error.message}`);
  } finally {
    loadingSupplyChainRoutes = false;
  }
}

function saveLocalSupplyChainRoute(route) {
  const routes = localSupplyChainRoutes();
  const nextRoutes = [
    { ...route, source: "local" },
    ...routes.filter((candidate) => candidate.id !== route.id && candidate.name.toLowerCase() !== route.name.toLowerCase()),
  ].slice(0, 20);
  writeSavedSupplyChainRoutes(nextRoutes);
}

function supplyChainRoutePayload(name) {
  return {
    name,
    stops: supplyChainStops,
    metadata: {
      source: "vekin-gis-frontend",
      localStorageKey: supplyChainStorageKey,
    },
  };
}

function portableSupplyChainRoute(route) {
  const normalized = normalizeSupplyChainRoute(route);
  if (!normalized || normalized.stops.length < 2) return null;
  return {
    schema: "vekin-gis/supply-chain-route",
    version: 1,
    exportedAt: new Date().toISOString(),
    route: {
      name: normalized.name,
      description: normalized.description || null,
      metadata: {
        ...(normalized.metadata || {}),
        exportedFrom: "vekin-gis",
      },
      stops: normalized.stops,
    },
  };
}

function routeFromImportedJson(payload) {
  const route = payload?.route || payload;
  return normalizeSupplyChainRoute({
    ...route,
    source: "import",
    name: route?.name || payload?.name || "Imported farm-to-fork route",
  });
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function selectedSupplyChainRouteForExport() {
  if (supplyChainStops.length >= 2) {
    return {
      id: `route-${Date.now()}`,
      source: "editor",
      name: currentRouteName(),
      updatedAt: new Date().toISOString(),
      stops: supplyChainStops,
    };
  }

  const selection = routeFromOptionValue(savedSupplyChainSelect?.value);
  if (!selection.id) return null;
  if (selection.source === "db") {
    return { ...(await fetchJson(`/api/supply-chain/routes/${selection.id}`)), source: "db" };
  }
  return localSupplyChainRoutes()
    .find((candidate) => candidate.id === selection.id) || null;
}

async function saveSupplyChainRouteToDatabase(name) {
  const selected = routeFromOptionValue(savedSupplyChainSelect?.value);
  const routes = combinedSupplyChainRoutes();
  const selectedRoute = routes.find((route) => (
    route.source === selected.source && route.id === selected.id
  ));
  const existingDbRoute = selectedRoute?.source === "db"
    ? selectedRoute
    : routes.find((route) => route.source === "db" && route.name.toLowerCase() === name.toLowerCase());
  const payload = supplyChainRoutePayload(name);
  if (existingDbRoute) {
    return fetchJson(`/api/supply-chain/routes/${existingDbRoute.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
  return fetchJson("/api/supply-chain/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function hide3dTerrainResult() {
  view3dTerrainButton?.classList.add("hidden");
  view3dTerrainButton?.removeAttribute("data-terrain-url");
}

function hide3dGridResult() {
  view3dGridButton?.classList.add("hidden");
  view3dGridButton?.removeAttribute("data-terrain-url");
}

function contextBoundsToLeafletBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length < 2) return null;
  return L.latLngBounds(bounds);
}

function appendBoundsParams(params, bounds, prefix = "") {
  params.set(`${prefix}west`, bounds.getWest().toFixed(6));
  params.set(`${prefix}south`, bounds.getSouth().toFixed(6));
  params.set(`${prefix}east`, bounds.getEast().toFixed(6));
  params.set(`${prefix}north`, bounds.getNorth().toFixed(6));
}

function appendFootprintParams(params, geometry) {
  if (!geometry) return;
  params.set("footprint", JSON.stringify(geometry));
}

function appendSupplyChainParams(params, stops) {
  if (!Array.isArray(stops) || !stops.length) return;
  params.set("route", JSON.stringify(stops));
}

function build3dTerrainUrl(bounds, options = {}) {
  const params = new URLSearchParams({
    label: options.label || "Processed selected area",
    building_type: options.buildingType || selectedBuildingType(),
  });
  appendBoundsParams(params, bounds);
  appendFootprintParams(params, options.footprint);
  appendSupplyChainParams(params, options.route);
  if (options.overlayBounds) {
    appendBoundsParams(params, options.overlayBounds, "overlay_");
  }
  if (options.startDate) params.set("start_date", options.startDate);
  if (options.endDate) params.set("end_date", options.endDate);
  if (options.captureDate) params.set("capture_date", options.captureDate);
  if (options.landCoverUrl) params.set("land_cover_url", options.landCoverUrl);
  if (options.demUrl) params.set("dem_url", options.demUrl);
  if (options.demTerrainUrl) params.set("dem_terrain_url", options.demTerrainUrl);
  return `/3d-map?${params.toString()}`;
}

function supplyChainBounds(stops) {
  const boundsList = stops
    .map((stop) => polygonToBounds(stop.geometry))
    .filter(Boolean)
    .map((bounds) => L.latLngBounds(bounds));
  if (!boundsList.length) return null;
  const merged = boundsList[0];
  boundsList.slice(1).forEach((bounds) => merged.extend(bounds));
  return merged.pad(supplyChainBoundsPaddingRatio);
}

function buildFarmToForkUrl() {
  const bounds = supplyChainBounds(supplyChainStops);
  if (!bounds) return null;
  return build3dTerrainUrl(bounds, {
    label: supplyChainNameInput?.value.trim() || "Farm to fork route",
    route: supplyChainStops,
    footprint: supplyChainStops[0]?.geometry,
    buildingType: supplyChainStops[0]?.type || "farm",
    startDate: getActiveDateRange().startDate,
    endDate: getActiveDateRange().endDate,
    landCoverUrl: latest3dContext?.land_cover_url,
    demUrl: latest3dContext?.dem_url,
    demTerrainUrl: latest3dContext?.dem_terrain_url,
    overlayBounds: contextBoundsToLeafletBounds(latest3dContext?.bounds),
  });
}

function updateFarmToForkButton() {
  if (!viewFarmToForkButton) return;
  const url = buildFarmToForkUrl();
  if (url && supplyChainStops.length >= 2) {
    viewFarmToForkButton.dataset.terrainUrl = url;
    viewFarmToForkButton.classList.remove("hidden");
  } else {
    viewFarmToForkButton.removeAttribute("data-terrain-url");
    viewFarmToForkButton.classList.add("hidden");
  }
}

function renderSupplyChainStops() {
  if (
    selectedSupplyChainStopIndex !== null
    && (selectedSupplyChainStopIndex < 0 || selectedSupplyChainStopIndex >= supplyChainStops.length)
  ) {
    selectedSupplyChainStopIndex = null;
  }
  if (supplyChainCount) {
    supplyChainCount.textContent = `${supplyChainStops.length} ${supplyChainStops.length === 1 ? "stop" : "stops"}`;
  }
  if (supplyChainList) {
    supplyChainList.innerHTML = "";
    supplyChainStops.forEach((stop, index) => {
      const item = document.createElement("li");
      const isSelected = index === selectedSupplyChainStopIndex;
      item.className = `grid gap-1 rounded border px-2 py-1 ${
        isSelected
          ? "border-lime-200/60 bg-lime-300/10"
          : "border-cyan-200/15 bg-cyan-400/5"
      }`;
      item.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <span>${index + 1}. ${supplyChainTypeLabel(stop.type)}${isSelected ? " - selected" : ""}</span>
          <small>${stop.name}</small>
        </div>
        ${stop.type === "farm" && farmMetricsSummary(stop.farmMetrics) ? `<small>${farmMetricsSummary(stop.farmMetrics)}</small>` : ""}
        <div class="grid grid-cols-5 gap-1">
          <button type="button" data-route-action="select" data-route-index="${index}">Select</button>
          <button type="button" data-route-action="replace-plot" data-route-index="${index}">Plot</button>
          <button type="button" data-route-action="up" data-route-index="${index}">Up</button>
          <button type="button" data-route-action="down" data-route-index="${index}">Down</button>
          <button type="button" data-route-action="remove" data-route-index="${index}">Remove</button>
        </div>
      `;
      supplyChainList.appendChild(item);
    });
  }
  updateFarmToForkButton();
}

function loadSupplyChainRoute(route) {
  const normalized = normalizeSupplyChainRoute(route);
  if (!normalized) {
    setStatus("Saved route could not be loaded.");
    return;
  }
  supplyChainStops = normalized.stops;
  selectedSupplyChainStopIndex = null;
  if (supplyChainNameInput) supplyChainNameInput.value = normalized.name;
  renderSupplyChainStops();
  const bounds = supplyChainBounds(supplyChainStops);
  if (bounds) {
    map.fitBounds(bounds, { padding: [24, 24] });
    show3dTerrainResult(bounds, {
      label: normalized.name,
      route: supplyChainStops,
      footprint: supplyChainStops[0]?.geometry,
      buildingType: supplyChainStops[0]?.type || "farm",
      startDate: getActiveDateRange().startDate,
      endDate: getActiveDateRange().endDate,
      landCoverUrl: latest3dContext?.land_cover_url,
      demUrl: latest3dContext?.dem_url,
      demTerrainUrl: latest3dContext?.dem_terrain_url,
      overlayBounds: contextBoundsToLeafletBounds(latest3dContext?.bounds),
    });
  }
  setStatus(
    normalized.source === "local"
      ? `Loaded local route ${normalized.name}. Click Save to move it into the database.`
      : normalized.source === "import"
        ? `Imported ${normalized.name}. Review it, then click Save to store it.`
      : `Loaded ${normalized.name} from the database.`,
  );
}

function show3dTerrainResult(bounds, options = {}) {
  if (!view3dTerrainButton) return;
  view3dTerrainButton.dataset.terrainUrl = build3dTerrainUrl(bounds, {
    ...options,
    footprint: options.footprint || getSelectedGeometry(),
    buildingType: options.buildingType || selectedBuildingType(),
    route: options.route || supplyChainStops,
  });
  view3dTerrainButton.classList.remove("hidden");
}

function show3dGridResult(feature, bounds) {
  if (!view3dGridButton) return;
  const properties = feature.properties || {};
  const range = getActiveDateRange();
  view3dGridButton.dataset.terrainUrl = build3dTerrainUrl(bounds, {
    label: `Grid ${properties.grid_id || "selected"}`,
    startDate: range.startDate,
    endDate: range.endDate,
    captureDate: properties.capture_date,
    landCoverUrl: latest3dContext?.land_cover_url,
    demUrl: latest3dContext?.dem_url,
    demTerrainUrl: latest3dContext?.dem_terrain_url,
    overlayBounds: contextBoundsToLeafletBounds(latest3dContext?.bounds),
    footprint: feature.geometry,
  });
  view3dGridButton.classList.remove("hidden");
}

function setSelectedBounds(bounds, options = {}) {
  polygonPoints = [];
  if (options.clear3d !== false) {
    hide3dTerrainResult();
    hide3dGridResult();
  }
  if (!selectedArea) {
    selectedArea = L.rectangle(bounds, {
      color: "#1b7f5a",
      weight: 2,
      fillOpacity: 0.05,
      pane: "selectionPane",
    }).addTo(map);
  }
  selectedArea.setBounds(bounds);
  updateBboxReadout();
  if (options.fit) {
    map.fitBounds(bounds, { padding: [24, 24] });
  }
  if (options.refreshWeather !== false) {
    loadSelectedGridWeather(options.weatherLabel || "selected area");
  }
}

function setSelectedPolygon(latlngs, options = {}) {
  if (latlngs.length < 3) return;
  if (options.clear3d !== false) {
    hide3dTerrainResult();
    hide3dGridResult();
  }
  if (selectedArea) {
    map.removeLayer(selectedArea);
  }
  selectedArea = L.polygon(latlngs, {
    color: "#1b7f5a",
    weight: 2,
    fillOpacity: 0.08,
    pane: "selectionPane",
  }).addTo(map);
  updateBboxReadout();
  if (options.fit) {
    map.fitBounds(selectedArea.getBounds(), { padding: [24, 24] });
  }
  if (options.refreshWeather !== false) {
    loadSelectedGridWeather(options.weatherLabel || "selected polygon");
  }
}

function setSelectedPolygonFromGeometry(geometry, options = {}) {
  if (!isValidPolygonGeometry(geometry)) return;
  const latlngs = geometry.coordinates[0]
    .slice(0, -1)
    .map(([longitude, latitude]) => L.latLng(latitude, longitude));
  setSelectedPolygon(latlngs, options);
}

function getSelectedBounds() {
  return selectedArea ? selectedArea.getBounds() : null;
}

function getSelectedGeometry() {
  if (!selectedArea) return null;
  if (selectedArea instanceof L.Rectangle) return boundsToPolygon(selectedArea.getBounds());
  const latlngs = selectedArea.getLatLngs?.()[0] || [];
  if (!Array.isArray(latlngs) || latlngs.length < 3) return boundsToPolygon(selectedArea.getBounds());
  const coordinates = latlngs.map((point) => [point.lng, point.lat]);
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    coordinates.push([...first]);
  }
  return {
    type: "Polygon",
    coordinates: [coordinates],
  };
}

function isValidPolygonGeometry(geometry) {
  const ring = geometry?.type === "Polygon" ? geometry.coordinates?.[0] : null;
  return Array.isArray(ring)
    && ring.length >= 4
    && ring.every((point) => (
      Array.isArray(point)
      && point.length >= 2
      && Number.isFinite(Number(point[0]))
      && Number.isFinite(Number(point[1]))
    ));
}

view3dTerrainButton?.addEventListener("click", () => {
  const url = view3dTerrainButton.dataset.terrainUrl;
  if (!url) {
    setStatus("Process an area first, then open the 3D terrain result.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
});

view3dGridButton?.addEventListener("click", () => {
  const url = view3dGridButton.dataset.terrainUrl;
  if (!url) {
    setStatus("Click a processed grid cell first, then open the selected grid in 3D.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
});

buildingTypeSelect?.addEventListener("change", updateFarmDataPanel);

addSupplyChainStopButton?.addEventListener("click", () => {
  if (polygonDrawMode) {
    if (polygonPoints.length < 3) {
      setStatus("Add at least three polygon corners before adding a route stop.");
      return;
    }
    const latlngs = [...polygonPoints];
    resetDrawMode();
    setSelectedPolygon(latlngs, { refreshWeather: false });
  }
  const geometry = getSelectedGeometry();
  if (!isValidPolygonGeometry(geometry)) {
    setStatus("Draw or select a polygon boundary before adding a route stop.");
    return;
  }
  const type = selectedBuildingType();
  const farmName = farmNameInput?.value.trim();
  const farmMetrics = type === "farm" ? currentFarmMetrics() : null;
  supplyChainStops.push({
    id: `stop-${Date.now()}-${supplyChainStops.length + 1}`,
    type,
    name: type === "farm" && farmName ? farmName : supplyChainTypeLabel(type),
    geometry,
    ...(farmMetrics ? { farmMetrics } : {}),
  });
  renderSupplyChainStops();
  setStatus(`${supplyChainTypeLabel(type)} added to the farm-to-fork route.`);
});

clearSupplyChainButton?.addEventListener("click", () => {
  supplyChainStops = [];
  selectedSupplyChainStopIndex = null;
  renderSupplyChainStops();
  setStatus("Farm-to-fork route cleared.");
});

supplyChainList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-route-action]");
  if (!button) return;
  const index = Number(button.dataset.routeIndex);
  if (!Number.isInteger(index) || index < 0 || index >= supplyChainStops.length) return;
  const action = button.dataset.routeAction;
  if (action === "select") {
    selectedSupplyChainStopIndex = index;
    const bounds = polygonToBounds(supplyChainStops[index].geometry);
    if (bounds) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [24, 24] });
    }
    setSelectedPolygonFromGeometry(supplyChainStops[index].geometry, {
      refreshWeather: false,
      fit: false,
      clear3d: false,
    });
    setStatus(`Selected ${supplyChainStops[index].name}. Draw or select a new polygon, then click Plot on this stop to replace its boundary.`);
  } else if (action === "replace-plot") {
    const geometry = getSelectedGeometry();
    if (!isValidPolygonGeometry(geometry)) {
      setStatus("Draw or select a valid polygon before replacing the plot boundary.");
      return;
    }
    supplyChainStops[index] = {
      ...supplyChainStops[index],
      geometry,
    };
    selectedSupplyChainStopIndex = index;
    renderSupplyChainStops();
    updateFarmToForkButton();
    setStatus(`Replaced plot boundary for ${supplyChainStops[index].name}. Click Save to update the database route.`);
  } else if (action === "remove") {
    supplyChainStops.splice(index, 1);
    if (selectedSupplyChainStopIndex === index) selectedSupplyChainStopIndex = null;
    if (selectedSupplyChainStopIndex !== null && selectedSupplyChainStopIndex > index) {
      selectedSupplyChainStopIndex -= 1;
    }
  } else if (action === "up" && index > 0) {
    [supplyChainStops[index - 1], supplyChainStops[index]] = [supplyChainStops[index], supplyChainStops[index - 1]];
    if (selectedSupplyChainStopIndex === index) selectedSupplyChainStopIndex = index - 1;
    else if (selectedSupplyChainStopIndex === index - 1) selectedSupplyChainStopIndex = index;
  } else if (action === "down" && index < supplyChainStops.length - 1) {
    [supplyChainStops[index], supplyChainStops[index + 1]] = [supplyChainStops[index + 1], supplyChainStops[index]];
    if (selectedSupplyChainStopIndex === index) selectedSupplyChainStopIndex = index + 1;
    else if (selectedSupplyChainStopIndex === index + 1) selectedSupplyChainStopIndex = index;
  }
  renderSupplyChainStops();
});

saveSupplyChainButton?.addEventListener("click", async () => {
  if (supplyChainStops.length < 2) {
    setStatus("Add at least two route stops before saving.");
    return;
  }
  const name = currentRouteName();
  const selectedBeforeSave = routeFromOptionValue(savedSupplyChainSelect?.value);
  const routeBeforeSave = combinedSupplyChainRoutes().find((route) => (
    route.source === selectedBeforeSave.source && route.id === selectedBeforeSave.id
  ));
  const originalButtonText = saveSupplyChainButton.textContent;
  saveSupplyChainButton.disabled = true;
  saveSupplyChainButton.textContent = "Saving...";
  setStatus(routeBeforeSave?.source === "local" ? `Importing ${name} into the database...` : `Saving ${name} to the database...`);
  try {
    const savedRoute = await saveSupplyChainRouteToDatabase(name);
    if (routeBeforeSave?.source === "local") {
      removeLocalSupplyChainRoute(routeBeforeSave);
    }
    savedSupplyChainRouteCache = [
      savedRoute,
      ...savedSupplyChainRouteCache.filter((route) => route.id !== savedRoute.id),
    ];
    if (supplyChainNameInput) supplyChainNameInput.value = name;
    await refreshSavedSupplyChainSelect({ refreshBackend: true });
    if (savedSupplyChainSelect) savedSupplyChainSelect.value = routeOptionValue({ id: savedRoute.id, source: "db" });
    setStatus(`Saved ${name} to the database.`);
  } catch (error) {
    const localRoute = {
      id: `route-${Date.now()}`,
      name,
      updatedAt: new Date().toISOString(),
      stops: supplyChainStops,
    };
    saveLocalSupplyChainRoute(localRoute);
    if (supplyChainNameInput) supplyChainNameInput.value = name;
    await refreshSavedSupplyChainSelect({ refreshBackend: false });
    if (savedSupplyChainSelect) savedSupplyChainSelect.value = routeOptionValue({ ...localRoute, source: "local" });
    setStatus(`Database save failed, so ${name} was saved in this browser: ${error.message}`);
  } finally {
    saveSupplyChainButton.disabled = false;
    saveSupplyChainButton.textContent = originalButtonText || "Save";
  }
});

loadSupplyChainButton?.addEventListener("click", async () => {
  const selection = routeFromOptionValue(savedSupplyChainSelect?.value);
  if (!selection.id) {
    setStatus("Choose a saved route to load.");
    return;
  }
  try {
    if (selection.source === "db") {
      const route = await fetchJson(`/api/supply-chain/routes/${selection.id}`);
      loadSupplyChainRoute({ ...route, source: "db" });
      return;
    }
    const route = localSupplyChainRoutes()
      .find((candidate) => candidate.id === selection.id);
    loadSupplyChainRoute(route);
  } catch (error) {
    setStatus(`Saved route could not be loaded from the database: ${error.message}`);
  }
});

exportSupplyChainButton?.addEventListener("click", async () => {
  try {
    const route = await selectedSupplyChainRouteForExport();
    const payload = portableSupplyChainRoute(route);
    if (!payload) {
      setStatus("Load or build a route with at least two stops before exporting.");
      return;
    }
    downloadJsonFile(routeFileName(payload.route.name), payload);
    setStatus(`Exported ${payload.route.name} as JSON.`);
  } catch (error) {
    setStatus(`Route could not be exported: ${error.message}`);
  }
});

importSupplyChainButton?.addEventListener("click", () => {
  importSupplyChainFileInput?.click();
});

importSupplyChainFileInput?.addEventListener("change", async () => {
  const file = importSupplyChainFileInput.files?.[0];
  importSupplyChainFileInput.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const route = routeFromImportedJson(payload);
    if (!route || route.stops.length < 2) {
      setStatus("Imported JSON must contain a route with at least two valid polygon stops.");
      return;
    }
    loadSupplyChainRoute(route);
  } catch (error) {
    setStatus(`Route JSON could not be imported: ${error.message}`);
  }
});

viewFarmToForkButton?.addEventListener("click", () => {
  const url = viewFarmToForkButton.dataset.terrainUrl || buildFarmToForkUrl();
  if (!url || supplyChainStops.length < 2) {
    setStatus("Add at least two route stops before opening farm-to-fork 3D.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
});

function parseBoundsText(value) {
  const normalized = value.trim();
  const labeledValues = {};
  for (const match of normalized.matchAll(/\b([WSEN])\s*[:=]?\s*(-?\d+(?:\.\d+)?)/gi)) {
    labeledValues[match[1].toUpperCase()] = Number(match[2]);
  }
  const hasAllLabels = ["W", "S", "E", "N"].every((label) => Number.isFinite(labeledValues[label]));
  const values = hasAllLabels
    ? [labeledValues.W, labeledValues.S, labeledValues.E, labeledValues.N]
    : normalized.match(/-?\d+(?:\.\d+)?/g)?.slice(0, 4).map(Number);

  if (!values || values.length !== 4 || values.some((number) => !Number.isFinite(number))) {
    throw new Error("Use W, S, E, N values, for example: W 101.1635, S 13.8941, E 101.4601, N 14.4506");
  }

  const [west, south, east, north] = values;
  if (west >= east || south >= north) {
    throw new Error("Bounds must have W less than E and S less than N.");
  }

  return [
    [south, west],
    [north, east],
  ];
}

function resetDrawMode() {
  drawMode = false;
  polygonDrawMode = false;
  firstCorner = null;
  polygonPoints = [];
  drawButton.classList.remove("is-active");
  drawPolygonButton?.classList.remove("is-active");
  draw3dPolygonButton?.classList.remove("is-active");
  if (drawPolygonButton) drawPolygonButton.textContent = "Draw Polygon";
  if (draw3dPolygonButton) draw3dPolygonButton.textContent = "Draw Polygon";
  if (previewArea) {
    map.removeLayer(previewArea);
    previewArea = null;
  }
  if (previewPolygon) {
    map.removeLayer(previewPolygon);
    previewPolygon = null;
  }
  map.getContainer().style.cursor = "";
}

function startDrawMode() {
  drawMode = true;
  polygonDrawMode = false;
  firstCorner = null;
  polygonPoints = [];
  drawButton.classList.add("is-active");
  drawPolygonButton?.classList.remove("is-active");
  draw3dPolygonButton?.classList.remove("is-active");
  if (drawPolygonButton) drawPolygonButton.textContent = "Draw Polygon";
  if (draw3dPolygonButton) draw3dPolygonButton.textContent = "Draw Polygon";
  map.getContainer().style.cursor = "crosshair";
  setStatus("Draw box mode: click the first corner, then click the opposite corner.");
}

function startPolygonDrawMode() {
  drawMode = false;
  polygonDrawMode = true;
  firstCorner = null;
  polygonPoints = [];
  drawButton.classList.remove("is-active");
  drawPolygonButton?.classList.add("is-active");
  draw3dPolygonButton?.classList.add("is-active");
  if (drawPolygonButton) drawPolygonButton.textContent = "Finish Polygon";
  if (draw3dPolygonButton) draw3dPolygonButton.textContent = "Finish Polygon";
  if (previewArea) {
    map.removeLayer(previewArea);
    previewArea = null;
  }
  if (previewPolygon) {
    map.removeLayer(previewPolygon);
  }
  previewPolygon = L.polygon([], {
    color: "#b8542f",
    dashArray: "6 4",
    weight: 2,
    fillOpacity: 0.08,
    pane: "selectionPane",
  }).addTo(map);
  map.getContainer().style.cursor = "crosshair";
  setStatus("Polygon mode: click boundary corners, then press Finish Polygon after at least three points.");
}

function finishPolygonDrawMode() {
  if (!polygonDrawMode || polygonPoints.length < 3) {
    setStatus("Add at least three polygon corners before finishing.");
    return;
  }
  const latlngs = [...polygonPoints];
  resetDrawMode();
  setSelectedPolygon(latlngs, { weatherLabel: "drawn polygon" });
  setStatus("Polygon boundary selected. Choose the building label, then process or open the 3D terrain.");
}

map.on("click", (event) => {
  if (drawMode) {
    if (!firstCorner) {
      firstCorner = event.latlng;
      if (previewArea) {
        map.removeLayer(previewArea);
      }
      previewArea = L.rectangle([firstCorner, firstCorner], {
        color: "#b8542f",
        dashArray: "6 4",
        weight: 2,
        fillOpacity: 0.08,
      }).addTo(map);
      setStatus("First corner set. Click the opposite corner to finish the bounding box.");
      return;
    }

    const bounds = L.latLngBounds(firstCorner, event.latlng);
    setSelectedBounds(bounds, { weatherLabel: "drawn area" });
    resetDrawMode();
    setStatus("Custom bounding box selected. Choose a date, then process NDVI.");
    return;
  }

  if (polygonDrawMode) {
    polygonPoints.push(event.latlng);
    previewPolygon?.setLatLngs(polygonPoints);
    setStatus(
      polygonPoints.length < 3
        ? `Polygon point ${polygonPoints.length} added. Add ${3 - polygonPoints.length} more.`
        : `${polygonPoints.length} polygon points added. Press Finish Polygon when the boundary is complete.`,
    );
    return;
  }

  const delta = 0.015;
  const bounds = [
    [event.latlng.lat - delta, event.latlng.lng - delta],
    [event.latlng.lat + delta, event.latlng.lng + delta],
  ];
  setSelectedBounds(bounds, { weatherLabel: "selected area" });
});

map.on("mousemove", (event) => {
  if (!drawMode || !firstCorner || !previewArea) return;
  previewArea.setBounds(L.latLngBounds(firstCorner, event.latlng));
});

drawButton.addEventListener("click", () => {
  if (drawMode) {
    resetDrawMode();
    setStatus("Draw box cancelled.");
  } else {
    startDrawMode();
  }
});

drawPolygonButton?.addEventListener("click", () => {
  if (polygonDrawMode) {
    finishPolygonDrawMode();
  } else {
    startPolygonDrawMode();
  }
});

draw3dPolygonButton?.addEventListener("click", () => {
  if (polygonDrawMode) {
    finishPolygonDrawMode();
  } else {
    startPolygonDrawMode();
  }
});

document.getElementById("apply-bounds-button").addEventListener("click", () => {
  const value = document.getElementById("bounds-input").value;
  try {
    resetDrawMode();
    const bounds = parseBoundsText(value);
    setSelectedBounds(bounds, { fit: true, weatherLabel: "custom bounds" });
    setStatus("Custom bounds applied. Press Process NDVI to calculate this area.");
  } catch (error) {
    setStatus(`Bounds error: ${error.message}`);
  }
});

function boundsToPolygon(bounds) {
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  return {
    type: "Polygon",
    coordinates: [[
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ]],
  };
}

function polygonToBounds(geometry) {
  const coordinates = geometry?.coordinates?.flat(2) ?? [];
  const lngs = coordinates.filter((_, index) => index % 2 === 0);
  const lats = coordinates.filter((_, index) => index % 2 === 1);
  if (!lngs.length || !lats.length) return null;
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

function geometryRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates?.[0] || []];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).map((polygon) => polygon?.[0] || []);
  return [];
}

function ringBounds(ring) {
  const points = ring
    .map((point) => [Number(point[0]), Number(point[1])])
    .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
  if (!points.length) return null;
  return points.reduce(
    (bounds, [longitude, latitude]) => ({
      west: Math.min(bounds.west, longitude),
      south: Math.min(bounds.south, latitude),
      east: Math.max(bounds.east, longitude),
      north: Math.max(bounds.north, latitude),
    }),
    { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity },
  );
}

function boundsIntersect(a, b) {
  return a && b
    && a.west <= b.east
    && a.east >= b.west
    && a.south <= b.north
    && a.north >= b.south;
}

function pointInRing(point, ring) {
  const [longitude, latitude] = point;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    const crosses = ((yi > latitude) !== (yj > latitude))
      && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function orientation(a, b, c) {
  return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
}

function onSegment(a, b, c) {
  return Math.min(a[0], c[0]) <= b[0]
    && b[0] <= Math.max(a[0], c[0])
    && Math.min(a[1], c[1]) <= b[1]
    && b[1] <= Math.max(a[1], c[1]);
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (Math.sign(o1) !== Math.sign(o2) && Math.sign(o3) !== Math.sign(o4)) return true;
  return (o1 === 0 && onSegment(a, c, b))
    || (o2 === 0 && onSegment(a, d, b))
    || (o3 === 0 && onSegment(c, a, d))
    || (o4 === 0 && onSegment(c, b, d));
}

function normalizeRing(ring) {
  return ring
    .map((point) => [Number(point[0]), Number(point[1])])
    .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
}

function ringsIntersect(aRing, bRing) {
  const a = normalizeRing(aRing);
  const b = normalizeRing(bRing);
  if (a.length < 3 || b.length < 3) return false;
  if (!boundsIntersect(ringBounds(a), ringBounds(b))) return false;
  if (a.some((point) => pointInRing(point, b)) || b.some((point) => pointInRing(point, a))) return true;
  for (let aIndex = 0; aIndex < a.length - 1; aIndex += 1) {
    for (let bIndex = 0; bIndex < b.length - 1; bIndex += 1) {
      if (segmentsIntersect(a[aIndex], a[aIndex + 1], b[bIndex], b[bIndex + 1])) return true;
    }
  }
  return false;
}

function featureIntersectsArea(feature, areaGeometry) {
  if (!areaGeometry) return true;
  const areaRings = geometryRings(areaGeometry);
  const featureRings = geometryRings(feature.geometry);
  return featureRings.some((featureRing) => areaRings.some((areaRing) => ringsIntersect(featureRing, areaRing)));
}

function ndviColor(value) {
  if (value === null || value === undefined) return "#cbd5cf";
  if (value < 0.15) return "#b8542f";
  if (value < 0.3) return "#d99441";
  if (value < 0.45) return "#d8c64b";
  if (value < 0.6) return "#77a95d";
  return "#1b7f5a";
}

function changeColor(changeClass) {
  if (changeClass === "possible-construction") return "#7f1d1d";
  if (changeClass === "crop-stress-harvest-or-clearing") return "#c2410c";
  if (changeClass === "moderate-vegetation-loss") return "#e76f51";
  if (changeClass === "crop-growth-or-recovery") return "#1b7f5a";
  if (changeClass === "moderate-vegetation-gain") return "#77a95d";
  if (changeClass === "stable") return "#3b6f8f";
  return "#8c9690";
}

function changeLayerStyle(feature) {
  const highlight = ["possible-construction", "crop-stress-harvest-or-clearing", "crop-growth-or-recovery"]
    .includes(feature.properties.change_class);
  return {
    color: "#1a2521",
    weight: highlight ? 2 : 1,
    fillColor: changeColor(feature.properties.change_class),
    fillOpacity: feature.properties.change_class === "insufficient-data" ? 0.18 : 0.82,
  };
}

function formatSignedNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "--";
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(3)}`;
}

function changeClassLabel(changeClass) {
  const labels = {
    "possible-construction": "Possible construction / built-up conversion",
    "crop-stress-harvest-or-clearing": "Crop stress, harvest, or clearing",
    "moderate-vegetation-loss": "Moderate vegetation loss",
    "crop-growth-or-recovery": "Crop growth or recovery",
    "moderate-vegetation-gain": "Moderate vegetation gain",
    stable: "Stable",
    "insufficient-data": "Insufficient data",
  };
  return labels[changeClass] || "Unknown";
}

function formatChangeSummary(summary = {}) {
  const ordered = [
    ["crop-stress-harvest-or-clearing", "crop stress/harvest"],
    ["crop-growth-or-recovery", "crop growth/recovery"],
    ["moderate-vegetation-loss", "moderate loss"],
    ["moderate-vegetation-gain", "moderate gain"],
    ["possible-construction", "possible construction"],
    ["stable", "stable"],
    ["insufficient-data", "insufficient data"],
  ];
  const parts = ordered
    .map(([key, label]) => [Number(summary[key] || 0), label])
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count.toLocaleString()} ${label}`);
  return parts.length ? parts.join(", ") : "no comparable grid cells";
}

function defaultGridStyle(feature) {
  return {
    color: "#315c4b",
    weight: 1,
    fillColor: ndviColor(feature.properties.average_ndvi),
    fillOpacity: feature.properties.average_ndvi === null ? 0.08 : 0.58,
  };
}

function selectedGridStyle(feature) {
  return {
    ...defaultGridStyle(feature),
    color: "#0f573d",
    weight: 3,
    fillOpacity: feature.properties.average_ndvi === null ? 0.16 : 0.72,
  };
}

function renderUrbanContextValues({
  title = "Urban Context",
  populationCount = null,
  builtUpAreaSquareMeters = null,
  greenCoverPercentage = null,
  roadDensityKmPerSquareKm = null,
}) {
  document.getElementById("population-count").textContent =
    formatOptionalCompact(populationCount);
  document.getElementById("built-up-area").textContent =
    formatOptionalSquareKilometers(builtUpAreaSquareMeters);
  document.getElementById("green-cover").textContent =
    greenCoverPercentage !== null && greenCoverPercentage !== undefined ? `${formatNumber(greenCoverPercentage)}%` : "0";
  document.getElementById("road-density").textContent =
    formatOptionalNumber(roadDensityKmPerSquareKm);
}

function renderUrbanContextFromFeatures(features = []) {
  const rows = features
    .map((feature) => feature.properties || {})
    .filter((row) => row.capture_date);
  const populationTotal = rows
    .map((row) => Number(row.population_count))
    .filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0);
  const builtUpTotal = rows
    .map((row) => Number(row.built_up_area_square_meters))
    .filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0);
  const greenAverage = averageFinite(rows.map((row) => row.green_cover_percentage));
  const roadDensityAverage = averageFinite(rows.map((row) => row.road_density_km_per_square_km));

  renderUrbanContextValues({
    title: "Urban Context",
    populationCount: populationTotal > 0 ? populationTotal : null,
    builtUpAreaSquareMeters: builtUpTotal > 0 ? builtUpTotal : null,
    greenCoverPercentage: greenAverage,
    roadDensityKmPerSquareKm: roadDensityAverage,
  });
}

function landCoverLabel(value) {
  const labels = {
    10: "Tree cover",
    20: "Shrubland",
    30: "Grassland",
    40: "Cropland",
    50: "Built-up",
    60: "Bare / sparse",
    70: "Snow / ice",
    80: "Water",
    90: "Wetland",
    95: "Mangroves",
    100: "Moss / lichen",
  };
  return labels[value] || (value === null || value === undefined ? "0" : `Class ${value}`);
}

function formatCoverMix(percentages = {}) {
  const entries = Object.entries(percentages || {})
    .map(([key, value]) => [Number(key), Number(value)])
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  if (!entries.length) return "0";
  return entries.map(([key, value]) => `${landCoverLabel(key)} ${value.toFixed(1)}%`).join(", ");
}

function formatGridDateRange(properties = {}) {
  const range = getActiveDateRange();
  const startDate = range.startDate || properties.capture_date;
  const endDate = range.endDate || properties.capture_date;
  if (!startDate && !endDate) return "0";
  return `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`;
}

function visibleGridRows() {
  return currentGridFeatures
    .map((feature) => feature.properties || {})
    .filter((row) => row.capture_date);
}

function comparisonNote(value, baseline, label = "displayed grid average") {
  const current = Number(value);
  const comparison = Number(baseline);
  if (!Number.isFinite(current) || !Number.isFinite(comparison)) return `No ${label} available`;
  const delta = current - comparison;
  if (Math.abs(delta) < 0.0005) return `In line with ${label}`;
  return `${delta > 0 ? "+" : ""}${formatNumber(delta)} vs ${label}`;
}

function shareNote(value, total, label = "displayed total") {
  const current = Number(value);
  const sum = Number(total);
  if (!Number.isFinite(current) || !Number.isFinite(sum) || sum <= 0) return `No ${label} available`;
  return `${((current / sum) * 100).toFixed(1)}% of ${label}`;
}

function clearMiniChart(id, message = "No chart data") {
  const node = document.getElementById(id);
  if (!node) return;
  node.innerHTML = `<div class="grid h-full place-items-center text-[11px] font-bold text-cyan-100/45">${message}</div>`;
}

function detailChartBaseOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: "index",
    },
    plugins: {
      legend: {
        labels: {
          color: detailChartPalette.ink,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: "#1a2521",
        titleColor: "#ffffff",
        bodyColor: "#ffffff",
        padding: 10,
      },
    },
    scales: {
      x: {
        ticks: { color: detailChartPalette.muted, maxRotation: 0 },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: { color: detailChartPalette.muted },
        grid: { color: "rgba(159, 199, 200, 0.18)" },
      },
    },
    ...extra,
  };
}

function renderDetailChart(id, config) {
  const node = document.getElementById(id);
  if (!node || typeof Chart === "undefined") return;
  if (detailCharts[id]) detailCharts[id].destroy();
  try {
    detailCharts[id] = new Chart(node, config);
  } catch (error) {
    console.error(`Unable to render ${id}`, error);
  }
}

function clearDetailChart(id) {
  if (detailCharts[id]) {
    detailCharts[id].destroy();
    delete detailCharts[id];
  }
}

function renderDetailNdviTrendChart(rows) {
  const points = rows
    .map((row) => ({
      label: row.date,
      value: Number(row.average_ndvi),
    }))
    .filter((row) => Number.isFinite(row.value));

  renderDetailChart("analysis-ndvi-chart", {
    type: "line",
    data: {
      labels: points.map((point) => point.label),
      datasets: [
        {
          label: "Average NDVI",
          data: points.map((point) => point.value),
          borderColor: detailChartPalette.green,
          backgroundColor: "rgba(27, 127, 90, 0.2)",
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.32,
        },
      ],
    },
    options: detailChartBaseOptions(),
  });
}

function renderDetailNdbiTrendChart(rows) {
  const points = rows
    .map((row) => ({
      label: row.date,
      value: Number(row.average_ndbi),
    }))
    .filter((row) => Number.isFinite(row.value));

  renderDetailChart("analysis-ndbi-chart", {
    type: "line",
    data: {
      labels: points.map((point) => point.label),
      datasets: [
        {
          label: "Average NDBI",
          data: points.map((point) => point.value),
          borderColor: "#67e8f9",
          backgroundColor: "rgba(103, 232, 249, 0.2)",
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.32,
        },
      ],
    },
    options: detailChartBaseOptions(),
  });
}

function renderDetailLandCoverChart(percentages = {}, trendRows = selectedLandCoverTrendRows) {
  const yearlyRows = (trendRows || []).filter((row) => row.land_cover_year && row.class_percentages);
  if (yearlyRows.length > 1) {
    const classTotals = {};
    yearlyRows.forEach((row) => {
      Object.entries(row.class_percentages || {}).forEach(([code, percent]) => {
        const value = Number(percent);
        if (Number.isFinite(value)) classTotals[code] = (classTotals[code] || 0) + value;
      });
    });
    const classCodes = Object.entries(classTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([code]) => code);
    const colors = [
      detailChartPalette.green,
      detailChartPalette.lightGreen,
      detailChartPalette.yellow,
      detailChartPalette.amber,
      detailChartPalette.red,
      detailChartPalette.blue,
    ];

    renderDetailChart("analysis-land-cover-chart", {
      type: "bar",
      data: {
        labels: yearlyRows.map((row) => String(row.land_cover_year)),
        datasets: classCodes.map((code, index) => ({
          label: landCoverLabel(Number(code)),
          data: yearlyRows.map((row) => Number(row.class_percentages?.[code]) || 0),
          backgroundColor: colors[index % colors.length],
          borderWidth: 0,
        })),
      },
      options: detailChartBaseOptions({
        plugins: {
          ...detailChartBaseOptions().plugins,
          legend: {
            position: "bottom",
            labels: {
              color: detailChartPalette.ink,
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: detailChartPalette.muted },
            grid: { display: false },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            max: 100,
            ticks: {
              color: detailChartPalette.muted,
              callback: (value) => `${value}%`,
            },
            grid: { color: "rgba(159, 199, 200, 0.18)" },
          },
        },
      }),
    });
    return;
  }

  const entries = Object.entries(percentages || {})
    .map(([code, percent]) => [code, Number(percent)])
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  renderDetailChart("analysis-land-cover-chart", {
    type: "doughnut",
    data: {
      labels: entries.map(([code]) => landCoverLabel(Number(code))),
      datasets: [
        {
          data: entries.map(([, value]) => value),
          backgroundColor: [
            detailChartPalette.green,
            detailChartPalette.lightGreen,
            detailChartPalette.yellow,
            detailChartPalette.amber,
            detailChartPalette.red,
            detailChartPalette.blue,
            detailChartPalette.slate,
          ],
          borderColor: "#031927",
          borderWidth: 2,
        },
      ],
    },
    options: detailChartBaseOptions({
      cutout: "62%",
      scales: {},
      plugins: {
        ...detailChartBaseOptions().plugins,
        legend: {
          position: "bottom",
          labels: {
            color: detailChartPalette.ink,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
          },
        },
      },
    }),
  });
}

function renderDetailPopulationBarChart(rows, selectedValue, baselineValue) {
  const points = (rows || [])
    .map((row) => ({
      label: String(row.population_year),
      value: Number(row.population_count),
    }))
    .filter((row) => row.label && Number.isFinite(row.value));
  const labels = points.length ? points.map((point) => point.label) : ["Selected", "Displayed avg"];
  const values = points.length ? points.map((point) => point.value) : [Number(selectedValue) || 0, Number(baselineValue) || 0];

  renderDetailChart("analysis-population-chart", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Population",
          data: values,
          backgroundColor: points.length ? "rgba(163, 230, 53, 0.76)" : ["rgba(163, 230, 53, 0.82)", "rgba(103, 232, 249, 0.62)"],
          borderColor: points.length ? detailChartPalette.green : [detailChartPalette.green, detailChartPalette.blue],
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: detailChartBaseOptions({
      plugins: {
        ...detailChartBaseOptions().plugins,
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: detailChartPalette.muted },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: detailChartPalette.muted,
            callback: (value) => formatCompactNumber(value),
          },
          grid: { color: "rgba(159, 199, 200, 0.18)" },
        },
      },
    }),
  });
}

function renderDetailGreenCoverLineChart(selectedValue, baselineValue) {
  const selected = Number(selectedValue);
  const baseline = Number(baselineValue);
  const points = [
    Number.isFinite(baseline) ? baseline : null,
    Number.isFinite(selected) ? selected : null,
  ];

  renderDetailChart("analysis-green-chart", {
    type: "line",
    data: {
      labels: ["Displayed avg", "Selected"],
      datasets: [
        {
          label: "Green Cover",
          data: points,
          borderColor: detailChartPalette.green,
          backgroundColor: "rgba(27, 127, 90, 0.2)",
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.32,
        },
      ],
    },
    options: detailChartBaseOptions({
      scales: {
        x: {
          ticks: { color: detailChartPalette.muted, maxRotation: 0 },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: detailChartPalette.muted,
            callback: (value) => `${value}%`,
          },
          grid: { color: "rgba(159, 199, 200, 0.18)" },
        },
      },
    }),
  });
}

function renderMiniLineChart(id, rows, valueKey, color = "#a3e635") {
  const node = document.getElementById(id);
  if (!node) return;
  const points = rows
    .map((row) => ({
      label: row.date || "",
      value: Number(row[valueKey]),
    }))
    .filter((point) => Number.isFinite(point.value));
  if (points.length < 2) {
    clearMiniChart(id, points.length ? "Need another capture date" : "No trend data");
    return;
  }

  const width = 260;
  const height = 76;
  const horizontalPadding = 10;
  const topPadding = 8;
  const chartBottom = 56;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - horizontalPadding * 2) / Math.max(points.length - 1, 1);
  const coordinates = points.map((point, index) => {
    const x = horizontalPadding + index * step;
    const y = chartBottom - ((point.value - min) / span) * (chartBottom - topPadding);
    return { ...point, x, y };
  });
  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const area = `${path} L${coordinates.at(-1).x.toFixed(1)} ${chartBottom} L${horizontalPadding} ${chartBottom} Z`;
  const circles = coordinates
    .map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.3"><title>${point.label}: ${formatNumber(point.value)}</title></circle>`)
    .join("");

  node.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend chart" class="h-full w-full overflow-visible">
      <path d="${area}" fill="${color}" opacity="0.14"></path>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
      <g fill="${color}">${circles}</g>
      <g fill="rgba(207, 250, 254, 0.65)" font-size="8" font-weight="700">
        <text x="${horizontalPadding}" y="72" text-anchor="start">${formatShortDate(points[0].label)}</text>
        <text x="${width - horizontalPadding}" y="72" text-anchor="end">${formatShortDate(points.at(-1).label)}</text>
      </g>
    </svg>
  `;
}

function renderMiniComparisonChart(id, selectedValue, baselineValue, options = {}) {
  const node = document.getElementById(id);
  if (!node) return;
  const selected = Number(selectedValue);
  const baseline = Number(baselineValue);
  if (!Number.isFinite(selected) && !Number.isFinite(baseline)) {
    clearMiniChart(id, "No comparison data");
    return;
  }
  const max = Math.max(Math.abs(selected) || 0, Math.abs(baseline) || 0, 0.1);
  const selectedWidth = Math.max(4, (Math.abs(selected) / max) * 100);
  const baselineWidth = Math.max(4, (Math.abs(baseline) / max) * 100);
  const selectedLabel = options.selectedLabel || "Selected";
  const baselineLabel = options.baselineLabel || "Displayed avg";
  const formatter = options.formatter || formatOptionalNumber;
  node.innerHTML = `
    <div class="grid h-full content-center gap-2 text-[11px] text-cyan-100/70">
      <div class="grid grid-cols-[70px_1fr_auto] items-center gap-2">
        <span>${selectedLabel}</span>
        <span class="h-2 overflow-hidden rounded bg-slate-800">
          <span class="block h-full rounded bg-lime-300" style="width:${selectedWidth}%"></span>
        </span>
        <strong class="text-cyan-50">${formatter(selected)}</strong>
      </div>
      <div class="grid grid-cols-[70px_1fr_auto] items-center gap-2">
        <span>${baselineLabel}</span>
        <span class="h-2 overflow-hidden rounded bg-slate-800">
          <span class="block h-full rounded bg-cyan-300" style="width:${baselineWidth}%"></span>
        </span>
        <strong class="text-cyan-50">${formatter(baseline)}</strong>
      </div>
    </div>
  `;
}

function renderSelectedGridAnalysis(
  properties = {},
  trendRows = selectedGridTrendRows,
  populationTrendRows = selectedPopulationTrendRows,
  landCoverTrendRows = selectedLandCoverTrendRows,
) {
  const rows = visibleGridRows();
  const ndbiAverage = averageFinite(rows.map((row) => row.average_ndbi));
  const builtUpTotal = sumFinite(rows.map((row) => row.built_up_area_square_meters));
  const roadAverage = averageFinite(rows.map((row) => row.road_density_km_per_square_km));
  const populationTotal = sumFinite(rows.map((row) => row.population_count));
  const ndviAverage = averageFinite(rows.map((row) => row.average_ndvi));
  const greenAverage = averageFinite(rows.map((row) => row.green_cover_percentage));
  const dateRange = formatGridDateRange(properties);

  setText("analysis-ndbi", formatOptionalNumber(properties.average_ndbi));
  setText("analysis-ndbi-note", comparisonNote(properties.average_ndbi, ndbiAverage));
  setText("analysis-land-cover", landCoverLabel(properties.dominant_land_cover_class));
  setText(
    "analysis-land-cover-note",
    properties.land_cover_year
      ? `${properties.land_cover_year}: ${formatCoverMix(properties.land_cover_percentages)}`
      : formatCoverMix(properties.land_cover_percentages),
  );
  setText("analysis-built-up", `${formatOptionalSquareKilometers(properties.built_up_area_square_meters)} km2`);
  setText("analysis-built-up-note", shareNote(properties.built_up_area_square_meters, builtUpTotal));
  setText("analysis-road", `${formatOptionalNumber(properties.road_density_km_per_square_km)} km/km2`);
  setText("analysis-road-note", comparisonNote(properties.road_density_km_per_square_km, roadAverage));
  setText("analysis-elev-avg", `${formatOptionalNumber(properties.average_elevation)} m`);
  setText("analysis-elev-avg-note", `DEM context for ${dateRange}`);
  setText("analysis-elev-min", `${formatOptionalNumber(properties.minimum_elevation)} m`);
  setText("analysis-elev-min-note", "Lowest sampled elevation in this grid");
  setText("analysis-elev-max", `${formatOptionalNumber(properties.maximum_elevation)} m`);
  setText("analysis-elev-max-note", "Highest sampled elevation in this grid");
  setText("analysis-population", formatOptionalCompact(properties.population_count));
  setText("analysis-population-note", shareNote(properties.population_count, populationTotal));
  setText("analysis-ndvi", formatOptionalNumber(properties.average_ndvi));
  setText("analysis-ndvi-note", comparisonNote(properties.average_ndvi, ndviAverage));
  setText("analysis-green", formatOptionalPercent(properties.green_cover_percentage));
  setText("analysis-green-note", comparisonNote(properties.green_cover_percentage, greenAverage));
  setText("analysis-river", formatRiverPresence(properties.has_river));
  setText(
    "analysis-river-note",
    properties.river_length_km === null || properties.river_length_km === undefined
      ? "HydroRIVERS data unavailable for this grid"
      : `${formatOptionalNumber(properties.river_length_km)} km intersects this grid`,
  );
  renderDetailNdbiTrendChart(trendRows);
  renderDetailNdviTrendChart(trendRows);
  renderDetailLandCoverChart(properties.land_cover_percentages, landCoverTrendRows);
  renderMiniComparisonChart("analysis-built-up-chart", properties.built_up_area_square_meters, builtUpTotal / Math.max(rows.length, 1), {
    formatter: formatOptionalSquareKilometers,
  });
  renderMiniComparisonChart("analysis-road-chart", properties.road_density_km_per_square_km, roadAverage, {
    formatter: (value) => formatOptionalNumber(value),
  });
  renderDetailPopulationBarChart(populationTrendRows, properties.population_count, populationTotal / Math.max(rows.length, 1));
  renderDetailGreenCoverLineChart(properties.green_cover_percentage, greenAverage);
  renderMiniComparisonChart("analysis-elev-avg-chart", properties.average_elevation, averageFinite(rows.map((row) => row.average_elevation)), {
    formatter: (value) => `${formatOptionalNumber(value)} m`,
  });
  renderMiniComparisonChart("analysis-elev-min-chart", properties.minimum_elevation, averageFinite(rows.map((row) => row.minimum_elevation)), {
    formatter: (value) => `${formatOptionalNumber(value)} m`,
  });
  renderMiniComparisonChart("analysis-elev-max-chart", properties.maximum_elevation, averageFinite(rows.map((row) => row.maximum_elevation)), {
    formatter: (value) => `${formatOptionalNumber(value)} m`,
  });
}

function renderOpenMeteoWeather(weather) {
  if (!weather || weather.error) {
    setText("analysis-weather-temp", "0");
    setText("analysis-weather-temp-note", weather?.error ? "Open-Meteo unavailable" : "Not processed yet");
    setText("analysis-weather-rain", "0");
    setText("analysis-weather-rain-note", weather?.error ? "Open-Meteo unavailable" : "Not processed yet");
    setText("analysis-weather-daily", "0");
    setText("analysis-weather-daily-note", weather?.error ? "Open-Meteo unavailable" : "Not processed yet");
    ["analysis-weather-temp-chart", "analysis-weather-rain-chart", "analysis-weather-daily-chart"].forEach(clearDetailChart);
    return;
  }

  const rows = Array.isArray(weather.daily) ? weather.daily : [];
  const latest = rows.at(-1) || {};
  const latestTemperature = Number(latest.temperature_c);
  const latestRainfall = Number(latest.rainfall_mm);
  const dayLabel = `${weather.days_returned} day${weather.days_returned === 1 ? "" : "s"}`;
  setText("analysis-weather-temp", Number.isFinite(latestTemperature) ? `${latestTemperature.toFixed(1)} C` : "--");
  setText("analysis-weather-temp-note", latest.date ? `Latest daily value: ${latest.date}` : `${dayLabel} from ${weather.source}`);
  setText("analysis-weather-rain", Number.isFinite(latestRainfall) ? `${latestRainfall.toFixed(1)} mm` : "--");
  setText("analysis-weather-rain-note", latest.date ? `Latest daily value: ${latest.date}` : `${weather.start_date} to ${weather.end_date}`);
  setText("analysis-weather-daily", `${rows.length} rows`);
  setText("analysis-weather-daily-note", `${weather.start_date} to ${weather.end_date}`);
  renderOpenMeteoDailyCharts(rows);
}

function renderOpenMeteoDailyCharts(rows) {
  const points = rows
    .map((row) => ({
      label: row.date,
      temperature: Number(row.temperature_c),
      rainfall: Number(row.rainfall_mm),
    }))
    .filter((row) => row.label && (Number.isFinite(row.temperature) || Number.isFinite(row.rainfall)));

  if (!points.length) {
    ["analysis-weather-temp-chart", "analysis-weather-rain-chart", "analysis-weather-daily-chart"].forEach(clearDetailChart);
    return;
  }

  const labels = points.map((point) => point.label);
  const temperatures = points.map((point) => (Number.isFinite(point.temperature) ? point.temperature : null));
  const rainfall = points.map((point) => (Number.isFinite(point.rainfall) ? point.rainfall : null));

  renderDetailChart("analysis-weather-temp-chart", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Daily temperature C",
          data: temperatures,
          borderColor: "#fbbf24",
          backgroundColor: "rgba(251, 191, 36, 0.18)",
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.32,
        },
      ],
    },
    options: detailChartBaseOptions({
      scales: {
        x: {
          ticks: { color: detailChartPalette.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: detailChartPalette.muted,
            callback: (value) => `${value} C`,
          },
          grid: { color: "rgba(159, 199, 200, 0.18)" },
        },
      },
    }),
  });

  renderDetailChart("analysis-weather-rain-chart", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Daily rainfall mm",
          data: rainfall,
          backgroundColor: "rgba(103, 232, 249, 0.62)",
          borderColor: "#67e8f9",
          borderWidth: 1,
          borderRadius: 5,
        },
      ],
    },
    options: detailChartBaseOptions({
      scales: {
        x: {
          ticks: { color: detailChartPalette.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: detailChartPalette.muted,
            callback: (value) => `${value} mm`,
          },
          grid: { color: "rgba(159, 199, 200, 0.18)" },
        },
      },
    }),
  });

  renderDetailChart("analysis-weather-daily-chart", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Rainfall mm",
          data: rainfall,
          yAxisID: "rainfall",
          backgroundColor: "rgba(103, 232, 249, 0.58)",
          borderColor: "#67e8f9",
          borderWidth: 1,
          borderRadius: 5,
        },
        {
          type: "line",
          label: "Temperature C",
          data: temperatures,
          yAxisID: "temperature",
          borderColor: "#fbbf24",
          backgroundColor: "rgba(251, 191, 36, 0.16)",
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.32,
        },
      ],
    },
    options: detailChartBaseOptions({
      scales: {
        x: {
          ticks: { color: detailChartPalette.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
          grid: { display: false },
        },
        rainfall: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          ticks: {
            color: detailChartPalette.muted,
            callback: (value) => `${value} mm`,
          },
          grid: { color: "rgba(159, 199, 200, 0.18)" },
        },
        temperature: {
          type: "linear",
          position: "right",
          ticks: {
            color: detailChartPalette.muted,
            callback: (value) => `${value} C`,
          },
          grid: { drawOnChartArea: false },
        },
      },
    }),
  });
}

function renderGridDataValues(
  properties = {},
  trendRows = selectedGridTrendRows,
  populationTrendRows = selectedPopulationTrendRows,
  landCoverTrendRows = selectedLandCoverTrendRows,
) {
  setText("grid-id", properties.grid_id || "0");
  setText("grid-ndvi", formatOptionalNumber(properties.average_ndvi));
  setText("grid-ndbi", formatOptionalNumber(properties.average_ndbi));
  setText("grid-min", formatOptionalNumber(properties.minimum_ndvi));
  setText("grid-max", formatOptionalNumber(properties.maximum_ndvi));
  setText("grid-date", formatGridDateRange(properties));
  setText("grid-population", formatOptionalCompact(properties.population_count));
  setText("grid-built-up", formatOptionalSquareKilometers(properties.built_up_area_square_meters));
  setText("grid-green", formatOptionalNumber(properties.green_cover_percentage));
  setText("grid-road", formatOptionalNumber(properties.road_density_km_per_square_km));
  setText("grid-river", formatRiverPresence(properties.has_river));
  setText("grid-river-length", formatOptionalNumber(properties.river_length_km));
  setText("grid-elev-avg", formatOptionalNumber(properties.average_elevation));
  setText("grid-elev-min", formatOptionalNumber(properties.minimum_elevation));
  setText("grid-elev-max", formatOptionalNumber(properties.maximum_elevation));
  setText("grid-land-cover", landCoverLabel(properties.dominant_land_cover_class));
  setText(
    "grid-cover-mix",
    properties.land_cover_year
      ? `${properties.land_cover_year}: ${formatCoverMix(properties.land_cover_percentages)}`
      : formatCoverMix(properties.land_cover_percentages),
  );
  renderSelectedGridAnalysis(properties, trendRows, populationTrendRows, landCoverTrendRows);
}

function renderSelectedGridInfo(feature) {
  const p = feature.properties;
  document.getElementById("avg-ndvi").textContent = formatOptionalNumber(p.average_ndvi);
  document.getElementById("min-ndvi").textContent = formatOptionalNumber(p.minimum_ndvi);
  document.getElementById("max-ndvi").textContent = formatOptionalNumber(p.maximum_ndvi);
  document.getElementById("change-label").textContent = "Date";
  document.getElementById("change-ndvi").textContent = p.capture_date
    ? new Date(p.capture_date).toLocaleDateString()
    : "0";
  renderUrbanContextValues({
    title: `Urban Context: ${p.grid_id}`,
    populationCount: p.population_count,
    builtUpAreaSquareMeters: p.built_up_area_square_meters,
    greenCoverPercentage: p.green_cover_percentage,
    roadDensityKmPerSquareKm: p.road_density_km_per_square_km,
  });
  renderGridDataValues(p);
}

async function loadSelectedGridTrend(gridId, properties) {
  const requestId = ++selectedGridTrendRequestId;
  const params = appendDateRangeParams(new URLSearchParams([["grid_id", gridId]]));
  const populationParams = new URLSearchParams([["grid_id", gridId]]);
  const landCoverParams = new URLSearchParams([["grid_id", gridId]]);
  const [dashboard, populationTrend, landCoverTrend] = await Promise.all([
    fetchJson(`/api/dashboard?${params.toString()}`),
    fetchJson(`/api/population/trend?${populationParams.toString()}`),
    fetchJson(`/api/land-cover/trend?${landCoverParams.toString()}`),
  ]);
  if (requestId !== selectedGridTrendRequestId) return;
  selectedGridTrendRows = dashboard.trend || [];
  selectedPopulationTrendRows = populationTrend || [];
  selectedLandCoverTrendRows = landCoverTrend || [];
  renderSelectedGridAnalysis(properties, selectedGridTrendRows, selectedPopulationTrendRows, selectedLandCoverTrendRows);
}

async function loadSelectedGridWeather(gridId) {
  const requestId = ++selectedGridWeatherRequestId;
  const { startDate, endDate } = getActiveDateRange();
  if (!startDate || !endDate) {
    renderOpenMeteoWeather(null);
    return;
  }

  const bounds = getSelectedBounds();
  if (!bounds) {
    renderOpenMeteoWeather(null);
    return;
  }

  setText("analysis-weather-temp", "Loading");
  setText("analysis-weather-temp-note", `Open-Meteo for ${gridId}`);
  setText("analysis-weather-rain", "Loading");
  setText("analysis-weather-rain-note", `${startDate} to ${endDate}`);
  setText("analysis-weather-daily", "Loading");
  setText("analysis-weather-daily-note", "Fetching daily rows");

  try {
    const weather = await fetchOpenMeteoWeather(bounds, startDate, endDate);
    if (requestId !== selectedGridWeatherRequestId) return;
    renderOpenMeteoWeather(weather);
  } catch (error) {
    if (requestId !== selectedGridWeatherRequestId) return;
    renderOpenMeteoWeather({ error });
    setStatus(`Selected ${gridId}, but Open-Meteo weather failed: ${error.message}`);
  }
}

function popupContent(p) {
  return `
    <strong>${p.grid_id}</strong><br>
    Average NDVI: ${formatNumber(p.average_ndvi)}<br>
    Min: ${formatNumber(p.minimum_ndvi)}<br>
    Max: ${formatNumber(p.maximum_ndvi)}<br>
    Population: ${formatCompactNumber(p.population_count)}<br>
    Built-up area: ${formatSquareKilometers(p.built_up_area_square_meters)} sq km<br>
    Green cover: ${formatNumber(p.green_cover_percentage)}%<br>
    Road density: ${formatNumber(p.road_density_km_per_square_km)} km/sq km<br>
    River: ${formatRiverPresence(p.has_river)} (${formatNumber(p.river_length_km)} km)<br>
    Date: ${p.capture_date || "No data"}
  `;
}

function changePopupContent(p) {
  return `
    <strong>${p.grid_id}</strong><br>
    Change: ${changeClassLabel(p.change_class)}<br>
    NDVI: ${formatNumber(p.start_ndvi)} -> ${formatNumber(p.end_ndvi)} (${formatSignedNumber(p.delta_ndvi)})<br>
    NDBI: ${formatNumber(p.start_ndbi)} -> ${formatNumber(p.end_ndbi)} (${formatSignedNumber(p.delta_ndbi)})<br>
    Requested: ${p.start_date || "--"} to ${p.end_date || "--"}<br>
    Compared: ${p.start_capture_date ? new Date(p.start_capture_date).toLocaleDateString() : "--"} to ${p.end_capture_date ? new Date(p.end_capture_date).toLocaleDateString() : "--"}
  `;
}

function selectGridFeature(feature, layer) {
  if (selectedGridLayer && selectedGridLayer !== layer) {
    overlays.Grids.resetStyle(selectedGridLayer);
  }
  selectedGridLayer = layer;
  layer.setStyle(selectedGridStyle(feature));
  layer.bringToFront();
  const gridBounds = layer.getBounds();
  setSelectedBounds(gridBounds, { weatherLabel: feature.properties.grid_id, clear3d: false });
  show3dGridResult(feature, gridBounds);
  renderSelectedGridInfo(feature);
  loadSelectedGridTrend(feature.properties.grid_id, feature.properties).catch((error) => {
    setStatus(`Selected ${feature.properties.grid_id}, but trend charts failed: ${error.message}`);
  });
  setStatus(`Selected ${feature.properties.grid_id}. Map and metrics now show this grid cell.`);
}

async function fetchJson(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message);
  }
  return response.json();
}

async function fetchOpenMeteoWeather(bounds, startDate, endDate) {
  const center = bounds.getCenter();
  return fetchJson("/api/weather/open-meteo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      latitude: center.lat,
      longitude: center.lng,
      start_date: startDate,
      end_date: endDate,
    }),
  });
}

async function loadContextLayers(area) {
  const context = await fetchJson("/api/context/layers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ area }),
  });
  latest3dContext = context;
  addContextLayers(context);
  return context;
}

function removeContextLayers() {
  contextLayerGroups["DEM / Elevation"].clearLayers();
  contextLayerGroups["Land Cover"].clearLayers();
}

function addContextLayers(context, options = {}) {
  const demWasVisible = map.hasLayer(contextLayerGroups["DEM / Elevation"]);
  if (options.replaceExisting) {
    removeContextLayers();
  }

  const demLayer = L.imageOverlay(context.dem_url, context.bounds, {
    opacity: 0.5,
    pane: "contextPane",
  });
  const landCoverLayer = L.imageOverlay(context.land_cover_url, context.bounds, {
    opacity: 0.45,
    pane: "contextPane",
  });

  contextLayerGroups["DEM / Elevation"].addLayer(demLayer);
  contextLayerGroups["Land Cover"].addLayer(landCoverLayer);

  if (demWasVisible) {
    contextLayerGroups["DEM / Elevation"].addTo(map);
  }
  if (options.showLandCover !== false) {
    contextLayerGroups["Land Cover"].addTo(map);
  }
}

async function loadLatestSavedContextLayer() {
  const rows = await fetchJson("/api/context/layers?limit=1");
  if (!rows.length) return;
  const latest = rows[0];
  const bounds = polygonToBounds(latest.bbox);
  if (!bounds) return;
  addContextLayers({
    bounds,
    dem_url: latest.dem_url,
    dem_terrain_url: latest.dem_terrain_url,
    land_cover_url: latest.land_cover_url,
  }, {
    replaceExisting: true,
  });
  latest3dContext = {
    bounds,
    dem_url: latest.dem_url,
    dem_terrain_url: latest.dem_terrain_url,
    land_cover_url: latest.land_cover_url,
  };
}

function getSelectedDate() {
  return document.getElementById("date").value;
}

function toGridCaptureParam(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
}

async function loadGridLayer(captureDate = null, options = {}) {
  const requestId = ++gridLayerRequestId;
  let path = "/api/grids";
  if (captureDate) {
    path = `/api/grids?capture_date=${encodeURIComponent(toGridCaptureParam(captureDate))}`;
  } else {
    const params = appendDateRangeParams(new URLSearchParams());
    path = `/api/grids?${params.toString()}`;
  }
  const grid = await fetchJson(path);
  if (requestId !== gridLayerRequestId) return;
  if (options.areaGeometry) {
    grid.features = (grid.features || []).filter((feature) => featureIntersectsArea(feature, options.areaGeometry));
  }
  currentGridFeatures = grid.features || [];
  selectedGridTrendRows = [];
  selectedPopulationTrendRows = [];
  selectedLandCoverTrendRows = [];
  hide3dGridResult();
  if (overlays.Grids) {
    map.removeLayer(overlays.Grids);
    layerControl.removeLayer(overlays.Grids);
  }
  overlays.Grids = L.geoJSON(grid, {
    pane: "ndviPane",
    style: defaultGridStyle,
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      layer.bindPopup(popupContent(p));
      layer.on("click", (event) => {
        if (event.originalEvent) {
          L.DomEvent.stopPropagation(event.originalEvent);
        }
        selectGridFeature(feature, layer);
        layer.openPopup();
      });
    },
  }).addTo(map);
  selectedGridLayer = null;
  layerControl.addOverlay(overlays.Grids, "Grid / NDVI");
  const representativeFeature =
    grid.features.find((feature) => feature.properties?.average_ndvi !== null && feature.properties?.average_ndvi !== undefined)
    || grid.features[0];
  renderUrbanContextFromFeatures(currentGridFeatures);
  if (representativeFeature) {
    renderGridDataValues(representativeFeature.properties);
    loadSelectedGridTrend(representativeFeature.properties.grid_id, representativeFeature.properties).catch((error) => {
      setStatus(`Grid trend refresh failed: ${error.message}`);
    });
  } else {
    renderGridDataValues();
  }
}

function renderChangeDetectionLayer(change) {
  if (changeDetectionLayer) {
    map.removeLayer(changeDetectionLayer);
    layerControl.removeLayer(changeDetectionLayer);
  }
  changeDetectionLayer = L.geoJSON(change, {
    pane: "ndviPane",
    style: changeLayerStyle,
    onEachFeature: (feature, layer) => {
      layer.bindPopup(changePopupContent(feature.properties));
    },
  }).addTo(map);
  layerControl.addOverlay(changeDetectionLayer, "Change Detection");
}

function formatNumber(value) {
  return value === null || value === undefined ? "--" : Number(value).toFixed(3);
}

function renderList(id, rows) {
  const node = document.getElementById(id);
  node.innerHTML = "";
  rows.forEach((row) => {
    const item = document.createElement("li");
    item.textContent = `${row.grid_id}: ${formatNumber(row.average_ndvi)}`;
    node.appendChild(item);
  });
}

function renderTrend(rows) {
  const node = document.getElementById("trend");
  node.innerHTML = "";
  const values = rows.map((row) => Number(row.average_ndvi)).filter(Number.isFinite);
  const max = Math.max(...values, 0.1);
  rows.forEach((row) => {
    const bar = document.createElement("span");
    const value = Number(row.average_ndvi);
    bar.style.height = `${Math.max(8, (value / max) * 70)}px`;
    bar.title = `${row.date}: ${formatNumber(value)}`;
    node.appendChild(bar);
  });
}

async function loadDashboard() {
  const params = appendDateRangeParams(new URLSearchParams());
  const dashboard = await fetchJson(`/api/dashboard?${params.toString()}`);
  document.getElementById("change-label").textContent = "Daily change";
  document.getElementById("avg-ndvi").textContent = formatOptionalNumber(dashboard.summary.average_ndvi);
  document.getElementById("min-ndvi").textContent = formatOptionalNumber(dashboard.summary.minimum_ndvi);
  document.getElementById("max-ndvi").textContent = formatOptionalNumber(dashboard.summary.maximum_ndvi);
  const trend = dashboard.trend || [];
  const previous = trend.at(-2)?.average_ndvi;
  const current = trend.at(-1)?.average_ndvi;
  const change = Number.isFinite(previous) && Number.isFinite(current) ? current - previous : null;
  document.getElementById("change-ndvi").textContent =
    change === null ? "0" : `${change >= 0 ? "+" : ""}${formatNumber(change)}`;
  renderList("lowest", dashboard.lowest);
  renderList("highest", dashboard.highest);
  renderTrend(trend);
}

async function loadMetadata() {
  const params = appendDateRangeParams(new URLSearchParams([["limit", "50"]]));
  const rows = await fetchJson(`/api/metadata?${params.toString()}`);
  const node = document.getElementById("metadata");
  node.innerHTML = "";
  rows.slice(0, 8).forEach((row) => {
    const item = document.createElement("div");
    item.className = "metadata-item";
    item.innerHTML = `
      <strong>${row.satellite}</strong>
      <span>${new Date(row.capture_date).toLocaleString()}</span>
      <small>Cloud ${formatNumber(row.cloud_cover)}% / ${row.processing_status}</small>
    `;
    node.appendChild(item);
  });
}

function refreshRangeFilteredMapData() {
  return Promise.all([loadGridLayer(), loadDashboard(), loadMetadata()]);
}

async function loadUrbanContext() {
  const context = await fetchJson("/api/context/statistics/latest");
  const rows = context.urban_context_statistics || [];
  const populationTotal = rows
    .map((row) => Number(row.population_count))
    .filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0);
  const builtUpTotal = rows
    .map((row) => Number(row.built_up_area_square_meters))
    .filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0);
  const greenAverage = averageFinite(rows.map((row) => row.green_cover_percentage));
  const roadDensityAverage = averageFinite(rows.map((row) => row.road_density_km_per_square_km));

  renderUrbanContextValues({
    title: "Urban Context",
    populationCount: populationTotal > 0 ? populationTotal : null,
    builtUpAreaSquareMeters: builtUpTotal > 0 ? builtUpTotal : null,
    greenCoverPercentage: greenAverage,
    roadDensityKmPerSquareKm: roadDensityAverage,
  });
}

document.getElementById("process-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const startDate = document.getElementById("date").value;
  const endDate = document.getElementById("end-date").value;
  const maxCloud = Number(document.getElementById("cloud").value || 40);
  if (!startDate || !endDate) return;
  if (startDate > endDate) {
    setStatus("Processing failed: start date must be before or equal to end date.");
    return;
  }
  saveActiveDateRange();
  const selectedBounds = getSelectedBounds();
  if (!selectedBounds) {
    setStatus("Choose an area first by clicking the map, drawing a box, searching, or pasting bounds.");
    return;
  }

  if (polygonDrawMode) {
    if (polygonPoints.length < 3) {
      setStatus("Add at least three polygon corners before processing.");
      return;
    }
    const latlngs = [...polygonPoints];
    resetDrawMode();
    setSelectedPolygon(latlngs, { refreshWeather: false });
  } else {
    resetDrawMode();
  }
  const isRange = startDate !== endDate;
  const selectedGeometry = getSelectedGeometry() || boundsToPolygon(selectedBounds);
  if (!isValidPolygonGeometry(selectedGeometry)) {
    setStatus("Processing failed: selected boundary must be a polygon with at least three corners.");
    return;
  }
  setStatus(isRange ? "Querying Sentinel-2 scenes across the date range..." : "Querying Sentinel-2 scenes for the selected date...");
  try {
    const payload = {
      area: selectedGeometry,
      max_cloud_cover: maxCloud,
    };
    const result = await fetchJson("/api/ndvi/process-range", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, start_date: startDate, end_date: endDate }),
    });
    setStatus("Processing CHIRPS Daily rainfall for the selected area...");
    const rainfall = await fetchJson("/api/rainfall/process-range", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, start_date: startDate, end_date: endDate }),
    }).catch((error) => ({ error }));
    setStatus("Fetching Open-Meteo temperature and rainfall for the selected area...");
    const openMeteo = await fetchOpenMeteoWeather(selectedBounds, startDate, endDate)
      .catch((error) => ({ error }));
    renderOpenMeteoWeather(openMeteo);
    setStatus("Loading DEM and land-cover context for the selected area...");
    let context = null;
    const contextSucceeded = await loadContextLayers(payload.area)
      .then((result) => {
        context = result;
        return true;
      })
      .catch(() => false);
    const displayCaptureDate = result.results.at(-1)?.capture_date;
    await Promise.all([loadGridLayer(displayCaptureDate, { areaGeometry: payload.area }), loadDashboard(), loadMetadata()]);
    const contextFailed = !contextSucceeded;
    const suffix = contextFailed ? " DEM/land-cover context was not available for this area." : "";
    const completion = isRange
      ? `Complete. Processed ${result.images_processed} scenes and ${result.grids_processed} grid/date rows.`
      : `Complete. Processed ${result.grids_processed} grid cells for ${new Date(displayCaptureDate).toLocaleDateString()}.`;
    const rainfallStatus = rainfall.error
      ? ` CHIRPS rainfall skipped: ${rainfall.error.message}`
      : ` CHIRPS rainfall: ${rainfall.days_processed} days across ${rainfall.grid_rows_processed} grid/date rows.`;
    const openMeteoStatus = openMeteo.error
      ? ` Open-Meteo skipped: ${openMeteo.error.message}`
      : ` Open-Meteo: ${openMeteo.days_returned} daily weather rows loaded.`;
    show3dTerrainResult(selectedBounds, {
      startDate,
      endDate,
      captureDate: displayCaptureDate,
      landCoverUrl: context?.land_cover_url,
      demUrl: context?.dem_url,
      demTerrainUrl: context?.dem_terrain_url,
      footprint: payload.area,
      buildingType: selectedBuildingType(),
      route: supplyChainStops,
      label: isRange ? "Processed date range" : `Processed ${displayCaptureDate || startDate}`,
    });
    setStatus(`${completion}${rainfallStatus}${openMeteoStatus}${suffix}`);
    map.fitBounds(selectedBounds, { padding: [24, 24] });
  } catch (error) {
    setStatus(`Processing failed: ${error.message}`);
  }
});

document.getElementById("change-detection-button")?.addEventListener("click", async () => {
  const startDate = document.getElementById("date").value;
  const endDate = document.getElementById("end-date").value;
  if (!startDate || !endDate) return;
  if (startDate >= endDate) {
    setStatus("Change detection needs a before date earlier than the after date.");
    return;
  }
  saveActiveDateRange();
  const selectedBounds = getSelectedBounds();
  if (!selectedBounds) {
    setStatus("Choose an area first by clicking the map, drawing a box, searching, or pasting bounds.");
    return;
  }

  resetDrawMode();
  setStatus("Loading NDVI/NDBI change detection layer...");
  try {
    const change = await fetchJson("/api/change-detection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        area: boundsToPolygon(selectedBounds),
        start_date: startDate,
        end_date: endDate,
      }),
    });
    renderChangeDetectionLayer(change);
    setStatus(`Change layer loaded: ${formatChangeSummary(change.summary)}.`);
  } catch (error) {
    setStatus(`Change detection failed: ${error.message}`);
  }
});

document.getElementById("search-button").addEventListener("click", async () => {
  const query = document.getElementById("location").value.trim();
  if (!query) return;

  resetDrawMode();
  setStatus("Searching location...");
  try {
    const searchLocation = async (value) => {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "th");
      url.searchParams.set("q", value);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Location search service unavailable.");
      return response.json();
    };

    let results = await searchLocation(`${query}, Thailand`);
    if (!results.length) {
      results = await searchLocation(query);
    }
    if (!results.length) throw new Error("No matching location found.");
    const result = results[0];
    const lat = Number(result.lat);
    const lon = Number(result.lon);
    const bbox = result.boundingbox?.map(Number);

    if (bbox?.length === 4 && bbox.every(Number.isFinite)) {
      const [south, north, west, east] = bbox;
      setSelectedBounds([[south, west], [north, east]], { fit: true, weatherLabel: "search result" });
    } else {
      setSelectedBounds([
        [lat - 0.012, lon - 0.012],
        [lat + 0.012, lon + 0.012],
      ], { fit: true, weatherLabel: "search result" });
    }
    setStatus(`Location selected: ${result.display_name || query}`);
  } catch (error) {
    setStatus(`Search failed: ${error.message}`);
  }
});

const initialDateRange = readStoredDateRange() || getDefaultDateRange();
setActiveDateRange(initialDateRange);
updateBboxReadout();
refreshSavedSupplyChainSelect();
renderSupplyChainStops();
updateFarmDataPanel();
document.getElementById("apply-map-date-range").addEventListener("click", () => {
  const range = {
    startDate: document.getElementById("map-range-start").value,
    endDate: document.getElementById("map-range-end").value,
  };
  if (!range.startDate || !range.endDate) {
    setStatus("Choose both start and end dates.");
    return;
  }
  if (range.startDate > range.endDate) {
    setStatus("Date range failed: start date must be before or equal to end date.");
    return;
  }
  setActiveDateRange(range);
  loadSelectedGridWeather("selected area").catch((error) => {
    setStatus(`Date range weather refresh failed: ${error.message}`);
  });
  setStatus("Applying date range to map and dashboard data...");
  refreshRangeFilteredMapData()
    .then(() => setStatus(`Showing processed grid data from ${range.startDate} to ${range.endDate}.`))
    .catch((error) => {
      setStatus(`Date range refresh failed: ${error.message}`);
    });
});
document.getElementById("date").addEventListener("change", () => {
  syncDateRangeControls();
  saveActiveDateRange();
  loadSelectedGridWeather("selected area").catch((error) => {
    setStatus(`Date range weather refresh failed: ${error.message}`);
  });
  refreshRangeFilteredMapData().catch((error) => {
    setStatus(`Date range refresh failed: ${error.message}`);
  });
});
document.getElementById("end-date").addEventListener("change", () => {
  syncDateRangeControls();
  saveActiveDateRange();
  loadSelectedGridWeather("selected area").catch((error) => {
    setStatus(`Date range weather refresh failed: ${error.message}`);
  });
  refreshRangeFilteredMapData().catch((error) => {
    setStatus(`Date range refresh failed: ${error.message}`);
  });
});
Promise.all([loadLatestSavedContextLayer(), loadGridLayer(), loadDashboard(), loadMetadata()]).catch((error) => {
  document.getElementById("status").textContent = `Backend unavailable: ${error.message}`;
});
}
})();
