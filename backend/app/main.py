from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from shapely.geometry import shape

from app.config import get_settings
from app.context_layers import create_context_layers
from app.db import close_pool, open_pool
from app.ndvi import calculate_grid_statistics, generate_ndvi
from app.rainfall import CHIRPS_SOURCE, calculate_rainfall_range
from app.planetary import find_sentinel_item, find_sentinel_items_for_range
from app.repositories import (
    delete_processed_data,
    ensure_context_statistics_tables,
    ensure_ndvi_statistics_columns,
    ensure_rainfall_tables,
    get_context_layers,
    get_dashboard,
    get_grid_layer,
    get_latest_context_statistics,
    get_metadata,
    get_ndvi_capture_dates_for_area,
    insert_ndvi_statistics,
    insert_rainfall_statistics,
    insert_satellite_image,
    update_satellite_status,
    upsert_rainfall_area,
)
from app.schemas import (
    AreaDateRangeRequest,
    AreaDateRequest,
    ChangeDetectionRequest,
    ContextLayersRequest,
    ProcessRangeResponse,
    ProcessResponse,
    RainfallProcessResponse,
)


settings = get_settings()
app = FastAPI(title="Vekin GIS Sentinel-2 Platform")
settings.context_temp_dir.mkdir(parents=True, exist_ok=True)
app.mount("/context", StaticFiles(directory=settings.context_temp_dir), name="context")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    open_pool()
    ensure_ndvi_statistics_columns()
    ensure_context_statistics_tables()
    ensure_rainfall_tables()


@app.on_event("shutdown")
def shutdown() -> None:
    close_pool()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/images/search")
def search_images(request: AreaDateRequest) -> dict[str, Any]:
    try:
        item = find_sentinel_item(
            area_geojson=request.area,
            capture_date=request.date,
            max_cloud_cover=request.max_cloud_cover,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "id": item["id"],
        "capture_date": item["capture_date"],
        "satellite": item["satellite"],
        "cloud_cover": item["cloud_cover"],
        "bbox": item["bbox"],
    }


def _process_ndvi_item(*, item: dict[str, Any], area_geojson: dict[str, Any]) -> ProcessResponse:
    image_id = insert_satellite_image(
        capture_date=item["capture_date"],
        satellite=item["satellite"],
        cloud_cover=item["cloud_cover"],
        bbox_geojson=item["bbox_geojson"],
        image_url=item["temporary_image_url"],
        processing_status="processing",
    )

    try:
        ndvi_path, ndbi_path = generate_ndvi(
            red_url=item["red_url"],
            nir_url=item["nir_url"],
            ndbi_nir_url=item["ndbi_nir_url"],
            swir_url=item["swir_url"],
            area_geojson=area_geojson,
            item_id=item["id"],
        )
        rows = calculate_grid_statistics(
            ndvi_path=ndvi_path,
            ndbi_path=ndbi_path,
            area_geojson=area_geojson,
            capture_date=item["capture_date"],
        )
        count = insert_ndvi_statistics(rows, image_id)
        update_satellite_status(image_id, "complete")
    except Exception:
        update_satellite_status(image_id, "failed")
        raise

    return ProcessResponse(
        satellite_image_id=image_id,
        capture_date=item["capture_date"],
        status="complete",
        grids_processed=count,
        ndvi_temp_path=str(ndvi_path),
        ndbi_temp_path=str(ndbi_path) if ndbi_path else None,
    )


@app.post("/api/ndvi/process", response_model=ProcessResponse)
def process_ndvi(request: AreaDateRequest) -> ProcessResponse:
    try:
        item = find_sentinel_item(
            area_geojson=request.area,
            capture_date=request.date,
            max_cloud_cover=request.max_cloud_cover,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        return _process_ndvi_item(item=item, area_geojson=request.area)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"NDVI processing failed: {exc}") from exc


@app.post("/api/ndvi/process-range", response_model=ProcessRangeResponse)
def process_ndvi_range(request: AreaDateRangeRequest) -> ProcessRangeResponse:
    try:
        items = find_sentinel_items_for_range(
            area_geojson=request.area,
            start_date=request.start_date,
            end_date=request.end_date,
            max_cloud_cover=request.max_cloud_cover,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    results: list[ProcessResponse] = []
    for item in items:
        try:
            results.append(_process_ndvi_item(item=item, area_geojson=request.area))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"NDVI range processing failed: {exc}") from exc

    return ProcessRangeResponse(
        status="complete",
        images_processed=len(results),
        grids_processed=sum(result.grids_processed for result in results),
        results=results,
    )


@app.post("/api/rainfall/process-range", response_model=RainfallProcessResponse)
def process_rainfall_range(request: AreaDateRangeRequest) -> RainfallProcessResponse:
    try:
        area_id = upsert_rainfall_area(request.area)
        rows = calculate_rainfall_range(
            area_geojson=request.area,
            start_date=request.start_date,
            end_date=request.end_date,
        )
        count = insert_rainfall_statistics(
            area_id=area_id,
            rows=rows,
            source=CHIRPS_SOURCE,
        )
    except (LookupError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Rainfall processing failed: {exc}") from exc

    rainfall_values = [
        row["average_rainfall_mm"]
        for row in rows
        if row["average_rainfall_mm"] is not None
    ]
    cumulative = sum(rainfall_values) if rainfall_values else None
    average = cumulative / len(rainfall_values) if rainfall_values else None
    return RainfallProcessResponse(
        area_id=area_id,
        status="complete",
        source=CHIRPS_SOURCE,
        days_processed=count,
        start_date=request.start_date,
        end_date=request.end_date,
        average_rainfall_mm=average,
        cumulative_rainfall_mm=cumulative,
    )


@app.get("/api/metadata")
def metadata(limit: int = Query(default=50, ge=1, le=200)) -> list[dict[str, Any]]:
    return get_metadata(limit)


@app.get("/api/grids")
def grids(capture_date: datetime | None = None) -> dict[str, Any]:
    return get_grid_layer(capture_date)


@app.get("/api/dashboard")
def dashboard(grid_id: str | None = None) -> dict[str, Any]:
    return get_dashboard(grid_id)


@app.delete("/api/dashboard/data")
def clear_dashboard_data() -> dict[str, Any]:
    deleted = delete_processed_data()
    return {
        "status": "complete",
        "deleted": deleted,
        "total_deleted": sum(deleted.values()),
    }


@app.post("/api/context/layers")
def context_layers(request: ContextLayersRequest) -> dict[str, Any]:
    try:
        layers = create_context_layers(request.area)
    except (LookupError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Context layer generation failed: {exc}") from exc

    return {
        **layers,
        "dem_url": f"{settings.api_public_base_url}{layers['dem_url']}",
        "land_cover_url": f"{settings.api_public_base_url}{layers['land_cover_url']}",
    }


@app.get("/api/context/layers")
def saved_context_layers(limit: int = Query(default=10, ge=1, le=50)) -> list[dict[str, Any]]:
    rows = get_context_layers(limit)
    return [
        {
            **row,
            "dem_url": f"{settings.api_public_base_url}{row['dem_url']}",
            "land_cover_url": f"{settings.api_public_base_url}{row['land_cover_url']}",
        }
        for row in rows
    ]


@app.get("/api/context/statistics/latest")
def latest_context_statistics() -> dict[str, Any]:
    return get_latest_context_statistics()


def _change_delta(start_value: Any, end_value: Any) -> float | None:
    if start_value is None or end_value is None:
        return None
    return float(end_value) - float(start_value)


def _change_class(delta_ndvi: float | None, delta_ndbi: float | None) -> str:
    if delta_ndvi is None:
        return "insufficient-data"
    if delta_ndvi <= -0.2 and delta_ndbi is not None and delta_ndbi >= 0.05:
        return "possible-construction"
    if delta_ndvi <= -0.15:
        return "crop-stress-harvest-or-clearing"
    if delta_ndvi <= -0.08:
        return "moderate-vegetation-loss"
    if delta_ndvi >= 0.15:
        return "crop-growth-or-recovery"
    if delta_ndvi >= 0.08:
        return "moderate-vegetation-gain"
    return "stable"


@app.post("/api/change-detection")
def change_detection(request: ChangeDetectionRequest) -> dict[str, Any]:
    available_dates = get_ndvi_capture_dates_for_area(
        area_geojson=request.area,
        start_date=datetime.combine(request.start_date, datetime.min.time()),
        end_date=datetime.combine(request.end_date, datetime.min.time()),
    )
    if len(available_dates) < 2:
        raise HTTPException(
            status_code=404,
            detail=(
                "Change detection needs at least two processed Sentinel-2 scenes in the selected date range. "
                f"Found {len(available_dates)}."
            ),
        )

    start_capture_date = available_dates[0]
    end_capture_date = available_dates[-1]
    start_layer = get_grid_layer(start_capture_date)
    end_layer = get_grid_layer(end_capture_date)
    area = shape(request.area)
    start_by_grid = {
        feature["properties"]["grid_id"]: feature["properties"]
        for feature in start_layer["features"]
    }

    features = []
    summary: dict[str, int] = {}
    for feature in end_layer["features"]:
        if not shape(feature["geometry"]).intersects(area):
            continue

        grid_id = feature["properties"]["grid_id"]
        start = start_by_grid.get(grid_id, {})
        end = feature["properties"]
        start_ndvi = start.get("average_ndvi")
        end_ndvi = end.get("average_ndvi")
        start_ndbi = start.get("average_ndbi")
        end_ndbi = end.get("average_ndbi")
        delta_ndvi = _change_delta(start_ndvi, end_ndvi)
        delta_ndbi = _change_delta(start_ndbi, end_ndbi)
        change_class = _change_class(delta_ndvi, delta_ndbi)
        summary[change_class] = summary.get(change_class, 0) + 1
        features.append(
            {
                **feature,
                "properties": {
                    **feature["properties"],
                    "start_date": request.start_date.isoformat(),
                    "end_date": request.end_date.isoformat(),
                    "start_capture_date": start_capture_date.isoformat(),
                    "end_capture_date": end_capture_date.isoformat(),
                    "start_ndvi": start_ndvi,
                    "end_ndvi": end_ndvi,
                    "delta_ndvi": delta_ndvi,
                    "start_ndbi": start_ndbi,
                    "end_ndbi": end_ndbi,
                    "delta_ndbi": delta_ndbi,
                    "change_class": change_class,
                },
            }
        )

    return {"type": "FeatureCollection", "features": features, "summary": summary}
