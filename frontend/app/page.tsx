import { ApiConfig } from "./api-config";
import { MapRuntime } from "./map-runtime";

export default function MapPage() {
  return (
    <main className="app-shell">
      <section className="map-panel">
        <div id="map" />
        <form id="process-form" className="control-panel">
          <div className="brand">
            <span>Vekin GIS</span>
            <strong>Sentinel-2 NDVI</strong>
          </div>
          <a href="/dashboard">Data Dashboard</a>
          <label>
            Start date
            <input id="date" type="date" required />
          </label>
          <label>
            End date
            <input id="end-date" type="date" required />
          </label>
          <label>
            Max cloud cover
            <input id="cloud" type="number" min="0" max="100" defaultValue="40" />
          </label>
          <label>
            Search location
            <input id="location" type="search" placeholder="Bang Kapi, Bangkok" />
          </label>
          <button id="search-button" type="button">Search</button>
          <button id="draw-box-button" type="button">Draw Box</button>
          <label>
            Paste bounds
            <input
              id="bounds-input"
              type="text"
              placeholder="W 101.1635, S 13.8941, E 101.4601, N 14.4506"
            />
          </label>
          <button id="apply-bounds-button" type="button">Apply Bounds</button>
          <div className="bbox-readout">
            <span>Selected bounds</span>
            <strong id="bbox-label">No area selected</strong>
          </div>
          <button type="submit">Process NDVI</button>
          <button id="change-detection-button" type="button">Show Change Layer</button>
          <p id="status">Select an area on the Bangkok map, choose a date, then process.</p>
        </form>
      </section>
      <aside className="dashboard">
        <section>
          <h1>Level 1 Analytics</h1>
          <div className="metric-grid">
            <div><span>Average NDVI</span><strong id="avg-ndvi">--</strong></div>
            <div><span>Minimum</span><strong id="min-ndvi">--</strong></div>
            <div><span>Maximum</span><strong id="max-ndvi">--</strong></div>
            <div><span id="change-label">Daily change</span><strong id="change-ndvi">--</strong></div>
          </div>
        </section>
        <section><h2>Lowest NDVI Grids</h2><ol id="lowest" /></section>
        <section><h2>Highest NDVI Grids</h2><ol id="highest" /></section>
        <section><h2>Recent Metadata</h2><div id="metadata" className="metadata-list" /></section>
        <section>
          <h2 id="urban-context-title">Urban Context</h2>
          <div className="metric-grid context-metrics">
            <div><span>Population</span><strong id="population-count">--</strong></div>
            <div><span>Built-up sq km</span><strong id="built-up-area">--</strong></div>
            <div><span>Green cover</span><strong id="green-cover">--</strong></div>
            <div><span>Road density</span><strong id="road-density">--</strong></div>
          </div>
        </section>
        <section><h2>Historical NDVI Trend</h2><div id="trend" className="trend" /></section>
      </aside>
      <ApiConfig />
      <MapRuntime />
    </main>
  );
}
