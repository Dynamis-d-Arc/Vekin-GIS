from datetime import datetime
from typing import Any

from psycopg.types.json import Json

from app.db import get_connection


def insert_satellite_image(
    *,
    capture_date: datetime,
    satellite: str,
    cloud_cover: float | None,
    bbox_geojson: dict[str, Any],
    image_url: str | None,
    processing_status: str,
) -> str:
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO satellite_images (
              capture_date, satellite, cloud_cover, bbox, image_url, processing_status
            )
            VALUES (
              %(capture_date)s,
              %(satellite)s,
              %(cloud_cover)s,
              ST_SetSRID(ST_GeomFromGeoJSON(%(bbox_geojson)s), 4326),
              %(image_url)s,
              %(processing_status)s
            )
            RETURNING id::text
            """,
            {
                "capture_date": capture_date,
                "satellite": satellite,
                "cloud_cover": cloud_cover,
                "bbox_geojson": Json(bbox_geojson),
                "image_url": image_url,
                "processing_status": processing_status,
            },
        ).fetchone()
        conn.commit()
        return row["id"]


def update_satellite_status(image_id: str, status: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE satellite_images SET processing_status = %s WHERE id = %s",
            (status, image_id),
        )
        conn.commit()


def get_grids_intersecting(geometry_geojson: dict[str, Any]) -> list[dict[str, Any]]:
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT
              grid_id,
              ST_AsGeoJSON(geometry)::json AS geometry
            FROM grids
            WHERE ST_Intersects(
              geometry,
              ST_SetSRID(ST_GeomFromGeoJSON(%(geometry)s), 4326)
            )
            ORDER BY grid_id
            """,
            {"geometry": Json(geometry_geojson)},
        ).fetchall()


def insert_ndvi_statistics(rows: list[dict[str, Any]], satellite_image_id: str) -> int:
    if not rows:
        return 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO ndvi_statistics (
                  grid_id,
                  capture_date,
                  average_ndvi,
                  minimum_ndvi,
                  maximum_ndvi,
                  geometry,
                  satellite_image_id
                )
                VALUES (
                  %(grid_id)s,
                  %(capture_date)s,
                  %(average_ndvi)s,
                  %(minimum_ndvi)s,
                  %(maximum_ndvi)s,
                  ST_SetSRID(ST_GeomFromGeoJSON(%(geometry)s), 4326),
                  %(satellite_image_id)s
                )
                ON CONFLICT (grid_id, capture_date, satellite_image_id)
                DO UPDATE SET
                  average_ndvi = EXCLUDED.average_ndvi,
                  minimum_ndvi = EXCLUDED.minimum_ndvi,
                  maximum_ndvi = EXCLUDED.maximum_ndvi,
                  geometry = EXCLUDED.geometry
                """,
                [
                    {
                        **row,
                        "geometry": Json(row["geometry"]),
                        "satellite_image_id": satellite_image_id,
                    }
                    for row in rows
                ],
            )
        conn.commit()
        return len(rows)


def get_metadata(limit: int = 50) -> list[dict[str, Any]]:
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT
              id::text,
              capture_date,
              satellite,
              cloud_cover,
              ST_AsGeoJSON(bbox)::json AS bbox,
              image_url,
              processing_status,
              created_at
            FROM satellite_images
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (limit,),
        ).fetchall()


def get_grid_layer(capture_date: datetime | None = None) -> dict[str, Any]:
    date_filter = ""
    params: tuple[Any, ...] = ()
    if capture_date:
        date_filter = "AND ns.capture_date::date = %s"
        params = (capture_date.date(),)

    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
              g.grid_id,
              ST_AsGeoJSON(g.geometry)::json AS geometry,
              ns.average_ndvi,
              ns.minimum_ndvi,
              ns.maximum_ndvi,
              ns.capture_date
            FROM grids g
            LEFT JOIN LATERAL (
              SELECT *
              FROM ndvi_statistics ns
              WHERE ns.grid_id = g.grid_id
              {date_filter}
              ORDER BY ns.capture_date DESC
              LIMIT 1
            ) ns ON true
            ORDER BY g.grid_id
            """,
            params,
        ).fetchall()

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": row["geometry"],
                "properties": {
                    "grid_id": row["grid_id"],
                    "average_ndvi": row["average_ndvi"],
                    "minimum_ndvi": row["minimum_ndvi"],
                    "maximum_ndvi": row["maximum_ndvi"],
                    "capture_date": row["capture_date"].isoformat() if row["capture_date"] else None,
                },
            }
            for row in rows
        ],
    }


def get_dashboard() -> dict[str, Any]:
    with get_connection() as conn:
        summary = conn.execute(
            """
            SELECT
              avg(average_ndvi) AS average_ndvi,
              min(minimum_ndvi) AS minimum_ndvi,
              max(maximum_ndvi) AS maximum_ndvi
            FROM ndvi_statistics
            """
        ).fetchone()
        lowest = conn.execute(
            """
            SELECT grid_id, average_ndvi, capture_date
            FROM ndvi_statistics
            WHERE average_ndvi IS NOT NULL
            ORDER BY average_ndvi ASC
            LIMIT 10
            """
        ).fetchall()
        highest = conn.execute(
            """
            SELECT grid_id, average_ndvi, capture_date
            FROM ndvi_statistics
            WHERE average_ndvi IS NOT NULL
            ORDER BY average_ndvi DESC
            LIMIT 10
            """
        ).fetchall()
        trend = conn.execute(
            """
            SELECT capture_date::date AS date, avg(average_ndvi) AS average_ndvi
            FROM ndvi_statistics
            GROUP BY capture_date::date
            ORDER BY date
            """
        ).fetchall()

    return {
        "summary": summary,
        "lowest": lowest,
        "highest": highest,
        "trend": trend,
    }

