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
          </div>
          <button id="three-d-reset-camera" type="button">
            Cinematic camera
          </button>
          <p id="three-d-status">Loading 3D terrain around the target coordinate...</p>
        </aside>

        <div id="three-d-map" className="three-d-map-canvas" />
      </section>
      <ThreeDMapRuntime />
    </main>
  );
}
