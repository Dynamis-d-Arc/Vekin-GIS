"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type * as Leaflet from "leaflet";
import {
  Chart,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";

declare global {
  interface Window {
    L: typeof Leaflet;
    Chart: typeof Chart;
    __VEKIN_MAP_RUNTIME_PATH__?: string;
  }
}

let libraryBootPromise: Promise<void> | null = null;

function bootMapLibraries() {
  if (libraryBootPromise) return libraryBootPromise;
  Chart.register(
    ArcElement,
    BarController,
    BarElement,
    CategoryScale,
    DoughnutController,
    Filler,
    Legend,
    LineController,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip,
  );
  window.Chart = Chart;
  libraryBootPromise = import("leaflet").then((leafletModule) => {
    window.L = leafletModule;
    window.L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    return undefined;
  });
  return libraryBootPromise;
}

function runMapRuntime(pathname: string) {
  return new Promise<void>((resolve, reject) => {
    const existingMap = document.querySelector("#map .leaflet-container");
    if (window.__VEKIN_MAP_RUNTIME_PATH__ === pathname && existingMap) {
      resolve();
      return;
    }

    document.getElementById("vekin-map-runtime-script")?.remove();
    window.__VEKIN_MAP_RUNTIME_PATH__ = pathname;

    const script = document.createElement("script");
    script.id = "vekin-map-runtime-script";
    script.src = `/app.js?v=${Date.now()}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load the map runtime."));
    document.body.appendChild(script);
  });
}

export function MapRuntime() {
  const pathname = usePathname();

  useEffect(() => {
    bootMapLibraries()
      .then(() => runMapRuntime(pathname))
      .catch((error) => {
      const status = document.getElementById("status");
      if (status) status.textContent = error.message;
    });
  }, [pathname]);

  return null;
}
