from datetime import date
from datetime import timedelta
from typing import Any

import planetary_computer
from pystac_client import Client
from shapely.geometry import box, mapping, shape

from app.config import get_settings


def _bbox_polygon_geojson(item_bbox: list[float], area_geojson: dict[str, Any]) -> dict[str, Any]:
    item_bounds = box(*item_bbox)
    area = shape(area_geojson)
    overlap = item_bounds.intersection(area.envelope)
    if overlap.geom_type == "Polygon" and overlap.area > 0:
        return mapping(overlap)
    return mapping(item_bounds)


def _sentinel_item_payload(item: Any, area_geojson: dict[str, Any]) -> dict[str, Any]:
    signed = planetary_computer.sign(item)
    bbox_geojson = _bbox_polygon_geojson(signed.bbox, area_geojson)
    red_asset = signed.assets.get("B04")
    nir_asset = signed.assets.get("B08")
    ndbi_nir_asset = signed.assets.get("B8A")
    swir_asset = signed.assets.get("B11")
    if not red_asset or not nir_asset or not ndbi_nir_asset or not swir_asset:
        raise LookupError("Matched Sentinel-2 item does not expose B04, B08, B8A, and B11 assets.")

    return {
        "id": signed.id,
        "capture_date": signed.datetime,
        "satellite": signed.properties.get("platform", "Sentinel-2"),
        "cloud_cover": signed.properties.get("eo:cloud_cover"),
        "bbox": signed.bbox,
        "bbox_geojson": bbox_geojson,
        "red_url": red_asset.href,
        "nir_url": nir_asset.href,
        "ndbi_nir_url": ndbi_nir_asset.href,
        "swir_url": swir_asset.href,
        "temporary_image_url": signed.get_self_href(),
    }


def find_sentinel_item(
    *,
    area_geojson: dict[str, Any],
    capture_date: date,
    max_cloud_cover: float,
) -> dict[str, Any]:
    settings = get_settings()
    client = Client.open(settings.planetary_computer_stac_url)
    area = shape(area_geojson)
    start_date = capture_date - timedelta(days=settings.sentinel_search_days)
    end_date = min(capture_date + timedelta(days=settings.sentinel_search_days), date.today())
    date_range = f"{start_date.isoformat()}/{end_date.isoformat()}"

    base_search_args = {
        "collections": [settings.sentinel_collection],
        "intersects": area_geojson,
        "datetime": date_range,
        "sortby": [{"field": "eo:cloud_cover", "direction": "asc"}],
        "max_items": 10,
    }

    search = client.search(
        **base_search_args,
        query={"eo:cloud_cover": {"lt": max_cloud_cover}},
    )
    items = list(search.items())
    if not items:
        fallback_search_args = {**base_search_args, "max_items": 1}
        fallback_items = list(client.search(**fallback_search_args).items())
        fallback = ""
        if fallback_items:
            fallback_item = fallback_items[0]
            fallback_date = fallback_item.datetime.date().isoformat() if fallback_item.datetime else "unknown date"
            fallback_cloud = fallback_item.properties.get("eo:cloud_cover")
            fallback = f" Least-cloudy available scene is {fallback_cloud}% on {fallback_date}."
        raise LookupError(
            "No Sentinel-2 image matched the selected area. "
            f"Searched {date_range} with cloud cover under {max_cloud_cover}%."
            f"{fallback} Try an older date or a higher cloud-cover value."
        )

    return _sentinel_item_payload(items[0], area_geojson)


def find_sentinel_items_for_range(
    *,
    area_geojson: dict[str, Any],
    start_date: date,
    end_date: date,
    max_cloud_cover: float,
) -> list[dict[str, Any]]:
    if start_date > end_date:
        raise LookupError("Start date must be before or equal to end date.")

    settings = get_settings()
    client = Client.open(settings.planetary_computer_stac_url)
    date_range = f"{start_date.isoformat()}/{end_date.isoformat()}"
    search = client.search(
        collections=[settings.sentinel_collection],
        intersects=area_geojson,
        datetime=date_range,
        query={"eo:cloud_cover": {"lt": max_cloud_cover}},
        sortby=[
            {"field": "datetime", "direction": "asc"},
            {"field": "eo:cloud_cover", "direction": "asc"},
        ],
        max_items=100,
    )

    best_by_day: dict[date, Any] = {}
    for item in search.items():
        if not item.datetime:
            continue
        day = item.datetime.date()
        current = best_by_day.get(day)
        current_cloud = current.properties.get("eo:cloud_cover") if current else None
        item_cloud = item.properties.get("eo:cloud_cover")
        if current is None or (item_cloud is not None and (current_cloud is None or item_cloud < current_cloud)):
            best_by_day[day] = item

    if not best_by_day:
        raise LookupError(
            "No Sentinel-2 images matched the selected area. "
            f"Searched {date_range} with cloud cover under {max_cloud_cover}%."
        )

    return [
        _sentinel_item_payload(item, area_geojson)
        for _, item in sorted(best_by_day.items())
    ]
