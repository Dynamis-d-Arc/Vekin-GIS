"use client";

import { useEffect } from "react";
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
  }
}

let bootPromise: Promise<void> | null = null;

function bootMap() {
  if (bootPromise) return bootPromise;
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
  bootPromise = import("leaflet").then((leafletModule) => {
    window.L = leafletModule;
    window.L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    return new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `/app.js?v=${Date.now()}`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Unable to load the map runtime."));
      document.body.appendChild(script);
    });
  });
  return bootPromise;
}

export function MapRuntime() {
  useEffect(() => {
    bootMap().catch((error) => {
      const status = document.getElementById("status");
      if (status) status.textContent = error.message;
    });
  }, []);

  return null;
}
