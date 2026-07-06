from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import numpy as np
import planetary_computer
import rasterio
from pystac_client import Client
from rasterio.enums import ColorInterp, Resampling
from rasterio.merge import merge
from shapely.geometry import box, mapping, shape

from app.config import get_settings
from app.repositories import upsert_context_layer


MAX_OVERLAY_PIXELS = 2400
MAX_CONTEXT_AREA_DEGREES = 2.0


def _rgba_png(path: Path, rgba: np.ndarray) -> None:
    with rasterio.open(
        path,
        "w",
        driver="PNG",
        height=rgba.shape[0],
        width=rgba.shape[1],
        count=4,
        dtype="uint8",
    ) as dst:
        dst.write(np.moveaxis(rgba, 2, 0))
        dst.colorinterp = (
            ColorInterp.red,
            ColorInterp.green,
            ColorInterp.blue,
            ColorInterp.alpha,
        )


def _scaled_shape(width: int, height: int) -> tuple[int, int]:
    scale = min(MAX_OVERLAY_PIXELS / width, MAX_OVERLAY_PIXELS / height, 1)
    return max(1, round(height * scale)), max(1, round(width * scale))


def _asset_hrefs(collection: str, asset_key: str, bbox_values: tuple[float, float, float, float]) -> list[str]:
    settings = get_settings()
    client = Client.open(settings.planetary_computer_stac_url)
    search = client.search(collections=[collection], bbox=bbox_values, max_items=24)
    hrefs = []
    for item in search.items():
        signed = planetary_computer.sign(item)
        asset = signed.assets.get(asset_key)
        if asset:
            hrefs.append(asset.href)
    if not hrefs:
        raise LookupError(f"No {collection} assets found for the selected area.")
    return hrefs


def _read_mosaic(
    *,
    collection: str,
    asset_key: str,
    bbox_values: tuple[float, float, float, float],
    resampling: Resampling,
) -> np.ndarray:
    datasets = [rasterio.open(href) for href in _asset_hrefs(collection, asset_key, bbox_values)]
    try:
        mosaic, _ = merge(datasets, bounds=bbox_values)
        height, width = _scaled_shape(mosaic.shape[2], mosaic.shape[1])
        if height == mosaic.shape[1] and width == mosaic.shape[2]:
            return mosaic[0]

        with rasterio.MemoryFile() as memory_file:
            profile = datasets[0].profile.copy()
            profile.update(
                driver="GTiff",
                height=mosaic.shape[1],
                width=mosaic.shape[2],
                count=mosaic.shape[0],
                dtype=mosaic.dtype,
            )
            with memory_file.open(**profile) as dataset:
                dataset.write(mosaic)
                return dataset.read(1, out_shape=(height, width), resampling=resampling)
    finally:
        for dataset in datasets:
            dataset.close()


def _dem_rgba(data: np.ndarray) -> np.ndarray:
    valid = np.isfinite(data)
    if not np.any(valid):
        return np.zeros((data.shape[0], data.shape[1], 4), dtype=np.uint8)

    lo, hi = np.nanpercentile(data[valid], [2, 98])
    normalized = np.clip((data - lo) / max(hi - lo, 1), 0, 1)
    stops = np.array(
        [
            [39, 108, 95],
            [133, 166, 91],
            [221, 197, 109],
            [184, 132, 89],
            [245, 245, 238],
        ],
        dtype=np.float32,
    )
    scaled = normalized * (len(stops) - 1)
    left = np.floor(scaled).astype(np.int16)
    right = np.clip(left + 1, 0, len(stops) - 1)
    mix = (scaled - left)[..., None]
    rgb = stops[left] * (1 - mix) + stops[right] * mix
    alpha = np.where(valid, 210, 0).astype(np.uint8)
    return np.dstack([rgb.astype(np.uint8), alpha])


def _land_cover_rgba(data: np.ndarray) -> np.ndarray:
    colors = {
        10: (0, 100, 0, 190),
        20: (255, 187, 34, 185),
        30: (255, 255, 76, 175),
        40: (240, 150, 255, 180),
        50: (250, 0, 0, 185),
        60: (180, 180, 180, 170),
        70: (240, 240, 240, 175),
        80: (0, 100, 200, 185),
        90: (0, 150, 160, 180),
        95: (0, 207, 117, 180),
        100: (250, 230, 160, 175),
    }
    rgba = np.zeros((data.shape[0], data.shape[1], 4), dtype=np.uint8)
    for value, color in colors.items():
        rgba[data == value] = color
    return rgba


def create_context_layers(area_geojson: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    area = shape(area_geojson)
    west, south, east, north = area.bounds
    bbox_values = (west, south, east, north)
    bbox_geojson = mapping(box(*bbox_values))
    bbox_area = (east - west) * (north - south)
    if bbox_area > MAX_CONTEXT_AREA_DEGREES:
        raise ValueError("Selected area is too large for on-demand DEM and land-cover overlays.")

    settings.context_temp_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(",".join(f"{value:.6f}" for value in bbox_values).encode("utf-8")).hexdigest()[:16]
    dem_path = settings.context_temp_dir / f"{key}-dem.png"
    land_cover_path = settings.context_temp_dir / f"{key}-land-cover.png"

    if not dem_path.exists():
        dem = _read_mosaic(
            collection="cop-dem-glo-30",
            asset_key="data",
            bbox_values=bbox_values,
            resampling=Resampling.bilinear,
        )
        _rgba_png(dem_path, _dem_rgba(dem))

    if not land_cover_path.exists():
        land_cover = _read_mosaic(
            collection="esa-worldcover",
            asset_key="map",
            bbox_values=bbox_values,
            resampling=Resampling.nearest,
        )
        _rgba_png(land_cover_path, _land_cover_rgba(land_cover))

    relative_dem_url = f"/context/{dem_path.name}"
    relative_land_cover_url = f"/context/{land_cover_path.name}"
    context_layer_id = upsert_context_layer(
        area_hash=key,
        selected_area_geojson=area_geojson,
        bbox_geojson=bbox_geojson,
        dem_url=relative_dem_url,
        land_cover_url=relative_land_cover_url,
    )

    return {
        "context_layer_id": context_layer_id,
        "bounds": [[south, west], [north, east]],
        "dem_url": relative_dem_url,
        "land_cover_url": relative_land_cover_url,
    }
