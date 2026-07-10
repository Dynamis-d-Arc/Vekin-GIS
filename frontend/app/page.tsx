import { ApiConfig } from "./api-config";
import { MapRuntime } from "./map-runtime";

const navItems = ["Overview", "Land Use", "Population", "Environment", "Reports"];

const kpis = [
  ["POP", "Population", "population-count", "0", "0% vs last year", ""],
  ["BLD", "Built-up Area", "built-up-area", "0", "0% vs last year", " km2"],
  ["NDV", "Green Cover", "green-cover", "0", "0% vs last year", ""],
  ["RD", "Road Density", "road-density", "0", "0% vs last year", " km/km2"],
];

const gridDetails = [
  ["Grid ID", "grid-id"],
  ["Date", "grid-date"],
  ["NDBI", "grid-ndbi"],
  ["Elevation avg", "grid-elev-avg"],
  ["Elevation min", "grid-elev-min"],
  ["Elevation max", "grid-elev-max"],
  ["Land cover", "grid-land-cover"],
];

const inputClass =
  "min-h-8 w-full rounded-md border border-cyan-200/25 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-emerald-300";
const labelClass = "grid gap-1.5 text-xs font-bold text-cyan-100/70";
const buttonClass =
  "min-h-9 rounded-md bg-emerald-700 px-3 text-sm font-extrabold text-white transition hover:bg-emerald-600";
const secondaryButtonClass =
  "min-h-9 rounded-md border border-cyan-200/20 bg-sky-950/90 px-3 text-sm font-extrabold text-cyan-50 transition hover:bg-emerald-700";
const cardClass =
  "min-w-0 overflow-hidden rounded-lg border border-cyan-200/25 bg-gradient-to-b from-sky-950/90 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_30px_rgba(0,0,0,0.18)]";
const fieldClass =
  "grid min-h-14 min-w-0 content-start gap-1 rounded-md border border-cyan-200/15 bg-slate-950/60 p-2 text-xs text-cyan-100/70";
const mapControlButtonClass =
  "group inline-flex h-7 items-center gap-1 rounded border border-cyan-100/20 bg-cyan-950/55 px-2 text-[11px] font-bold text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-lime-200/45 hover:bg-emerald-700/90 focus:outline-none focus:ring-1 focus:ring-lime-200/60";
const mapControlIconClass =
  "grid h-4 w-4 place-items-center rounded-sm border border-cyan-100/15 bg-slate-950/45 text-[9px] leading-none text-lime-200 transition group-hover:border-lime-200/35";

export default function MapPage() {
  return (
    <main className="grid h-screen min-h-screen grid-cols-[220px_minmax(0,1fr)] overflow-hidden bg-[radial-gradient(circle_at_80%_0%,rgba(55,111,143,0.22),transparent_34%),linear-gradient(135deg,#031927_0%,#062239_48%,#02131f_100%)] text-cyan-50 max-[900px]:grid-cols-1">
      <aside className="grid min-h-screen content-start gap-4 overflow-y-auto overflow-x-hidden border-r border-cyan-200/25 bg-slate-950/70 p-3 shadow-[10px_0_26px_rgba(0,0,0,0.2)]">
        <div className="flex items-center gap-3 p-2">
          <div className="grid h-11 w-11 place-items-center rounded-lg border border-cyan-200/30 bg-gradient-to-br from-sky-900 to-slate-950 text-xs font-black text-lime-300">
            UI
          </div>
          <div>
            <span className="text-xs text-cyan-100/65">Vekin GIS</span>
            <strong className="mt-0.5 block text-[17px] text-cyan-50">Urban Insights</strong>
          </div>
        </div>

        <nav className="grid gap-2" aria-label="Urban dashboard sections">
          {navItems.map((item, index) => (
            <a
              key={item}
              className={`grid min-h-9 grid-cols-[28px_1fr] items-center justify-start gap-2 rounded-md border px-4 text-sm font-extrabold no-underline transition ${
                index === 0
                  ? "border-lime-200/40 bg-gradient-to-r from-green-600 to-green-700 text-white"
                  : "border-transparent bg-transparent text-cyan-50 hover:border-lime-200/40 hover:bg-green-700 hover:text-white"
              }`}
              href={item === "Reports" ? "/dashboard" : "#"}
            >
              <span className="grid h-6 w-6 place-items-center rounded bg-sky-950 text-[10px] text-cyan-200">
                {item.slice(0, 2).toUpperCase()}
              </span>
              {item}
            </a>
          ))}
        </nav>
      </aside>

      <section className="grid h-screen min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5 overflow-hidden p-3">
        <section className="grid grid-cols-4 gap-2 max-[900px]:grid-cols-2" aria-label="Urban monitoring summary">
          {kpis.map(([icon, label, id, fallback, note, suffix], index) => (
            <div
              className="grid min-h-24 grid-cols-[50px_1fr] grid-rows-[auto_auto_auto] gap-x-3 rounded-lg border border-cyan-200/25 bg-gradient-to-b from-sky-950/90 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_30px_rgba(0,0,0,0.18)]"
              key={id}
            >
              <span
                className={`row-span-3 grid h-11 w-11 place-items-center self-center rounded-lg border border-cyan-200/25 bg-sky-950 text-[11px] font-black ${
                  index === 2 ? "text-lime-300" : "text-cyan-50"
                }`}
              >
                {icon}
              </span>
              <small className="text-xs text-cyan-100/65">{label}</small>
              <strong className="text-[clamp(22px,2.4vw,33px)] leading-none text-white">
                <span id={id}>{fallback}</span>
                {suffix}
              </strong>
              <em className={`text-xs not-italic ${index === 2 ? "text-red-300" : "text-lime-300"}`}>{note}</em>
            </div>
          ))}
        </section>

        <section className="grid min-h-0 grid-cols-[minmax(480px,1.55fr)_minmax(260px,0.85fr)_minmax(260px,0.85fr)] grid-rows-[minmax(0,0.85fr)_minmax(0,1.25fr)_minmax(0,0.9fr)] gap-2">
          <article id="map-card" className={`${cardClass} relative row-span-3`}>
            <div className="flex items-center justify-between gap-2.5">
              <h2 className="mb-2.5 text-[15px] font-bold text-cyan-50">Land Use / Land Cover</h2>
              <div className="flex items-center gap-2">
                <span id="urban-context-title" className="text-xs text-cyan-100/65">Urban Context</span>
                <button
                  id="toggle-process-form"
                  type="button"
                  aria-controls="process-form"
                  aria-expanded="true"
                  className={mapControlButtonClass}
                >
                  <span className={mapControlIconClass} aria-hidden="true">-</span>
                  <span>Hide form</span>
                </button>
                <button
                  id="toggle-map-fullscreen"
                  type="button"
                  aria-controls="map"
                  aria-expanded="false"
                  className={mapControlButtonClass}
                >
                  <span className={mapControlIconClass} aria-hidden="true">[]</span>
                  <span>Fullscreen</span>
                </button>
              </div>
            </div>

            <form
              id="process-form"
              className="absolute left-5 top-12 z-[430] grid max-h-[calc(100%-72px)] w-[min(330px,calc(100%-44px))] gap-2 overflow-y-auto rounded-lg border border-cyan-200/25 bg-slate-950/85 p-3 text-cyan-50 shadow-[0_16px_34px_rgba(0,0,0,0.28)] backdrop-blur-md max-[900px]:left-4 max-[900px]:w-[min(320px,calc(100%-32px))] max-[520px]:inset-x-3 max-[520px]:w-auto max-[520px]:max-h-[calc(100%-64px)]"
            >
              <label className={labelClass}>
                Area of interest
                <input className={inputClass} id="location" type="search" placeholder="Bang Kapi, Bangkok" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button className={secondaryButtonClass} id="search-button" type="button">Search</button>
                <button className={secondaryButtonClass} id="draw-box-button" type="button">Draw Box</button>
              </div>
              <label className={labelClass}>
                Paste bounds
                <input
                  className={inputClass}
                  id="bounds-input"
                  type="text"
                  placeholder="W 101.1635, S 13.8941, E 101.4601, N 14.4506"
                />
              </label>
              <button className={secondaryButtonClass} id="apply-bounds-button" type="button">Apply Bounds</button>
              <div className="grid min-h-12 gap-1 rounded-md border border-cyan-200/25 bg-slate-950/80 p-2.5 text-xs text-cyan-100/70">
                <span>Selected bounds</span>
                <strong id="bbox-label" className="text-xs leading-snug text-cyan-50">No area selected</strong>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={labelClass}>
                  Start
                  <input className={inputClass} id="date" type="date" required />
                </label>
                <label className={labelClass}>
                  End
                  <input className={inputClass} id="end-date" type="date" required />
                </label>
              </div>
              <label className={labelClass}>
                Max cloud cover
                <input className={inputClass} id="cloud" type="number" min="0" max="100" defaultValue="40" />
              </label>
              <button className={buttonClass} type="submit">Process Grid</button>
              <button className={secondaryButtonClass} id="change-detection-button" type="button">
                Show Change Layer
              </button>
              <p id="status" className="m-0 text-sm leading-snug text-cyan-100/75">
                Select an area, choose a date range, then process.
              </p>
            </form>

            <div
              id="map"
              className="relative z-10 h-[calc(100%-32px)] min-h-0 overflow-hidden rounded-md border border-cyan-200/25"
            />
          </article>

          <article className={`${cardClass} col-start-2 col-end-4 row-span-2 overflow-y-auto`}>
            <h2 className="mb-2.5 text-[15px] font-bold text-cyan-50">Selected Grid Details</h2>
            <div className="grid grid-cols-[repeat(3,minmax(130px,1fr))] gap-2">
              {gridDetails.map(([label, id]) => (
                <span className={fieldClass} key={id}>
                  {label}
                  <strong id={id} className="[overflow-wrap:anywhere] text-[15px] leading-tight text-cyan-50">0</strong>
                </span>
              ))}
              <span className={`${fieldClass} col-span-full`}>
                Cover mix
                <strong id="grid-cover-mix" className="[overflow-wrap:anywhere] text-[15px] leading-tight text-cyan-50">
                  0
                </strong>
              </span>
            </div>
          </article>

          <article className={`${cardClass} col-start-2 col-end-4`}>
            <h2 className="mb-2.5 text-[15px] font-bold text-cyan-50">Environmental Indicators</h2>
            <div className="grid grid-cols-4 gap-2">
              {[
                ["Avg. NDVI", "avg-ndvi", "placeholder"],
                ["Minimum NDVI", "min-ndvi", "placeholder"],
                ["Maximum NDVI", "max-ndvi", "placeholder"],
                ["Daily change", "change-ndvi", "placeholder"],
              ].map(([label, id, note]) => (
                <div className="grid min-h-0 gap-1 rounded-md border border-cyan-200/15 bg-slate-950/60 p-2" key={id}>
                  <span id={id === "change-ndvi" ? "change-label" : undefined} className="text-xs text-cyan-100/65">
                    {label}
                  </span>
                  <strong id={id} className="text-lg text-lime-300">0</strong>
                  <em className="text-[11px] not-italic text-red-300">{note}</em>
                </div>
              ))}
            </div>
          </article>
        </section>

        <div className="hidden" aria-hidden="true">
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
