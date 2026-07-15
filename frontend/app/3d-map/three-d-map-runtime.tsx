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

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
    Cesium?: CesiumGlobal;
  }
}

const DEFAULT_LATITUDE = 14.975972;
const DEFAULT_LONGITUDE = 101.42225;

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
    const satelliteLayerInput = document.getElementById("three-d-satellite-layer") as HTMLInputElement | null;
    const elevationLayerInput = document.getElementById("three-d-elevation-layer") as HTMLInputElement | null;
    const gridOverlayInput = document.getElementById("three-d-grid-overlay") as HTMLInputElement | null;
    const selectionLayerInput = document.getElementById("three-d-selection-layer") as HTMLInputElement | null;
    const markerLayerInput = document.getElementById("three-d-marker-layer") as HTMLInputElement | null;
    const resetButton = document.getElementById("three-d-reset-camera");
    const titleNode = document.getElementById("three-d-title");

    if (!container) return;

    let disposed = false;
    let viewer: import("cesium").Viewer | null = null;
    const terrainRequest = terrainRequestFromUrl();
    let landCoverImageryLayer: import("cesium").ImageryLayer | null = null;
    const gridOverlayItems: { entity: import("cesium").Entity; feature: GridFeature }[] = [];
    const selectionEntities: import("cesium").Entity[] = [];
    const markerEntities: import("cesium").Entity[] = [];
    if (titleNode) titleNode.textContent = terrainRequest.label;

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

      const applyLayerVisibility = () => {
        if (!viewer) return;
        const satelliteVisible = satelliteLayerInput?.checked !== false;
        const elevationVisible = elevationLayerInput?.checked !== false;
        const style = currentGridStyle();
        const hasLandCoverRaster = Boolean(landCoverImageryLayer);
        const gridVisible = gridOverlayInput?.checked !== false && (style !== "land-cover" || !hasLandCoverRaster);
        const selectionVisible = selectionLayerInput?.checked !== false;
        const markerVisible = markerLayerInput?.checked !== false;

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

      const updateRelief = () => {
        if (!viewer) return;
        if (elevationLayerInput?.checked === false) return;
        viewer.scene.verticalExaggeration = Number(reliefInput?.value || 2.25);
        viewer.scene.requestRender();
      };

      reliefInput?.addEventListener("input", updateRelief);
      gridStyleSelect?.addEventListener("change", updateGridStyle);
      satelliteLayerInput?.addEventListener("change", applyLayerVisibility);
      elevationLayerInput?.addEventListener("change", applyLayerVisibility);
      gridOverlayInput?.addEventListener("change", setGridOverlayVisible);
      selectionLayerInput?.addEventListener("change", applyLayerVisibility);
      markerLayerInput?.addEventListener("change", applyLayerVisibility);
      resetButton?.addEventListener("click", setCinematicCamera);
      applyLayerVisibility();
      setCinematicCamera();
      if (labelNode) labelNode.textContent = "Cesium terrain";
      loadGridOverlay().catch((error: Error) => {
        setStatus(`Cesium terrain loaded, but grid overlay failed: ${error.message}`);
      });

      return () => {
        reliefInput?.removeEventListener("input", updateRelief);
        gridStyleSelect?.removeEventListener("change", updateGridStyle);
        satelliteLayerInput?.removeEventListener("change", applyLayerVisibility);
        elevationLayerInput?.removeEventListener("change", applyLayerVisibility);
        gridOverlayInput?.removeEventListener("change", setGridOverlayVisible);
        selectionLayerInput?.removeEventListener("change", applyLayerVisibility);
        markerLayerInput?.removeEventListener("change", applyLayerVisibility);
        resetButton?.removeEventListener("click", setCinematicCamera);
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
