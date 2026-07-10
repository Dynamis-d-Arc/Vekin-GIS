from functools import lru_cache
from datetime import datetime, timezone
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql://vekin:vekin@localhost:5432/vekin_gis"
    planetary_computer_stac_url: str = "https://planetarycomputer.microsoft.com/api/stac/v1"
    sentinel_collection: str = "sentinel-2-l2a"
    api_public_base_url: str = "http://localhost:8000"
    ndvi_temp_dir: Path = Path("tmp/ndvi")
    rainfall_temp_dir: Path = Path("tmp/rainfall")
    chirps_daily_base_url: str = "https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_daily/tifs/p05"
    chirps_prelim_daily_base_url: str = "https://data.chc.ucsb.edu/products/CHIRPS-2.0/prelim/global_daily/tifs/p05"
    context_temp_dir: Path = Path("tmp/context")
    context_statistics_schema: str | None = None
    context_statistics_schema_reference_table: str = "BKK_TMD_WEATHER_DATA"
    worldpop_population_density_url: str = (
        "https://worldpop.arcgis.com/arcgis/rest/services/"
        "WorldPop_Population_Density_100m/ImageServer/exportImage"
    )
    worldpop_population_time_ms: int = 1577836800000
    worldpop_population_years: str = "2020,2021,2022,2023,2024"
    land_cover_years: str = "2020,2021"
    overpass_api_url: str = "https://overpass-api.de/api/interpreter"
    overpass_timeout_seconds: int = 45
    cors_origins: str = "*"
    sentinel_search_days: int = 30

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def population_year_time_ms(year: int) -> int:
    return int(datetime(year, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
