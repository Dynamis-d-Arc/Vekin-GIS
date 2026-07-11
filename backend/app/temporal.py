from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timedelta
from math import sqrt
from typing import Any, Literal


TemporalGranularity = Literal["weekly", "monthly"]


def _as_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _period_start(value: date, granularity: TemporalGranularity) -> date:
    if granularity == "weekly":
        return value - timedelta(days=value.weekday())
    return value.replace(day=1)


def _period_end(value: date, granularity: TemporalGranularity) -> date:
    if granularity == "weekly":
        return value + timedelta(days=6)
    return value.replace(day=monthrange(value.year, value.month)[1])


def _previous_period(value: date, granularity: TemporalGranularity) -> date:
    if granularity == "weekly":
        return value - timedelta(days=7)
    previous_month_end = value - timedelta(days=1)
    return previous_month_end.replace(day=1)


def _prior_year_period(value: date, granularity: TemporalGranularity) -> date | None:
    if granularity == "monthly":
        return value.replace(year=value.year - 1)
    iso_year, iso_week, _ = value.isocalendar()
    try:
        return date.fromisocalendar(iso_year - 1, iso_week, 1)
    except ValueError:
        return None


def _season_key(value: date, granularity: TemporalGranularity) -> int:
    return value.isocalendar().week if granularity == "weekly" else value.month


def _weighted_average(rows: list[dict[str, Any]], value_key: str, count_key: str) -> float | None:
    total = 0.0
    weight = 0
    for row in rows:
        value = row.get(value_key)
        count = int(row.get(count_key) or 0)
        if value is None or count <= 0:
            continue
        total += float(value) * count
        weight += count
    return total / weight if weight else None


def _aggregate_periods(
    rows: list[dict[str, Any]],
    granularity: TemporalGranularity,
) -> list[dict[str, Any]]:
    grouped: dict[date, list[dict[str, Any]]] = {}
    for row in rows:
        row_date = _as_date(row["date"])
        grouped.setdefault(_period_start(row_date, granularity), []).append(row)

    periods = []
    for period_start, period_rows in sorted(grouped.items()):
        periods.append(
            {
                "period_start": period_start,
                "period_end": _period_end(period_start, granularity),
                "average_ndvi": _weighted_average(
                    period_rows, "average_ndvi", "ndvi_observation_count"
                ),
                "average_ndbi": _weighted_average(
                    period_rows, "average_ndbi", "ndbi_observation_count"
                ),
                "observation_count": sum(
                    int(row.get("ndvi_observation_count") or 0) for row in period_rows
                ),
                "capture_count": sum(int(row.get("capture_count") or 0) for row in period_rows),
            }
        )
    return periods


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _sample_stddev(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    average = sum(values) / len(values)
    return sqrt(sum((value - average) ** 2 for value in values) / (len(values) - 1))


def _delta(current: Any, comparison: Any) -> float | None:
    if current is None or comparison is None:
        return None
    return float(current) - float(comparison)


def _slope_per_30_days(periods: list[dict[str, Any]], value_key: str) -> float | None:
    points = [period for period in periods if period.get(value_key) is not None]
    if len(points) < 2:
        return None
    origin = points[0]["period_start"]
    xs = [(point["period_start"] - origin).days for point in points]
    ys = [float(point[value_key]) for point in points]
    x_mean = sum(xs) / len(xs)
    y_mean = sum(ys) / len(ys)
    denominator = sum((value - x_mean) ** 2 for value in xs)
    if denominator == 0:
        return None
    slope_per_day = sum(
        (x_value - x_mean) * (y_value - y_mean)
        for x_value, y_value in zip(xs, ys, strict=True)
    ) / denominator
    return slope_per_day * 30


def _comparison_fields(
    *,
    current: dict[str, Any],
    all_periods_by_start: dict[date, dict[str, Any]],
    historical_periods: list[dict[str, Any]],
    granularity: TemporalGranularity,
    value_key: str,
    prefix: str,
) -> dict[str, Any]:
    period_start = current["period_start"]
    previous = all_periods_by_start.get(_previous_period(period_start, granularity))
    prior_year_start = _prior_year_period(period_start, granularity)
    prior_year = all_periods_by_start.get(prior_year_start) if prior_year_start else None
    baselines = [
        float(period[value_key])
        for period in historical_periods
        if period["period_start"] < period_start
        and _season_key(period["period_start"], granularity) == _season_key(period_start, granularity)
        and period.get(value_key) is not None
    ]
    historical_mean = _mean(baselines)
    historical_stddev = _sample_stddev(baselines)
    anomaly = _delta(current.get(value_key), historical_mean)
    anomaly_zscore = (
        anomaly / historical_stddev
        if anomaly is not None and historical_stddev not in (None, 0)
        else None
    )
    return {
        f"previous_period_{prefix}": previous.get(value_key) if previous else None,
        f"previous_period_delta_{prefix}": _delta(
            current.get(value_key), previous.get(value_key) if previous else None
        ),
        f"previous_year_{prefix}": prior_year.get(value_key) if prior_year else None,
        f"year_over_year_delta_{prefix}": _delta(
            current.get(value_key), prior_year.get(value_key) if prior_year else None
        ),
        f"historical_mean_{prefix}": historical_mean,
        f"historical_sample_count_{prefix}": len(baselines),
        f"anomaly_{prefix}": anomaly,
        f"anomaly_zscore_{prefix}": anomaly_zscore,
    }


def build_temporal_analysis(
    daily_rows: list[dict[str, Any]],
    *,
    granularity: TemporalGranularity,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict[str, Any]:
    if granularity not in ("weekly", "monthly"):
        raise ValueError("granularity must be 'weekly' or 'monthly'")

    normalized_rows = [{**row, "date": _as_date(row["date"])} for row in daily_rows]
    selected_rows = [
        row
        for row in normalized_rows
        if (start_date is None or row["date"] >= start_date)
        and (end_date is None or row["date"] <= end_date)
    ]
    historical_periods = _aggregate_periods(normalized_rows, granularity)
    selected_periods = _aggregate_periods(selected_rows, granularity)
    historical_by_start = {period["period_start"]: period for period in historical_periods}

    enriched_periods = []
    for period in selected_periods:
        enriched_periods.append(
            {
                **period,
                **_comparison_fields(
                    current=period,
                    all_periods_by_start=historical_by_start,
                    historical_periods=historical_periods,
                    granularity=granularity,
                    value_key="average_ndvi",
                    prefix="ndvi",
                ),
                **_comparison_fields(
                    current=period,
                    all_periods_by_start=historical_by_start,
                    historical_periods=historical_periods,
                    granularity=granularity,
                    value_key="average_ndbi",
                    prefix="ndbi",
                ),
            }
        )

    latest = enriched_periods[-1] if enriched_periods else {}
    return {
        "granularity": granularity,
        "periods": enriched_periods,
        "summary": {
            "period_count": len(enriched_periods),
            "ndvi_slope_per_30_days": _slope_per_30_days(enriched_periods, "average_ndvi"),
            "ndbi_slope_per_30_days": _slope_per_30_days(enriched_periods, "average_ndbi"),
            "latest_period_start": latest.get("period_start"),
            "latest_previous_period_delta_ndvi": latest.get("previous_period_delta_ndvi"),
            "latest_year_over_year_delta_ndvi": latest.get("year_over_year_delta_ndvi"),
            "latest_anomaly_ndvi": latest.get("anomaly_ndvi"),
            "latest_anomaly_zscore_ndvi": latest.get("anomaly_zscore_ndvi"),
        },
    }
