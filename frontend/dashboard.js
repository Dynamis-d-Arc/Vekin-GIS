const API_BASE = "http://localhost:8000";

let gridRows = [];
let allGridRows = [];
const charts = {};

const palette = {
  green: "#1b7f5a",
  lightGreen: "#77a95d",
  yellow: "#d8c64b",
  amber: "#d99441",
  red: "#b8542f",
  blue: "#3b6f8f",
  slate: "#5f6f69",
  line: "#d9e1dc",
  ink: "#1a2521",
  muted: "#68736d",
};

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

function formatMillimeters(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "--"
    : `${Number(value).toFixed(1)} mm`;
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

function finiteOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message);
  }
  return response.json();
}

function setStatus(message) {
  document.getElementById("dashboard-status").textContent = message;
}

function chartBaseOptions(extra = {}) {
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
          color: palette.ink,
          boxWidth: 12,
          boxHeight: 12,
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
        ticks: { color: palette.muted },
        grid: { color: "rgba(217, 225, 220, 0.7)" },
      },
      y: {
        beginAtZero: true,
        ticks: { color: palette.muted },
        grid: { color: "rgba(217, 225, 220, 0.7)" },
      },
    },
    ...extra,
  };
}

function renderChart(id, config) {
  if (charts[id]) {
    charts[id].destroy();
  }
  const node = document.getElementById(id);
  charts[id] = new Chart(node, config);
}

function ndviBucket(value) {
  if (!Number.isFinite(value)) return null;
  if (value < 0.15) return "<0.15";
  if (value < 0.3) return "0.15-0.30";
  if (value < 0.45) return "0.30-0.45";
  if (value < 0.6) return "0.45-0.60";
  return ">=0.60";
}

function renderTrendChart(rows) {
  const points = rows
    .map((row) => ({
      label: row.date,
      value: Number(row.average_ndvi),
    }))
    .filter((row) => Number.isFinite(row.value));

  renderChart("ndvi-trend-chart", {
    type: "line",
    data: {
      labels: points.map((point) => point.label),
      datasets: [
        {
          label: "Average NDVI",
          data: points.map((point) => point.value),
          borderColor: palette.green,
          backgroundColor: "rgba(27, 127, 90, 0.18)",
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.32,
        },
      ],
    },
    options: chartBaseOptions({
      scales: {
        x: {
          ticks: { color: palette.muted, maxRotation: 0 },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: palette.muted },
          grid: { color: "rgba(217, 225, 220, 0.7)" },
        },
      },
    }),
  });
}

function renderRainfallTrendChart(rows) {
  const points = rows
    .map((row) => ({
      label: row.date,
      value: Number(row.average_rainfall_mm),
    }))
    .filter((row) => Number.isFinite(row.value));

  renderChart("rainfall-trend-chart", {
    type: "bar",
    data: {
      labels: points.map((point) => point.label),
      datasets: [
        {
          label: "Average rainfall",
          data: points.map((point) => point.value),
          backgroundColor: "rgba(59, 111, 143, 0.72)",
          borderColor: palette.blue,
          borderWidth: 1,
          borderRadius: 5,
        },
      ],
    },
    options: chartBaseOptions({
      scales: {
        x: {
          ticks: { color: palette.muted, maxRotation: 0 },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: palette.muted,
            callback: (value) => `${value} mm`,
          },
          grid: { color: "rgba(217, 225, 220, 0.7)" },
        },
      },
    }),
  });
}

function renderNdviDistributionChart() {
  const labels = ["<0.15", "0.15-0.30", "0.30-0.45", "0.45-0.60", ">=0.60"];
  const counts = Object.fromEntries(labels.map((label) => [label, 0]));
  gridRows.forEach((row) => {
    const bucket = ndviBucket(Number(row.average_ndvi));
    if (bucket) counts[bucket] += 1;
  });

  renderChart("ndvi-distribution-chart", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Grid count",
          data: labels.map((label) => counts[label]),
          backgroundColor: [palette.red, palette.amber, palette.yellow, palette.lightGreen, palette.green],
          borderRadius: 6,
        },
      ],
    },
    options: chartBaseOptions({
      plugins: {
        ...chartBaseOptions().plugins,
        legend: { display: false },
      },
    }),
  });
}

function renderLandCoverChart() {
  const totals = {};
  gridRows.forEach((row) => {
    Object.entries(row.land_cover_percentages || {}).forEach(([code, percent]) => {
      totals[code] = (totals[code] || 0) + Number(percent);
    });
  });
  const entries = Object.entries(totals)
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  renderChart("land-cover-chart", {
    type: "doughnut",
    data: {
      labels: entries.map(([code]) => `Class ${code}`),
      datasets: [
        {
          data: entries.map(([, value]) => value),
          backgroundColor: [
            palette.green,
            palette.lightGreen,
            palette.yellow,
            palette.amber,
            palette.red,
            palette.blue,
            palette.slate,
          ],
          borderColor: "#ffffff",
          borderWidth: 3,
        },
      ],
    },
    options: chartBaseOptions({
      cutout: "62%",
      scales: {},
      plugins: {
        ...chartBaseOptions().plugins,
        legend: {
          position: "bottom",
          labels: {
            color: palette.ink,
            boxWidth: 12,
            boxHeight: 12,
            usePointStyle: true,
          },
        },
      },
    }),
  });
}

function renderContextChart(context) {
  const rows = context.urban_context_statistics || [];
  const populationTotal = sumFinite(rows.map((row) => row.population_count));
  const greenAverage = averageFinite(rows.map((row) => row.green_cover_percentage));
  const builtUpSquareKm = sumFinite(rows.map((row) => row.built_up_area_square_meters)) / 1_000_000;
  const roadDensityAverage = averageFinite(rows.map((row) => row.road_density_km_per_square_km));

  renderChart("context-chart", {
    type: "radar",
    data: {
      labels: ["Population", "Green cover", "Built-up area", "Road density"],
      datasets: [
        {
          label: "Latest context",
          data: [
            populationTotal ? Math.log10(populationTotal + 1) : 0,
            finiteOrZero(greenAverage),
            builtUpSquareKm,
            finiteOrZero(roadDensityAverage),
          ],
          backgroundColor: "rgba(59, 111, 143, 0.2)",
          borderColor: palette.blue,
          pointBackgroundColor: palette.blue,
          pointRadius: 4,
        },
      ],
    },
    options: chartBaseOptions({
      scales: {
        r: {
          beginAtZero: true,
          ticks: { color: palette.muted, backdropColor: "transparent" },
          grid: { color: "rgba(217, 225, 220, 0.9)" },
          angleLines: { color: "rgba(217, 225, 220, 0.9)" },
          pointLabels: { color: palette.ink, font: { size: 12 } },
        },
      },
    }),
  });
}

function renderStatusChart(metadata) {
  const statuses = metadata.reduce((counts, row) => {
    const status = row.processing_status || "unknown";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const labels = Object.keys(statuses);

  renderChart("status-chart", {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: labels.map((label) => statuses[label]),
          backgroundColor: labels.map((label) => label === "processed" ? palette.green : palette.amber),
          borderColor: "#ffffff",
          borderWidth: 3,
        },
      ],
    },
    options: chartBaseOptions({
      scales: {},
      plugins: {
        ...chartBaseOptions().plugins,
        legend: {
          position: "bottom",
          labels: {
            color: palette.ink,
            boxWidth: 12,
            boxHeight: 12,
            usePointStyle: true,
          },
        },
      },
    }),
  });
}

function renderCharts({ dashboard, metadata, context }) {
  if (typeof Chart === "undefined") {
    setStatus("Chart.js is unavailable. Check your internet connection or CDN access.");
    return;
  }
  renderTrendChart(dashboard.trend || []);
  renderRainfallTrendChart(dashboard.rainfall_trend || []);
  renderNdviDistributionChart();
  renderLandCoverChart();
  renderContextChart(context);
  renderStatusChart(metadata);
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
  const rainfallRows = dashboard.rainfall_trend || [];
  const rainfallAverage = averageFinite(rainfallRows.map((row) => row.average_rainfall_mm));
  const rainfallTotal = sumFinite(rainfallRows.map((row) => row.average_rainfall_mm));

  document.getElementById("total-grids").textContent = formatCompactNumber(properties.length);
  document.getElementById("ndvi-grids").textContent = formatCompactNumber(ndviCount);
  document.getElementById("context-grids").textContent = formatCompactNumber(contextCount);
  document.getElementById("road-grids").textContent = formatCompactNumber(roadCount);
  document.getElementById("dashboard-avg-ndvi").textContent = formatNumber(dashboard.summary.average_ndvi);
  document.getElementById("dashboard-avg-rainfall").textContent = formatMillimeters(rainfallAverage);
  document.getElementById("dashboard-rainfall-total").textContent = rainfallRows.length ? formatMillimeters(rainfallTotal) : "--";
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
      <td>${formatNumber(row.average_ndbi)}</td>
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

function renderInsights({ dashboard, context }) {
  const node = document.getElementById("dashboard-insights");
  const contextRows = context.urban_context_statistics || [];
  const populationTotal = sumFinite(contextRows.map((row) => row.population_count));
  const greenAverage = averageFinite(contextRows.map((row) => row.green_cover_percentage));
  const roadDensityAverage = averageFinite(contextRows.map((row) => row.road_density_km_per_square_km));
  const trend = dashboard.trend || [];
  const previous = Number(trend.at(-2)?.average_ndvi);
  const current = Number(trend.at(-1)?.average_ndvi);
  const change = Number.isFinite(previous) && Number.isFinite(current) ? current - previous : null;
  const rainfallRows = dashboard.rainfall_trend || [];
  const latestRainfall = Number(rainfallRows.at(-1)?.average_rainfall_mm);
  const items = [
    ["NDVI change", change === null ? "--" : `${change >= 0 ? "+" : ""}${formatNumber(change)}`],
    ["Latest rainfall", Number.isFinite(latestRainfall) ? formatMillimeters(latestRainfall) : "--"],
    ["Average green cover", greenAverage === null ? "--" : `${formatNumber(greenAverage)}%`],
    ["Average road density", roadDensityAverage === null ? "--" : `${formatNumber(roadDensityAverage)} km/sq km`],
    ["Context population", populationTotal > 0 ? formatCompactNumber(populationTotal) : "--"],
  ];

  node.innerHTML = "";
  items.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "insight-item";
    item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    node.appendChild(item);
  });
}

async function loadDataDashboard() {
  setStatus("Loading data from the local API...");
  const gridFilter = document.getElementById("dashboard-grid-filter");
  const selectedGridId = gridFilter.value;
  const dashboardPath = selectedGridId
    ? `/api/dashboard?grid_id=${encodeURIComponent(selectedGridId)}`
    : "/api/dashboard";
  const [dashboard, metadata, context, grids] = await Promise.all([
    fetchJson(dashboardPath),
    fetchJson("/api/metadata"),
    fetchJson("/api/context/statistics/latest"),
    fetchJson("/api/grids"),
  ]);

  allGridRows = grids.features.map((feature) => feature.properties);
  const gridIds = [...new Set(allGridRows.map((row) => row.grid_id))].sort();
  gridFilter.innerHTML = '<option value="">All grids</option>';
  gridIds.forEach((gridId) => {
    const option = document.createElement("option");
    option.value = gridId;
    option.textContent = gridId;
    option.selected = gridId === selectedGridId;
    gridFilter.appendChild(option);
  });

  gridRows = selectedGridId
    ? allGridRows.filter((row) => row.grid_id === selectedGridId)
    : allGridRows;
  const filteredGrids = {
    ...grids,
    features: selectedGridId
      ? grids.features.filter((feature) => feature.properties.grid_id === selectedGridId)
      : grids.features,
  };
  const filteredContext = selectedGridId
    ? {
        ...context,
        dem_statistics: (context.dem_statistics || []).filter((row) => row.grid_id === selectedGridId),
        land_cover_statistics: (context.land_cover_statistics || []).filter((row) => row.grid_id === selectedGridId),
        urban_context_statistics: (context.urban_context_statistics || []).filter((row) => row.grid_id === selectedGridId),
      }
    : context;

  renderOverview({ dashboard, grids: filteredGrids, context: filteredContext });
  renderContextLayer(context);
  renderGridTable();
  renderMetadataTable(metadata);
  renderCharts({ dashboard, metadata, context: filteredContext });
  renderInsights({ dashboard, context: filteredContext });
  setStatus(selectedGridId ? `Showing ${selectedGridId}.` : `Loaded ${gridRows.length.toLocaleString()} grid rows.`);
}

async function deleteDashboardData() {
  const confirmed = window.confirm(
    "Delete all dashboard data? This permanently clears grids, NDVI/NDBI, rainfall, satellite metadata, and context layer results.",
  );
  if (!confirmed) return;

  const button = document.getElementById("delete-dashboard-data");
  button.disabled = true;
  setStatus("Deleting processed dashboard data...");
  try {
    const result = await fetchJson("/api/dashboard/data", { method: "DELETE" });
    await loadDataDashboard();
    setStatus(`Deleted ${formatCompactNumber(result.total_deleted)} records, including all grid cells.`);
  } catch (error) {
    setStatus(`Delete failed: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

document.getElementById("refresh-dashboard").addEventListener("click", () => {
  loadDataDashboard().catch((error) => {
    setStatus(`Dashboard load failed: ${error.message}`);
  });
});

document.getElementById("delete-dashboard-data").addEventListener("click", () => {
  deleteDashboardData();
});

document.getElementById("grid-filter").addEventListener("input", renderGridTable);
document.getElementById("dashboard-grid-filter").addEventListener("change", () => {
  document.getElementById("grid-filter").value = "";
  loadDataDashboard().catch((error) => {
    setStatus(`Dashboard load failed: ${error.message}`);
  });
});

loadDataDashboard().catch((error) => {
  setStatus(`Dashboard load failed: ${error.message}`);
});
