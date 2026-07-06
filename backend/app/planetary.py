from datetime import date
from datetime import timedelta
from typing import Any

import planetary_computer
from pystac_client import Client
from shapely.geometry import box, mapping, shape

from app.config import get_settings


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

    item = planetary_computer.sign(items[0])
    bbox_geojson = mapping(box(*item.bbox).intersection(area.envelope))
    red_asset = item.assets.get("B04")
    nir_asset = item.assets.get("B08")
    if not red_asset or not nir_asset:
        raise LookupError("Matched Sentinel-2 item does not expose B04 and B08 assets.")

    return {
        "id": item.id,
        "capture_date": item.datetime,
        "satellite": item.properties.get("platform", "Sentinel-2"),
        "cloud_cover": item.properties.get("eo:cloud_cover"),
        "bbox": item.bbox,
        "bbox_geojson": bbox_geojson,
        "red_url": red_asset.href,
        "nir_url": nir_asset.href,
        "temporary_image_url": item.get_self_href(),
    }
