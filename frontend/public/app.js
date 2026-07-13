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
  const processForm = document.getElementById("process-form");
  const formToggle = document.getElementById("toggle-process-form");
  const formClose = document.getElementById("close-process-form");
  const fullscreenToggle = document.getElementById("toggle-map-fullscreen");
  if (!mapCard || !processForm || !formToggle || !fullscreenToggle) return;

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

  const setFormCollapsed = (isCollapsed, returnFocus = false) => {
    processForm.classList.toggle("process-form-collapsed", isCollapsed);
    processForm.setAttribute("aria-hidden", String(isCollapsed));
    if (isCollapsed) {
      processForm.setAttribute("inert", "");
    } else {
      processForm.removeAttribute("inert");
    }
    setButtonContent(formToggle, isCollapsed ? "+" : "-", isCollapsed ? "Show form" : "Hide form");
    formToggle.setAttribute("aria-expanded", String(!isCollapsed));
    if (returnFocus) formToggle.focus();
  };

  formToggle.addEventListener("click", () => {
    setFormCollapsed(!processForm.classList.contains("process-form-collapsed"));
  });

  formClose?.addEventListener("click", () => setFormCollapsed(true, true));

  fullscreenToggle.addEventListener("click", () => {
    const isExpanded = mapCard.classList.toggle("map-card-expanded");
    setButtonContent(fullscreenToggle, isExpanded ? "x" : "[]", isExpanded ? "Exit" : "Fullscreen");
    fullscreenToggle.setAttribute("aria-expanded", String(isExpanded));
    refreshMapSize();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !processForm.classList.contains("process-form-collapsed")) {
      setFormCollapsed(true, true);
      return;
    }
    if (event.key !== "Escape" || !mapCard.classList.contains("map-card-expanded")) return;
    mapCard.classList.remove("map-card-expanded");
    setButtonContent(fullscreenToggle, "[]", "Fullscreen");
    fullscreenToggle.setAttribute("aria-expanded", "false");
    refreshMapSize();
  });
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
let firstCorner = null;
let previewArea = null;
let selectedGridLayer = null;
let changeDetectionLayer = null;
let gridLayerRequestId = 0;
let selectedGridTrendRequestId = 0;
let currentGridFeatures = [];
let selectedGridTrendRows = [];
let selectedPopulationTrendRows = [];
let selectedLandCoverTrendRows = [];
const drawButton = document.getElementById("draw-box-button");
const bboxLabel = document.getElementById("bbox-label");

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

function setSelectedBounds(bounds, options = {}) {
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
}

function getSelectedBounds() {
  return selectedArea ? selectedArea.getBounds() : null;
}

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
  firstCorner = null;
  drawButton.classList.remove("is-active");
  if (previewArea) {
    map.removeLayer(previewArea);
    previewArea = null;
  }
  map.getContainer().style.cursor = "";
}

function startDrawMode() {
  drawMode = true;
  firstCorner = null;
  drawButton.classList.add("is-active");
  map.getContainer().style.cursor = "crosshair";
  setStatus("Draw box mode: click the first corner, then click the opposite corner.");
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
    setSelectedBounds(bounds);
    resetDrawMode();
    setStatus("Custom bounding box selected. Choose a date, then process NDVI.");
    return;
  }

  const delta = 0.015;
  const bounds = [
    [event.latlng.lat - delta, event.latlng.lng - delta],
    [event.latlng.lat + delta, event.latlng.lng + delta],
  ];
  setSelectedBounds(bounds);
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

document.getElementById("apply-bounds-button").addEventListener("click", () => {
  const value = document.getElementById("bounds-input").value;
  try {
    resetDrawMode();
    const bounds = parseBoundsText(value);
    setSelectedBounds(bounds, { fit: true });
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
  setSelectedBounds(layer.getBounds());
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

async function loadContextLayers(area) {
  const context = await fetchJson("/api/context/layers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ area }),
  });
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
    land_cover_url: latest.land_cover_url,
  }, {
    replaceExisting: true,
  });
}

function getSelectedDate() {
  return document.getElementById("date").value;
}

function toGridCaptureParam(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
}

async function loadGridLayer(captureDate = null) {
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
  currentGridFeatures = grid.features || [];
  selectedGridTrendRows = [];
  selectedPopulationTrendRows = [];
  selectedLandCoverTrendRows = [];
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

  resetDrawMode();
  const isRange = startDate !== endDate;
  setStatus(isRange ? "Querying Sentinel-2 scenes across the date range..." : "Querying Sentinel-2 scenes for the selected date...");
  try {
    const payload = {
      area: boundsToPolygon(selectedBounds),
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
    setStatus("Loading DEM and land-cover context for the selected area...");
    const contextSucceeded = await loadContextLayers(payload.area)
      .then(() => true)
      .catch(() => false);
    const displayCaptureDate = result.results.at(-1)?.capture_date;
    await Promise.all([loadGridLayer(displayCaptureDate), loadDashboard(), loadMetadata()]);
    const contextFailed = !contextSucceeded;
    const suffix = contextFailed ? " DEM/land-cover context was not available for this area." : "";
    const completion = isRange
      ? `Complete. Processed ${result.images_processed} scenes and ${result.grids_processed} grid/date rows.`
      : `Complete. Processed ${result.grids_processed} grid cells for ${new Date(displayCaptureDate).toLocaleDateString()}.`;
    const rainfallStatus = rainfall.error
      ? ` CHIRPS rainfall skipped: ${rainfall.error.message}`
      : ` CHIRPS rainfall: ${rainfall.days_processed} days across ${rainfall.grid_rows_processed} grid/date rows.`;
    setStatus(`${completion}${rainfallStatus}${suffix}`);
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
      setSelectedBounds([[south, west], [north, east]], { fit: true });
    } else {
      setSelectedBounds([
        [lat - 0.012, lon - 0.012],
        [lat + 0.012, lon + 0.012],
      ], { fit: true });
    }
    setStatus(`Location selected: ${result.display_name || query}`);
  } catch (error) {
    setStatus(`Search failed: ${error.message}`);
  }
});

const initialDateRange = readStoredDateRange() || getDefaultDateRange();
setActiveDateRange(initialDateRange);
updateBboxReadout();
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
  refreshRangeFilteredMapData().catch((error) => {
    setStatus(`Date range refresh failed: ${error.message}`);
  });
});
document.getElementById("end-date").addEventListener("change", () => {
  syncDateRangeControls();
  saveActiveDateRange();
  refreshRangeFilteredMapData().catch((error) => {
    setStatus(`Date range refresh failed: ${error.message}`);
  });
});
Promise.all([loadLatestSavedContextLayer(), loadGridLayer(), loadDashboard(), loadMetadata()]).catch((error) => {
  document.getElementById("status").textContent = `Backend unavailable: ${error.message}`;
});
}
