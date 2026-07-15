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
type BuildingType = "farm" | "middle-man" | "processor" | "warehouse" | "retailer" | "end-product";
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
};
type FootprintGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};
type SupplyChainStop = {
  id?: string;
  type: BuildingType;
  name?: string;
  geometry: FootprintGeometry;
};

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
    Cesium?: CesiumGlobal;
  }
}

const DEFAULT_LATITUDE = 14.975972;
const DEFAULT_LONGITUDE = 101.42225;
const COW_MODEL_URI = "/models/GLB_Cow.glb";
const COW_BOUNDARY: Boundary = {
  west: 101.3111,
  south: 15.4420,
  east: 101.3334,
  north: 15.4560,
};
const COW_POINT_OFFSETS = [
  [0.10, 0.16],
  [0.18, 0.72],
  [0.25, 0.43],
  [0.35, 0.85],
  [0.42, 0.28],
  [0.51, 0.58],
  [0.60, 0.18],
  [0.68, 0.76],
  [0.74, 0.39],
  [0.83, 0.63],
  [0.90, 0.22],
  [0.94, 0.88],
] as const;

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
  if (
    value === "middle-man"
    || value === "processor"
    || value === "warehouse"
    || value === "retailer"
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
      const candidate = stop as { id?: string; type?: string; name?: string; geometry?: FootprintGeometry };
      const geometry = candidate.geometry;
      if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return [];
      return [{
        id: candidate.id || `route-stop-${index + 1}`,
        type: buildingTypeFromValue(candidate.type || null),
        name: candidate.name,
        geometry,
      }];
    });
  } catch {
    return [];
  }
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

function buildingTypeLabel(buildingType: BuildingType) {
  if (buildingType === "middle-man") return "Middle man";
  if (buildingType === "processor") return "Processor";
  if (buildingType === "warehouse") return "Warehouse";
  if (buildingType === "retailer") return "Retailer";
  if (buildingType === "end-product") return "End product destination";
  return "Farm";
}

function buildingStyle(Cesium: CesiumGlobal, buildingType: BuildingType) {
  if (buildingType === "middle-man") {
    return {
      label: buildingTypeLabel(buildingType),
      color: Cesium.Color.fromCssColorString("#f59e0b"),
      height: 54,
    };
  }
  if (buildingType === "processor") {
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
  if (buildingType === "retailer") {
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

function pointInsideBoundary(point: CowPoint, boundary: Boundary) {
  return point.longitude >= boundary.west
    && point.longitude <= boundary.east
    && point.latitude >= boundary.south
    && point.latitude <= boundary.north;
}

function cowPointsForBoundary(boundary: Boundary) {
  if (!boundaryIntersects(COW_BOUNDARY, boundary)) return [];
  const width = COW_BOUNDARY.east - COW_BOUNDARY.west;
  const height = COW_BOUNDARY.north - COW_BOUNDARY.south;
  return COW_POINT_OFFSETS.map(([x, y], index) => ({
    id: `cow-${index + 1}`,
    longitude: COW_BOUNDARY.west + width * x,
    latitude: COW_BOUNDARY.south + height * y,
  })).filter((point) => pointInsideBoundary(point, boundary));
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

    if (!container) return;

    let disposed = false;
    let viewer: import("cesium").Viewer | null = null;
    const terrainRequest = terrainRequestFromUrl();
    let landCoverImageryLayer: import("cesium").ImageryLayer | null = null;
    const gridOverlayItems: { entity: import("cesium").Entity; feature: GridFeature }[] = [];
    const selectionEntities: import("cesium").Entity[] = [];
    const markerEntities: import("cesium").Entity[] = [];
    const buildingEntities: import("cesium").Entity[] = [];
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
      const routeCenters: { longitude: number; latitude: number; height: number; label: string }[] = [];
      routeStopsForRequest(terrainRequest).forEach((stop, stopIndex) => {
        footprintRings(stop.geometry).forEach((ring, ringIndex) => {
          const style = buildingStyle(Cesium, stop.type);
          const label = stop.name || style.label;
          const coordinates = ring.flatMap(([longitude, latitude]) => [longitude, latitude]);
          const buildingEntity = viewer?.entities.add({
            name: `${label} building`,
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
              routeIndex: stopIndex + 1,
            },
          });
          if (buildingEntity) buildingEntities.push(buildingEntity);

          const centroid = ringCentroid(ring);
          if (ringIndex === 0) {
            routeCenters.push({
              longitude: centroid.longitude,
              latitude: centroid.latitude,
              height: style.height,
              label,
            });
          }
          const labelEntity = viewer?.entities.add({
            name: `${label} label`,
            position: Cesium.Cartesian3.fromDegrees(centroid.longitude, centroid.latitude, style.height + 16),
            label: {
              text: `${stopIndex + 1}. ${label}`,
              font: "800 14px sans-serif",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -10 - ringIndex * 4),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          if (labelEntity) buildingLabelEntities.push(labelEntity);
        });
      });
      routeCenters.slice(0, -1).forEach((center, index) => {
        const next = routeCenters[index + 1];
        const routeEntity = viewer?.entities.add({
          name: `${center.label} to ${next.label}`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              center.longitude,
              center.latitude,
              center.height + 38,
              next.longitude,
              next.latitude,
              next.height + 38,
            ]),
            width: 6,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.18,
              taperPower: 0.65,
              color: Cesium.Color.fromCssColorString("#d9f99d").withAlpha(0.92),
            }),
            clampToGround: false,
          },
        });
        if (routeEntity) routeEntities.push(routeEntity);
      });
      if (routeCenters.length > 1) {
        const startTime = Cesium.JulianDate.now();
        const shipmentPosition = new Cesium.CallbackPositionProperty((time, result) => {
          const segmentSeconds = 5;
          const elapsed = Math.max(0, Cesium.JulianDate.secondsDifference(time || Cesium.JulianDate.now(), startTime));
          const segmentIndex = Math.floor(elapsed / segmentSeconds) % (routeCenters.length - 1);
          const segmentProgress = (elapsed % segmentSeconds) / segmentSeconds;
          const from = routeCenters[segmentIndex];
          const to = routeCenters[segmentIndex + 1];
          const longitude = from.longitude + (to.longitude - from.longitude) * segmentProgress;
          const latitude = from.latitude + (to.latitude - from.latitude) * segmentProgress;
          const height = Math.max(from.height, to.height) + 55;
          return Cesium.Cartesian3.fromDegrees(longitude, latitude, height, undefined, result);
        }, false);
        const shipmentEntity = viewer?.entities.add({
          name: "Animated shipment",
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
      }
      cowPointsForBoundary(terrainRequest).forEach((cow) => {
        const cowEntity = viewer?.entities.add({
          name: cow.id,
          position: Cesium.Cartesian3.fromDegrees(cow.longitude, cow.latitude, 0),
          model: {
            uri: COW_MODEL_URI,
            scale: 0.018,
            minimumPixelSize: 26,
            maximumScale: 80,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: "cow",
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
          },
        });
        if (cowEntity) cowEntities.push(cowEntity);
      });

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
          if (entity.polygon) {
            entity.polygon.material = new Cesium.ColorMaterialProperty(style.color.withAlpha(0.72));
            entity.polygon.extrudedHeight = new Cesium.ConstantProperty(style.height);
          }
          entity.properties = new Cesium.PropertyBag({
            type: "building",
            buildingType: currentBuildingType(),
          });
        });
        buildingLabelEntities.forEach((entity) => {
          entity.name = `${style.label} label`;
          if (entity.label) entity.label.text = new Cesium.ConstantProperty(style.label);
          const position = entity.position?.getValue(Cesium.JulianDate.now());
          if (position) {
            const cartographic = Cesium.Cartographic.fromCartesian(position);
            entity.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromRadians(
              cartographic.longitude,
              cartographic.latitude,
              style.height + 16,
            ));
          }
        });
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
