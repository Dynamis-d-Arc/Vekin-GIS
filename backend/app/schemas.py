from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field
from pydantic import ConfigDict


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


class OpenMeteoWeatherRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    start_date: date
    end_date: date


class OpenMeteoDailyWeather(BaseModel):
    date: date
    temperature_c: float | None
    rainfall_mm: float | None


class OpenMeteoWeatherResponse(BaseModel):
    source: str
    source_url: str
    latitude: float
    longitude: float
    timezone: str | None
    timezone_abbreviation: str | None
    utc_offset_seconds: int | None
    start_date: date
    end_date: date
    days_returned: int
    average_temperature_c: float | None
    cumulative_rainfall_mm: float | None
    daily: list[OpenMeteoDailyWeather]


class SupplyChainFarmMetrics(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    cow_count: int | None = Field(default=None, ge=0, alias="cowCount")
    herd_type: Literal["dairy", "beef", "mixed"] | None = Field(default=None, alias="herdType")
    daily_output_kg: float | None = Field(default=None, ge=0, alias="dailyOutputKg")
    co2e_kg_per_day: float | None = Field(default=None, ge=0, alias="co2eKgPerDay")


class SupplyChainStopBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(default=None, description="Optional client-side stop id from legacy localStorage data.")
    type: Literal["farm", "cooperative", "dpo", "processor", "retailer"]
    name: str | None = None
    geometry: dict[str, Any] = Field(..., description="Polygon or MultiPolygon GeoJSON geometry in EPSG:4326")
    farm_metrics: SupplyChainFarmMetrics | None = Field(default=None, alias="farmMetrics")


class SupplyChainRouteLinkBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_stop_id: str = Field(..., min_length=1, alias="fromStopId")
    to_stop_id: str = Field(..., min_length=1, alias="toStopId")
    type: Literal["inbound", "outbound", "chain", "custom"] = "custom"
    metadata: dict[str, Any] = Field(default_factory=dict)


class SupplyChainRouteCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    stops: list[SupplyChainStopBase] = Field(default_factory=list, min_length=2)
    links: list[SupplyChainRouteLinkBase] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SupplyChainRouteUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    stops: list[SupplyChainStopBase] = Field(default_factory=list, min_length=2)
    links: list[SupplyChainRouteLinkBase] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SupplyChainStopResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    client_stop_id: str | None = Field(default=None, alias="clientStopId")
    type: str
    name: str | None
    geometry: dict[str, Any]
    farm_metrics: dict[str, Any] = Field(default_factory=dict, alias="farmMetrics")
    stop_order: int = Field(alias="stopOrder")


class SupplyChainRouteLinkResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    from_stop_id: str = Field(alias="fromStopId")
    to_stop_id: str = Field(alias="toStopId")
    from_client_stop_id: str | None = Field(default=None, alias="fromClientStopId")
    to_client_stop_id: str | None = Field(default=None, alias="toClientStopId")
    type: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    link_order: int = Field(alias="linkOrder")


class SupplyChainRouteResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    description: str | None
    metadata: dict[str, Any]
    stops: list[SupplyChainStopResponse]
    links: list[SupplyChainRouteLinkResponse] = Field(default_factory=list)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
