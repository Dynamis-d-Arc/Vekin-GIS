from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import close_pool, open_pool
from app.ndvi import calculate_grid_statistics, generate_ndvi
from app.planetary import find_sentinel_item
from app.repositories import (
    get_dashboard,
    get_grid_layer,
    get_metadata,
    insert_ndvi_statistics,
    insert_satellite_image,
    update_satellite_status,
)
from app.schemas import AreaDateRequest, ChangeDetectionRequest, ProcessResponse


settings = get_settings()
app = FastAPI(title="Vekin GIS Sentinel-2 Platform")

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

    image_id = insert_satellite_image(
        capture_date=item["capture_date"],
        satellite=item["satellite"],
        cloud_cover=item["cloud_cover"],
        bbox_geojson=item["bbox_geojson"],
        image_url=item["temporary_image_url"],
        processing_status="processing",
    )

    try:
        ndvi_path = generate_ndvi(
            red_url=item["red_url"],
            nir_url=item["nir_url"],
            area_geojson=request.area,
            item_id=item["id"],
        )
        rows = calculate_grid_statistics(
            ndvi_path=ndvi_path,
            area_geojson=request.area,
            capture_date=item["capture_date"],
        )
        count = insert_ndvi_statistics(rows, image_id)
        update_satellite_status(image_id, "complete")
    except Exception as exc:
        update_satellite_status(image_id, "failed")
        raise HTTPException(status_code=500, detail=f"NDVI processing failed: {exc}") from exc

    return ProcessResponse(
        satellite_image_id=image_id,
        capture_date=item["capture_date"],
        status="complete",
        grids_processed=count,
        ndvi_temp_path=str(ndvi_path),
    )


@app.get("/api/metadata")
def metadata(limit: int = Query(default=50, ge=1, le=200)) -> list[dict[str, Any]]:
    return get_metadata(limit)


@app.get("/api/grids")
def grids(capture_date: datetime | None = None) -> dict[str, Any]:
    return get_grid_layer(capture_date)


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    return get_dashboard()


@app.post("/api/change-detection")
def change_detection(request: ChangeDetectionRequest) -> dict[str, Any]:
    start_layer = get_grid_layer(datetime.combine(request.start_date, datetime.min.time()))
    end_layer = get_grid_layer(datetime.combine(request.end_date, datetime.min.time()))
    start_by_grid = {
        feature["properties"]["grid_id"]: feature["properties"]["average_ndvi"]
        for feature in start_layer["features"]
    }

    features = []
    for feature in end_layer["features"]:
        grid_id = feature["properties"]["grid_id"]
        start_value = start_by_grid.get(grid_id)
        end_value = feature["properties"]["average_ndvi"]
        if start_value is None or end_value is None:
            delta = None
        else:
            delta = end_value - start_value
        features.append(
            {
                **feature,
                "properties": {
                    **feature["properties"],
                    "start_ndvi": start_value,
                    "end_ndvi": end_value,
                    "delta_ndvi": delta,
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}

