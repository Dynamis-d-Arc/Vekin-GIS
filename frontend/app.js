const API_BASE = "http://localhost:8000";
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

function averageFinite(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
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

function renderStaticPreview() {
  const mapNode = document.getElementById("map");
  mapNode.className = "static-map";
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
  document.getElementById("avg-ndvi").textContent = "0.421";
  document.getElementById("min-ndvi").textContent = "0.118";
  document.getElementById("max-ndvi").textContent = "0.714";
  document.getElementById("change-ndvi").textContent = "+0.024";
  document.getElementById("bbox-label").textContent = "Draw mode needs the live Leaflet map.";
  document.getElementById("apply-bounds-button").addEventListener("click", () => {
    document.getElementById("status").textContent = "Bounds paste needs the live Leaflet map.";
  });
  renderList("lowest", [
    { grid_id: "BKK-00017", average_ndvi: 0.118 },
    { grid_id: "BKK-00042", average_ndvi: 0.147 },
    { grid_id: "BKK-00063", average_ndvi: 0.164 },
  ]);
  renderList("highest", [
    { grid_id: "BKK-00009", average_ndvi: 0.714 },
    { grid_id: "BKK-00031", average_ndvi: 0.688 },
    { grid_id: "BKK-00058", average_ndvi: 0.651 },
  ]);
  renderTrend([
    { date: "2026-06-01", average_ndvi: 0.35 },
    { date: "2026-06-11", average_ndvi: 0.39 },
    { date: "2026-06-21", average_ndvi: 0.43 },
    { date: "2026-07-01", average_ndvi: 0.42 },
  ]);
}

function bootLeafletPortal() {
const map = L.map("map", { zoomControl: true }).fitBounds(bangkokBounds);
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

const overlays = {};
const layerControl = L.control.layers({ Streets: streets, Satellite: satellite }, overlays).addTo(map);
const contextLayerGroups = {
  "DEM / Elevation": L.layerGroup(),
  "Land Cover": L.layerGroup().addTo(map),
};
overlays["DEM / Elevation"] = contextLayerGroups["DEM / Elevation"];
overlays["Land Cover"] = contextLayerGroups["Land Cover"];
layerControl.addOverlay(contextLayerGroups["DEM / Elevation"], "DEM / Elevation");
layerControl.addOverlay(contextLayerGroups["Land Cover"], "Land Cover");

let selectedArea = L.rectangle(bangkokBounds, {
  color: "#1b7f5a",
  weight: 2,
  fillOpacity: 0.05,
  pane: "selectionPane",
}).addTo(map);
let drawMode = false;
let firstCorner = null;
let previewArea = null;
let selectedGridLayer = null;
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
  bboxLabel.textContent = formatBounds(selectedArea.getBounds());
}

function setSelectedBounds(bounds, options = {}) {
  selectedArea.setBounds(bounds);
  updateBboxReadout();
  if (options.fit) {
    map.fitBounds(bounds, { padding: [24, 24] });
  }
}

function parseBoundsText(value) {
  const normalized = value.trim();
  const labeledMatch = normalized.match(
    /W\s*(-?\d+(?:\.\d+)?).*?S\s*(-?\d+(?:\.\d+)?).*?E\s*(-?\d+(?:\.\d+)?).*?N\s*(-?\d+(?:\.\d+)?)/i,
  );
  const values = labeledMatch
    ? labeledMatch.slice(1).map(Number)
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

  const delta = 0.035;
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
  document.getElementById("urban-context-title").textContent = title;
  document.getElementById("population-count").textContent =
    populationCount !== null && populationCount !== undefined ? formatCompactNumber(populationCount) : "--";
  document.getElementById("built-up-area").textContent =
    builtUpAreaSquareMeters !== null && builtUpAreaSquareMeters !== undefined ? formatSquareKilometers(builtUpAreaSquareMeters) : "--";
  document.getElementById("green-cover").textContent =
    greenCoverPercentage !== null && greenCoverPercentage !== undefined ? `${formatNumber(greenCoverPercentage)}%` : "--";
  document.getElementById("road-density").textContent =
    roadDensityKmPerSquareKm !== null && roadDensityKmPerSquareKm !== undefined ? formatNumber(roadDensityKmPerSquareKm) : "--";
}

function renderSelectedGridInfo(feature) {
  const p = feature.properties;
  document.getElementById("avg-ndvi").textContent = formatNumber(p.average_ndvi);
  document.getElementById("min-ndvi").textContent = formatNumber(p.minimum_ndvi);
  document.getElementById("max-ndvi").textContent = formatNumber(p.maximum_ndvi);
  document.getElementById("change-label").textContent = "Date";
  document.getElementById("change-ndvi").textContent = p.capture_date
    ? new Date(p.capture_date).toLocaleDateString()
    : "--";
  renderUrbanContextValues({
    title: `Urban Context: ${p.grid_id}`,
    populationCount: p.population_count,
    builtUpAreaSquareMeters: p.built_up_area_square_meters,
    greenCoverPercentage: p.green_cover_percentage,
    roadDensityKmPerSquareKm: p.road_density_km_per_square_km,
  });
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
    Date: ${p.capture_date || "No data"}
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
  const path = captureDate ? `/api/grids?capture_date=${encodeURIComponent(toGridCaptureParam(captureDate))}` : "/api/grids";
  const grid = await fetchJson(path);
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
  const dashboard = await fetchJson("/api/dashboard");
  document.getElementById("change-label").textContent = "Daily change";
  document.getElementById("avg-ndvi").textContent = formatNumber(dashboard.summary.average_ndvi);
  document.getElementById("min-ndvi").textContent = formatNumber(dashboard.summary.minimum_ndvi);
  document.getElementById("max-ndvi").textContent = formatNumber(dashboard.summary.maximum_ndvi);
  const trend = dashboard.trend || [];
  const previous = trend.at(-2)?.average_ndvi;
  const current = trend.at(-1)?.average_ndvi;
  const change = Number.isFinite(previous) && Number.isFinite(current) ? current - previous : null;
  document.getElementById("change-ndvi").textContent =
    change === null ? "--" : `${change >= 0 ? "+" : ""}${formatNumber(change)}`;
  renderList("lowest", dashboard.lowest);
  renderList("highest", dashboard.highest);
  renderTrend(trend);
}

async function loadMetadata() {
  const rows = await fetchJson("/api/metadata");
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

  resetDrawMode();
  const isRange = startDate !== endDate;
  setStatus(isRange ? "Querying Sentinel-2 scenes across the date range..." : "Querying Sentinel-2 scenes for the selected date...");
  try {
    const payload = {
      area: boundsToPolygon(selectedArea.getBounds()),
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
    await Promise.all([loadGridLayer(displayCaptureDate), loadDashboard(), loadMetadata(), loadUrbanContext()]);
    const contextFailed = !contextSucceeded;
    const suffix = contextFailed ? " DEM/land-cover context was not available for this area." : "";
    const completion = isRange
      ? `Complete. Processed ${result.images_processed} scenes and ${result.grids_processed} grid/date rows.`
      : `Complete. Processed ${result.grids_processed} grid cells for ${new Date(displayCaptureDate).toLocaleDateString()}.`;
    const rainfallStatus = rainfall.error
      ? ` CHIRPS rainfall skipped: ${rainfall.error.message}`
      : ` CHIRPS rainfall days: ${rainfall.days_processed}.`;
    setStatus(`${completion}${rainfallStatus}${suffix}`);
    map.fitBounds(selectedArea.getBounds(), { padding: [24, 24] });
  } catch (error) {
    setStatus(`Processing failed: ${error.message}`);
  }
});

document.getElementById("search-button").addEventListener("click", async () => {
  const query = document.getElementById("location").value.trim();
  if (!query) return;

  resetDrawMode();
  setStatus("Searching location...");
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("q", `${query}, Bangkok, Thailand`);
    const response = await fetch(url);
    const results = await response.json();
    if (!results.length) throw new Error("No matching location found.");
    const lat = Number(results[0].lat);
    const lon = Number(results[0].lon);
    map.setView([lat, lon], 14);
    setSelectedBounds([
      [lat - 0.025, lon - 0.025],
      [lat + 0.025, lon + 0.025],
    ]);
    setStatus("Location selected.");
  } catch (error) {
    setStatus(`Search failed: ${error.message}`);
  }
});

const defaultDate = new Date();
defaultDate.setDate(defaultDate.getDate() - 30);
document.getElementById("date").valueAsDate = defaultDate;
document.getElementById("end-date").valueAsDate = defaultDate;
updateBboxReadout();
document.getElementById("date").addEventListener("change", () => {
  loadGridLayer(getSelectedDate()).catch((error) => {
    setStatus(`Grid refresh failed: ${error.message}`);
  });
});
document.getElementById("end-date").addEventListener("change", () => {
  loadGridLayer(document.getElementById("end-date").value).catch((error) => {
    setStatus(`Grid refresh failed: ${error.message}`);
  });
});
Promise.all([loadLatestSavedContextLayer(), loadGridLayer(), loadDashboard(), loadMetadata(), loadUrbanContext()]).catch((error) => {
  document.getElementById("status").textContent = `Backend unavailable: ${error.message}`;
});
}
