import type { Metadata } from "next";
import { ApiConfig } from "../api-config";
import { DashboardRuntime } from "./dashboard-runtime";

export const metadata: Metadata = {
  title: "Data Dashboard",
};

const metrics = [
  ["Total grids", "total-grids", "stored cells"],
  ["NDVI grids", "ndvi-grids", "with imagery stats"],
  ["Context grids", "context-grids", "with urban data"],
  ["Road density grids", "road-grids", "OSM-derived"],
  ["River grids", "river-grids", "HydroRIVERS intersections"],
  ["Average NDVI", "dashboard-avg-ndvi", "latest aggregate"],
  ["Avg rainfall", "dashboard-avg-rainfall", "CHIRPS daily"],
  ["Cumulative rain", "dashboard-rainfall-total", "loaded date range"],
  ["Total population", "dashboard-population", "latest context"],
  ["Built-up sq km", "dashboard-built-up", "ESA WorldCover"],
  ["Avg road density", "dashboard-road-density", "km / sq km"],
  ["Period NDVI change", "dashboard-period-change", "versus previous period"],
  ["Annual NDVI change", "dashboard-year-change", "same period last year"],
  ["NDVI anomaly", "dashboard-ndvi-anomaly", "seasonal z-score"],
  ["NDVI slope", "dashboard-ndvi-slope", "change per 30 days"],
];

const charts = [
  ["ndvi-trend-chart", "NDVI Trend", "Period average and historical baseline", " tall-chart"],
  ["ndvi-anomaly-chart", "NDVI Anomalies", "Seasonal anomaly z-score by period", ""],
  ["rainfall-trend-chart", "Rainfall Trend", "CHIRPS Daily average rainfall", ""],
  ["land-cover-chart", "Land Cover Mix", "Latest dominant land-cover share", ""],
  ["ndvi-distribution-chart", "NDVI Distribution", "Grid count by NDVI range", ""],
  ["context-chart", "Urban Context", "Population, green, built-up, roads", ""],
  ["status-chart", "Processing Status", "Satellite metadata records", ""],
];

const gridColumns = [
  "Grid ID", "NDVI", "NDBI", "Min", "Max", "Date", "Population",
  "Built-up sq km", "Green %", "Road density", "River", "River km", "Elevation avg",
  "Elevation min", "Elevation max", "Land cover", "Cover mix",
];

export default function DashboardPage() {
  return (
    <main className="data-dashboard">
      <header className="dashboard-header dashboard-hero">
        <div>
          <span>Vekin GIS</span>
          <h1>Data Dashboard</h1>
          <p>Operational view of NDVI, context layers, population, road density, and satellite processing runs.</p>
        </div>
        <div className="dashboard-actions">
          <button id="refresh-dashboard" type="button">Refresh</button>
          <button id="delete-dashboard-data" className="danger-button" type="button">Delete All Data</button>
          <a href="/">Map</a>
        </div>
      </header>

      <div className="dashboard-filter-bar">
        <p id="dashboard-status" className="dashboard-status">Loading data from the local API...</p>
        <div className="dashboard-filter-controls">
          <label htmlFor="dashboard-grid-filter">
            Grid
            <select id="dashboard-grid-filter" defaultValue="">
              <option value="">All grids</option>
            </select>
          </label>
          <label htmlFor="dashboard-aggregation">
            Aggregation
            <select id="dashboard-aggregation" defaultValue="monthly">
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <label htmlFor="dashboard-start-date">
            From
            <input id="dashboard-start-date" type="date" />
          </label>
          <label htmlFor="dashboard-end-date">
            To
            <input id="dashboard-end-date" type="date" />
          </label>
          <button id="apply-dashboard-date-range" type="button">Apply</button>
        </div>
      </div>

      <section className="data-section">
        <h2>Overview</h2>
        <div className="metric-grid dashboard-metrics">
          {metrics.map(([label, id, note]) => (
            <div className="kpi-card" key={id}>
              <span>{label}</span>
              <strong id={id}>--</strong>
              <small>{note}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="analytics-grid">
        {charts.map(([id, title, subtitle, frameClass], index) => (
          <article className={`chart-panel${index === 0 ? " hero-chart" : ""}`} key={id}>
            <div>
              <h2>{title}</h2>
              <span
                id={
                  id === "rainfall-trend-chart"
                    ? "rainfall-trend-scope"
                    : id === "ndvi-trend-chart"
                      ? "temporal-trend-scope"
                      : undefined
                }
              >
                {subtitle}
              </span>
            </div>
            <div className={`chart-frame${frameClass}`}>
              <canvas id={id} />
            </div>
          </article>
        ))}
      </section>

      <section className="data-section two-column-section">
        <div>
          <h2>Latest Context Layer</h2>
          <div id="context-layer" className="metadata-list" />
        </div>
        <div className="insight-panel">
          <h2>Analyst Summary</h2>
          <div id="dashboard-insights" className="insight-list" />
        </div>
      </section>

      <section className="data-section">
        <div className="section-heading">
          <div>
            <h2>Grid Data Rows</h2>
            <span>Detailed per-cell output from NDVI and context processing</span>
          </div>
        </div>
        <div className="table-toolbar">
          <input id="grid-filter" type="search" placeholder="Filter grid ID" />
          <span id="grid-count">--</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr>{gridColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody id="grid-table" />
          </table>
        </div>
      </section>

      <section className="data-section two-column-section">
        <div>
          <h2>Recent Metadata</h2>
          <div className="table-scroll compact-table">
            <table>
              <thead><tr><th>Satellite</th><th>Capture date</th><th>Cloud</th><th>Status</th></tr></thead>
              <tbody id="metadata-table" />
            </table>
          </div>
        </div>
      </section>
      <ApiConfig />
      <DashboardRuntime />
    </main>
  );
}
