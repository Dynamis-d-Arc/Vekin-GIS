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
const sampleBuildings = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Sample building A" },
      geometry: {
        type: "Polygon",
        coordinates: [[[100.525, 13.742], [100.529, 13.742], [100.529, 13.746], [100.525, 13.746], [100.525, 13.742]]],
      },
    },
    {
      type: "Feature",
      properties: { name: "Sample building B" },
      geometry: {
        type: "Polygon",
        coordinates: [[[100.538, 13.756], [100.543, 13.756], [100.543, 13.761], [100.538, 13.761], [100.538, 13.756]]],
      },
    },
  ],
};
const sampleParcels = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { parcel_id: "BKK-P-001" },
      geometry: {
        type: "Polygon",
        coordinates: [[[100.518, 13.737], [100.532, 13.737], [100.532, 13.75], [100.518, 13.75], [100.518, 13.737]]],
      },
    },
    {
      type: "Feature",
      properties: { parcel_id: "BKK-P-002" },
      geometry: {
        type: "Polygon",
        coordinates: [[[100.534, 13.752], [100.55, 13.752], [100.55, 13.766], [100.534, 13.766], [100.534, 13.752]]],
      },
    },
  ],
};

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
const roads = L.layerGroup().addTo(map);
layerControl.addOverlay(roads, "Roads");

const buildings = L.geoJSON(null, {
  style: {
    color: "#6a6f74",
    weight: 1,
    fillColor: "#9aa2a8",
    fillOpacity: 0.35,
  },
}).addTo(map);
layerControl.addOverlay(buildings, "Buildings");

const parcels = L.geoJSON(null, {
  style: {
    color: "#8b6f32",
    weight: 1,
    fillColor: "#d8c64b",
    fillOpacity: 0.18,
  },
}).addTo(map);
layerControl.addOverlay(parcels, "Parcels");

let selectedArea = L.rectangle(bangkokBounds, {
  color: "#1b7f5a",
  weight: 2,
  fillOpacity: 0.05,
}).addTo(map);
let drawMode = false;
let firstCorner = null;
let previewArea = null;
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

function drawRoads() {
  const lines = [
    [[13.738, 100.492], [13.754, 100.534], [13.762, 100.58]],
    [[13.69, 100.47], [13.72, 100.52], [13.748, 100.56]],
    [[13.775, 100.51], [13.765, 100.56], [13.742, 100.62]],
  ];
  lines.forEach((line) => {
    L.polyline(line, { color: "#f2f4f1", weight: 5, opacity: 0.95 }).addTo(roads);
    L.polyline(line, { color: "#d34f34", weight: 2, opacity: 0.85 }).addTo(roads);
  });
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

function ndviColor(value) {
  if (value === null || value === undefined) return "#cbd5cf";
  if (value < 0.15) return "#b8542f";
  if (value < 0.3) return "#d99441";
  if (value < 0.45) return "#d8c64b";
  if (value < 0.6) return "#77a95d";
  return "#1b7f5a";
}

async function fetchJson(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message);
  }
  return response.json();
}

async function loadGridLayer() {
  const grid = await fetchJson("/api/grids");
  if (overlays.Grids) {
    map.removeLayer(overlays.Grids);
    layerControl.removeLayer(overlays.Grids);
  }
  overlays.Grids = L.geoJSON(grid, {
    style: (feature) => ({
      color: "#315c4b",
      weight: 1,
      fillColor: ndviColor(feature.properties.average_ndvi),
      fillOpacity: feature.properties.average_ndvi === null ? 0.08 : 0.58,
    }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      layer.bindPopup(`
        <strong>${p.grid_id}</strong><br>
        Average NDVI: ${formatNumber(p.average_ndvi)}<br>
        Min: ${formatNumber(p.minimum_ndvi)}<br>
        Max: ${formatNumber(p.maximum_ndvi)}<br>
        Date: ${p.capture_date || "No data"}
      `);
    },
  }).addTo(map);
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

document.getElementById("process-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const date = document.getElementById("date").value;
  const maxCloud = Number(document.getElementById("cloud").value || 40);
  if (!date) return;

  resetDrawMode();
  setStatus("Querying Sentinel-2 and processing B04/B08 NDVI...");
  try {
    const payload = {
      area: boundsToPolygon(selectedArea.getBounds()),
      date,
      max_cloud_cover: maxCloud,
    };
    const result = await fetchJson("/api/ndvi/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setStatus(`Complete. Processed ${result.grids_processed} grid cells for ${new Date(result.capture_date).toLocaleDateString()}.`);
    await Promise.all([loadGridLayer(), loadDashboard(), loadMetadata()]);
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

function loadLocalLayers() {
  buildings.addData(sampleBuildings);
  parcels.addData(sampleParcels);
}

document.getElementById("date").valueAsDate = new Date();
updateBboxReadout();
drawRoads();
loadLocalLayers();
Promise.all([loadGridLayer(), loadDashboard(), loadMetadata()]).catch((error) => {
  document.getElementById("status").textContent = `Backend unavailable: ${error.message}`;
});
}
