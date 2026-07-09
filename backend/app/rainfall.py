from datetime import date, timedelta
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
import gzip
import shutil

import rasterio
from rasterio.warp import transform_geom
from rasterstats import zonal_stats
from shapely.geometry import mapping, shape

from app.config import get_settings


CHIRPS_SOURCE = "chirps-daily"


def _daterange(start_date: date, end_date: date) -> list[date]:
    days = (end_date - start_date).days
    return [start_date + timedelta(days=offset) for offset in range(days + 1)]


def chirps_daily_url(capture_date: date, *, preliminary: bool = False) -> str:
    settings = get_settings()
    base_url = settings.chirps_prelim_daily_base_url if preliminary else settings.chirps_daily_base_url
    filename = f"chirps-v2.0.{capture_date:%Y.%m.%d}.tif.gz"
    return f"{base_url.rstrip('/')}/{capture_date:%Y}/{filename}"


def download_chirps_daily(capture_date: date) -> tuple[Path, str]:
    settings = get_settings()
    final_year_dir = settings.rainfall_temp_dir / "chirps-daily" / f"{capture_date:%Y}"
    prelim_year_dir = settings.rainfall_temp_dir / "chirps-daily-prelim" / f"{capture_date:%Y}"

    filename = f"chirps-v2.0.{capture_date:%Y.%m.%d}.tif"
    final_tif_path = final_year_dir / filename
    if final_tif_path.exists():
        return final_tif_path, chirps_daily_url(capture_date)

    download_errors: list[str] = []
    for candidate_url, tif_path in (
        (chirps_daily_url(capture_date), final_tif_path),
        (chirps_daily_url(capture_date, preliminary=True), prelim_year_dir / filename),
    ):
        if tif_path.exists():
            return tif_path, candidate_url

        tif_path.parent.mkdir(parents=True, exist_ok=True)
        gz_path = tif_path.with_suffix(".tif.gz")
        try:
            with urlopen(candidate_url, timeout=60) as response, gz_path.open("wb") as target:
                shutil.copyfileobj(response, target)

            with gzip.open(gz_path, "rb") as source, tif_path.open("wb") as target:
                shutil.copyfileobj(source, target)
            gz_path.unlink(missing_ok=True)
            return tif_path, candidate_url
        except HTTPError as exc:
            download_errors.append(f"{candidate_url} returned HTTP {exc.code}")
        except URLError as exc:
            download_errors.append(f"{candidate_url} failed: {exc.reason}")
        finally:
            gz_path.unlink(missing_ok=True)

    raise LookupError(f"CHIRPS Daily rainfall is unavailable for {capture_date}: {'; '.join(download_errors)}")


def calculate_area_rainfall_statistics(
    *,
    rainfall_path: Path,
    area_geojson: dict[str, Any],
    capture_date: date,
    source_url: str,
) -> dict[str, Any]:
    with rasterio.open(rainfall_path) as src:
        area = shape(area_geojson)
        geometry = transform_geom("EPSG:4326", src.crs, mapping(area))
        nodata = src.nodata if src.nodata is not None else -9999

    stats = zonal_stats(
        [geometry],
        rainfall_path,
        stats=["mean", "min", "max", "median", "std", "count"],
        all_touched=True,
        nodata=nodata,
    )[0]

    return {
        "capture_date": capture_date,
        "average_rainfall_mm": stats.get("mean"),
        "minimum_rainfall_mm": stats.get("min"),
        "maximum_rainfall_mm": stats.get("max"),
        "median_rainfall_mm": stats.get("median"),
        "rainfall_stddev_mm": stats.get("std"),
        "valid_pixel_count": int(stats.get("count") or 0),
        "source_url": source_url,
    }


def calculate_grid_rainfall_statistics(
    *,
    rainfall_path: Path,
    grids: list[dict[str, Any]],
    capture_date: date,
    source_url: str,
) -> list[dict[str, Any]]:
    if not grids:
        return []

    with rasterio.open(rainfall_path) as src:
        geometries = [
            transform_geom("EPSG:4326", src.crs, grid["geometry"])
            for grid in grids
        ]
        nodata = src.nodata if src.nodata is not None else -9999

    statistics = zonal_stats(
        geometries,
        rainfall_path,
        stats=["mean", "min", "max", "median", "std", "count"],
        all_touched=True,
        nodata=nodata,
    )
    rows = []
    for grid, stats in zip(grids, statistics, strict=True):
        valid_pixel_count = int(stats.get("count") or 0)
        if valid_pixel_count == 0 or stats.get("mean") is None:
            continue
        rows.append(
            {
                "grid_id": grid["grid_id"],
                "capture_date": capture_date,
                "average_rainfall_mm": stats.get("mean"),
                "minimum_rainfall_mm": stats.get("min"),
                "maximum_rainfall_mm": stats.get("max"),
                "median_rainfall_mm": stats.get("median"),
                "rainfall_stddev_mm": stats.get("std"),
                "valid_pixel_count": valid_pixel_count,
                "source_url": source_url,
            }
        )
    return rows


def calculate_rainfall_range(
    *,
    area_geojson: dict[str, Any],
    grids: list[dict[str, Any]],
    start_date: date,
    end_date: date,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if end_date < start_date:
        raise ValueError("end_date must be on or after start_date")

    rows: list[dict[str, Any]] = []
    grid_rows: list[dict[str, Any]] = []
    for capture_date in _daterange(start_date, end_date):
        rainfall_path, source_url = download_chirps_daily(capture_date)
        row = calculate_area_rainfall_statistics(
            rainfall_path=rainfall_path,
            area_geojson=area_geojson,
            capture_date=capture_date,
            source_url=source_url,
        )
        if row["valid_pixel_count"] > 0 and row["average_rainfall_mm"] is not None:
            rows.append(row)
        grid_rows.extend(
            calculate_grid_rainfall_statistics(
                rainfall_path=rainfall_path,
                grids=grids,
                capture_date=capture_date,
                source_url=source_url,
            )
        )
    return rows, grid_rows
