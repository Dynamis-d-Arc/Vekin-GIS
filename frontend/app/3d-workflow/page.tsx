import type { Metadata } from "next";
import { Badge, Button, Label, TextInput } from "flowbite-react";
import { ApiConfig } from "../api-config";
import { MapRuntime } from "../map-runtime";

export const metadata: Metadata = {
  title: "3D Farm Route Workspace",
};

const inputClass = "flowbite-field w-full";
const labelClass = "grid gap-1.5 text-xs font-bold text-cyan-100/70";
const buttonClass = "fb-button font-bold";
const secondaryButtonClass = "fb-button font-bold";

export default function ThreeDWorkflowPage() {
  return (
    <main className="flowbite-dashboard three-d-workflow-shell grid min-h-screen text-cyan-50">
      <header className="three-d-workflow-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <div className="brand-symbol" aria-hidden="true"><span>V</span></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1>3D Farm-to-Fork Workspace</h1>
              <Badge color="success" size="xs" className="live-badge"><i /> Live</Badge>
            </div>
            <p>Build farm routes, save stops, and open the supply chain in the 3D terrain view.</p>
          </div>
        </div>
        <nav className="three-d-workflow-nav" aria-label="Workspace navigation">
          <a href="/">2D GIS Map</a>
          <a href="/dashboard">Data Dashboard</a>
        </nav>
      </header>

      <section className="three-d-workflow-grid">
        <article id="map-card" className="three-d-workflow-map-panel">
          <div className="three-d-workflow-panel-heading">
            <div>
              <span>Route map</span>
              <strong>Draw farm plots and stops</strong>
            </div>
            <p id="status">Select or draw a farm plot, then add route stops.</p>
          </div>
          <div className="three-d-workflow-map-stage">
            <div id="map" className="relative z-10 h-full min-h-0 overflow-hidden" />
          </div>
        </article>

        <aside className="three-d-workflow-form-panel" aria-label="3D farm route controls">
          <section
            id="three-d-route-form"
            aria-label="3D farm route controls"
            className="process-form-panel grid gap-2 rounded-xl border border-emerald-300/20 p-3.5"
          >
            <header className="process-form-header">
              <div>
                <span>3D route</span>
                <strong>Farm route &amp; cows</strong>
              </div>
              <Button
                className={`${secondaryButtonClass} hidden`}
                color="alternative"
                id="view-3d-terrain"
                size="xs"
                type="button"
              >
                View 3D terrain
              </Button>
            </header>
            <Button className={secondaryButtonClass} color="alternative" size="sm" id="draw-3d-polygon-button" type="button">Draw Polygon</Button>
            <div className={`${labelClass} process-field-full`}>
              <Label htmlFor="building-type">Building label</Label>
              <select id="building-type" className={inputClass} defaultValue="farm">
                <option value="farm">Farm</option>
                <option value="cooperative">Cooperative</option>
                <option value="dpo">DPO</option>
              </select>
            </div>
            <div id="farm-data-panel" className="grid gap-2 rounded-md border border-emerald-300/25 bg-emerald-400/10 p-2.5 text-xs text-cyan-100/70">
              <div className="flex items-center justify-between gap-2">
                <span>Farm data</span>
                <strong className="text-lime-200">Cow metrics</strong>
              </div>
              <TextInput
                className={inputClass}
                sizing="sm"
                id="farm-name"
                type="text"
                placeholder="Farm name"
              />
              <div className="grid grid-cols-2 gap-2">
                <div className={labelClass}>
                  <Label htmlFor="farm-cow-count">Cows</Label>
                  <TextInput className={inputClass} sizing="sm" id="farm-cow-count" type="number" min="0" placeholder="120" />
                </div>
                <div className={labelClass}>
                  <Label htmlFor="farm-herd-type">Herd type</Label>
                  <select id="farm-herd-type" className={inputClass} defaultValue="mixed">
                    <option value="dairy">Dairy</option>
                    <option value="beef">Beef</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className={labelClass}>
                  <Label htmlFor="farm-daily-output">Daily output</Label>
                  <TextInput className={inputClass} sizing="sm" id="farm-daily-output" type="number" min="0" placeholder="kg/day" />
                </div>
                <div className={labelClass}>
                  <Label htmlFor="farm-co2e">CO2e/day</Label>
                  <TextInput className={inputClass} sizing="sm" id="farm-co2e" type="number" min="0" placeholder="kg" />
                </div>
              </div>
            </div>
            <div className="grid gap-2 rounded-md border border-cyan-200/25 bg-slate-950/80 p-2.5 text-xs text-cyan-100/70">
              <div className="flex items-center justify-between gap-2">
                <span>Farm-to-fork route</span>
                <strong id="supply-chain-count" className="text-lime-200">0 stops</strong>
              </div>
              <TextInput
                className={inputClass}
                sizing="sm"
                id="supply-chain-name"
                type="text"
                placeholder="Route name"
              />
              <ol id="supply-chain-list" className="grid gap-1 text-cyan-50" />
              <div className="grid grid-cols-2 gap-2">
                <Button className={secondaryButtonClass} color="alternative" size="sm" id="add-supply-chain-stop" type="button">Add Stop</Button>
                <Button className={secondaryButtonClass} color="alternative" size="sm" id="clear-supply-chain" type="button">Clear Route</Button>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select id="saved-supply-chain-routes" className={inputClass} defaultValue="">
                  <option value="">Saved routes</option>
                </select>
                <Button className={secondaryButtonClass} color="alternative" size="sm" id="save-supply-chain" type="button">Save</Button>
              </div>
              <Button className={secondaryButtonClass} color="alternative" size="sm" id="load-supply-chain" type="button">Load Saved Route</Button>
              <div className="grid grid-cols-2 gap-2">
                <Button className={secondaryButtonClass} color="alternative" size="sm" id="export-supply-chain" type="button">Export JSON</Button>
                <Button className={secondaryButtonClass} color="alternative" size="sm" id="import-supply-chain" type="button">Import JSON</Button>
              </div>
              <input id="import-supply-chain-file" type="file" accept="application/json,.json" className="hidden" />
              <Button
                className={`${buttonClass} hidden`}
                color="green"
                id="view-farm-to-fork"
                size="sm"
                type="button"
              >
                View farm-to-fork 3D
              </Button>
            </div>
          </section>
        </aside>
      </section>

      <div className="hidden" aria-hidden="true">
        <form id="process-form">
          <input id="location" type="search" />
          <button id="search-button" type="button">Search</button>
          <button id="draw-box-button" type="button">Draw Box</button>
          <button id="draw-polygon-button" type="button">Draw Polygon</button>
          <input id="bounds-input" type="text" />
          <button id="apply-bounds-button" type="button">Apply Bounds</button>
          <span id="bbox-label">No area selected</span>
          <input id="date" type="date" />
          <input id="end-date" type="date" />
          <input id="cloud" type="number" defaultValue="40" />
        </form>
        <input id="map-range-start" type="date" />
        <input id="map-range-end" type="date" />
        <button id="apply-map-date-range" type="button">Apply</button>
        <button id="view-3d-grid" type="button">View selected grid in 3D</button>
        <span id="change-label">Daily change</span>
        <strong id="population-count">0</strong>
        <strong id="built-up-area">0</strong>
        <strong id="green-cover">0</strong>
        <strong id="road-density">0</strong>
        <strong id="grid-id">0</strong>
        <strong id="grid-date">0</strong>
        <strong id="avg-ndvi">0</strong>
        <strong id="min-ndvi">0</strong>
        <strong id="max-ndvi">0</strong>
        <strong id="change-ndvi">0</strong>
        <ol id="lowest"><li>0</li></ol>
        <ol id="highest"><li>0</li></ol>
        <div id="trend" />
        <div id="metadata" />
        <div id="grid-table" />
        <div id="metadata-table" />
      </div>

      <ApiConfig />
      <MapRuntime />
    </main>
  );
}
