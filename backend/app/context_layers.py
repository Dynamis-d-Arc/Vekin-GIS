from __future__ import annotations

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen, urlretrieve

import numpy as np
import planetary_computer
import rasterio
from affine import Affine
from pystac_client import Client
from rasterio.enums import ColorInterp, Resampling
from rasterio.mask import mask
from rasterio.merge import merge
from rasterio.transform import array_bounds
from rasterio.warp import transform_geom
from rasterstats import zonal_stats
from pyproj import Geod
from shapely.geometry import LineString, MultiLineString, box, mapping, shape

from app.config import get_settings
from app.repositories import ensure_grids_for_area, insert_context_statistics, upsert_context_layer


MAX_OVERLAY_PIXELS = 2400
MAX_CONTEXT_AREA_DEGREES = 2.0
BUILT_UP_CLASS = 50
GREEN_COVER_CLASSES = {10, 20, 30, 40, 90, 95, 100}
GEOD = Geod(ellps="WGS84")
ROAD_HIGHWAY_FILTER = (
    "motorway|trunk|primary|secondary|tertiary|unclassified|residential|"
    "motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|living_street|service"
)


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


def _configured_years(value: str, fallback: list[int]) -> list[int]:
    years: list[int] = []
    for entry in value.split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            years.append(int(entry))
        except ValueError:
            continue
    return sorted(set(years)) or fallback


def _asset_hrefs(
    collection: str,
    asset_key: str,
    bbox_values: tuple[float, float, float, float],
    datetime_range: str | None = None,
) -> list[str]:
    settings = get_settings()
    client = Client.open(settings.planetary_computer_stac_url)
    search_kwargs: dict[str, Any] = {
        "collections": [collection],
        "bbox": bbox_values,
        "max_items": 24,
    }
    if datetime_range:
        search_kwargs["datetime"] = datetime_range
    search = client.search(**search_kwargs)
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
    datetime_range: str | None = None,
) -> tuple[np.ndarray, Affine, Any, np.ndarray]:
    datasets = [
        rasterio.open(href)
        for href in _asset_hrefs(collection, asset_key, bbox_values, datetime_range)
    ]
    try:
        mosaic, transform = merge(datasets, bounds=bbox_values)
        crs = datasets[0].crs
        data = mosaic[0]
        height, width = _scaled_shape(mosaic.shape[2], mosaic.shape[1])
        if height == mosaic.shape[1] and width == mosaic.shape[2]:
            return data, transform, crs, data

        with rasterio.MemoryFile() as memory_file:
            profile = datasets[0].profile.copy()
            profile.update(
                driver="GTiff",
                height=mosaic.shape[1],
                width=mosaic.shape[2],
                count=mosaic.shape[0],
                dtype=mosaic.dtype,
                transform=transform,
            )
            with memory_file.open(**profile) as dataset:
                dataset.write(mosaic)
                overlay_data = dataset.read(1, out_shape=(height, width), resampling=resampling)
                return data, transform, crs, overlay_data
    finally:
        for dataset in datasets:
            dataset.close()


def _read_worldpop_population_count(
    *,
    bbox_values: tuple[float, float, float, float],
    output_path: Path,
    year: int,
) -> tuple[np.ndarray, Affine, Any]:
    settings = get_settings()
    if not output_path.exists():
        source_url = settings.worldpop_population_url_template.format(year=year)
        source_path = settings.context_temp_dir / f"worldpop-thailand-{year}.tif"
        if not source_path.exists():
            partial_path = source_path.with_suffix(".tif.part")
            urlretrieve(source_url, partial_path)
            partial_path.replace(source_path)
        crop_geometry = mapping(box(*bbox_values))
        with rasterio.open(source_path) as source:
            cropped, cropped_transform = mask(
                source,
                [crop_geometry],
                crop=True,
                filled=True,
                nodata=np.nan,
                all_touched=True,
            )
            profile = source.profile.copy()
            profile.update(
                driver="GTiff",
                height=cropped.shape[1],
                width=cropped.shape[2],
                count=1,
                dtype="float32",
                transform=cropped_transform,
                nodata=np.nan,
                compress="deflate",
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with rasterio.open(output_path, "w", **profile) as target:
                target.write(cropped[0].astype("float32"), 1)

    with rasterio.open(output_path) as dataset:
        return dataset.read(1), dataset.transform, dataset.crs


def _worldpop_years() -> list[int]:
    settings = get_settings()
    return _configured_years(settings.worldpop_population_years, list(range(2015, 2031)))


def _land_cover_years() -> list[int]:
    settings = get_settings()
    return _configured_years(settings.land_cover_years, [2020, 2021])


def _read_osm_roads(
    bbox_values: tuple[float, float, float, float],
) -> list[LineString]:
    settings = get_settings()
    west, south, east, north = bbox_values
    query = f"""
    [out:json][timeout:{settings.overpass_timeout_seconds}];
    (
      way["highway"~"{ROAD_HIGHWAY_FILTER}"]({south},{west},{north},{east});
    );
    out body geom;
    """
    data = urlencode({"data": query}).encode("utf-8")
    request = Request(
        settings.overpass_api_url,
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Vekin-GIS/1.0 road-density",
        },
        method="POST",
    )
    with urlopen(request, timeout=settings.overpass_timeout_seconds + 10) as response:
        payload = json.loads(response.read().decode("utf-8"))

    roads: list[LineString] = []
    for element in payload.get("elements", []):
        coordinates = [
            (point["lon"], point["lat"])
            for point in element.get("geometry", [])
            if "lon" in point and "lat" in point
        ]
        if len(coordinates) >= 2:
            roads.append(LineString(coordinates))
    return roads


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


def _clean_float(value: Any) -> float | None:
    if value is None:
        return None
    numeric = float(value)
    return numeric if np.isfinite(numeric) else None


def _geometry_area_square_meters(geometry_geojson: dict[str, Any]) -> float:
    area, _ = GEOD.geometry_area_perimeter(shape(geometry_geojson))
    return abs(area)


def _road_density_km_per_square_km(
    *,
    grid_geometry_geojson: dict[str, Any],
    road_lines: list[LineString] | None,
    grid_area_square_meters: float,
) -> float | None:
    if road_lines is None or grid_area_square_meters <= 0:
        return None

    grid_geometry = shape(grid_geometry_geojson)
    road_length_meters = 0.0
    for road in road_lines:
        if not road.intersects(grid_geometry):
            continue
        clipped = road.intersection(grid_geometry)
        if clipped.is_empty:
            continue
        if isinstance(clipped, (LineString, MultiLineString)):
            road_length_meters += abs(GEOD.geometry_length(clipped))
        else:
            road_length_meters += sum(
                abs(GEOD.geometry_length(geometry))
                for geometry in getattr(clipped, "geoms", [])
                if isinstance(geometry, (LineString, MultiLineString))
            )

    if road_length_meters <= 0:
        return 0.0
    return round((road_length_meters / 1000) / (grid_area_square_meters / 1_000_000), 3)


def _context_grid_statistics(
    *,
    area_geojson: dict[str, Any],
    dem: np.ndarray,
    dem_transform: Affine,
    dem_crs: Any,
    land_cover_by_year: dict[int, tuple[np.ndarray, Affine, Any]],
    population_count_by_year: dict[int, tuple[np.ndarray, Affine, Any]],
    road_lines: list[LineString] | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    grids = ensure_grids_for_area(area_geojson)
    if not grids:
        return [], [], [], []

    dem_geometries = [
        transform_geom("EPSG:4326", dem_crs, grid["geometry"])
        if dem_crs
        else grid["geometry"]
        for grid in grids
    ]
    dem_stats = zonal_stats(
        dem_geometries,
        dem.astype("float32"),
        affine=dem_transform,
        stats=["mean", "min", "max"],
        geojson_out=False,
        nodata=np.nan,
    )
    land_cover_stats_by_year: dict[int, list[dict[str, Any]]] = {}
    for land_cover_year, (
        land_cover,
        land_cover_transform,
        land_cover_crs,
    ) in land_cover_by_year.items():
        land_cover_geometries = [
            transform_geom("EPSG:4326", land_cover_crs, grid["geometry"])
            if land_cover_crs
            else grid["geometry"]
            for grid in grids
        ]
        land_cover_stats_by_year[land_cover_year] = zonal_stats(
            land_cover_geometries,
            land_cover,
            affine=land_cover_transform,
            categorical=True,
            geojson_out=False,
            nodata=0,
        )
    latest_land_cover_year = max(land_cover_stats_by_year, default=None)
    land_cover_stats = (
        land_cover_stats_by_year[latest_land_cover_year]
        if latest_land_cover_year is not None
        else [{} for _ in grids]
    )
    population_stats_by_year: dict[int, list[dict[str, Any] | None]] = {}
    population_pixel_area_by_year: dict[int, float] = {}
    for population_year, (
        population_count_raster,
        population_transform,
        population_crs,
    ) in population_count_by_year.items():
        population_geometries = [
            transform_geom("EPSG:4326", population_crs, grid["geometry"])
            if population_crs
            else grid["geometry"]
            for grid in grids
        ]
        population_stats_by_year[population_year] = zonal_stats(
            population_geometries,
            population_count_raster.astype("float32"),
            affine=population_transform,
            stats=["mean"],
            geojson_out=False,
            nodata=np.nan,
            all_touched=True,
        )
        raster_bounds = array_bounds(
            population_count_raster.shape[0],
            population_count_raster.shape[1],
            population_transform,
        )
        raster_area_square_meters = _geometry_area_square_meters(
            mapping(box(*raster_bounds))
        )
        population_pixel_area_by_year[population_year] = (
            raster_area_square_meters / population_count_raster.size
        )
    latest_population_year = max(population_stats_by_year, default=None)
    population_stats = (
        population_stats_by_year[latest_population_year]
        if latest_population_year is not None
        else [None] * len(grids)
    )

    dem_rows: list[dict[str, Any]] = []
    land_cover_rows: list[dict[str, Any]] = []
    urban_context_rows: list[dict[str, Any]] = []
    population_rows: list[dict[str, Any]] = []
    for grid_index, (grid, dem_stat, land_cover_stat, population_stat) in enumerate(zip(
        grids,
        dem_stats,
        land_cover_stats,
        population_stats,
        strict=True,
    )):
        dem_rows.append(
            {
                "grid_id": grid["grid_id"],
                "average_elevation": _clean_float(dem_stat.get("mean")),
                "minimum_elevation": _clean_float(dem_stat.get("min")),
                "maximum_elevation": _clean_float(dem_stat.get("max")),
            }
        )

        class_counts = {
            int(class_value): int(count)
            for class_value, count in land_cover_stat.items()
            if class_value is not None and int(class_value) != 0 and int(count) > 0
        }
        total = sum(class_counts.values())
        dominant_class = max(class_counts, key=class_counts.get) if class_counts else None
        percentages = {
            str(class_value): round((count / total) * 100, 2)
            for class_value, count in sorted(class_counts.items())
        } if total else {}
        grid_area_square_meters = _geometry_area_square_meters(grid["geometry"])
        built_up_count = class_counts.get(BUILT_UP_CLASS, 0)
        green_cover_count = sum(count for class_value, count in class_counts.items() if class_value in GREEN_COVER_CLASSES)
        built_up_area_square_meters = (
            round(grid_area_square_meters * (built_up_count / total), 2)
            if total
            else None
        )
        green_cover_percentage = (
            round((green_cover_count / total) * 100, 2)
            if total
            else None
        )
        latest_population_mean = (
            _clean_float(population_stat.get("mean")) if population_stat else None
        )
        latest_population_pixel_area = (
            population_pixel_area_by_year.get(latest_population_year)
            if latest_population_year is not None
            else None
        )
        population_count = (
            round(latest_population_mean * grid_area_square_meters / latest_population_pixel_area, 2)
            if latest_population_mean is not None
            and latest_population_pixel_area is not None
            and latest_population_pixel_area > 0
            else None
        )
        for population_year, year_stats in population_stats_by_year.items():
            year_stat = year_stats[grid_index]
            year_population_mean = _clean_float(year_stat.get("mean")) if year_stat else None
            year_pixel_area = population_pixel_area_by_year.get(population_year)
            population_rows.append(
                {
                    "grid_id": grid["grid_id"],
                    "population_year": population_year,
                    "population_count": round(
                        year_population_mean * grid_area_square_meters / year_pixel_area,
                        2,
                    )
                    if year_population_mean is not None
                    and year_pixel_area is not None
                    and year_pixel_area > 0
                    else None,
                }
            )
        road_density = _road_density_km_per_square_km(
            grid_geometry_geojson=grid["geometry"],
            road_lines=road_lines,
            grid_area_square_meters=grid_area_square_meters,
        )
        for land_cover_year, year_stats in land_cover_stats_by_year.items():
            year_stat = year_stats[grid_index]
            year_class_counts = {
                int(class_value): int(count)
                for class_value, count in year_stat.items()
                if class_value is not None and int(class_value) != 0 and int(count) > 0
            }
            year_total = sum(year_class_counts.values())
            year_percentages = {
                str(class_value): round((count / year_total) * 100, 2)
                for class_value, count in sorted(year_class_counts.items())
            } if year_total else {}
            land_cover_rows.append(
                {
                    "grid_id": grid["grid_id"],
                    "land_cover_year": land_cover_year,
                    "dominant_class": max(year_class_counts, key=year_class_counts.get) if year_class_counts else None,
                    "class_percentages": year_percentages,
                }
            )
        urban_context_rows.append(
            {
                "grid_id": grid["grid_id"],
                "population_count": population_count,
                "built_up_area_square_meters": built_up_area_square_meters,
                "green_cover_percentage": green_cover_percentage,
                "road_density_km_per_square_km": road_density,
            }
        )

    return dem_rows, land_cover_rows, urban_context_rows, population_rows


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
    population_years = _worldpop_years()
    land_cover_years = _land_cover_years()

    dem, dem_transform, dem_crs, dem_overlay = _read_mosaic(
        collection="cop-dem-glo-30",
        asset_key="data",
        bbox_values=bbox_values,
        resampling=Resampling.bilinear,
    )
    if not dem_path.exists():
        _rgba_png(dem_path, _dem_rgba(dem_overlay))

    land_cover_by_year: dict[int, tuple[np.ndarray, Affine, Any]] = {}
    land_cover_overlay_by_year: dict[int, np.ndarray] = {}
    for land_cover_year in land_cover_years:
        try:
            land_cover, land_cover_transform, land_cover_crs, land_cover_overlay = _read_mosaic(
                collection="esa-worldcover",
                asset_key="map",
                bbox_values=bbox_values,
                resampling=Resampling.nearest,
                datetime_range=f"{land_cover_year}-01-01/{land_cover_year}-12-31",
            )
        except Exception:
            continue
        land_cover_by_year[land_cover_year] = (land_cover, land_cover_transform, land_cover_crs)
        land_cover_overlay_by_year[land_cover_year] = land_cover_overlay
    if not land_cover_by_year:
        land_cover, land_cover_transform, land_cover_crs, land_cover_overlay = _read_mosaic(
            collection="esa-worldcover",
            asset_key="map",
            bbox_values=bbox_values,
            resampling=Resampling.nearest,
        )
        fallback_year = land_cover_years[-1]
        land_cover_by_year[fallback_year] = (land_cover, land_cover_transform, land_cover_crs)
        land_cover_overlay_by_year[fallback_year] = land_cover_overlay

    latest_land_cover_year = max(land_cover_overlay_by_year)
    land_cover_path = settings.context_temp_dir / f"{key}-land-cover-{latest_land_cover_year}.png"
    if not land_cover_path.exists():
        _rgba_png(land_cover_path, _land_cover_rgba(land_cover_overlay_by_year[latest_land_cover_year]))

    population_count_by_year: dict[int, tuple[np.ndarray, Affine, Any]] = {}

    def read_population_year(population_year: int) -> tuple[np.ndarray, Affine, Any]:
        population_count_path = settings.context_temp_dir / f"{key}-population-count-v2-{population_year}.tif"
        return _read_worldpop_population_count(
            bbox_values=bbox_values,
            output_path=population_count_path,
            year=population_year,
        )

    with ThreadPoolExecutor(max_workers=min(4, len(population_years))) as executor:
        futures = {
            executor.submit(read_population_year, population_year): population_year
            for population_year in population_years
        }
        for future in as_completed(futures):
            population_year = futures[future]
            try:
                population_count_by_year[population_year] = future.result()
            except Exception:
                continue

    road_lines = None
    try:
        road_lines = _read_osm_roads(bbox_values)
    except Exception:
        road_lines = None

    relative_dem_url = f"/context/{dem_path.name}"
    relative_land_cover_url = f"/context/{land_cover_path.name}"
    context_layer_id = upsert_context_layer(
        area_hash=key,
        selected_area_geojson=area_geojson,
        bbox_geojson=bbox_geojson,
        dem_url=relative_dem_url,
        land_cover_url=relative_land_cover_url,
    )
    dem_rows, land_cover_rows, urban_context_rows, population_rows = _context_grid_statistics(
        area_geojson=area_geojson,
        dem=dem,
        dem_transform=dem_transform,
        dem_crs=dem_crs,
        land_cover_by_year=land_cover_by_year,
        population_count_by_year=population_count_by_year,
        road_lines=road_lines,
    )
    insert_context_statistics(
        context_layer_id=context_layer_id,
        dem_rows=dem_rows,
        land_cover_rows=land_cover_rows,
        urban_context_rows=urban_context_rows,
        population_rows=population_rows,
    )

    return {
        "context_layer_id": context_layer_id,
        "dem_statistics_count": len(dem_rows),
        "land_cover_statistics_count": len(land_cover_rows),
        "urban_context_statistics_count": len(urban_context_rows),
        "population_statistics_count": len(population_rows),
        "population_years": sorted(population_count_by_year),
        "land_cover_years": sorted(land_cover_by_year),
        "land_cover_year": latest_land_cover_year,
        "bounds": [[south, west], [north, east]],
        "dem_url": relative_dem_url,
        "land_cover_url": relative_land_cover_url,
    }
