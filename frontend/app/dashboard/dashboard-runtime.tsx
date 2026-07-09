"use client";

import { useEffect } from "react";
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
  PieController,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
} from "chart.js";

declare global {
  interface Window {
    Chart: typeof Chart;
  }
}

let bootPromise: Promise<void> | null = null;

function bootDashboard() {
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
    PieController,
    PointElement,
    RadarController,
    RadialLinearScale,
    Tooltip,
  );
  window.Chart = Chart;

  bootPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/dashboard.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load the dashboard runtime."));
    document.body.appendChild(script);
  });
  return bootPromise;
}

export function DashboardRuntime() {
  useEffect(() => {
    bootDashboard().catch((error) => {
      const status = document.getElementById("dashboard-status");
      if (status) status.textContent = error.message;
    });
  }, []);

  return null;
}
