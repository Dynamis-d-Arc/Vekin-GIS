from datetime import date
from json import JSONDecodeError
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen
import json


OPEN_METEO_SOURCE = "open-meteo-archive"
DAILY_VARIABLES = ("temperature_2m_mean", "precipitation_sum")
DEFAULT_OPEN_METEO_ARCHIVE_API_URL = "https://archive-api.open-meteo.com/v1/archive"


def open_meteo_archive_url(
    *,
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
    base_url: str | None = None,
) -> str:
    if base_url is None:
        from app.config import get_settings

        base_url = get_settings().open_meteo_archive_api_url
    query = urlencode(
        {
            "latitude": latitude,
            "longitude": longitude,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "daily": ",".join(DAILY_VARIABLES),
            "timezone": "auto",
        }
    )
    return f"{base_url or DEFAULT_OPEN_METEO_ARCHIVE_API_URL}?{query}"


def _mean(values: list[float | None]) -> float | None:
    finite_values = [value for value in values if value is not None]
    if not finite_values:
        return None
    return sum(finite_values) / len(finite_values)


def _sum(values: list[float | None]) -> float | None:
    finite_values = [value for value in values if value is not None]
    if not finite_values:
        return None
    return sum(finite_values)


def _parse_open_meteo_daily(payload: dict[str, Any]) -> list[dict[str, Any]]:
    daily = payload.get("daily")
    if not isinstance(daily, dict):
        raise ValueError("Open-Meteo response did not include daily weather data")

    times = daily.get("time") or []
    temperatures = daily.get("temperature_2m_mean") or []
    rainfall = daily.get("precipitation_sum") or []
    if not (len(times) == len(temperatures) == len(rainfall)):
        raise ValueError("Open-Meteo daily weather arrays have mismatched lengths")

    rows: list[dict[str, Any]] = []
    for time, temperature, rainfall_mm in zip(times, temperatures, rainfall, strict=True):
        rows.append(
            {
                "date": date.fromisoformat(time),
                "temperature_c": temperature,
                "rainfall_mm": rainfall_mm,
            }
        )
    return rows


def fetch_open_meteo_daily_weather(
    *,
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
) -> dict[str, Any]:
    if end_date < start_date:
        raise ValueError("end_date must be on or after start_date")

    source_url = open_meteo_archive_url(
        latitude=latitude,
        longitude=longitude,
        start_date=start_date,
        end_date=end_date,
    )
    try:
        with urlopen(source_url, timeout=60) as response:
            payload = json.load(response)
    except HTTPError as exc:
        raise LookupError(f"Open-Meteo returned HTTP {exc.code}") from exc
    except URLError as exc:
        raise LookupError(f"Open-Meteo request failed: {exc.reason}") from exc
    except JSONDecodeError as exc:
        raise ValueError("Open-Meteo returned invalid JSON") from exc

    rows = _parse_open_meteo_daily(payload)
    temperatures = [row["temperature_c"] for row in rows]
    rainfall = [row["rainfall_mm"] for row in rows]
    return {
        "source": OPEN_METEO_SOURCE,
        "source_url": source_url,
        "latitude": payload.get("latitude", latitude),
        "longitude": payload.get("longitude", longitude),
        "timezone": payload.get("timezone"),
        "timezone_abbreviation": payload.get("timezone_abbreviation"),
        "utc_offset_seconds": payload.get("utc_offset_seconds"),
        "start_date": start_date,
        "end_date": end_date,
        "days_returned": len(rows),
        "average_temperature_c": _mean(temperatures),
        "cumulative_rainfall_mm": _sum(rainfall),
        "daily": rows,
    }
