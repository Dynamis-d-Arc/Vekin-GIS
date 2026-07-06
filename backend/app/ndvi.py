from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.mask import mask
from rasterio.warp import transform_geom
from rasterstats import zonal_stats
from shapely.geometry import mapping, shape

from app.config import get_settings
from app.repositories import get_grids_intersecting


def _read_band_for_area(asset_url: str, area_geojson: dict[str, Any]) -> tuple[np.ndarray, dict[str, Any]]:
    with rasterio.Env():
        with rasterio.open(asset_url) as src:
            area = shape(area_geojson)
            src_area = transform_geom("EPSG:4326", src.crs, mapping(area))
            out_image, out_transform = mask(src, [src_area], crop=True, indexes=1, filled=True)
            profile = src.profile.copy()
            profile.update(
                height=out_image.shape[0],
                width=out_image.shape[1],
                transform=out_transform,
                count=1,
                dtype="float32",
                nodata=np.nan,
            )
            return out_image.astype("float32"), profile


def generate_ndvi(
    *,
    red_url: str,
    nir_url: str,
    area_geojson: dict[str, Any],
    item_id: str,
) -> Path:
    settings = get_settings()
    settings.ndvi_temp_dir.mkdir(parents=True, exist_ok=True)

    red, profile = _read_band_for_area(red_url, area_geojson)
    nir, _ = _read_band_for_area(nir_url, area_geojson)

    denominator = nir + red
    ndvi = np.divide(
        nir - red,
        denominator,
        out=np.full_like(nir, np.nan, dtype="float32"),
        where=denominator != 0,
    )
    ndvi = np.clip(ndvi, -1, 1).astype("float32")

    output_path = settings.ndvi_temp_dir / f"{item_id}-ndvi.tif"
    with rasterio.open(output_path, "w", **profile) as dst:
        dst.write(ndvi, 1)

    return output_path


def calculate_grid_statistics(
    *,
    ndvi_path: Path,
    area_geojson: dict[str, Any],
    capture_date: datetime,
) -> list[dict[str, Any]]:
    grids = get_grids_intersecting(area_geojson)
    if not grids:
        return []

    with rasterio.open(ndvi_path) as src:
        raster_crs = src.crs

    geometries = [
        transform_geom("EPSG:4326", raster_crs, grid["geometry"])
        for grid in grids
    ]

    stats = zonal_stats(
        geometries,
        ndvi_path,
        stats=["mean", "min", "max"],
        geojson_out=False,
        nodata=np.nan,
    )

    rows: list[dict[str, Any]] = []
    for grid, stat in zip(grids, stats, strict=True):
        rows.append(
            {
                "grid_id": grid["grid_id"],
                "capture_date": capture_date,
                "average_ndvi": stat.get("mean"),
                "minimum_ndvi": stat.get("min"),
                "maximum_ndvi": stat.get("max"),
                "geometry": grid["geometry"],
            }
        )
    return rows
