import Link from "next/link";
import { ThreeDMapRuntime } from "./three-d-map-runtime";

export default function ThreeDMapPage() {
  return (
    <main className="three-d-map-shell">
      <section className="three-d-map-frame" aria-label="3D terrain map">
        <div className="three-d-map-topbar">
          <div>
            <span>3D terrain experiment</span>
            <h1 id="three-d-title">Selected terrain</h1>
          </div>
          <nav aria-label="Map views">
            <Link href="/">2D dashboard</Link>
          </nav>
        </div>

        <aside className="three-d-map-panel" aria-label="3D map controls">
          <div>
            <span>Layer mode</span>
            <strong id="three-d-layer-label">Terrain view</strong>
          </div>
          <label htmlFor="three-d-terrain-scale">
            Terrain relief
            <input id="three-d-terrain-scale" type="range" min="1" max="6" step="0.25" defaultValue="2.25" />
          </label>
          <label htmlFor="three-d-grid-style">
            Grid color
            <select id="three-d-grid-style" defaultValue="ndvi">
              <option value="ndvi">NDVI</option>
              <option value="land-cover">Land cover</option>
            </select>
          </label>
          <label htmlFor="three-d-building-type">
            Building label
            <select id="three-d-building-type" defaultValue="farm">
              <option value="farm">Farm</option>
              <option value="middle-man">Middle man</option>
              <option value="processor">Processor</option>
              <option value="warehouse">Warehouse</option>
              <option value="retailer">Retailer</option>
              <option value="end-product">End product destination</option>
            </select>
          </label>
          <label htmlFor="three-d-building-display">
            Building display
            <select id="three-d-building-display" defaultValue="solid">
              <option value="solid">3D buildings</option>
              <option value="border">Borders only</option>
            </select>
          </label>
          <div id="three-d-farm-panel" className="hidden" aria-live="polite">
            <span>Selected farm</span>
            <strong id="three-d-farm-title">Farm</strong>
            <p id="three-d-farm-summary">No farm selected.</p>
          </div>
          <div id="three-d-route-carbon-panel" className="hidden" aria-live="polite">
            <span>Route carbon</span>
            <strong id="three-d-route-carbon">0 kg CO2e</strong>
            <p id="three-d-route-span">Source to destination pending</p>
            <p id="three-d-route-distance">Distance pending</p>
            <p id="three-d-route-carbon-factor">Average truck factor</p>
          </div>
          <div className="three-d-layer-list" aria-label="3D map layers">
            <label className="three-d-toggle-row" htmlFor="three-d-satellite-layer">
              <input id="three-d-satellite-layer" type="checkbox" defaultChecked />
              Satellite imagery
            </label>
            <label className="three-d-toggle-row" htmlFor="three-d-elevation-layer">
              <input id="three-d-elevation-layer" type="checkbox" defaultChecked />
              Terrain elevation
            </label>
            <label className="three-d-toggle-row" htmlFor="three-d-grid-overlay">
              <input id="three-d-grid-overlay" type="checkbox" defaultChecked />
              Grid overlay
            </label>
            <label className="three-d-toggle-row" htmlFor="three-d-selection-layer">
              <input id="three-d-selection-layer" type="checkbox" defaultChecked />
              Selection outline
            </label>
            <label className="three-d-toggle-row" htmlFor="three-d-marker-layer">
              <input id="three-d-marker-layer" type="checkbox" defaultChecked />
              Center marker
            </label>
            <label className="three-d-toggle-row" htmlFor="three-d-building-layer">
              <input id="three-d-building-layer" type="checkbox" defaultChecked />
              Route buildings
            </label>
            <label className="three-d-toggle-row" htmlFor="three-d-route-layer">
              <input id="three-d-route-layer" type="checkbox" defaultChecked />
              Farm-to-fork route
            </label>
            <label className="three-d-toggle-row" htmlFor="three-d-shipment-layer">
              <input id="three-d-shipment-layer" type="checkbox" defaultChecked />
              Animated shipment
            </label>
            <label className="three-d-toggle-row" htmlFor="three-d-cow-layer">
              <input id="three-d-cow-layer" type="checkbox" defaultChecked />
              Cows
            </label>
          </div>
          <div className="three-d-map-actions" aria-label="Camera controls">
            <button id="three-d-rotate-left" type="button" aria-label="Rotate view left">
              &lt;
            </button>
            <button id="three-d-reset-camera" type="button">
              Camera
            </button>
            <button id="three-d-rotate-right" type="button" aria-label="Rotate view right">
              &gt;
            </button>
          </div>
          <p id="three-d-status">Loading 3D terrain around the target coordinate...</p>
        </aside>

        <div id="three-d-map" className="three-d-map-canvas" />
      </section>
      <ThreeDMapRuntime />
    </main>
  );
}
