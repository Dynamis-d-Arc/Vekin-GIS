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
    end_date = capture_date + timedelta(days=settings.sentinel_search_days)
    date_range = f"{start_date.isoformat()}/{end_date.isoformat()}"

    search = client.search(
        collections=[settings.sentinel_collection],
        intersects=area_geojson,
        datetime=date_range,
        query={"eo:cloud_cover": {"lt": max_cloud_cover}},
        sortby=[{"field": "eo:cloud_cover", "direction": "asc"}],
        max_items=10,
    )
    items = list(search.items())
    if not items:
        raise LookupError("No Sentinel-2 image matched the area, date, and cloud-cover threshold.")

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
