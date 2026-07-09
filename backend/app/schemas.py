from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class AreaDateRequest(BaseModel):
    area: dict[str, Any] = Field(..., description="GeoJSON geometry in EPSG:4326")
    date: date
    max_cloud_cover: float = 40


class AreaDateRangeRequest(BaseModel):
    area: dict[str, Any] = Field(..., description="GeoJSON geometry in EPSG:4326")
    start_date: date
    end_date: date
    max_cloud_cover: float = 40


class ChangeDetectionRequest(BaseModel):
    area: dict[str, Any]
    start_date: date
    end_date: date


class ContextLayersRequest(BaseModel):
    area: dict[str, Any] = Field(..., description="GeoJSON geometry in EPSG:4326")


class ImageSearchResult(BaseModel):
    id: str
    capture_date: datetime
    satellite: str
    cloud_cover: float | None
    bbox: list[float]


class ProcessResponse(BaseModel):
    satellite_image_id: str
    capture_date: datetime
    status: str
    grids_processed: int
    ndvi_temp_path: str | None
    ndbi_temp_path: str | None = None


class ProcessRangeResponse(BaseModel):
    status: str
    images_processed: int
    grids_processed: int
    results: list[ProcessResponse]


class RainfallProcessResponse(BaseModel):
    area_id: str
    status: str
    source: str
    days_processed: int
    grid_rows_processed: int
    start_date: date
    end_date: date
    average_rainfall_mm: float | None
    cumulative_rainfall_mm: float | None
