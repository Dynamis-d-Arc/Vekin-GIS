import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 8000;
let selectedDate = new Date().toISOString().slice(0, 10);
let selectedAreaBounds = null;

function dateSeed(dateText) {
  return [...dateText].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function json(response, status, payload) {
  response.writeHead(status, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function hashNoise(x, y, seed) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 0.371) * 43758.5453;
  return value - Math.floor(value);
}

function smoothNoise(lon, lat, seed) {
  const scale = 18;
  const x = lon * scale;
  const y = lat * scale;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const fadeX = xf * xf * (3 - 2 * xf);
  const fadeY = yf * yf * (3 - 2 * yf);

  const n00 = hashNoise(x0, y0, seed);
  const n10 = hashNoise(x0 + 1, y0, seed);
  const n01 = hashNoise(x0, y0 + 1, seed);
  const n11 = hashNoise(x0 + 1, y0 + 1, seed);
  const nx0 = n00 * (1 - fadeX) + n10 * fadeX;
  const nx1 = n01 * (1 - fadeX) + n11 * fadeX;
  return nx0 * (1 - fadeY) + nx1 * fadeY;
}

function gridFeature(index, west, south, width, height, seed) {
  const east = west + width;
  const north = south + height;
  const centerLon = west + width / 2;
  const centerLat = south + height / 2;
  const seasonal = Math.sin((seed / 365) * Math.PI * 2) * 0.08;
  const dayPulse = ((seed % 9) - 4) * 0.025;
  const broadGradient =
    Math.sin(centerLon * 3.4 + seed * 0.03) * 0.06 +
    Math.cos(centerLat * 4.7 - seed * 0.02) * 0.05;
  const localVariation = (smoothNoise(centerLon, centerLat, seed) - 0.5) * 0.22;
  const ndvi = Math.max(0.05, Math.min(0.82, 0.42 + seasonal + dayPulse + broadGradient + localVariation));
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    },
    properties: {
      grid_id: `GRID-${String(index + 1).padStart(5, "0")}`,
      average_ndvi: ndvi,
      minimum_ndvi: Math.max(-1, ndvi - 0.08),
      maximum_ndvi: Math.min(1, ndvi + 0.11),
      capture_date: new Date(`${selectedDate}T10:30:00.000Z`).toISOString(),
    },
  };
}

function defaultBounds() {
  return {
    west: 100.36,
    south: 13.52,
    east: 100.88,
    north: 13.904,
  };
}

function buildFeaturesForBounds(dateText, bounds) {
  const features = [];
  const seed = dateSeed(dateText);
  const width = Math.max(0.01, bounds.east - bounds.west);
  const height = Math.max(0.01, bounds.north - bounds.south);
  const columns = Math.min(12, Math.max(3, Math.ceil(width / 0.045)));
  const rows = Math.min(12, Math.max(3, Math.ceil(height / 0.045)));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const cellSize = Math.min(cellWidth, cellHeight);
  let index = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const west = bounds.west + col * cellWidth;
      const south = bounds.south + row * cellHeight;
      features.push(gridFeature(index, west, south, cellWidth, cellHeight, seed));
      index += 1;
    }
  }
  return features;
}

function buildFeatures(dateText) {
  return buildFeaturesForBounds(dateText, defaultBounds());
}

function featureBounds(feature) {
  const coordinates = feature.geometry.coordinates[0];
  const lngs = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  return {
    west: Math.min(...lngs),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    north: Math.max(...lats),
  };
}

function boundsFromArea(area) {
  const coordinates = area?.coordinates?.[0];
  if (!Array.isArray(coordinates)) {
    return null;
  }
  const lngs = coordinates.map((coordinate) => coordinate[0]).filter(Number.isFinite);
  const lats = coordinates.map((coordinate) => coordinate[1]).filter(Number.isFinite);
  if (!lngs.length || !lats.length) {
    return null;
  }
  return {
    west: Math.min(...lngs),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    north: Math.max(...lats),
  };
}

function intersects(a, b) {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

function selectedFeatures(dateText) {
  if (!selectedAreaBounds) {
    return buildFeatures(dateText);
  }
  return buildFeaturesForBounds(dateText, selectedAreaBounds)
    .filter((feature) => intersects(featureBounds(feature), selectedAreaBounds));
}

function summarize(features) {
  if (!features.length) {
    return {
      average_ndvi: null,
      minimum_ndvi: null,
      maximum_ndvi: null,
    };
  }

  return {
    average_ndvi:
      features.reduce((sum, feature) => sum + feature.properties.average_ndvi, 0) / features.length,
    minimum_ndvi: Math.min(...features.map((feature) => feature.properties.minimum_ndvi)),
    maximum_ndvi: Math.max(...features.map((feature) => feature.properties.maximum_ndvi)),
  };
}

function dashboardFor(dateText) {
  const features = selectedFeatures(dateText);
  const sorted = [...features].sort(
    (a, b) => a.properties.average_ndvi - b.properties.average_ndvi,
  );
  const baseDate = new Date(`${dateText}T00:00:00.000Z`);
  const trend = [-4, -3, -2, -1, 0].map((offset) => {
    const date = new Date(baseDate);
    date.setUTCDate(baseDate.getUTCDate() + offset);
    const trendDate = date.toISOString().slice(0, 10);
    return {
      date: trendDate,
      average_ndvi: summarize(selectedFeatures(trendDate)).average_ndvi,
    };
  });

  return {
    summary: summarize(features),
    lowest: sorted.slice(0, 10).map((feature) => feature.properties),
    highest: sorted.slice(-10).reverse().map((feature) => feature.properties),
    trend,
  };
}

function gridFor(dateText) {
  return { type: "FeatureCollection", features: selectedFeatures(dateText) };
}

function metadataFor(dateText) {
  const captureDate = new Date(`${dateText}T10:30:00.000Z`).toISOString();
  return [{
    id: "demo-sentinel-2",
    capture_date: captureDate,
    satellite: "Sentinel-2 L2A demo",
    cloud_cover: 12 + (dateSeed(dateText) % 24),
    bbox: null,
    image_url: "https://planetarycomputer.microsoft.com/api/stac/v1",
    processing_status: "complete",
    created_at: new Date().toISOString(),
  }];
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    json(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (url.pathname === "/api/health") {
    json(response, 200, { status: "ok", mode: "demo" });
    return;
  }

  if (url.pathname === "/api/grids") {
    json(response, 200, gridFor(selectedDate));
    return;
  }

  if (url.pathname === "/api/dashboard") {
    json(response, 200, dashboardFor(selectedDate));
    return;
  }

  if (url.pathname === "/api/metadata") {
    json(response, 200, metadataFor(selectedDate));
    return;
  }

  if (url.pathname === "/api/ndvi/process" && request.method === "POST") {
    const body = await readJsonBody(request);
    if (body.date) {
      selectedDate = body.date;
    }
    selectedAreaBounds = boundsFromArea(body.area) ?? selectedAreaBounds;
    const processedFeatures = selectedFeatures(selectedDate);
    json(response, 200, {
      satellite_image_id: "demo-sentinel-2",
      capture_date: new Date(`${selectedDate}T10:30:00.000Z`).toISOString(),
      status: "complete",
      grids_processed: processedFeatures.length,
      ndvi_temp_path: `demo://ndvi-preview-${selectedDate}.tif`,
    });
    return;
  }

  json(response, 404, { detail: "Not found" });
}).listen(port, host, () => {
  console.log(`Demo API at http://${host}:${port}`);
});
