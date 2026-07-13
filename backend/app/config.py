from functools import lru_cache
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
    hydro_rivers_path: Path = Path("HydroRIVERS_v10")
    worldpop_population_url_template: str = (
        "https://data.worldpop.org/GIS/Population/Global_2015_2030/"
        "R2025A/{year}/THA/v1/1km_ua/constrained/"
        "tha_pop_{year}_CN_1km_R2025A_UA_v1.tif"
    )
    worldpop_population_years: str = ",".join(str(year) for year in range(2015, 2031))
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
