import { ApiConfig } from "./api-config";
import { MapRuntime } from "./map-runtime";
const navItems = ["Overview", "Land Use", "Population", "Environment", "Reports"];

export default function MapPage() {
  return (
    <main className="app-shell urban-shell">
      <aside className="insight-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">UI</div>
          <div>
            <span>Vekin GIS</span>
            <strong>Urban Insights</strong>
          </div>
        </div>

        <nav className="insight-nav" aria-label="Urban dashboard sections">
          {navItems.map((item, index) => (
            <a key={item} className={index === 0 ? "is-current" : ""} href={item === "Reports" ? "/dashboard" : "#"}>
              <span>{item.slice(0, 2).toUpperCase()}</span>
              {item}
            </a>
          ))}
        </nav>

        <form id="process-form" className="control-panel urban-control-panel">
          <label>
            Area of interest
            <input id="location" type="search" placeholder="Bang Kapi, Bangkok" />
          </label>
          <div className="control-row">
            <button id="search-button" type="button">Search</button>
            <button id="draw-box-button" type="button">Draw Box</button>
          </div>
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
          <div className="date-grid">
            <label>
              Start
              <input id="date" type="date" required />
            </label>
            <label>
              End
              <input id="end-date" type="date" required />
            </label>
          </div>
          <label>
            Max cloud cover
            <input id="cloud" type="number" min="0" max="100" defaultValue="40" />
          </label>
          <button type="submit">Process NDVI</button>
          <button id="change-detection-button" type="button">Show Change Layer</button>
          <p id="status">Select an area, choose a date range, then process.</p>
        </form>
      </aside>

      <section className="urban-dashboard">
        <header className="urban-title">
          <span>Example</span>
          <h1>Urban Growth & Infrastructure Monitoring Dashboard</h1>
        </header>

        <section className="urban-kpis" aria-label="Urban monitoring summary">
          <div className="urban-kpi">
            <span className="kpi-icon">POP</span>
            <small>Population</small>
            <strong id="population-count">0</strong>
            <em>0% vs last year</em>
          </div>
          <div className="urban-kpi">
            <span className="kpi-icon">BLD</span>
            <small>Built-up Area</small>
            <strong><span id="built-up-area">0</span> km<sup>2</sup></strong>
            <em>0% vs last year</em>
          </div>
          <div className="urban-kpi">
            <span className="kpi-icon green">NDV</span>
            <small>Green Cover</small>
            <strong id="green-cover">0</strong>
            <em className="is-down">0% vs last year</em>
          </div>
          <div className="urban-kpi">
            <span className="kpi-icon">RD</span>
            <small>Road Density</small>
            <strong><span id="road-density">0</span> km/km<sup>2</sup></strong>
            <em>0% vs last year</em>
          </div>
        </section>

        <section className="urban-grid">
          <article className="urban-card urban-map-card">
            <div className="panel-heading">
              <h2>Land Use / Land Cover</h2>
              <span id="urban-context-title">Urban Context</span>
            </div>
            <div id="map" />
            <div className="map-legend">
              <span><i className="built" />Built-up</span>
              <span><i className="agri" />Agriculture</span>
              <span><i className="forest" />Forest</span>
              <span><i className="water" />Water</span>
              <span><i className="barren" />Barren</span>
            </div>
          </article>

          <article className="urban-card growth-card">
            <h2>Selected Grid Data</h2>
            <div className="grid-data-list">
              <span>Grid ID <strong id="grid-id">0</strong></span>
              <span>NDVI <strong id="grid-ndvi">0</strong></span>
              <span>NDBI <strong id="grid-ndbi">0</strong></span>
              <span>Min <strong id="grid-min">0</strong></span>
              <span>Max <strong id="grid-max">0</strong></span>
              <span>Date <strong id="grid-date">0</strong></span>
            </div>
          </article>

          <article className="urban-card population-card">
            <h2>Grid Context</h2>
            <div className="grid-data-list context-data-list">
              <span>Population <strong id="grid-population">0</strong></span>
              <span>Built-up sq km <strong id="grid-built-up">0</strong></span>
              <span>Green % <strong id="grid-green">0</strong></span>
              <span>Road density <strong id="grid-road">0</strong></span>
              <span>Elevation avg <strong id="grid-elev-avg">0</strong></span>
              <span>Elevation min <strong id="grid-elev-min">0</strong></span>
              <span>Elevation max <strong id="grid-elev-max">0</strong></span>
            </div>
          </article>

          <article className="urban-card trend-card">
            <h2>Land Cover / Cover Mix</h2>
            <div className="cover-mix-panel">
              <span>Land cover <strong id="grid-land-cover">0</strong></span>
              <p id="grid-cover-mix">0</p>
            </div>
          </article>

          <article className="urban-card environmental-card">
            <h2>Environmental Indicators</h2>
            <div className="environment-grid">
              <div><span>Avg. NDVI</span><strong id="avg-ndvi">0</strong><em>placeholder</em></div>
              <div><span>Minimum NDVI</span><strong id="min-ndvi">0</strong><em>placeholder</em></div>
              <div><span>Maximum NDVI</span><strong id="max-ndvi">0</strong><em>placeholder</em></div>
              <div><span id="change-label">Daily change</span><strong id="change-ndvi">0</strong><em>placeholder</em></div>
            </div>
          </article>
        </section>

        <div className="runtime-data" aria-hidden="true">
          <ol id="lowest">
            <li>0</li>
            <li>0</li>
            <li>0</li>
          </ol>
          <ol id="highest">
            <li>0</li>
            <li>0</li>
            <li>0</li>
          </ol>
          <div id="trend" className="trend" />
          <div id="metadata" className="metadata-list">
            <div className="metadata-item">
              <strong>Sentinel-2</strong>
              <span>0</span>
              <small>Cloud 0% / 0</small>
            </div>
          </div>
        </div>
      </section>
      <ApiConfig />
      <MapRuntime />
    </main>
  );
}
