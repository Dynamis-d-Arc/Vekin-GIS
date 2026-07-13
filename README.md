# Vekin GIS Sentinel-2 Platform

Level 0 data portal and Level 1 NDVI analytics for Sentinel-2 imagery.

The platform does not keep a permanent Sentinel-2 archive. It queries cloud-hosted imagery on demand, reads only the Red and NIR bands needed for NDVI, stores metadata and grid statistics in PostgreSQL/PostGIS, and keeps generated rasters in a temporary working directory.

## Stack

- PostgreSQL/PostGIS for grids, image metadata, and NDVI statistics
- FastAPI backend for STAC search, NDVI processing, and analytics APIs
- Next.js App Router frontend with Leaflet and Chart.js
- Microsoft Planetary Computer STAC as the preferred imagery source
- WorldPop Global 2 R2025A 1 km annual population counts for Thailand (2015-2030)

## Quick Start

1. Copy the environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Start PostGIS:

   ```powershell
   docker compose up -d db
   ```

   Or start PostGIS and the real NDVI API together:

   ```powershell
   docker compose up -d --build db api
   ```

3. Install backend dependencies:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r backend\requirements.txt
   ```

4. Run migrations:

   ```powershell
   python backend\scripts\migrate.py
   ```

5. Start the backend if you are not using Docker for the API:

   ```powershell
   uvicorn app.main:app --app-dir backend --reload
   ```

6. Start the frontend:

   ```powershell
   cd frontend
   npm.cmd install
   npm.cmd run dev
   ```

7. Open `http://localhost:3000`.

The frontend expects the backend at `http://localhost:8000`. Override it with
`NEXT_PUBLIC_API_BASE_URL` when needed.

Use `scripts/demo-api.mjs` only for frontend demos. Real NDVI values require the Docker/API backend, PostGIS, and network access to Microsoft Planetary Computer.

## Core API

- `POST /api/images/search` searches Microsoft Planetary Computer Sentinel-2 L2A metadata for an area/date.
- `POST /api/ndvi/process` retrieves B04 and B08 on demand, generates a temporary NDVI GeoTIFF, calculates grid statistics, and stores metadata/statistics.
- `GET /api/grids` returns Bangkok grid polygons with the latest NDVI values for map styling.
- `GET /api/metadata` returns captured image metadata and processing status.
- `POST /api/weather/open-meteo` retrieves Open-Meteo daily mean temperature and rainfall for a latitude/longitude date range.
- `GET /api/dashboard` returns average NDVI, min/max values, lowest/highest grids, and historical trend values.
- `POST /api/change-detection` compares grid NDVI values between two dates.

WorldPop years after the latest demographic inputs are modelled projections. Population GeoTIFFs
are read on demand, cropped to the selected area, cached under `tmp/context`, and aggregated as
people per WorldPop pixel rather than population density.

## Level 0 Portal Layers

- Roads: lightweight sample road overlay plus OpenStreetMap base layer.
- Buildings: sample GeoJSON overlay, ready to replace with authoritative building footprints.
- Parcels: sample GeoJSON overlay, ready to replace with authoritative parcel polygons.
- Satellite: Esri World Imagery tile layer for visual context.
- NDVI/Grid: PostGIS grid layer colored by stored NDVI statistics.

## Storage Strategy

Stored in PostgreSQL:

- Grid polygons
- Sentinel-2 metadata
- NDVI statistics
- Dashboard query results

Not stored permanently:

- Sentinel-2 archive imagery
- Raw satellite bands
- Long-lived GeoTIFF collections

Generated NDVI GeoTIFFs are written to `tmp/ndvi` and are treated as disposable processing artifacts.
