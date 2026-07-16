"use client";

import { useEffect } from "react";
import "cesium/Build/Cesium/Widgets/widgets.css";

type CesiumGlobal = typeof import("cesium");
type GridGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};
type GridFeature = {
  type: "Feature";
  geometry: GridGeometry;
  properties?: {
    grid_id?: string;
    average_ndvi?: number | null;
    average_elevation?: number | null;
    population_count?: number | null;
    dominant_land_cover_class?: number | string | null;
    land_cover_percentages?: Record<string, number> | null;
    land_cover_year?: number | null;
  };
};
type GridCollection = {
  type: "FeatureCollection";
  features?: GridFeature[];
};
type GridStyle = "ndvi" | "land-cover";
type BuildingDisplayMode = "solid" | "border";
type BuildingType = "farm" | "cooperative" | "dpo" | "middle-man" | "processor" | "warehouse" | "retailer" | "end-product";
type Boundary = {
  west: number;
  south: number;
  east: number;
  north: number;
};
type CowPoint = {
  id: string;
  longitude: number;
  latitude: number;
  label: string;
  representedCount: number;
  farmLabel: string;
};
type FootprintGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};
type FarmMetrics = {
  cowCount?: number;
  herdType?: "dairy" | "beef" | "mixed";
  dailyOutputKg?: number;
  co2eKgPerDay?: number;
};
type SupplyChainStop = {
  id?: string;
  type: BuildingType;
  name?: string;
  geometry: FootprintGeometry;
  farmMetrics?: FarmMetrics;
};
type RouteCenter = {
  longitude: number;
  latitude: number;
  height: number;
  label: string;
  stopId?: string;
  stopIndex: number;
  stopType: BuildingType;
};
type RouteLeg = {
  id: string;
  from: RouteCenter;
  to: RouteCenter;
  label: string;
  direction: "inbound" | "outbound" | "chain";
};
type RoadRouteResult = {
  positions: import("cesium").Cartesian3[];
  snappedCount: number;
  maxSnapDistanceMeters: number;
};

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
    Cesium?: CesiumGlobal;
  }
}

const DEFAULT_LATITUDE = 14.975972;
const DEFAULT_LONGITUDE = 101.42225;
const RURAL_ROAD_SNAP_RADIUS_METERS = 2500;
const ROUTE_LINE_HEIGHT_METERS = 260;
const AVERAGE_TRUCK_CO2E_KG_PER_KM = 0.9;
const COW_MODEL_URI = "/models/GLB_Cow.glb";
const COWS_PER_MODEL = 5;
const MAX_COW_MODELS_PER_FARM = 200;

type TerrainRequest = {
  west: number;
  south: number;
  east: number;
  north: number;
  centerLatitude: number;
  centerLongitude: number;
  cameraHeight: number;
  label: string;
  hasBounds: boolean;
  overlayWest: number;
  overlaySouth: number;
  overlayEast: number;
  overlayNorth: number;
  landCoverUrl: string | null;
  demUrl: string | null;
  demTerrainUrl: string | null;
  footprint: FootprintGeometry | null;
  buildingType: BuildingType;
  route: SupplyChainStop[];
};
let cesiumScriptPromise: Promise<CesiumGlobal> | null = null;

function loadCesiumScript() {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (cesiumScriptPromise) return cesiumScriptPromise;

  window.CESIUM_BASE_URL = "/cesium";
  cesiumScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/cesium/Cesium.js";
    script.async = true;
    script.onload = () => {
      if (window.Cesium) {
        resolve(window.Cesium);
      } else {
        reject(new Error("Cesium global was not created."));
      }
    };
    script.onerror = () => reject(new Error("Unable to load /cesium/Cesium.js."));
    document.head.appendChild(script);
  });

  return cesiumScriptPromise;
}

function cesiumIonToken() {
  return process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || "";
}

function apiBase() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function finiteParam(params: URLSearchParams, key: string) {
  const value = Number(params.get(key));
  return Number.isFinite(value) ? value : null;
}

function buildingTypeFromValue(value: string | null): BuildingType {
  if (value === "processor") return "cooperative";
  if (value === "retailer") return "dpo";
  if (
    value === "cooperative"
    || value === "dpo"
    || value === "middle-man"
    || value === "warehouse"
    || value === "end-product"
  ) return value;
  return "farm";
}

function parseFootprint(value: string | null): FootprintGeometry | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as FootprintGeometry;
    if (parsed?.type !== "Polygon" && parsed?.type !== "MultiPolygon") return null;
    if (!Array.isArray(parsed.coordinates)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseSupplyChainRoute(value: string | null): SupplyChainStop[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((stop, index) => {
      if (!stop || typeof stop !== "object") return [];
      const candidate = stop as { id?: string; type?: string; name?: string; geometry?: FootprintGeometry; farmMetrics?: FarmMetrics };
      const geometry = candidate.geometry;
      if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return [];
      const type = buildingTypeFromValue(candidate.type || null);
      return [{
        id: candidate.id || `route-stop-${index + 1}`,
        type,
        name: candidate.name,
        geometry,
        ...(type === "farm" ? { farmMetrics: normalizeFarmMetrics(candidate.farmMetrics) } : {}),
      }];
    });
  } catch {
    return [];
  }
}

function normalizeFarmMetrics(metrics: FarmMetrics | undefined): FarmMetrics {
  const normalized: FarmMetrics = {};
  const cowCount = Number(metrics?.cowCount);
  const dailyOutputKg = Number(metrics?.dailyOutputKg);
  const co2eKgPerDay = Number(metrics?.co2eKgPerDay);
  if (Number.isFinite(cowCount) && cowCount >= 0) normalized.cowCount = cowCount;
  if (metrics?.herdType === "dairy" || metrics?.herdType === "beef" || metrics?.herdType === "mixed") {
    normalized.herdType = metrics.herdType;
  }
  if (Number.isFinite(dailyOutputKg) && dailyOutputKg >= 0) normalized.dailyOutputKg = dailyOutputKg;
  if (Number.isFinite(co2eKgPerDay) && co2eKgPerDay >= 0) normalized.co2eKgPerDay = co2eKgPerDay;
  return normalized;
}

function farmMetricsSummary(metrics: FarmMetrics | undefined) {
  if (!metrics) return "";
  const parts = [];
  if (Number.isFinite(metrics.cowCount)) parts.push(`Cows: ${metrics.cowCount!.toLocaleString()}`);
  if (metrics.herdType) parts.push(`Herd: ${metrics.herdType}`);
  if (Number.isFinite(metrics.dailyOutputKg)) parts.push(`Output: ${metrics.dailyOutputKg!.toLocaleString()} kg/day`);
  if (Number.isFinite(metrics.co2eKgPerDay)) parts.push(`CO2e: ${metrics.co2eKgPerDay!.toLocaleString()} kg/day`);
  return parts.join(" | ");
}

function farmLabelText(label: string, metrics: FarmMetrics | undefined) {
  const cowText = Number.isFinite(metrics?.cowCount) ? ` | ${metrics!.cowCount!.toLocaleString()} cows` : "";
  return `${label}${cowText}`;
}

function terrainRequestFromUrl(): TerrainRequest {
  const params = new URLSearchParams(window.location.search);
  const west = finiteParam(params, "west");
  const south = finiteParam(params, "south");
  const east = finiteParam(params, "east");
  const north = finiteParam(params, "north");
  const overlayWest = finiteParam(params, "overlay_west");
  const overlaySouth = finiteParam(params, "overlay_south");
  const overlayEast = finiteParam(params, "overlay_east");
  const overlayNorth = finiteParam(params, "overlay_north");
  const hasBounds = [west, south, east, north].every((value) => value !== null)
    && west! < east!
    && south! < north!;
  const hasOverlayBounds = [overlayWest, overlaySouth, overlayEast, overlayNorth].every((value) => value !== null)
    && overlayWest! < overlayEast!
    && overlaySouth! < overlayNorth!;
  const footprint = parseFootprint(params.get("footprint"));
  const buildingType = buildingTypeFromValue(params.get("building_type"));
  const route = parseSupplyChainRoute(params.get("route"));

  if (hasBounds) {
    const width = east! - west!;
    const height = north! - south!;
    const span = Math.max(width, height);
    return {
      west: west!,
      south: south!,
      east: east!,
      north: north!,
      centerLongitude: (west! + east!) / 2,
      centerLatitude: (south! + north!) / 2,
      cameraHeight: clamp(span * 165000, 1400, 20000),
      label: params.get("label") || "Processed selected area",
      hasBounds,
      overlayWest: hasOverlayBounds ? overlayWest! : west!,
      overlaySouth: hasOverlayBounds ? overlaySouth! : south!,
      overlayEast: hasOverlayBounds ? overlayEast! : east!,
      overlayNorth: hasOverlayBounds ? overlayNorth! : north!,
      landCoverUrl: params.get("land_cover_url"),
      demUrl: params.get("dem_url"),
      demTerrainUrl: params.get("dem_terrain_url"),
      footprint,
      buildingType,
      route,
    };
  }

  return {
    west: DEFAULT_LONGITUDE - 0.04,
    south: DEFAULT_LATITUDE - 0.03,
    east: DEFAULT_LONGITUDE + 0.04,
    north: DEFAULT_LATITUDE + 0.03,
    centerLongitude: DEFAULT_LONGITUDE,
    centerLatitude: DEFAULT_LATITUDE,
    cameraHeight: 4200,
    label: "Preview terrain",
    hasBounds: false,
    overlayWest: hasOverlayBounds ? overlayWest! : DEFAULT_LONGITUDE - 0.04,
    overlaySouth: hasOverlayBounds ? overlaySouth! : DEFAULT_LATITUDE - 0.03,
    overlayEast: hasOverlayBounds ? overlayEast! : DEFAULT_LONGITUDE + 0.04,
    overlayNorth: hasOverlayBounds ? overlayNorth! : DEFAULT_LATITUDE + 0.03,
    landCoverUrl: params.get("land_cover_url"),
    demUrl: params.get("dem_url"),
    demTerrainUrl: params.get("dem_terrain_url"),
    footprint,
    buildingType,
    route,
  };
}

function finiteNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function ndviColor(Cesium: CesiumGlobal, value: unknown) {
  if (value === null || value === undefined) {
    return Cesium.Color.fromCssColorString("#cbd5cf").withAlpha(0.34);
  }
  const ndvi = finiteNumber(value, Number.NaN);
  if (!Number.isFinite(ndvi)) return Cesium.Color.fromCssColorString("#cbd5cf").withAlpha(0.34);
  if (ndvi < 0.15) return Cesium.Color.fromCssColorString("#b8542f").withAlpha(0.44);
  if (ndvi < 0.3) return Cesium.Color.fromCssColorString("#d99441").withAlpha(0.44);
  if (ndvi < 0.45) return Cesium.Color.fromCssColorString("#d8c64b").withAlpha(0.44);
  if (ndvi < 0.6) return Cesium.Color.fromCssColorString("#77a95d").withAlpha(0.44);
  return Cesium.Color.fromCssColorString("#1b7f5a").withAlpha(0.44);
}

function landCoverColor(Cesium: CesiumGlobal, value: unknown) {
  const classValue = Number(value);
  const colors: Record<number, string> = {
    10: "rgba(0, 100, 0, 0.42)",
    20: "rgba(255, 187, 34, 0.40)",
    30: "rgba(255, 255, 76, 0.38)",
    40: "rgba(240, 150, 255, 0.40)",
    50: "rgba(250, 0, 0, 0.42)",
    60: "rgba(180, 180, 180, 0.38)",
    70: "rgba(240, 240, 240, 0.38)",
    80: "rgba(0, 100, 200, 0.42)",
    90: "rgba(0, 150, 160, 0.40)",
    95: "rgba(0, 207, 117, 0.40)",
    100: "rgba(250, 230, 160, 0.38)",
  };
  return Cesium.Color.fromCssColorString(colors[classValue] || "rgba(125, 211, 252, 0.22)");
}

function landCoverLabel(value: unknown) {
  const labels: Record<number, string> = {
    10: "Tree cover",
    20: "Shrubland",
    30: "Grassland",
    40: "Cropland",
    50: "Built-up",
    60: "Bare / sparse",
    70: "Snow / ice",
    80: "Water",
    90: "Wetland",
    95: "Mangroves",
    100: "Moss / lichen",
  };
  const classValue = Number(value);
  return labels[classValue] || (value === null || value === undefined ? "Unknown land cover" : `Class ${value}`);
}

function gridMaterial(Cesium: CesiumGlobal, feature: GridFeature, style: GridStyle) {
  if (style === "land-cover") {
    return landCoverColor(Cesium, feature.properties?.dominant_land_cover_class);
  }
  return ndviColor(Cesium, feature.properties?.average_ndvi);
}

function gridEntityName(feature: GridFeature, style: GridStyle) {
  const gridId = feature.properties?.grid_id || "Grid cell";
  if (style === "land-cover") {
    return `${gridId} - ${landCoverLabel(feature.properties?.dominant_land_cover_class)}`;
  }
  return gridId;
}

function proxiedImageUrl(url: string) {
  if (url.startsWith("http://localhost:8000") || url.startsWith("http://127.0.0.1:8000")) {
    return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1):8000/, apiBase());
  }
  return url;
}

function roadNearestUrl(center: RouteCenter) {
  return `https://router.project-osrm.org/nearest/v1/driving/${center.longitude.toFixed(6)},${center.latitude.toFixed(6)}?number=1`;
}

function roadRouteUrl(centers: RouteCenter[]) {
  const coordinates = centers
    .map((center) => `${center.longitude.toFixed(6)},${center.latitude.toFixed(6)}`)
    .join(";");
  const radiuses = centers.map(() => String(RURAL_ROAD_SNAP_RADIUS_METERS)).join(";");
  return `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&radiuses=${radiuses}&continue_straight=false`;
}

function routePositionsFromCenters(Cesium: CesiumGlobal, centers: RouteCenter[]) {
  return Cesium.Cartesian3.fromDegreesArrayHeights(
    centers.flatMap((center) => [center.longitude, center.latitude, center.height + ROUTE_LINE_HEIGHT_METERS]),
  );
}

function routeDistanceMeters(Cesium: CesiumGlobal, positions: import("cesium").Cartesian3[]) {
  return positions.slice(1).reduce((total, position, index) => {
    const previous = positions[index];
    return previous ? total + Cesium.Cartesian3.distance(previous, position) : total;
  }, 0);
}

function formatRouteDistance(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return "Distance pending";
  const kilometers = meters / 1000;
  return kilometers >= 10
    ? `${Math.round(kilometers).toLocaleString()} km`
    : `${kilometers.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
}

function formatRouteCarbon(co2eKg: number) {
  if (!Number.isFinite(co2eKg) || co2eKg <= 0) return "0 kg CO2e";
  if (co2eKg >= 1000) {
    return `${(co2eKg / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} t CO2e`;
  }
  return `${Math.round(co2eKg).toLocaleString()} kg CO2e`;
}

function routeSpanLabel(routeLegs: RouteLeg[], routeStops: SupplyChainStop[]) {
  if (!routeLegs.length) return "Source to destination pending";
  const hubIndex = supplyNetworkHubIndex(routeStops);
  if (hubIndex >= 0) {
    const inboundCount = routeLegs.filter((leg) => leg.direction === "inbound").length;
    const outboundCount = routeLegs.filter((leg) => leg.direction === "outbound").length;
    const hubLabel = routeLegs.find((leg) => leg.direction === "inbound")?.to.label
      || routeLegs.find((leg) => leg.direction === "outbound")?.from.label
      || routeStops[hubIndex]?.name
      || buildingTypeLabel(routeStops[hubIndex]?.type || "cooperative");
    const sourceLabel = inboundCount === 1
      ? routeLegs.find((leg) => leg.direction === "inbound")?.from.label || "1 source"
      : `${inboundCount.toLocaleString()} sources`;
    const destinationLabel = outboundCount === 1
      ? routeLegs.find((leg) => leg.direction === "outbound")?.to.label || "1 destination"
      : `${outboundCount.toLocaleString()} destinations`;
    return `${sourceLabel} to ${hubLabel} to ${destinationLabel}`;
  }
  const firstLeg = routeLegs[0]!;
  const lastLeg = routeLegs[routeLegs.length - 1]!;
  return `${firstLeg.from.label} to ${lastLeg.to.label}`;
}

function routeLegSpanLabel(leg: RouteLeg) {
  return `${leg.from.label} to ${leg.to.label}`;
}

function supplyNetworkHubIndex(stops: SupplyChainStop[]) {
  const primaryHubIndex = stops.findIndex((stop) => stop.type === "cooperative" || stop.type === "processor");
  if (primaryHubIndex >= 0) return primaryHubIndex;
  const secondaryHubIndex = stops.findIndex((stop) => stop.type === "warehouse" || stop.type === "middle-man");
  return secondaryHubIndex >= 0 ? secondaryHubIndex : -1;
}

function routeLegsFromCenters(centers: RouteCenter[], stops: SupplyChainStop[]): RouteLeg[] {
  if (centers.length < 2) return [];
  const hubIndex = supplyNetworkHubIndex(stops);
  const hub = hubIndex >= 0 ? centers.find((center) => center.stopIndex === hubIndex) : null;
  if (!hub) {
    return centers.slice(0, -1).map((from, index) => {
      const to = centers[index + 1]!;
      return {
        id: `chain-${index + 1}`,
        from,
        to,
        label: `${from.label} to ${to.label}`,
        direction: "chain",
      };
    });
  }

  return centers
    .filter((center) => center !== hub)
    .map((center) => {
      const isSource = center.stopType === "farm" || center.stopType === "middle-man";
      const isDestination = center.stopType === "dpo" || center.stopType === "retailer" || center.stopType === "end-product";
      const inbound = isSource || (!isDestination && center.stopIndex < hub.stopIndex);
      const from = inbound ? center : hub;
      const to = inbound ? hub : center;
      return {
        id: `${from.stopId || from.stopIndex}-${to.stopId || to.stopIndex}`,
        from,
        to,
        label: `${from.label} to ${to.label}`,
        direction: inbound ? "inbound" : "outbound",
      };
    });
}

async function snapRouteCenterToRoad(center: RouteCenter): Promise<{ center: RouteCenter; distanceMeters: number | null }> {
  const response = await fetch(roadNearestUrl(center));
  if (!response.ok) return { center, distanceMeters: null };
  const payload = await response.json() as {
    code?: string;
    waypoints?: { distance?: number; location?: [number, number] }[];
  };
  const waypoint = payload.waypoints?.[0];
  const distanceMeters = Number(waypoint?.distance);
  const location = waypoint?.location;
  if (
    payload.code !== "Ok"
    || !Array.isArray(location)
    || !Number.isFinite(distanceMeters)
    || distanceMeters > RURAL_ROAD_SNAP_RADIUS_METERS
  ) {
    return { center, distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : null };
  }
  return {
    center: {
      ...center,
      longitude: location[0],
      latitude: location[1],
    },
    distanceMeters,
  };
}

async function fetchRoadRoutePositions(Cesium: CesiumGlobal, centers: RouteCenter[]): Promise<RoadRouteResult | null> {
  if (centers.length < 2) return null;
  const snapped = await Promise.all(centers.map((center) => snapRouteCenterToRoad(center)));
  const routeCenters = snapped.map((item) => item.center);
  const snapDistances = snapped
    .map((item) => item.distanceMeters)
    .filter((distance): distance is number => Number.isFinite(distance));
  const response = await fetch(roadRouteUrl(routeCenters));
  if (!response.ok) throw new Error(`Road routing returned ${response.status}`);
  const payload = await response.json() as {
    code?: string;
    routes?: { geometry?: { type?: string; coordinates?: [number, number][] } }[];
  };
  const coordinates = payload.routes?.[0]?.geometry?.coordinates;
  if (payload.code !== "Ok" || !Array.isArray(coordinates) || coordinates.length < 2) return null;
  const maxHeight = Math.max(...centers.map((center) => center.height)) + ROUTE_LINE_HEIGHT_METERS;
  return {
    positions: Cesium.Cartesian3.fromDegreesArrayHeights(
      coordinates.flatMap(([longitude, latitude]) => [longitude, latitude, maxHeight]),
    ),
    snappedCount: snapped.filter((item, index) => (
      item.center.longitude !== centers[index]!.longitude
      || item.center.latitude !== centers[index]!.latitude
    )).length,
    maxSnapDistanceMeters: snapDistances.length ? Math.max(...snapDistances) : 0,
  };
}

function buildingTypeLabel(buildingType: BuildingType) {
  if (buildingType === "middle-man") return "Middle man";
  if (buildingType === "cooperative" || buildingType === "processor") return "Cooperative";
  if (buildingType === "warehouse") return "Warehouse";
  if (buildingType === "dpo" || buildingType === "retailer") return "DPO";
  if (buildingType === "end-product") return "End product destination";
  return "Farm";
}

function stopDisplayName(stop: SupplyChainStop, fallbackLabel: string) {
  if (stop.type === "cooperative" && stop.name === "Processor") return "Cooperative";
  if (stop.type === "dpo" && stop.name === "Retailer") return "DPO";
  if (stop.type === "processor" && stop.name === "Processor") return "Cooperative";
  if (stop.type === "retailer" && stop.name === "Retailer") return "DPO";
  return stop.name || fallbackLabel;
}

function buildingStyle(Cesium: CesiumGlobal, buildingType: BuildingType) {
  if (buildingType === "middle-man") {
    return {
      label: buildingTypeLabel(buildingType),
      color: Cesium.Color.fromCssColorString("#f59e0b"),
      height: 54,
    };
  }
  if (buildingType === "cooperative" || buildingType === "processor") {
    return {
      label: buildingTypeLabel(buildingType),
      color: Cesium.Color.fromCssColorString("#a855f7"),
      height: 66,
    };
  }
  if (buildingType === "warehouse") {
    return {
      label: buildingTypeLabel(buildingType),
      color: Cesium.Color.fromCssColorString("#06b6d4"),
      height: 48,
    };
  }
  if (buildingType === "dpo" || buildingType === "retailer") {
    return {
      label: buildingTypeLabel(buildingType),
      color: Cesium.Color.fromCssColorString("#ef4444"),
      height: 58,
    };
  }
  if (buildingType === "end-product") {
    return {
      label: buildingTypeLabel(buildingType),
      color: Cesium.Color.fromCssColorString("#2563eb"),
      height: 72,
    };
  }
  return {
    label: buildingTypeLabel(buildingType),
    color: Cesium.Color.fromCssColorString("#22c55e"),
    height: 34,
  };
}

function routeStopsForRequest(request: TerrainRequest): SupplyChainStop[] {
  if (request.route.length) return request.route;
  const geometry = request.footprint || fallbackFootprint(request);
  if (!geometry) return [];
  return [{
    id: "selected-building",
    type: request.buildingType,
    name: buildingTypeLabel(request.buildingType),
    geometry,
  }];
}

function fallbackFootprint(request: TerrainRequest): FootprintGeometry | null {
  if (!request.hasBounds) return null;
  return {
    type: "Polygon",
    coordinates: [[
      [request.west, request.south],
      [request.east, request.south],
      [request.east, request.north],
      [request.west, request.north],
      [request.west, request.south],
    ]],
  };
}

function footprintRings(geometry: FootprintGeometry | null) {
  if (!geometry) return [];
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates as number[][][]]
    : geometry.coordinates as number[][][][];
  return polygons
    .map((polygon) => polygon[0])
    .filter((ring) => Array.isArray(ring) && ring.length >= 4)
    .map((ring) => {
      const sanitized = ring
        .map((point) => [Number(point[0]), Number(point[1])] as [number, number])
        .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
      const first = sanitized[0];
      const last = sanitized.at(-1);
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
        sanitized.push([...first]);
      }
      return sanitized;
    })
    .filter((ring) => ring.length >= 4);
}

function ringCentroid(ring: [number, number][]) {
  const openRing = ring.slice(0, -1);
  const coordinates = openRing.length ? openRing : ring;
  const sum = coordinates.reduce(
    (total, [longitude, latitude]) => ({
      longitude: total.longitude + longitude,
      latitude: total.latitude + latitude,
    }),
    { longitude: 0, latitude: 0 },
  );
  return {
    longitude: sum.longitude / coordinates.length,
    latitude: sum.latitude / coordinates.length,
  };
}

function footprintBounds(geometry: FootprintGeometry | null): Boundary | null {
  const points = footprintRings(geometry).flat();
  if (!points.length) return null;
  return points.reduce(
    (bounds, [longitude, latitude]) => ({
      west: Math.min(bounds.west, longitude),
      south: Math.min(bounds.south, latitude),
      east: Math.max(bounds.east, longitude),
      north: Math.max(bounds.north, latitude),
    }),
    { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity },
  );
}

function boundaryIntersects(a: Boundary, b: Boundary) {
  return a.west <= b.east
    && a.east >= b.west
    && a.south <= b.north
    && a.north >= b.south;
}

function pointInRing(longitude: number, latitude: number, ring: [number, number][]) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentLongitude, currentLatitude] = ring[current];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crossesLatitude = currentLatitude > latitude !== previousLatitude > latitude;
    if (!crossesLatitude) continue;
    const slopeLongitude = ((previousLongitude - currentLongitude) * (latitude - currentLatitude))
      / (previousLatitude - currentLatitude)
      + currentLongitude;
    if (longitude < slopeLongitude) inside = !inside;
  }
  return inside;
}

function cowPointsForFarm(stop: SupplyChainStop, stopIndex: number): CowPoint[] {
  if (stop.type !== "farm") return [];
  const cowCount = Math.max(0, Math.floor(Number(stop.farmMetrics?.cowCount) || 0));
  if (!cowCount) return [];
  const rings = footprintRings(stop.geometry);
  if (!rings.length) return [];

  const modelCount = Math.min(Math.ceil(cowCount / COWS_PER_MODEL), MAX_COW_MODELS_PER_FARM);
  const farmLabel = stop.name || buildingTypeLabel(stop.type);
  const points: CowPoint[] = [];

  rings.forEach((ring, ringIndex) => {
    if (points.length >= modelCount) return;
    const bounds = ring.reduce(
      (total, [longitude, latitude]) => ({
        west: Math.min(total.west, longitude),
        south: Math.min(total.south, latitude),
        east: Math.max(total.east, longitude),
        north: Math.max(total.north, latitude),
      }),
      { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity },
    );
    const remaining = modelCount - points.length;
    let gridSize = Math.max(2, Math.ceil(Math.sqrt(remaining * 2)));
    const maxGridSize = Math.max(gridSize, Math.ceil(Math.sqrt(modelCount)) * 8);

    while (points.length < modelCount && gridSize <= maxGridSize) {
      for (let row = 0; row < gridSize && points.length < modelCount; row += 1) {
        for (let column = 0; column < gridSize && points.length < modelCount; column += 1) {
          const longitude = bounds.west + ((column + 0.5) / gridSize) * (bounds.east - bounds.west);
          const latitude = bounds.south + ((row + 0.5) / gridSize) * (bounds.north - bounds.south);
          if (!pointInRing(longitude, latitude, ring)) continue;
          const representedCount = Math.min(COWS_PER_MODEL, cowCount - points.length * COWS_PER_MODEL);
          points.push({
            id: `cow-${stopIndex + 1}-${ringIndex + 1}-${points.length + 1}`,
            longitude,
            latitude,
            label: representedCount === 1 ? "1 cow" : `${representedCount} cows`,
            representedCount,
            farmLabel,
          });
        }
      }
      gridSize *= 2;
    }
  });

  if (!points.length) {
    const centroid = ringCentroid(rings[0]);
    const representedCount = Math.min(COWS_PER_MODEL, cowCount);
    points.push({
      id: `cow-${stopIndex + 1}-1-1`,
      longitude: centroid.longitude,
      latitude: centroid.latitude,
      label: representedCount === 1 ? "1 cow" : `${representedCount} cows`,
      representedCount,
      farmLabel,
    });
  }

  return points;
}

function cowPointsForRouteStops(stops: SupplyChainStop[]) {
  return stops.flatMap((stop, stopIndex) => cowPointsForFarm(stop, stopIndex));
}

function ringIntersectsBounds(ring: number[][], bounds: TerrainRequest) {
  return ring.some(([longitude, latitude]) => {
    return longitude >= bounds.west
      && longitude <= bounds.east
      && latitude >= bounds.south
      && latitude <= bounds.north;
  });
}

function featureIntersectsBounds(feature: GridFeature, bounds: TerrainRequest) {
  if (!bounds.hasBounds) return true;
  const footprintBoundary = footprintBounds(bounds.footprint);
  if (footprintBoundary && !bounds.route.length) {
    return polygonRings(feature).some((ring) => ringIntersectsBounds(ring, { ...bounds, ...footprintBoundary }));
  }
  if (feature.geometry.type === "Polygon") {
    return ringIntersectsBounds(feature.geometry.coordinates[0] as number[][], bounds);
  }
  return (feature.geometry.coordinates as number[][][][]).some((polygon) => {
    return ringIntersectsBounds(polygon[0], bounds);
  });
}

function polygonRings(feature: GridFeature) {
  if (feature.geometry.type === "Polygon") {
    return [feature.geometry.coordinates[0] as number[][]];
  }
  return (feature.geometry.coordinates as number[][][][]).map((polygon) => polygon[0]);
}

export function ThreeDMapRuntime() {
  useEffect(() => {
    const container = document.getElementById("three-d-map");
    const statusNode = document.getElementById("three-d-status");
    const labelNode = document.getElementById("three-d-layer-label");
    const reliefInput = document.getElementById("three-d-terrain-scale") as HTMLInputElement | null;
    const gridStyleSelect = document.getElementById("three-d-grid-style") as HTMLSelectElement | null;
    const buildingTypeSelect = document.getElementById("three-d-building-type") as HTMLSelectElement | null;
    const buildingDisplaySelect = document.getElementById("three-d-building-display") as HTMLSelectElement | null;
    const satelliteLayerInput = document.getElementById("three-d-satellite-layer") as HTMLInputElement | null;
    const elevationLayerInput = document.getElementById("three-d-elevation-layer") as HTMLInputElement | null;
    const gridOverlayInput = document.getElementById("three-d-grid-overlay") as HTMLInputElement | null;
    const selectionLayerInput = document.getElementById("three-d-selection-layer") as HTMLInputElement | null;
    const markerLayerInput = document.getElementById("three-d-marker-layer") as HTMLInputElement | null;
    const buildingLayerInput = document.getElementById("three-d-building-layer") as HTMLInputElement | null;
    const routeLayerInput = document.getElementById("three-d-route-layer") as HTMLInputElement | null;
    const shipmentLayerInput = document.getElementById("three-d-shipment-layer") as HTMLInputElement | null;
    const cowLayerInput = document.getElementById("three-d-cow-layer") as HTMLInputElement | null;
    const resetButton = document.getElementById("three-d-reset-camera");
    const rotateLeftButton = document.getElementById("three-d-rotate-left");
    const rotateRightButton = document.getElementById("three-d-rotate-right");
    const titleNode = document.getElementById("three-d-title");
    const farmPanel = document.getElementById("three-d-farm-panel");
    const farmTitleNode = document.getElementById("three-d-farm-title");
    const farmSummaryNode = document.getElementById("three-d-farm-summary");
    const routeCarbonPanel = document.getElementById("three-d-route-carbon-panel");
    const routeCarbonNode = document.getElementById("three-d-route-carbon");
    const routeSpanNode = document.getElementById("three-d-route-span");
    const routeDistanceNode = document.getElementById("three-d-route-distance");
    const routeCarbonFactorNode = document.getElementById("three-d-route-carbon-factor");

    if (!container) return;

    let disposed = false;
    let viewer: import("cesium").Viewer | null = null;
    const terrainRequest = terrainRequestFromUrl();
    let landCoverImageryLayer: import("cesium").ImageryLayer | null = null;
    const gridOverlayItems: { entity: import("cesium").Entity; feature: GridFeature }[] = [];
    const selectionEntities: import("cesium").Entity[] = [];
    const markerEntities: import("cesium").Entity[] = [];
    const buildingEntities: import("cesium").Entity[] = [];
    const buildingBorderEntities: import("cesium").Entity[] = [];
    const buildingLabelEntities: import("cesium").Entity[] = [];
    const routeEntities: import("cesium").Entity[] = [];
    const shipmentEntities: import("cesium").Entity[] = [];
    const cowEntities: import("cesium").Entity[] = [];
    if (titleNode) titleNode.textContent = terrainRequest.label;
    if (buildingTypeSelect) buildingTypeSelect.value = terrainRequest.buildingType;

    const setStatus = (message: string) => {
      if (statusNode) statusNode.textContent = message;
    };

    const start = async () => {
      setStatus("Loading CesiumJS...");
      const Cesium = await loadCesiumScript();
      if (disposed) return;

      setStatus("Starting Cesium terrain renderer...");
      if (labelNode) labelNode.textContent = "Cesium terrain";

      const token = cesiumIonToken();
      if (token) {
        Cesium.Ion.defaultAccessToken = token;
      }

      const worldTerrain = Cesium.Terrain.fromWorldTerrain({
        requestVertexNormals: true,
        requestWaterMask: true,
      });
      const flatTerrainProvider = new Cesium.EllipsoidTerrainProvider();
      const currentGridStyle = (): GridStyle => {
        return gridStyleSelect?.value === "land-cover" ? "land-cover" : "ndvi";
      };
      const currentBuildingType = (): BuildingType => {
        return buildingTypeFromValue(buildingTypeSelect?.value || terrainRequest.buildingType);
      };
      const currentBuildingDisplay = (): BuildingDisplayMode => {
        return buildingDisplaySelect?.value === "border" ? "border" : "solid";
      };

      viewer = new Cesium.Viewer(container, {
        terrain: worldTerrain,
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        shadows: true,
        shouldAnimate: true,
        baseLayer: Cesium.ImageryLayer.fromProviderAsync(
          Cesium.ArcGisMapServerImageryProvider.fromUrl(
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
          ),
        ),
      });

      viewer.scene.globe.depthTestAgainstTerrain = true;
      viewer.scene.globe.enableLighting = false;
      viewer.scene.globe.dynamicAtmosphereLighting = false;
      viewer.scene.verticalExaggeration = Number(reliefInput?.value || 2.25);
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
      viewer.scene.fog.enabled = true;
      viewer.scene.fog.density = 0.00018;
      viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
      viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.6);
      const satelliteLayer = viewer.imageryLayers.get(0);
      if (terrainRequest.landCoverUrl) {
        try {
          const landCoverProvider = await Cesium.SingleTileImageryProvider.fromUrl(
            proxiedImageUrl(terrainRequest.landCoverUrl),
            {
              rectangle: Cesium.Rectangle.fromDegrees(
                terrainRequest.overlayWest,
                terrainRequest.overlaySouth,
                terrainRequest.overlayEast,
                terrainRequest.overlayNorth,
              ),
            },
          );
          landCoverImageryLayer = viewer.imageryLayers.addImageryProvider(landCoverProvider);
          landCoverImageryLayer.alpha = 0.58;
          landCoverImageryLayer.show = false;
        } catch {
          landCoverImageryLayer = null;
        }
      }

      const target = Cesium.Cartesian3.fromDegrees(
        terrainRequest.centerLongitude,
        terrainRequest.centerLatitude,
        520,
      );
      const markerEntity = viewer.entities.add({
        position: target,
        point: {
          pixelSize: 8,
          color: Cesium.Color.LAWNGREEN.withAlpha(0.9),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      markerEntities.push(markerEntity);
      if (terrainRequest.hasBounds) {
        const selectionRings = terrainRequest.route.length
          ? terrainRequest.route.flatMap((stop) => footprintRings(stop.geometry))
          : footprintRings(terrainRequest.footprint);
        if (selectionRings.length) {
          selectionRings.forEach((ring) => {
            const selectionEntity = viewer?.entities.add({
              polygon: {
                hierarchy: Cesium.Cartesian3.fromDegreesArray(ring.flat()),
                material: Cesium.Color.LAWNGREEN.withAlpha(0.08),
                outline: true,
                outlineColor: Cesium.Color.LAWNGREEN.withAlpha(0.85),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                classificationType: Cesium.ClassificationType.TERRAIN,
              },
            });
            if (selectionEntity) selectionEntities.push(selectionEntity);
          });
        } else {
          const selectionEntity = viewer.entities.add({
            rectangle: {
              coordinates: Cesium.Rectangle.fromDegrees(
                terrainRequest.west,
                terrainRequest.south,
                terrainRequest.east,
                terrainRequest.north,
              ),
              material: Cesium.Color.LAWNGREEN.withAlpha(0.08),
              outline: true,
              outlineColor: Cesium.Color.LAWNGREEN.withAlpha(0.85),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
          selectionEntities.push(selectionEntity);
        }
      }
      const routeCenters: RouteCenter[] = [];
      const routeStops = routeStopsForRequest(terrainRequest);
      routeStops.forEach((stop, stopIndex) => {
        footprintRings(stop.geometry).forEach((ring, ringIndex) => {
          const style = buildingStyle(Cesium, stop.type);
          const label = stopDisplayName(stop, style.label);
          const farmSummary = stop.type === "farm" ? farmMetricsSummary(stop.farmMetrics) : "";
          const displayLabel = stop.type === "farm" ? farmLabelText(label, stop.farmMetrics) : label;
          const coordinates = ring.flatMap(([longitude, latitude]) => [longitude, latitude]);
          const buildingEntity = viewer?.entities.add({
            name: `${displayLabel} building`,
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(coordinates),
              material: style.color.withAlpha(0.72),
              outline: true,
              outlineColor: Cesium.Color.WHITE.withAlpha(0.8),
              height: 0,
              extrudedHeight: style.height,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            },
            properties: {
              type: "building",
              buildingType: stop.type,
              buildingHeight: style.height,
              routeIndex: stopIndex + 1,
              stopIndex,
              label,
              farmSummary,
            },
          });
          if (buildingEntity) buildingEntities.push(buildingEntity);

          const borderEntity = viewer?.entities.add({
            name: `${displayLabel} footprint border`,
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray(coordinates),
              width: 6,
              material: style.color.withAlpha(0.98),
              clampToGround: true,
              zIndex: 12,
            },
            show: false,
            properties: {
              type: "building-border",
              buildingType: stop.type,
              buildingHeight: style.height,
              routeIndex: stopIndex + 1,
              stopIndex,
              label,
              farmSummary,
            },
          });
          if (borderEntity) buildingBorderEntities.push(borderEntity);

          const centroid = ringCentroid(ring);
          if (ringIndex === 0) {
            routeCenters.push({
              longitude: centroid.longitude,
              latitude: centroid.latitude,
              height: style.height,
              label: displayLabel,
              stopId: stop.id,
              stopIndex,
              stopType: stop.type,
            });
          }
          const labelEntity = viewer?.entities.add({
            name: `${displayLabel} label`,
            position: Cesium.Cartesian3.fromDegrees(centroid.longitude, centroid.latitude, style.height + 16),
            label: {
              text: `${stopIndex + 1}. ${displayLabel}`,
              font: "800 14px sans-serif",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -10 - ringIndex * 4),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            properties: {
              type: "building-label",
              buildingType: stop.type,
              buildingHeight: style.height,
              routeIndex: stopIndex + 1,
              stopIndex,
              label,
              farmSummary,
              longitude: centroid.longitude,
              latitude: centroid.latitude,
            },
          });
          if (labelEntity) buildingLabelEntities.push(labelEntity);
        });
      });
      const routeLegs = routeLegsFromCenters(routeCenters, routeStops);
      const shipmentPaths = routeLegs.map((leg) => routePositionsFromCenters(Cesium, [leg.from, leg.to]));
      let selectedRouteLegIndex: number | null = null;
      const routeLegIndexForStop = (stopIndex: number, preference: "outbound" | "inbound" | "any" = "any") => {
        const preferredIndex = routeLegs.findIndex((leg) => {
          if (preference === "outbound") return leg.from.stopIndex === stopIndex;
          if (preference === "inbound") return leg.to.stopIndex === stopIndex;
          return false;
        });
        if (preferredIndex >= 0) return preferredIndex;
        const directIndex = routeLegs.findIndex((leg) => leg.from.stopIndex === stopIndex || leg.to.stopIndex === stopIndex);
        return directIndex >= 0 ? directIndex : null;
      };
      const routeLegIndexForBuilding = (buildingType: BuildingType, stopIndex: number) => {
        if (buildingType === "cooperative" || buildingType === "processor") {
          return routeLegIndexForStop(stopIndex, "outbound");
        }
        if (buildingType === "dpo" || buildingType === "retailer" || buildingType === "end-product") {
          return routeLegIndexForStop(stopIndex, "inbound");
        }
        return routeLegIndexForStop(stopIndex);
      };
      const updateRouteCarbonPanel = () => {
        if (!routeCarbonPanel || !routeCarbonNode || !routeSpanNode || !routeDistanceNode || !routeCarbonFactorNode) return;
        if (!routeLegs.length) {
          routeCarbonPanel.classList.add("hidden");
          return;
        }
        const selectedLeg = selectedRouteLegIndex === null ? null : routeLegs[selectedRouteLegIndex] || null;
        const distanceMeters = selectedLeg
          ? routeDistanceMeters(Cesium, shipmentPaths[selectedRouteLegIndex!] || [])
          : shipmentPaths.reduce((total, positions) => total + routeDistanceMeters(Cesium, positions), 0);
        const distanceKilometers = distanceMeters / 1000;
        const co2eKg = distanceKilometers * AVERAGE_TRUCK_CO2E_KG_PER_KM;
        routeCarbonPanel.classList.remove("hidden");
        routeCarbonNode.textContent = formatRouteCarbon(co2eKg);
        routeSpanNode.textContent = selectedLeg ? routeLegSpanLabel(selectedLeg) : routeSpanLabel(routeLegs, routeStops);
        routeDistanceNode.textContent = `${formatRouteDistance(distanceMeters)} ${selectedLeg ? "selected leg" : "total route"} distance`;
        routeCarbonFactorNode.textContent = `${AVERAGE_TRUCK_CO2E_KG_PER_KM.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg CO2e/km avg truck`;
      };
      updateRouteCarbonPanel();
      const routeVisuals = routeLegs.map((leg, legIndex) => {
        const shipmentPath = shipmentPaths[legIndex] || [];
        const routeColor = leg.direction === "inbound"
          ? Cesium.Color.RED
          : leg.direction === "outbound"
            ? Cesium.Color.ROYALBLUE
            : Cesium.Color.BLACK;
        const routeOutlineEntity = viewer?.entities.add({
          name: `Farm-to-fork road route outline: ${leg.label}`,
          polyline: {
            positions: shipmentPath,
            width: 10,
            material: Cesium.Color.WHITE.withAlpha(0.92),
            clampToGround: true,
            zIndex: 9,
          },
          properties: {
            type: "route-leg",
            routeLegIndex: legIndex,
            label: leg.label,
          },
        });
        if (routeOutlineEntity) routeEntities.push(routeOutlineEntity);

        const routeEntity = viewer?.entities.add({
          name: `Farm-to-fork road route: ${leg.label}`,
          polyline: {
            positions: shipmentPath,
            width: 5,
            material: routeColor.withAlpha(0.98),
            clampToGround: true,
            zIndex: 10,
          },
          properties: {
            type: "route-leg",
            routeLegIndex: legIndex,
            label: leg.label,
          },
        });
        if (routeEntity) routeEntities.push(routeEntity);
        return { leg, routeEntity, routeOutlineEntity, routeColor };
      });
      const updateRouteHighlight = () => {
        routeVisuals.forEach(({ routeEntity, routeOutlineEntity, routeColor }, legIndex) => {
          const isSelected = selectedRouteLegIndex === legIndex;
          const hasSelection = selectedRouteLegIndex !== null;
          if (routeOutlineEntity?.polyline) {
            routeOutlineEntity.polyline.width = new Cesium.ConstantProperty(isSelected ? 16 : hasSelection ? 7 : 10);
            routeOutlineEntity.polyline.material = new Cesium.ColorMaterialProperty(
              (isSelected ? Cesium.Color.YELLOW : Cesium.Color.WHITE).withAlpha(isSelected ? 0.96 : hasSelection ? 0.18 : 0.92),
            );
            routeOutlineEntity.polyline.zIndex = new Cesium.ConstantProperty(isSelected ? 18 : 9);
          }
          if (routeEntity?.polyline) {
            routeEntity.polyline.width = new Cesium.ConstantProperty(isSelected ? 9 : hasSelection ? 3 : 5);
            routeEntity.polyline.material = new Cesium.ColorMaterialProperty(routeColor.withAlpha(isSelected ? 1 : hasSelection ? 0.32 : 0.98));
            routeEntity.polyline.zIndex = new Cesium.ConstantProperty(isSelected ? 19 : 10);
          }
        });
        viewer?.scene.requestRender();
      };
      const selectRouteLeg = (routeLegIndex: number | null) => {
        selectedRouteLegIndex = routeLegIndex;
        updateRouteCarbonPanel();
        updateRouteHighlight();
      };
      const updateRoadRoute = async () => {
        if (!routeVisuals.length) return;
        let loadedLegs = 0;
        let snappedCount = 0;
        let maxSnapDistanceMeters = 0;
        try {
          await Promise.all(routeVisuals.map(async ({ leg, routeEntity, routeOutlineEntity }, legIndex) => {
            if (!routeEntity?.polyline) return;
            const roadRoute = await fetchRoadRoutePositions(Cesium, [leg.from, leg.to]);
            if (!roadRoute?.positions.length || disposed) return;
            shipmentPaths[legIndex] = roadRoute.positions;
            if (routeOutlineEntity?.polyline) {
              routeOutlineEntity.polyline.positions = new Cesium.ConstantProperty(roadRoute.positions);
            }
            routeEntity.polyline.positions = new Cesium.ConstantProperty(roadRoute.positions);
            loadedLegs += 1;
            snappedCount += roadRoute.snappedCount;
            maxSnapDistanceMeters = Math.max(maxSnapDistanceMeters, roadRoute.maxSnapDistanceMeters);
          }));
          if (!loadedLegs || disposed) return;
          updateRouteCarbonPanel();
          const snapNote = snappedCount
            ? ` Snapped ${snappedCount.toLocaleString()} stop${snappedCount === 1 ? "" : "s"} to nearby roads, max ${Math.round(maxSnapDistanceMeters).toLocaleString()} m.`
            : "";
          const hubNote = supplyNetworkHubIndex(routeStops) >= 0 ? " supply-network" : "";
          setStatus(`Road-following${hubNote} route loaded for ${loadedLegs.toLocaleString()} leg${loadedLegs === 1 ? "" : "s"}.${snapNote}`);
          viewer?.scene.requestRender();
        } catch {
          setStatus(`Farm-to-fork route shown as direct lines. No routable road was found within ${RURAL_ROAD_SNAP_RADIUS_METERS.toLocaleString()} m of one or more stops, or road routing was unavailable.`);
        }
      };
      updateRoadRoute();

      routeLegs.forEach((leg, legIndex) => {
        const pathForLeg = () => shipmentPaths[legIndex] || [];
        if (pathForLeg().length <= 1) return;
        const startTime = Cesium.JulianDate.addSeconds(Cesium.JulianDate.now(), legIndex * 1.5, new Cesium.JulianDate());
        const shipmentPosition = new Cesium.CallbackPositionProperty((time, result) => {
          const segmentSeconds = 5;
          const elapsed = Math.max(0, Cesium.JulianDate.secondsDifference(time || Cesium.JulianDate.now(), startTime));
          const path = pathForLeg();
          const firstPoint = path[0] || Cesium.Cartesian3.fromDegrees(leg.from.longitude, leg.from.latitude, leg.from.height + 55);
          if (path.length < 2) return firstPoint;
          const segmentIndex = Math.floor(elapsed / segmentSeconds) % (path.length - 1);
          const segmentProgress = (elapsed % segmentSeconds) / segmentSeconds;
          const from = path[segmentIndex] ?? firstPoint;
          const to = path[segmentIndex + 1] ?? firstPoint;
          return Cesium.Cartesian3.lerp(from, to, segmentProgress, result || new Cesium.Cartesian3());
        }, false);
        const shipmentEntity = viewer?.entities.add({
          name: `Animated shipment: ${leg.label}`,
          position: shipmentPosition,
          point: {
            pixelSize: 14,
            color: Cesium.Color.fromCssColorString("#d9f99d"),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: "shipment",
            font: "800 12px sans-serif",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -24),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        if (shipmentEntity) shipmentEntities.push(shipmentEntity);
      });
      cowPointsForRouteStops(routeStops).forEach((cow) => {
        const cowEntity = viewer?.entities.add({
          name: `${cow.farmLabel}: ${cow.label}`,
          position: Cesium.Cartesian3.fromDegrees(cow.longitude, cow.latitude, 0),
          model: {
            uri: COW_MODEL_URI,
            scale: 0.035,
            minimumPixelSize: 52,
            maximumScale: 240,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: cow.label,
            font: "700 13px sans-serif",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -18),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: {
            type: "cow",
            longitude: cow.longitude,
            latitude: cow.latitude,
            representedCount: cow.representedCount,
            farmLabel: cow.farmLabel,
          },
        });
        if (cowEntity) cowEntities.push(cowEntity);
      });

      const pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      const routeBuildingDetails = (entity: import("cesium").Entity | undefined) => {
        const properties = entity?.properties;
        const buildingType = buildingTypeFromValue(properties?.buildingType?.getValue(Cesium.JulianDate.now()) || null);
        const stopIndex = Number(properties?.stopIndex?.getValue(Cesium.JulianDate.now()));
        if (!Number.isInteger(stopIndex)) return null;
        return {
          buildingType,
          stopIndex,
          label: properties?.label?.getValue(Cesium.JulianDate.now()) || entity?.name || buildingTypeLabel(buildingType),
        };
      };
      const showFarmMetrics = (entity: import("cesium").Entity, source: "hover" | "click") => {
        const properties = entity?.properties;
        const buildingType = properties?.buildingType?.getValue(Cesium.JulianDate.now());
        if (buildingType !== "farm") return false;
        const label = properties?.label?.getValue(Cesium.JulianDate.now()) || entity?.name || "Farm";
        const farmSummary = properties?.farmSummary?.getValue(Cesium.JulianDate.now()) || "No cow metrics entered for this farm.";
        const stopIndex = Number(properties?.stopIndex?.getValue(Cesium.JulianDate.now()));
        farmPanel?.classList.remove("hidden");
        if (farmTitleNode) farmTitleNode.textContent = label;
        if (farmSummaryNode) farmSummaryNode.textContent = farmSummary;
        if (source === "click" && Number.isInteger(stopIndex)) {
          selectRouteLeg(routeLegIndexForStop(stopIndex));
        }
        setStatus(`${source === "hover" ? "Farm hover" : "Farm selected"} - ${label}: ${farmSummary}`);
        return true;
      };
      const routeBuildingEntityFromPosition = (position: import("cesium").Cartesian2 | undefined) => {
        if (!position) return null;
        const pickedItems = [
          viewer?.scene.pick(position),
          ...(viewer?.scene.drillPick(position, 12, 5, 5) || []),
        ];
        for (const picked of pickedItems) {
          const entity = (picked?.id || picked?.primitive?.id) as import("cesium").Entity | undefined;
          const type = entity?.properties?.type?.getValue(Cesium.JulianDate.now());
          if ((type === "building" || type === "building-border" || type === "building-label") && routeBuildingDetails(entity)) {
            return entity;
          }
        }
        return null;
      };
      const routeLegIndexFromPosition = (position: import("cesium").Cartesian2 | undefined) => {
        if (!position) return null;
        const pickedItems = [
          viewer?.scene.pick(position),
          ...(viewer?.scene.drillPick(position, 12, 5, 5) || []),
        ];
        for (const picked of pickedItems) {
          const entity = (picked?.id || picked?.primitive?.id) as import("cesium").Entity | undefined;
          const type = entity?.properties?.type?.getValue(Cesium.JulianDate.now());
          const routeLegIndex = Number(entity?.properties?.routeLegIndex?.getValue(Cesium.JulianDate.now()));
          if (type === "route-leg" && Number.isInteger(routeLegIndex) && routeLegs[routeLegIndex]) {
            return routeLegIndex;
          }
        }
        return null;
      };
      pickHandler.setInputAction((movement: { position: import("cesium").Cartesian2 }) => {
        const routeLegIndex = routeLegIndexFromPosition(movement.position);
        if (routeLegIndex !== null) {
          selectRouteLeg(routeLegIndex);
          setStatus(`Selected route leg - ${routeLegs[routeLegIndex]!.label}`);
          return;
        }
        const entity = routeBuildingEntityFromPosition(movement.position);
        if (entity) {
          const details = routeBuildingDetails(entity);
          const selectedLegIndex = details ? routeLegIndexForBuilding(details.buildingType, details.stopIndex) : null;
          if (details && details.buildingType !== "farm") {
            selectRouteLeg(selectedLegIndex);
            setStatus(
              selectedLegIndex !== null
                ? `Selected route leg - ${routeLegs[selectedLegIndex]!.label}`
                : `${buildingTypeLabel(details.buildingType)} selected - no connected route leg found.`,
            );
            return;
          }
          showFarmMetrics(entity, "click");
          return;
        }
        if (!entity) {
          selectRouteLeg(null);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      pickHandler.setInputAction((movement: { endPosition?: import("cesium").Cartesian2 }) => {
        const entity = routeBuildingEntityFromPosition(movement.endPosition);
        const routeLegIndex = routeLegIndexFromPosition(movement.endPosition);
        viewer!.scene.canvas.style.cursor = entity || routeLegIndex !== null ? "pointer" : "";
        if (entity) showFarmMetrics(entity, "hover");
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      const applyLayerVisibility = () => {
        if (!viewer) return;
        const satelliteVisible = satelliteLayerInput?.checked !== false;
        const elevationVisible = elevationLayerInput?.checked !== false;
        const style = currentGridStyle();
        const hasLandCoverRaster = Boolean(landCoverImageryLayer);
        const gridVisible = gridOverlayInput?.checked !== false && (style !== "land-cover" || !hasLandCoverRaster);
        const selectionVisible = selectionLayerInput?.checked !== false;
        const markerVisible = markerLayerInput?.checked !== false;
        const buildingVisible = buildingLayerInput?.checked !== false;
        const routeVisible = routeLayerInput?.checked !== false;
        const shipmentVisible = shipmentLayerInput?.checked !== false;
        const cowVisible = cowLayerInput?.checked !== false;

        if (satelliteLayer) satelliteLayer.show = satelliteVisible;
        viewer.scene.globe.baseColor = satelliteVisible
          ? Cesium.Color.BLACK
          : Cesium.Color.fromCssColorString("#193329");
        if (elevationVisible) {
          viewer.scene.setTerrain(worldTerrain);
          viewer.scene.verticalExaggeration = Number(reliefInput?.value || 2.25);
          viewer.scene.globe.depthTestAgainstTerrain = true;
        } else {
          viewer.scene.globe.terrainProvider = flatTerrainProvider;
          viewer.scene.verticalExaggeration = 1;
          viewer.scene.globe.depthTestAgainstTerrain = false;
        }
        gridOverlayItems.forEach(({ entity }) => {
          entity.show = gridVisible;
        });
        if (landCoverImageryLayer) {
          landCoverImageryLayer.show = gridOverlayInput?.checked !== false && style === "land-cover";
        }
        selectionEntities.forEach((entity) => {
          entity.show = selectionVisible;
        });
        markerEntities.forEach((entity) => {
          entity.show = markerVisible;
        });
        buildingEntities.forEach((entity) => {
          entity.show = buildingVisible;
        });
        buildingBorderEntities.forEach((entity) => {
          entity.show = buildingVisible && currentBuildingDisplay() === "border";
        });
        buildingLabelEntities.forEach((entity) => {
          entity.show = buildingVisible;
        });
        routeEntities.forEach((entity) => {
          entity.show = routeVisible;
        });
        shipmentEntities.forEach((entity) => {
          entity.show = shipmentVisible && routeVisible;
        });
        cowEntities.forEach((entity) => {
          entity.show = cowVisible;
        });
        viewer.scene.requestRender();
      };

      const setGridOverlayVisible = () => {
        applyLayerVisibility();
      };

      const applyBuildingDisplay = () => {
        const mode = currentBuildingDisplay();
        buildingEntities.forEach((entity) => {
          const buildingType = buildingTypeFromValue(
            entity.properties?.buildingType?.getValue(Cesium.JulianDate.now()) || currentBuildingType(),
          );
          const style = buildingStyle(Cesium, buildingType);
          const height = Number(entity.properties?.buildingHeight?.getValue(Cesium.JulianDate.now()));
          const buildingHeight = Number.isFinite(height) ? height : style.height;
          if (entity.polygon) {
            entity.polygon.material = new Cesium.ColorMaterialProperty(
              mode === "border" ? style.color.withAlpha(0.08) : style.color.withAlpha(0.72),
            );
            entity.polygon.outline = new Cesium.ConstantProperty(true);
            entity.polygon.outlineColor = new Cesium.ConstantProperty(
              mode === "border" ? style.color.withAlpha(0.98) : Cesium.Color.WHITE.withAlpha(0.8),
            );
            entity.polygon.outlineWidth = new Cesium.ConstantProperty(1);
            entity.polygon.height = new Cesium.ConstantProperty(0);
            entity.polygon.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.CLAMP_TO_GROUND);
            entity.polygon.extrudedHeight = mode === "border" ? undefined : new Cesium.ConstantProperty(buildingHeight);
            entity.polygon.extrudedHeightReference = mode === "border"
              ? undefined
              : new Cesium.ConstantProperty(Cesium.HeightReference.RELATIVE_TO_GROUND);
          }
        });
        buildingBorderEntities.forEach((entity) => {
          const buildingType = buildingTypeFromValue(
            entity.properties?.buildingType?.getValue(Cesium.JulianDate.now()) || currentBuildingType(),
          );
          const style = buildingStyle(Cesium, buildingType);
          entity.show = mode === "border" && buildingLayerInput?.checked !== false;
          if (entity.polyline) {
            entity.polyline.width = new Cesium.ConstantProperty(6);
            entity.polyline.material = new Cesium.ColorMaterialProperty(style.color.withAlpha(0.98));
          }
        });
        buildingLabelEntities.forEach((entity) => {
          const longitude = Number(entity.properties?.longitude?.getValue(Cesium.JulianDate.now()));
          const latitude = Number(entity.properties?.latitude?.getValue(Cesium.JulianDate.now()));
          if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
          const height = Number(entity.properties?.buildingHeight?.getValue(Cesium.JulianDate.now()));
          const labelHeight = (currentBuildingDisplay() === "border" ? 14 : (Number.isFinite(height) ? height : 34) + 16);
          entity.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(longitude, latitude, labelHeight));
        });
        viewer?.scene.requestRender();
      };

      const updateGridStyle = () => {
        const style = currentGridStyle();
        gridOverlayItems.forEach(({ entity, feature }) => {
          entity.name = gridEntityName(feature, style);
          const polygon = entity.polygon;
          if (polygon) {
            polygon.material = new Cesium.ColorMaterialProperty(gridMaterial(Cesium, feature, style));
          }
        });
        applyLayerVisibility();
        viewer?.scene.requestRender();
      };

      const updateBuildingStyle = () => {
        if (terrainRequest.route.length) return;
        const style = buildingStyle(Cesium, currentBuildingType());
        buildingEntities.forEach((entity) => {
          entity.name = `${style.label} building`;
          entity.properties = new Cesium.PropertyBag({
            type: "building",
            buildingType: currentBuildingType(),
            buildingHeight: style.height,
          });
        });
        buildingBorderEntities.forEach((entity) => {
          entity.name = `${style.label} footprint border`;
          entity.properties = new Cesium.PropertyBag({
            type: "building-border",
            buildingType: currentBuildingType(),
            buildingHeight: style.height,
          });
        });
        buildingLabelEntities.forEach((entity) => {
          entity.name = `${style.label} label`;
          if (entity.label) entity.label.text = new Cesium.ConstantProperty(style.label);
          const position = entity.position?.getValue(Cesium.JulianDate.now());
          const cartographic = position ? Cesium.Cartographic.fromCartesian(position) : null;
          entity.properties = new Cesium.PropertyBag({
            type: "building-label",
            buildingType: currentBuildingType(),
            buildingHeight: style.height,
            label: style.label,
            longitude: cartographic ? Cesium.Math.toDegrees(cartographic.longitude) : undefined,
            latitude: cartographic ? Cesium.Math.toDegrees(cartographic.latitude) : undefined,
          });
        });
        applyBuildingDisplay();
        applyLayerVisibility();
        viewer?.scene.requestRender();
      };

      const loadGridOverlay = async () => {
        if (!viewer) return;
        setStatus("Loading processed grid overlay...");
        const response = await fetch(`${apiBase()}/api/grids`);
        if (!response.ok) throw new Error(`Grid API returned ${response.status}`);
        const collection = (await response.json()) as GridCollection;
        const features = (collection.features || []).filter((feature) => featureIntersectsBounds(feature, terrainRequest));

        features.forEach((feature) => {
          polygonRings(feature).forEach((ring) => {
            if (ring.length < 4 || !viewer) return;
            const coordinates = ring.flatMap(([longitude, latitude]) => [longitude, latitude]);
            const entity = viewer.entities.add({
              name: gridEntityName(feature, currentGridStyle()),
              polygon: {
                hierarchy: Cesium.Cartesian3.fromDegreesArray(coordinates),
                material: gridMaterial(Cesium, feature, currentGridStyle()),
                outline: true,
                outlineColor: Cesium.Color.WHITE.withAlpha(0.68),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                classificationType: Cesium.ClassificationType.TERRAIN,
              },
              properties: {
                grid_id: feature.properties?.grid_id,
                average_ndvi: feature.properties?.average_ndvi,
                average_elevation: feature.properties?.average_elevation,
                population_count: feature.properties?.population_count,
                dominant_land_cover_class: feature.properties?.dominant_land_cover_class,
                land_cover_year: feature.properties?.land_cover_year,
              },
            });
            gridOverlayItems.push({ entity, feature });
          });
        });
        applyLayerVisibility();
        setStatus(
          features.length
            ? `Cesium terrain with ${features.length.toLocaleString()} processed grid cells overlaid.`
            : "Cesium terrain loaded. No processed grid cells were found inside this selected area.",
        );
      };

      const setCinematicCamera = () => {
        if (!viewer) return;
        const span = Math.max(
          terrainRequest.east - terrainRequest.west,
          terrainRequest.north - terrainRequest.south,
          0.01,
        );
        const range = clamp(span * 130000, 700, 18000);
        viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, Math.max(range * 0.14, 120)), {
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(42),
            Cesium.Math.toRadians(-48),
            Math.min(range, terrainRequest.cameraHeight),
          ),
          duration: 1.1,
          complete: () => {
            viewer?.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          },
        });
      };

      const rotateCamera = (direction: -1 | 1) => {
        if (!viewer) return;
        const currentHeading = viewer.camera.heading;
        const pitch = clamp(viewer.camera.pitch, Cesium.Math.toRadians(-80), Cesium.Math.toRadians(-18));
        const distance = Math.max(Cesium.Cartesian3.distance(viewer.camera.positionWC, target), 700);

        viewer.camera.lookAt(
          target,
          new Cesium.HeadingPitchRange(
            currentHeading + direction * Cesium.Math.toRadians(28),
            pitch,
            distance,
          ),
        );
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        viewer.scene.requestRender();
      };
      const rotateLeft = () => rotateCamera(-1);
      const rotateRight = () => rotateCamera(1);

      const updateRelief = () => {
        if (!viewer) return;
        if (elevationLayerInput?.checked === false) return;
        viewer.scene.verticalExaggeration = Number(reliefInput?.value || 2.25);
        viewer.scene.requestRender();
      };

      reliefInput?.addEventListener("input", updateRelief);
      gridStyleSelect?.addEventListener("change", updateGridStyle);
      buildingTypeSelect?.addEventListener("change", updateBuildingStyle);
      buildingDisplaySelect?.addEventListener("change", applyBuildingDisplay);
      satelliteLayerInput?.addEventListener("change", applyLayerVisibility);
      elevationLayerInput?.addEventListener("change", applyLayerVisibility);
      gridOverlayInput?.addEventListener("change", setGridOverlayVisible);
      selectionLayerInput?.addEventListener("change", applyLayerVisibility);
      markerLayerInput?.addEventListener("change", applyLayerVisibility);
      buildingLayerInput?.addEventListener("change", applyLayerVisibility);
      routeLayerInput?.addEventListener("change", applyLayerVisibility);
      shipmentLayerInput?.addEventListener("change", applyLayerVisibility);
      cowLayerInput?.addEventListener("change", applyLayerVisibility);
      resetButton?.addEventListener("click", setCinematicCamera);
      rotateLeftButton?.addEventListener("click", rotateLeft);
      rotateRightButton?.addEventListener("click", rotateRight);
      applyLayerVisibility();
      setCinematicCamera();
      if (labelNode) labelNode.textContent = "Cesium terrain";
      loadGridOverlay().catch((error: Error) => {
        setStatus(`Cesium terrain loaded, but grid overlay failed: ${error.message}`);
      });

      return () => {
        reliefInput?.removeEventListener("input", updateRelief);
        gridStyleSelect?.removeEventListener("change", updateGridStyle);
        buildingTypeSelect?.removeEventListener("change", updateBuildingStyle);
        buildingDisplaySelect?.removeEventListener("change", applyBuildingDisplay);
        satelliteLayerInput?.removeEventListener("change", applyLayerVisibility);
        elevationLayerInput?.removeEventListener("change", applyLayerVisibility);
        gridOverlayInput?.removeEventListener("change", setGridOverlayVisible);
        selectionLayerInput?.removeEventListener("change", applyLayerVisibility);
        markerLayerInput?.removeEventListener("change", applyLayerVisibility);
        buildingLayerInput?.removeEventListener("change", applyLayerVisibility);
        routeLayerInput?.removeEventListener("change", applyLayerVisibility);
        shipmentLayerInput?.removeEventListener("change", applyLayerVisibility);
        cowLayerInput?.removeEventListener("change", applyLayerVisibility);
        resetButton?.removeEventListener("click", setCinematicCamera);
        rotateLeftButton?.removeEventListener("click", rotateLeft);
        rotateRightButton?.removeEventListener("click", rotateRight);
        pickHandler.destroy();
      };
    };

    let cleanupListeners: void | (() => void);
    start()
      .then((cleanup) => {
        cleanupListeners = cleanup;
      })
      .catch((error: Error) => {
        setStatus(`Cesium terrain failed: ${error.message}`);
      });

    return () => {
      disposed = true;
      cleanupListeners?.();
      viewer?.destroy();
    };
  }, []);

  return null;
}
