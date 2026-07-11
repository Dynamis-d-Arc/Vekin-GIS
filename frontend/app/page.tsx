import { Badge, Button, Card, Label, TextInput } from "flowbite-react";
import { ApiConfig } from "./api-config";
import { MapRuntime } from "./map-runtime";

const kpis = [
  ["01", "Population", "population-count", "0", "0% vs last year", "", "Residents in selected area"],
  ["02", "Built-up Area", "built-up-area", "0", "0% vs last year", " km²", "Developed land coverage"],
  ["03", "Green Cover", "green-cover", "0", "0% vs last year", "%", "Vegetation coverage"],
  ["04", "Road Density", "road-density", "0", "0% vs last year", " km/km²", "Transport network density"],
];

const inputClass =
  "flowbite-field w-full";
const labelClass = "grid gap-1.5 text-xs font-bold text-cyan-100/70";
const buttonClass = "fb-button font-bold";
const secondaryButtonClass = "fb-button font-bold";
const cardClass =
  "min-w-0 overflow-hidden rounded-lg border border-cyan-200/25 bg-gradient-to-b from-sky-950/90 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_30px_rgba(0,0,0,0.18)]";
const mapControlButtonClass = "fb-button group h-8 gap-2.5 px-3 text-[11px] font-bold";
const mapControlIconClass =
  "grid h-4 w-4 place-items-center rounded-sm border border-cyan-100/15 bg-slate-950/45 text-[9px] leading-none text-lime-200 transition group-hover:border-lime-200/35";
const detailTabButtonClass = "fb-button text-xs font-bold";
const detailMetricClass =
  "grid min-h-16 gap-1 rounded-md border border-cyan-200/15 bg-slate-950/60 p-2";
const detailMetricLabelClass = "text-xs font-bold text-cyan-100/65";
const detailMetricValueClass = "[overflow-wrap:anywhere] text-[15px] font-extrabold leading-tight text-lime-200";
const detailMetricNoteClass = "text-[11px] leading-snug text-cyan-100/60";

export default function MapPage() {
  return (
    <main className="flowbite-dashboard dashboard-shell grid h-screen min-h-screen overflow-hidden text-cyan-50">
      <section className="grid h-screen min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden p-4 max-[760px]:overflow-y-auto max-[760px]:p-3">
        <header className="dashboard-topbar flex min-w-0 items-center justify-between gap-5 rounded-xl border border-cyan-200/15 px-4 py-3 max-[860px]:items-start max-[860px]:flex-col">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="brand-symbol" aria-hidden="true"><span>V</span></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="m-0 text-[19px] font-extrabold tracking-[-0.02em] text-white">Vekin Urban Intelligence</h1>
                <Badge color="success" size="xs" className="live-badge"><i /> Live</Badge>
              </div>
              <p className="mt-1 text-xs text-cyan-100/55">Geospatial monitoring · Bangkok Metropolitan Area</p>
            </div>
          </div>
          <div className="grid grid-cols-[repeat(2,minmax(130px,1fr))_auto] items-end gap-2 max-[620px]:w-full max-[620px]:grid-cols-1">
            <div className={labelClass}>
              <Label htmlFor="map-range-start">From</Label>
              <TextInput className={inputClass} sizing="sm" id="map-range-start" type="date" />
            </div>
            <div className={labelClass}>
              <Label htmlFor="map-range-end">To</Label>
              <TextInput className={inputClass} sizing="sm" id="map-range-end" type="date" />
            </div>
            <Button className={`${secondaryButtonClass} px-3`} color="alternative" size="sm" id="apply-map-date-range" type="button">Update view</Button>
          </div>
        </header>

        <section className="grid grid-cols-4 gap-2 max-[900px]:grid-cols-2" aria-label="Urban monitoring summary">
          {kpis.map(([icon, label, id, fallback, note, suffix, description], index) => (
            <Card
              className="kpi-premium group relative grid min-h-[106px] max-w-none grid-cols-[42px_1fr] grid-rows-[auto_auto_auto] gap-x-3 overflow-hidden rounded-xl border border-cyan-200/15 p-3.5"
              key={id}
              theme={{ root: { children: "contents" } }}
            >
              <span
                className={`row-span-3 grid h-10 w-10 place-items-center self-start rounded-lg border text-[10px] font-black tracking-wider ${
                  index === 2 ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-300" : "border-cyan-200/15 bg-cyan-400/5 text-cyan-100/70"
                }`}
              >
                {icon}
              </span>
              <div className="flex items-center justify-between gap-2">
                <small className="font-bold text-cyan-100/60">{label}</small>
                <em className={`text-[10px] not-italic ${index === 2 ? "text-rose-300" : "text-emerald-300"}`}>{note}</em>
              </div>
              <strong className="text-[clamp(21px,2.2vw,30px)] leading-none tracking-[-0.03em] text-white">
                <span id={id}>{fallback}</span>
                {suffix}
              </strong>
              <span className="self-end text-[10px] text-cyan-100/35">{description}</span>
            </Card>
          ))}
        </section>

        <section className="dashboard-content-grid grid min-h-0 grid-cols-[minmax(480px,1.55fr)_minmax(260px,0.85fr)_minmax(260px,0.85fr)] grid-rows-[minmax(0,0.85fr)_minmax(0,1.25fr)_minmax(0,0.9fr)] gap-2">
          <article id="map-card" className={`${cardClass} dashboard-panel relative row-span-3`}>
            <div className="flex items-center justify-between gap-2.5">
              <div className="mb-2.5">
                <span className="panel-eyebrow">Spatial overview</span>
                <h2 className="mt-0.5 text-[15px] font-bold text-cyan-50">Land Use &amp; Land Cover</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  id="toggle-process-form"
                  type="button"
                  aria-controls="process-form"
                  aria-expanded="true"
                  className={mapControlButtonClass}
                  color="alternative"
                  size="xs"
                >
                  <span className={mapControlIconClass} aria-hidden="true">-</span>
                  <span>Hide form</span>
                </Button>
                <Button
                  id="toggle-map-fullscreen"
                  type="button"
                  aria-controls="map"
                  aria-expanded="false"
                  className={mapControlButtonClass}
                  color="alternative"
                  size="xs"
                >
                  <span className={mapControlIconClass} aria-hidden="true">[]</span>
                  <span>Fullscreen</span>
                </Button>
              </div>
            </div>

            <div className="map-stage">
              <form
                id="process-form"
                aria-label="Map processing controls"
                className="process-form-panel absolute left-3 top-3 z-[430] grid max-h-[calc(100%-24px)] w-[min(340px,calc(100%-24px))] gap-2 overflow-y-auto rounded-xl border border-cyan-200/20 p-3.5 text-cyan-50"
              >
              <header className="process-form-header">
                <div>
                  <span>Analysis workspace</span>
                  <strong>Process satellite grid</strong>
                </div>
                <Button className="fb-button" color="alternative" size="xs" id="close-process-form" type="button" aria-label="Close processing form">×</Button>
              </header>
              <div className={`${labelClass} process-field-full`}>
                <Label htmlFor="location">Area of interest</Label>
                <TextInput className={inputClass} sizing="sm" id="location" type="search" placeholder="Bang Kapi, Bangkok" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button className={secondaryButtonClass} color="alternative" size="sm" id="search-button" type="button">Search</Button>
                <Button className={secondaryButtonClass} color="alternative" size="sm" id="draw-box-button" type="button">Draw Box</Button>
              </div>
              <div className={`${labelClass} process-field-full`}>
                <Label htmlFor="bounds-input">Paste bounds</Label>
                <TextInput
                  className={inputClass}
                  sizing="sm"
                  id="bounds-input"
                  type="text"
                  placeholder="W 101.1635, S 13.8941, E 101.4601, N 14.4506"
                />
              </div>
              <Button className={secondaryButtonClass} color="alternative" size="sm" id="apply-bounds-button" type="button">Apply Bounds</Button>
              <div className="grid min-h-12 gap-1 rounded-md border border-cyan-200/25 bg-slate-950/80 p-2.5 text-xs text-cyan-100/70">
                <span>Selected bounds</span>
                <strong id="bbox-label" className="text-xs leading-snug text-cyan-50">No area selected</strong>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className={labelClass}>
                  <Label htmlFor="date">Start</Label>
                  <TextInput className={inputClass} sizing="sm" id="date" type="date" required />
                </div>
                <div className={labelClass}>
                  <Label htmlFor="end-date">End</Label>
                  <TextInput className={inputClass} sizing="sm" id="end-date" type="date" required />
                </div>
              </div>
              <div className={`${labelClass} process-field-full`}>
                <Label htmlFor="cloud">Max cloud cover</Label>
                <TextInput className={inputClass} sizing="sm" id="cloud" type="number" min="0" max="100" defaultValue="40" />
              </div>
              <Button className={buttonClass} color="green" size="sm" type="submit">Process Grid</Button>
              <p id="status" className="m-0 text-sm leading-snug text-cyan-100/75">
                Select an area, choose a date range, then process.
              </p>
              </form>

              <div
                id="map"
                className="relative z-10 h-full min-h-0 overflow-hidden"
              />
            </div>
          </article>

          <article className={`${cardClass} dashboard-panel grid-details-panel col-start-2 col-end-4 row-span-3 overflow-y-auto`}>
            <span className="panel-eyebrow">Selection analysis</span>
            <h2 className="mb-2.5 mt-0.5 text-[15px] font-bold text-cyan-50">Selected Grid Details</h2>
            <p className="m-0 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold leading-relaxed text-cyan-50">
              <span>Grid ID: <strong id="grid-id" className="font-extrabold text-lime-200">0</strong></span>
              <span>Date: <strong id="grid-date" className="font-extrabold text-lime-200">0</strong></span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Selected grid analysis">
              {["Land Use", "Population", "Environment"].map((tab, index) => (
                <Button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={index === 0 ? "true" : "false"}
                  data-grid-detail-tab={tab.toLowerCase().replace(" ", "-")}
                  className={`${detailTabButtonClass} ${index === 0 ? "selected-grid-tab-active" : ""}`}
                  color="alternative"
                  size="xs"
                >
                  {tab}
                </Button>
              ))}
            </div>

            <div className="mt-3">
              <section data-grid-detail-panel="land-use" role="tabpanel">
                <div className="grid grid-cols-2 gap-2 max-[620px]:grid-cols-1">
                  {[
                    ["NDBI Trends", "analysis-ndbi", "analysis-ndbi-note", "analysis-ndbi-chart"],
                    ["Land Cover Mix", "analysis-land-cover", "analysis-land-cover-note", "analysis-land-cover-chart"],
                    ["Built-up Area Trends", "analysis-built-up", "analysis-built-up-note", "analysis-built-up-chart"],
                    ["Road Density Trends", "analysis-road", "analysis-road-note", "analysis-road-chart"],
                    ["Elevation Avg", "analysis-elev-avg", "analysis-elev-avg-note", "analysis-elev-avg-chart"],
                    ["Elevation Min", "analysis-elev-min", "analysis-elev-min-note", "analysis-elev-min-chart"],
                    ["Elevation Max", "analysis-elev-max", "analysis-elev-max-note", "analysis-elev-max-chart"],
                  ].map(([label, valueId, noteId, chartId]) => (
                    <div className={detailMetricClass} key={valueId}>
                      <span className={detailMetricLabelClass}>{label}</span>
                      <strong id={valueId} className={detailMetricValueClass}>0</strong>
                      <span id={noteId} className={detailMetricNoteClass}>No grid selected</span>
                      {chartId === "analysis-land-cover-chart" ? (
                        <div className="h-32 min-w-0">
                          <canvas id={chartId} />
                        </div>
                      ) : (
                        <div id={chartId} className="h-20 min-w-0" />
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="hidden" data-grid-detail-panel="population" role="tabpanel">
                <div className="grid grid-cols-2 gap-2 max-[620px]:grid-cols-1">
                  <div className={detailMetricClass}>
                    <span className={detailMetricLabelClass}>Population Trend</span>
                    <strong id="analysis-population" className={detailMetricValueClass}>0</strong>
                    <span id="analysis-population-note" className={detailMetricNoteClass}>No grid selected</span>
                    <div className="h-32 min-w-0">
                      <canvas id="analysis-population-chart" />
                    </div>
                  </div>
                </div>
              </section>

              <section className="hidden" data-grid-detail-panel="environment" role="tabpanel">
                <div className="grid grid-cols-2 gap-2 max-[620px]:grid-cols-1">
                  {[
                    ["NDVI Trends", "analysis-ndvi", "analysis-ndvi-note", "analysis-ndvi-chart"],
                    ["Green Cover Trends", "analysis-green", "analysis-green-note", "analysis-green-chart"],
                  ].map(([label, valueId, noteId, chartId]) => (
                    <div className={detailMetricClass} key={valueId}>
                      <span className={detailMetricLabelClass}>{label}</span>
                      <strong id={valueId} className={detailMetricValueClass}>0</strong>
                      <span id={noteId} className={detailMetricNoteClass}>No grid selected</span>
                      {chartId === "analysis-ndvi-chart" ? (
                        <div className="h-32 min-w-0">
                          <canvas id={chartId} />
                        </div>
                      ) : chartId === "analysis-green-chart" ? (
                        <div className="h-32 min-w-0">
                          <canvas id={chartId} />
                        </div>
                      ) : (
                        <div id={chartId} className="h-24 min-w-0" />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </article>

        </section>

        <div className="hidden" aria-hidden="true">
          <span id="change-label">Daily change</span>
          <strong id="avg-ndvi">0</strong>
          <strong id="min-ndvi">0</strong>
          <strong id="max-ndvi">0</strong>
          <strong id="change-ndvi">0</strong>
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
          <div id="trend" />
          <div id="metadata">
            <div>
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
