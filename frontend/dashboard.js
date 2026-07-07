const API_BASE = "http://localhost:8000";

let gridRows = [];

function formatNumber(value, digits = 3) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "--"
    : Number(value).toFixed(digits);
}

function formatCompactNumber(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "--"
    : Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatSquareKilometers(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "--"
    : (Number(value) / 1_000_000).toFixed(2);
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

function formatLandCoverMix(percentages) {
  if (!percentages || !Object.keys(percentages).length) return "--";
  return Object.entries(percentages)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([code, percent]) => `${code}: ${formatNumber(percent, 1)}%`)
    .join(", ");
}

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message);
  }
  return response.json();
}

function setStatus(message) {
  document.getElementById("dashboard-status").textContent = message;
}

function renderTrend(rows) {
  const node = document.getElementById("dashboard-trend");
  node.innerHTML = "";
  const values = rows.map((row) => Number(row.average_ndvi)).filter(Number.isFinite);
  const max = Math.max(...values, 0.1);
  rows.forEach((row) => {
    const bar = document.createElement("span");
    const value = Number(row.average_ndvi);
    bar.style.height = `${Math.max(8, (value / max) * 120)}px`;
    bar.title = `${row.date}: ${formatNumber(value)}`;
    node.appendChild(bar);
  });
}

function renderContextLayer(context) {
  const node = document.getElementById("context-layer");
  node.innerHTML = "";
  const layer = context.context_layer;
  if (!layer) {
    node.innerHTML = `<div class="metadata-item"><strong>No context layer found</strong></div>`;
    return;
  }

  const rows = [
    ["Layer ID", layer.id],
    ["DEM source", layer.dem_source],
    ["Land-cover source", layer.land_cover_source],
    ["Updated", new Date(layer.updated_at).toLocaleString()],
    ["DEM overlay", layer.dem_url],
    ["Land-cover overlay", layer.land_cover_url],
  ];

  rows.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "metadata-item";
    item.innerHTML = `<strong>${label}</strong><span>${value || "--"}</span>`;
    node.appendChild(item);
  });
}

function renderOverview({ dashboard, grids, context }) {
  const properties = grids.features.map((feature) => feature.properties);
  const contextRows = context.urban_context_statistics || [];
  const ndviCount = properties.filter((row) => Number.isFinite(Number(row.average_ndvi))).length;
  const contextCount = properties.filter(
    (row) =>
      (row.population_count !== null && row.population_count !== undefined) ||
      (row.built_up_area_square_meters !== null && row.built_up_area_square_meters !== undefined) ||
      (row.green_cover_percentage !== null && row.green_cover_percentage !== undefined) ||
      (row.road_density_km_per_square_km !== null && row.road_density_km_per_square_km !== undefined),
  ).length;
  const roadCount = properties.filter(
    (row) => row.road_density_km_per_square_km !== null && row.road_density_km_per_square_km !== undefined,
  ).length;
  const populationTotal = sumFinite(contextRows.map((row) => row.population_count));
  const builtUpTotal = sumFinite(contextRows.map((row) => row.built_up_area_square_meters));
  const roadDensityAverage = averageFinite(contextRows.map((row) => row.road_density_km_per_square_km));

  document.getElementById("total-grids").textContent = formatCompactNumber(properties.length);
  document.getElementById("ndvi-grids").textContent = formatCompactNumber(ndviCount);
  document.getElementById("context-grids").textContent = formatCompactNumber(contextCount);
  document.getElementById("road-grids").textContent = formatCompactNumber(roadCount);
  document.getElementById("dashboard-avg-ndvi").textContent = formatNumber(dashboard.summary.average_ndvi);
  document.getElementById("dashboard-population").textContent = populationTotal > 0 ? formatCompactNumber(populationTotal) : "--";
  document.getElementById("dashboard-built-up").textContent = builtUpTotal > 0 ? formatSquareKilometers(builtUpTotal) : "--";
  document.getElementById("dashboard-road-density").textContent = roadDensityAverage === null ? "--" : formatNumber(roadDensityAverage);
}

function renderGridTable() {
  const filter = document.getElementById("grid-filter").value.trim().toLowerCase();
  const rows = gridRows
    .filter((row) => !filter || row.grid_id.toLowerCase().includes(filter))
    .slice(0, 500);
  const table = document.getElementById("grid-table");
  table.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.grid_id}</td>
      <td>${formatNumber(row.average_ndvi)}</td>
      <td>${formatNumber(row.minimum_ndvi)}</td>
      <td>${formatNumber(row.maximum_ndvi)}</td>
      <td>${row.capture_date ? new Date(row.capture_date).toLocaleDateString() : "--"}</td>
      <td>${formatCompactNumber(row.population_count)}</td>
      <td>${formatSquareKilometers(row.built_up_area_square_meters)}</td>
      <td>${row.green_cover_percentage === null || row.green_cover_percentage === undefined ? "--" : `${formatNumber(row.green_cover_percentage)}%`}</td>
      <td>${formatNumber(row.road_density_km_per_square_km)}</td>
      <td>${formatNumber(row.average_elevation)}</td>
      <td>${formatNumber(row.minimum_elevation)}</td>
      <td>${formatNumber(row.maximum_elevation)}</td>
      <td>${row.dominant_land_cover_class || "--"}</td>
      <td>${formatLandCoverMix(row.land_cover_percentages)}</td>
    `;
    table.appendChild(tr);
  });

  document.getElementById("grid-count").textContent =
    `${rows.length.toLocaleString()} shown / ${gridRows.length.toLocaleString()} total`;
}

function renderMetadataTable(rows) {
  const table = document.getElementById("metadata-table");
  table.innerHTML = "";
  rows.slice(0, 50).forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.satellite}</td>
      <td>${new Date(row.capture_date).toLocaleString()}</td>
      <td>${formatNumber(row.cloud_cover)}%</td>
      <td>${row.processing_status}</td>
    `;
    table.appendChild(tr);
  });
}

async function loadDataDashboard() {
  setStatus("Loading data from the local API...");
  const [dashboard, metadata, context, grids] = await Promise.all([
    fetchJson("/api/dashboard"),
    fetchJson("/api/metadata"),
    fetchJson("/api/context/statistics/latest"),
    fetchJson("/api/grids"),
  ]);

  gridRows = grids.features.map((feature) => feature.properties);
  renderOverview({ dashboard, grids, context });
  renderContextLayer(context);
  renderGridTable();
  renderMetadataTable(metadata);
  renderTrend(dashboard.trend || []);
  setStatus(`Loaded ${gridRows.length.toLocaleString()} grid rows.`);
}

document.getElementById("refresh-dashboard").addEventListener("click", () => {
  loadDataDashboard().catch((error) => {
    setStatus(`Dashboard load failed: ${error.message}`);
  });
});

document.getElementById("grid-filter").addEventListener("input", renderGridTable);

loadDataDashboard().catch((error) => {
  setStatus(`Dashboard load failed: ${error.message}`);
});
