from datetime import date, datetime
from typing import Any

from psycopg import sql
from psycopg.types.json import Json

from app.config import get_settings
from app.db import get_connection
from app.temporal import TemporalGranularity, build_temporal_analysis


DEFAULT_GRID_SIZE_METERS = 1000
MAX_PROCESSING_GRIDS = 2500
DEFAULT_CONTEXT_STATISTICS_SCHEMA = "public"


def get_context_statistics_schema(conn) -> str:
    settings = get_settings()
    configured_schema = (settings.context_statistics_schema or "").strip()
    if configured_schema:
        return configured_schema

    reference_table = settings.context_statistics_schema_reference_table.strip()
    row = conn.execute(
        """
        SELECT table_schema
        FROM information_schema.tables
        WHERE upper(table_name) = upper(%s)
          AND table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY (table_schema = 'public') DESC, table_schema
        LIMIT 1
        """,
        (reference_table,),
    ).fetchone()
    if row:
        return row["table_schema"]
    return DEFAULT_CONTEXT_STATISTICS_SCHEMA


def _stats_table(schema: str, table_name: str) -> sql.Identifier:
    return sql.Identifier(schema, table_name)


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


def ensure_ndvi_statistics_columns() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            ALTER TABLE ndvi_statistics
              ADD COLUMN IF NOT EXISTS average_ndbi double precision,
              ADD COLUMN IF NOT EXISTS minimum_ndbi double precision,
              ADD COLUMN IF NOT EXISTS maximum_ndbi double precision
            """
        )
        conn.commit()


def delete_processed_data() -> dict[str, int]:
    with get_connection() as conn:
        stats_schema = get_context_statistics_schema(conn)
        counts = {
            "grids": conn.execute("SELECT count(*) FROM grids").fetchone()["count"],
            "ndvi_statistics": conn.execute("SELECT count(*) FROM ndvi_statistics").fetchone()["count"],
            "satellite_images": conn.execute("SELECT count(*) FROM satellite_images").fetchone()["count"],
            "rainfall_statistics": conn.execute("SELECT count(*) FROM rainfall_statistics").fetchone()["count"],
            "rainfall_grid_statistics": conn.execute(
                "SELECT count(*) FROM rainfall_grid_statistics"
            ).fetchone()["count"],
            "rainfall_areas": conn.execute("SELECT count(*) FROM rainfall_areas").fetchone()["count"],
            "context_layers": conn.execute("SELECT count(*) FROM context_layers").fetchone()["count"],
            "dem_statistics": conn.execute(
                sql.SQL("SELECT count(*) FROM {}").format(_stats_table(stats_schema, "dem_statistics"))
            ).fetchone()["count"],
            "land_cover_statistics": conn.execute(
                sql.SQL("SELECT count(*) FROM {}").format(_stats_table(stats_schema, "land_cover_statistics"))
            ).fetchone()["count"],
            "urban_context_statistics": conn.execute(
                sql.SQL("SELECT count(*) FROM {}").format(_stats_table(stats_schema, "urban_context_statistics"))
            ).fetchone()["count"],
            "population_statistics": conn.execute(
                sql.SQL("SELECT count(*) FROM {}").format(_stats_table(stats_schema, "population_statistics"))
            ).fetchone()["count"],
        }

        conn.execute("DELETE FROM ndvi_statistics")
        conn.execute("DELETE FROM satellite_images")
        conn.execute("DELETE FROM rainfall_areas")
        conn.execute("DELETE FROM context_layers")
        conn.execute("DELETE FROM grids")
        conn.commit()
        return counts


def ensure_context_statistics_tables() -> None:
    with get_connection() as conn:
        stats_schema = get_context_statistics_schema(conn)
        conn.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(stats_schema)))
        conn.execute(
            sql.SQL(
                """
            CREATE TABLE IF NOT EXISTS {} (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              grid_id text NOT NULL REFERENCES public.grids(grid_id) ON DELETE CASCADE,
              context_layer_id uuid NOT NULL REFERENCES public.context_layers(id) ON DELETE CASCADE,
              average_elevation double precision,
              minimum_elevation double precision,
              maximum_elevation double precision,
              created_at timestamptz NOT NULL DEFAULT now(),
              UNIQUE (grid_id, context_layer_id)
            )
            """
            ).format(_stats_table(stats_schema, "dem_statistics"))
        )
        conn.execute(
            sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} (grid_id)").format(
                sql.Identifier(f"idx_{stats_schema}_dem_statistics_grid_id"),
                _stats_table(stats_schema, "dem_statistics"),
            )
        )
        conn.execute(
            sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} (context_layer_id)").format(
                sql.Identifier(f"idx_{stats_schema}_dem_statistics_context_layer_id"),
                _stats_table(stats_schema, "dem_statistics"),
            )
        )
        conn.execute(
            sql.SQL(
                """
            CREATE TABLE IF NOT EXISTS {} (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              grid_id text NOT NULL REFERENCES public.grids(grid_id) ON DELETE CASCADE,
              context_layer_id uuid NOT NULL REFERENCES public.context_layers(id) ON DELETE CASCADE,
              land_cover_year integer NOT NULL DEFAULT 0,
              dominant_class integer,
              class_percentages jsonb NOT NULL DEFAULT '{{}}'::jsonb,
              created_at timestamptz NOT NULL DEFAULT now(),
              UNIQUE (grid_id, context_layer_id, land_cover_year)
            )
            """
            ).format(_stats_table(stats_schema, "land_cover_statistics"))
        )
        conn.execute(
            sql.SQL("ALTER TABLE {} ADD COLUMN IF NOT EXISTS land_cover_year integer").format(
                _stats_table(stats_schema, "land_cover_statistics")
            )
        )
        conn.execute(
            sql.SQL("UPDATE {} SET land_cover_year = 0 WHERE land_cover_year IS NULL").format(
                _stats_table(stats_schema, "land_cover_statistics")
            )
        )
        conn.execute(
            sql.SQL("ALTER TABLE {} ALTER COLUMN land_cover_year SET DEFAULT 0").format(
                _stats_table(stats_schema, "land_cover_statistics")
            )
        )
        conn.execute(
            sql.SQL("ALTER TABLE {} ALTER COLUMN land_cover_year SET NOT NULL").format(
                _stats_table(stats_schema, "land_cover_statistics")
            )
        )
        conn.execute(
            sql.SQL(
                "ALTER TABLE {} DROP CONSTRAINT IF EXISTS land_cover_statistics_grid_id_context_layer_id_key"
            ).format(_stats_table(stats_schema, "land_cover_statistics"))
        )
        conn.execute(
            sql.SQL(
                "CREATE UNIQUE INDEX IF NOT EXISTS {} ON {} (grid_id, context_layer_id, land_cover_year)"
            ).format(
                sql.Identifier(f"idx_{stats_schema}_land_cover_statistics_grid_context_year"),
                _stats_table(stats_schema, "land_cover_statistics"),
            )
        )
        conn.execute(
            sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} (grid_id)").format(
                sql.Identifier(f"idx_{stats_schema}_land_cover_statistics_grid_id"),
                _stats_table(stats_schema, "land_cover_statistics"),
            )
        )
        conn.execute(
            sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} (context_layer_id)").format(
                sql.Identifier(f"idx_{stats_schema}_land_cover_statistics_context_layer_id"),
                _stats_table(stats_schema, "land_cover_statistics"),
            )
        )
        conn.execute(
            sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} (grid_id, land_cover_year)").format(
                sql.Identifier(f"idx_{stats_schema}_land_cover_statistics_grid_year"),
                _stats_table(stats_schema, "land_cover_statistics"),
            )
        )
        conn.execute(
            sql.SQL(
                """
            CREATE TABLE IF NOT EXISTS {} (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              grid_id text NOT NULL REFERENCES public.grids(grid_id) ON DELETE CASCADE,
              context_layer_id uuid NOT NULL REFERENCES public.context_layers(id) ON DELETE CASCADE,
              population_count double precision,
              built_up_area_square_meters double precision,
              green_cover_percentage double precision,
              road_density_km_per_square_km double precision,
              created_at timestamptz NOT NULL DEFAULT now(),
              UNIQUE (grid_id, context_layer_id)
            )
            """
            ).format(_stats_table(stats_schema, "urban_context_statistics"))
        )
        conn.execute(
            sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} (grid_id)").format(
                sql.Identifier(f"idx_{stats_schema}_urban_context_statistics_grid_id"),
                _stats_table(stats_schema, "urban_context_statistics"),
            )
        )
        conn.execute(
            sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} (context_layer_id)").format(
                sql.Identifier(f"idx_{stats_schema}_urban_context_statistics_context_layer_id"),
                _stats_table(stats_schema, "urban_context_statistics"),
            )
        )
        conn.execute(
            sql.SQL(
                """
            CREATE TABLE IF NOT EXISTS {} (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              grid_id text NOT NULL REFERENCES public.grids(grid_id) ON DELETE CASCADE,
              context_layer_id uuid NOT NULL REFERENCES public.context_layers(id) ON DELETE CASCADE,
              population_year integer NOT NULL,
              population_count double precision,
              created_at timestamptz NOT NULL DEFAULT now(),
              UNIQUE (grid_id, context_layer_id, population_year)
            )
            """
            ).format(_stats_table(stats_schema, "population_statistics"))
        )
        conn.execute(
            sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} (grid_id, population_year)").format(
                sql.Identifier(f"idx_{stats_schema}_population_statistics_grid_year"),
                _stats_table(stats_schema, "population_statistics"),
            )
        )
        conn.execute(
            sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} (context_layer_id)").format(
                sql.Identifier(f"idx_{stats_schema}_population_statistics_context_layer_id"),
                _stats_table(stats_schema, "population_statistics"),
            )
        )
        conn.commit()


def ensure_rainfall_tables() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rainfall_areas (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              area_hash text NOT NULL UNIQUE,
              geometry geometry(Polygon, 4326) NOT NULL,
              bbox geometry(Polygon, 4326) NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_rainfall_areas_geometry
              ON rainfall_areas
              USING gist (geometry)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rainfall_statistics (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              area_id uuid NOT NULL REFERENCES rainfall_areas(id) ON DELETE CASCADE,
              capture_date date NOT NULL,
              source text NOT NULL DEFAULT 'chirps-daily',
              average_rainfall_mm double precision,
              minimum_rainfall_mm double precision,
              maximum_rainfall_mm double precision,
              median_rainfall_mm double precision,
              rainfall_stddev_mm double precision,
              valid_pixel_count integer NOT NULL DEFAULT 0,
              source_url text,
              created_at timestamptz NOT NULL DEFAULT now(),
              UNIQUE (area_id, capture_date, source)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_rainfall_statistics_area_date
              ON rainfall_statistics (area_id, capture_date)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_rainfall_statistics_capture_date
              ON rainfall_statistics (capture_date)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rainfall_grid_statistics (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              area_id uuid NOT NULL REFERENCES rainfall_areas(id) ON DELETE CASCADE,
              grid_id text NOT NULL REFERENCES grids(grid_id) ON DELETE CASCADE,
              capture_date date NOT NULL,
              source text NOT NULL DEFAULT 'chirps-daily',
              average_rainfall_mm double precision,
              minimum_rainfall_mm double precision,
              maximum_rainfall_mm double precision,
              median_rainfall_mm double precision,
              rainfall_stddev_mm double precision,
              valid_pixel_count integer NOT NULL DEFAULT 0,
              source_url text,
              created_at timestamptz NOT NULL DEFAULT now(),
              UNIQUE (area_id, grid_id, capture_date, source)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_rainfall_grid_statistics_grid_date
              ON rainfall_grid_statistics (grid_id, capture_date)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_rainfall_grid_statistics_area_date
              ON rainfall_grid_statistics (area_id, capture_date)
            """
        )
        conn.commit()


def upsert_rainfall_area(area_geojson: dict[str, Any]) -> str:
    with get_connection() as conn:
        row = conn.execute(
            """
            WITH input AS (
              SELECT ST_SetSRID(ST_GeomFromGeoJSON(%(area)s), 4326) AS geometry
            ),
            normalized AS (
              SELECT
                md5(ST_AsText(ST_SnapToGrid(geometry, 0.000001))) AS area_hash,
                geometry,
                ST_Envelope(geometry)::geometry(Polygon, 4326) AS bbox
              FROM input
            )
            INSERT INTO rainfall_areas (area_hash, geometry, bbox)
            SELECT area_hash, geometry, bbox
            FROM normalized
            ON CONFLICT (area_hash) DO UPDATE SET
              geometry = EXCLUDED.geometry,
              bbox = EXCLUDED.bbox,
              updated_at = now()
            RETURNING id::text
            """,
            {"area": Json(area_geojson)},
        ).fetchone()
        conn.commit()
        return row["id"]


def insert_rainfall_statistics(
    *,
    area_id: str,
    rows: list[dict[str, Any]],
    source: str = "chirps-daily",
) -> int:
    if not rows:
        return 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO rainfall_statistics (
                  area_id,
                  capture_date,
                  source,
                  average_rainfall_mm,
                  minimum_rainfall_mm,
                  maximum_rainfall_mm,
                  median_rainfall_mm,
                  rainfall_stddev_mm,
                  valid_pixel_count,
                  source_url
                )
                VALUES (
                  %(area_id)s,
                  %(capture_date)s,
                  %(source)s,
                  %(average_rainfall_mm)s,
                  %(minimum_rainfall_mm)s,
                  %(maximum_rainfall_mm)s,
                  %(median_rainfall_mm)s,
                  %(rainfall_stddev_mm)s,
                  %(valid_pixel_count)s,
                  %(source_url)s
                )
                ON CONFLICT (area_id, capture_date, source)
                DO UPDATE SET
                  average_rainfall_mm = EXCLUDED.average_rainfall_mm,
                  minimum_rainfall_mm = EXCLUDED.minimum_rainfall_mm,
                  maximum_rainfall_mm = EXCLUDED.maximum_rainfall_mm,
                  median_rainfall_mm = EXCLUDED.median_rainfall_mm,
                  rainfall_stddev_mm = EXCLUDED.rainfall_stddev_mm,
                  valid_pixel_count = EXCLUDED.valid_pixel_count,
                  source_url = EXCLUDED.source_url
                """,
                [{**row, "area_id": area_id, "source": source} for row in rows],
            )
        conn.commit()
        return len(rows)


def insert_grid_rainfall_statistics(
    *,
    area_id: str,
    rows: list[dict[str, Any]],
    source: str = "chirps-daily",
) -> int:
    if not rows:
        return 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO rainfall_grid_statistics (
                  area_id,
                  grid_id,
                  capture_date,
                  source,
                  average_rainfall_mm,
                  minimum_rainfall_mm,
                  maximum_rainfall_mm,
                  median_rainfall_mm,
                  rainfall_stddev_mm,
                  valid_pixel_count,
                  source_url
                )
                VALUES (
                  %(area_id)s,
                  %(grid_id)s,
                  %(capture_date)s,
                  %(source)s,
                  %(average_rainfall_mm)s,
                  %(minimum_rainfall_mm)s,
                  %(maximum_rainfall_mm)s,
                  %(median_rainfall_mm)s,
                  %(rainfall_stddev_mm)s,
                  %(valid_pixel_count)s,
                  %(source_url)s
                )
                ON CONFLICT (area_id, grid_id, capture_date, source)
                DO UPDATE SET
                  average_rainfall_mm = EXCLUDED.average_rainfall_mm,
                  minimum_rainfall_mm = EXCLUDED.minimum_rainfall_mm,
                  maximum_rainfall_mm = EXCLUDED.maximum_rainfall_mm,
                  median_rainfall_mm = EXCLUDED.median_rainfall_mm,
                  rainfall_stddev_mm = EXCLUDED.rainfall_stddev_mm,
                  valid_pixel_count = EXCLUDED.valid_pixel_count,
                  source_url = EXCLUDED.source_url
                """,
                [{**row, "area_id": area_id, "source": source} for row in rows],
            )
        conn.commit()
        return len(rows)


def get_rainfall_trend(limit: int = 365) -> list[dict[str, Any]]:
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT
              rs.capture_date AS date,
              rs.average_rainfall_mm,
              rs.minimum_rainfall_mm,
              rs.maximum_rainfall_mm,
              rs.median_rainfall_mm,
              rs.rainfall_stddev_mm,
              rs.valid_pixel_count,
              rs.source,
              ra.id::text AS area_id
            FROM rainfall_statistics rs
            JOIN rainfall_areas ra ON ra.id = rs.area_id
            WHERE rs.source = 'chirps-daily'
            ORDER BY rs.capture_date DESC, rs.created_at DESC
            LIMIT %s
            """,
            (limit,),
        ).fetchall()[::-1]


def upsert_context_layer(
    *,
    area_hash: str,
    selected_area_geojson: dict[str, Any],
    bbox_geojson: dict[str, Any],
    dem_url: str,
    land_cover_url: str,
    dem_source: str = "cop-dem-glo-30",
    land_cover_source: str = "esa-worldcover",
) -> str:
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO context_layers (
              area_hash,
              selected_area,
              bbox,
              dem_url,
              land_cover_url,
              dem_source,
              land_cover_source
            )
            VALUES (
              %(area_hash)s,
              ST_SetSRID(ST_GeomFromGeoJSON(%(selected_area)s), 4326),
              ST_SetSRID(ST_GeomFromGeoJSON(%(bbox)s), 4326),
              %(dem_url)s,
              %(land_cover_url)s,
              %(dem_source)s,
              %(land_cover_source)s
            )
            ON CONFLICT (area_hash) DO UPDATE SET
              selected_area = EXCLUDED.selected_area,
              bbox = EXCLUDED.bbox,
              dem_url = EXCLUDED.dem_url,
              land_cover_url = EXCLUDED.land_cover_url,
              dem_source = EXCLUDED.dem_source,
              land_cover_source = EXCLUDED.land_cover_source,
              updated_at = now()
            RETURNING id::text
            """,
            {
                "area_hash": area_hash,
                "selected_area": Json(selected_area_geojson),
                "bbox": Json(bbox_geojson),
                "dem_url": dem_url,
                "land_cover_url": land_cover_url,
                "dem_source": dem_source,
                "land_cover_source": land_cover_source,
            },
        ).fetchone()
        conn.commit()
        return row["id"]


def get_context_layers(limit: int = 20) -> list[dict[str, Any]]:
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT
              id::text,
              area_hash,
              ST_AsGeoJSON(selected_area)::json AS selected_area,
              ST_AsGeoJSON(bbox)::json AS bbox,
              dem_url,
              land_cover_url,
              dem_source,
              land_cover_source,
              created_at,
              updated_at
            FROM context_layers
            ORDER BY updated_at DESC
            LIMIT %s
            """,
            (limit,),
        ).fetchall()


def insert_context_statistics(
    *,
    context_layer_id: str,
    dem_rows: list[dict[str, Any]],
    land_cover_rows: list[dict[str, Any]],
    urban_context_rows: list[dict[str, Any]] | None = None,
    population_rows: list[dict[str, Any]] | None = None,
) -> None:
    with get_connection() as conn:
        stats_schema = get_context_statistics_schema(conn)
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("DELETE FROM {} WHERE context_layer_id = %s").format(
                    _stats_table(stats_schema, "dem_statistics")
                ),
                (context_layer_id,),
            )
            cur.execute(
                sql.SQL("DELETE FROM {} WHERE context_layer_id = %s").format(
                    _stats_table(stats_schema, "land_cover_statistics")
                ),
                (context_layer_id,),
            )
            cur.execute(
                sql.SQL("DELETE FROM {} WHERE context_layer_id = %s").format(
                    _stats_table(stats_schema, "urban_context_statistics")
                ),
                (context_layer_id,),
            )
            cur.execute(
                sql.SQL("DELETE FROM {} WHERE context_layer_id = %s").format(
                    _stats_table(stats_schema, "population_statistics")
                ),
                (context_layer_id,),
            )
            if dem_rows:
                cur.executemany(
                    sql.SQL(
                        """
                    INSERT INTO {} (
                      grid_id,
                      context_layer_id,
                      average_elevation,
                      minimum_elevation,
                      maximum_elevation
                    )
                    VALUES (
                      %(grid_id)s,
                      %(context_layer_id)s,
                      %(average_elevation)s,
                      %(minimum_elevation)s,
                      %(maximum_elevation)s
                    )
                    ON CONFLICT (grid_id, context_layer_id)
                    DO UPDATE SET
                      average_elevation = EXCLUDED.average_elevation,
                      minimum_elevation = EXCLUDED.minimum_elevation,
                      maximum_elevation = EXCLUDED.maximum_elevation
                    """
                    ).format(_stats_table(stats_schema, "dem_statistics")),
                    [{**row, "context_layer_id": context_layer_id} for row in dem_rows],
                )
            if land_cover_rows:
                cur.executemany(
                    sql.SQL(
                        """
                    INSERT INTO {} (
                      grid_id,
                      context_layer_id,
                      land_cover_year,
                      dominant_class,
                      class_percentages
                    )
                    VALUES (
                      %(grid_id)s,
                      %(context_layer_id)s,
                      %(land_cover_year)s,
                      %(dominant_class)s,
                      %(class_percentages)s
                    )
                    ON CONFLICT (grid_id, context_layer_id, land_cover_year)
                    DO UPDATE SET
                      dominant_class = EXCLUDED.dominant_class,
                      class_percentages = EXCLUDED.class_percentages
                    """
                    ).format(_stats_table(stats_schema, "land_cover_statistics")),
                    [
                        {
                            **row,
                            "context_layer_id": context_layer_id,
                            "class_percentages": Json(row["class_percentages"]),
                        }
                        for row in land_cover_rows
                    ],
                )
            if urban_context_rows:
                cur.executemany(
                    sql.SQL(
                        """
                    INSERT INTO {} (
                      grid_id,
                      context_layer_id,
                      population_count,
                      built_up_area_square_meters,
                      green_cover_percentage,
                      road_density_km_per_square_km
                    )
                    VALUES (
                      %(grid_id)s,
                      %(context_layer_id)s,
                      %(population_count)s,
                      %(built_up_area_square_meters)s,
                      %(green_cover_percentage)s,
                      %(road_density_km_per_square_km)s
                    )
                    ON CONFLICT (grid_id, context_layer_id)
                    DO UPDATE SET
                      population_count = EXCLUDED.population_count,
                      built_up_area_square_meters = EXCLUDED.built_up_area_square_meters,
                      green_cover_percentage = EXCLUDED.green_cover_percentage,
                      road_density_km_per_square_km = EXCLUDED.road_density_km_per_square_km
                    """
                    ).format(_stats_table(stats_schema, "urban_context_statistics")),
                    [{**row, "context_layer_id": context_layer_id} for row in urban_context_rows],
                )
            if population_rows:
                cur.executemany(
                    sql.SQL(
                        """
                    INSERT INTO {} (
                      grid_id,
                      context_layer_id,
                      population_year,
                      population_count
                    )
                    VALUES (
                      %(grid_id)s,
                      %(context_layer_id)s,
                      %(population_year)s,
                      %(population_count)s
                    )
                    ON CONFLICT (grid_id, context_layer_id, population_year)
                    DO UPDATE SET
                      population_count = EXCLUDED.population_count
                    """
                    ).format(_stats_table(stats_schema, "population_statistics")),
                    [{**row, "context_layer_id": context_layer_id} for row in population_rows],
                )
        conn.commit()


def ensure_grids_for_area(
    geometry_geojson: dict[str, Any],
    *,
    grid_size_meters: int = DEFAULT_GRID_SIZE_METERS,
) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            WITH input AS (
              SELECT ST_SetSRID(ST_GeomFromGeoJSON(%(geometry)s), 4326) AS geom
            ),
            metric_input AS (
              SELECT ST_Transform(geom, 3857) AS geom
              FROM input
            ),
            cells AS (
              SELECT (ST_SquareGrid(%(grid_size)s, geom)).geom AS geom
              FROM metric_input
            ),
            clipped AS (
              SELECT
                ST_Multi(ST_Transform(ST_Intersection(cells.geom, metric_input.geom), 4326)) AS geometry
              FROM cells
              CROSS JOIN metric_input
              WHERE ST_Intersects(cells.geom, metric_input.geom)
            ),
            polygons AS (
              SELECT
                ST_CollectionExtract(geometry, 3)::geometry(MultiPolygon, 4326) AS geometry
              FROM clipped
              WHERE NOT ST_IsEmpty(geometry)
            ),
            numbered AS (
              SELECT
                'GRID-' || md5(ST_AsEWKB(ST_SnapToGrid(geometry, 0.000001))) AS grid_id,
                geometry
              FROM polygons
              LIMIT %(max_grids)s
            ),
            upserted AS (
              INSERT INTO grids (grid_id, geometry)
              SELECT grid_id, ST_GeometryN(geometry, 1)::geometry(Polygon, 4326)
              FROM numbered
              ON CONFLICT (grid_id) DO UPDATE
              SET geometry = EXCLUDED.geometry
              RETURNING grid_id, geometry
            )
            SELECT
              grid_id,
              ST_AsGeoJSON(geometry)::json AS geometry
            FROM upserted
            ORDER BY grid_id
            """,
            {
                "geometry": Json(geometry_geojson),
                "grid_size": grid_size_meters,
                "max_grids": MAX_PROCESSING_GRIDS,
            },
        ).fetchall()
        conn.commit()
        return rows


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
            cur.execute(
                """
                DELETE FROM ndvi_statistics
                WHERE capture_date = %(capture_date)s
                AND grid_id = ANY(%(grid_ids)s)
                """,
                {
                    "capture_date": rows[0]["capture_date"],
                    "grid_ids": [row["grid_id"] for row in rows],
                },
            )
            cur.executemany(
                """
                INSERT INTO ndvi_statistics (
                  grid_id,
                  capture_date,
                  average_ndvi,
                  minimum_ndvi,
                  maximum_ndvi,
                  average_ndbi,
                  minimum_ndbi,
                  maximum_ndbi,
                  geometry,
                  satellite_image_id
                )
                VALUES (
                  %(grid_id)s,
                  %(capture_date)s,
                  %(average_ndvi)s,
                  %(minimum_ndvi)s,
                  %(maximum_ndvi)s,
                  %(average_ndbi)s,
                  %(minimum_ndbi)s,
                  %(maximum_ndbi)s,
                  ST_SetSRID(ST_GeomFromGeoJSON(%(geometry)s), 4326),
                  %(satellite_image_id)s
                )
                ON CONFLICT (grid_id, capture_date, satellite_image_id)
                DO UPDATE SET
                  average_ndvi = EXCLUDED.average_ndvi,
                  minimum_ndvi = EXCLUDED.minimum_ndvi,
                  maximum_ndvi = EXCLUDED.maximum_ndvi,
                  average_ndbi = EXCLUDED.average_ndbi,
                  minimum_ndbi = EXCLUDED.minimum_ndbi,
                  maximum_ndbi = EXCLUDED.maximum_ndbi,
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


def get_metadata(
    limit: int = 50,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict[str, Any]]:
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
            WHERE (%(start_date)s::date IS NULL OR capture_date::date >= %(start_date)s::date)
              AND (%(end_date)s::date IS NULL OR capture_date::date <= %(end_date)s::date)
            ORDER BY created_at DESC
            LIMIT %(limit)s
            """,
            {"limit": limit, "start_date": start_date, "end_date": end_date},
        ).fetchall()


def get_grid_layer(
    capture_date: datetime | None = None,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    all_dates: bool = False,
) -> dict[str, Any]:
    date_filter = sql.SQL("")
    date_limit = sql.SQL("LIMIT 1")
    params: dict[str, Any] = {}
    if capture_date:
        date_filter = sql.SQL(
            """
              AND ns.capture_date::date = (
                SELECT candidate.capture_date::date
                FROM ndvi_statistics candidate
                ORDER BY abs(candidate.capture_date::date - %(capture_date)s), candidate.capture_date DESC
                LIMIT 1
              )
            """
        )
        params["capture_date"] = capture_date.date()
    elif start_date or end_date:
        if all_dates:
            date_limit = sql.SQL("")
        date_filter = sql.SQL(
            """
              AND (%(start_date)s::date IS NULL OR ns.capture_date::date >= %(start_date)s::date)
              AND (%(end_date)s::date IS NULL OR ns.capture_date::date <= %(end_date)s::date)
            """
        )
        params["start_date"] = start_date
        params["end_date"] = end_date

    with get_connection() as conn:
        stats_schema = get_context_statistics_schema(conn)
        stats_exist = conn.execute("SELECT EXISTS (SELECT 1 FROM ndvi_statistics)").fetchone()["exists"]
        rows = conn.execute(
            sql.SQL(
                """
            SELECT
              g.grid_id,
              ST_AsGeoJSON(g.geometry)::json AS geometry,
              ns.average_ndvi,
              ns.minimum_ndvi,
              ns.maximum_ndvi,
              ns.average_ndbi,
              ns.minimum_ndbi,
              ns.maximum_ndbi,
              ns.capture_date,
              ds.average_elevation,
              ds.minimum_elevation,
              ds.maximum_elevation,
              lcs.dominant_class,
              lcs.class_percentages,
              lcs.land_cover_year,
              ucs.population_count,
              ucs.built_up_area_square_meters,
              ucs.green_cover_percentage,
              ucs.road_density_km_per_square_km
            FROM grids g
            LEFT JOIN LATERAL (
              SELECT *
              FROM ndvi_statistics ns
              WHERE ns.grid_id = g.grid_id
              {date_filter}
              ORDER BY ns.capture_date DESC
              {date_limit}
            ) ns ON true
            LEFT JOIN LATERAL (
              SELECT ds.*
              FROM {dem_statistics} ds
              JOIN context_layers cl ON cl.id = ds.context_layer_id
              WHERE ds.grid_id = g.grid_id
              ORDER BY cl.updated_at DESC
              LIMIT 1
            ) ds ON true
            LEFT JOIN LATERAL (
              SELECT lcs.*
              FROM {land_cover_statistics} lcs
              JOIN context_layers cl ON cl.id = lcs.context_layer_id
              WHERE lcs.grid_id = g.grid_id
              ORDER BY cl.updated_at DESC, lcs.land_cover_year DESC
              LIMIT 1
            ) lcs ON true
            LEFT JOIN LATERAL (
              SELECT ucs.*
              FROM {urban_context_statistics} ucs
              JOIN context_layers cl ON cl.id = ucs.context_layer_id
              WHERE ucs.grid_id = g.grid_id
              ORDER BY cl.updated_at DESC
              LIMIT 1
            ) ucs ON true
            WHERE %(show_all_grids)s OR ns.capture_date IS NOT NULL
            ORDER BY g.grid_id
            """
            ).format(
                date_filter=date_filter,
                date_limit=date_limit,
                dem_statistics=_stats_table(stats_schema, "dem_statistics"),
                land_cover_statistics=_stats_table(stats_schema, "land_cover_statistics"),
                urban_context_statistics=_stats_table(stats_schema, "urban_context_statistics"),
            ),
            {"show_all_grids": not stats_exist, **params},
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
                    "average_ndbi": row["average_ndbi"],
                    "minimum_ndbi": row["minimum_ndbi"],
                    "maximum_ndbi": row["maximum_ndbi"],
                    "capture_date": row["capture_date"].isoformat() if row["capture_date"] else None,
                    "average_elevation": row["average_elevation"],
                    "minimum_elevation": row["minimum_elevation"],
                    "maximum_elevation": row["maximum_elevation"],
                    "dominant_land_cover_class": row["dominant_class"],
                    "land_cover_percentages": row["class_percentages"] or {},
                    "land_cover_year": row["land_cover_year"],
                    "population_count": row["population_count"],
                    "built_up_area_square_meters": row["built_up_area_square_meters"],
                    "green_cover_percentage": row["green_cover_percentage"],
                    "road_density_km_per_square_km": row["road_density_km_per_square_km"],
                },
            }
            for row in rows
        ],
    }


def get_ndvi_capture_dates_for_area(
    *,
    area_geojson: dict[str, Any],
    start_date: datetime,
    end_date: datetime,
) -> list[datetime]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT ns.capture_date
            FROM ndvi_statistics ns
            WHERE ns.capture_date::date BETWEEN %(start_date)s AND %(end_date)s
            AND ST_Intersects(
              ns.geometry,
              ST_SetSRID(ST_GeomFromGeoJSON(%(area)s), 4326)
            )
            ORDER BY ns.capture_date
            """,
            {
                "area": Json(area_geojson),
                "start_date": start_date.date(),
                "end_date": end_date.date(),
            },
        ).fetchall()
    return [row["capture_date"] for row in rows]


def get_latest_context_statistics() -> dict[str, Any]:
    with get_connection() as conn:
        stats_schema = get_context_statistics_schema(conn)
        context_layer = conn.execute(
            """
            SELECT
              id::text,
              area_hash,
              dem_url,
              land_cover_url,
              dem_source,
              land_cover_source,
              created_at,
              updated_at
            FROM context_layers
            ORDER BY updated_at DESC
            LIMIT 1
            """
        ).fetchone()
        if not context_layer:
            return {
                "context_layer": None,
                "dem_statistics": [],
                "land_cover_statistics": [],
                "urban_context_statistics": [],
                "population_statistics": [],
            }

        dem_rows = conn.execute(
            sql.SQL(
                """
            SELECT
              grid_id,
              average_elevation,
              minimum_elevation,
              maximum_elevation,
              created_at
            FROM {}
            WHERE context_layer_id = %s
            ORDER BY grid_id
            """
            ).format(_stats_table(stats_schema, "dem_statistics")),
            (context_layer["id"],),
        ).fetchall()
        land_cover_rows = conn.execute(
            sql.SQL(
                """
            SELECT
              grid_id,
              land_cover_year,
              dominant_class,
              class_percentages,
              created_at
            FROM {}
            WHERE context_layer_id = %s
            ORDER BY grid_id, land_cover_year
            """
            ).format(_stats_table(stats_schema, "land_cover_statistics")),
            (context_layer["id"],),
        ).fetchall()
        urban_context_rows = conn.execute(
            sql.SQL(
                """
            SELECT
              grid_id,
              population_count,
              built_up_area_square_meters,
              green_cover_percentage,
              road_density_km_per_square_km,
              created_at
            FROM {}
            WHERE context_layer_id = %s
            ORDER BY grid_id
            """
            ).format(_stats_table(stats_schema, "urban_context_statistics")),
            (context_layer["id"],),
        ).fetchall()
        population_rows = conn.execute(
            sql.SQL(
                """
            SELECT
              grid_id,
              population_year,
              population_count,
              created_at
            FROM {}
            WHERE context_layer_id = %s
            ORDER BY grid_id, population_year
            """
            ).format(_stats_table(stats_schema, "population_statistics")),
            (context_layer["id"],),
        ).fetchall()

    return {
        "context_layer": context_layer,
        "dem_statistics": dem_rows,
        "land_cover_statistics": land_cover_rows,
        "urban_context_statistics": urban_context_rows,
        "population_statistics": population_rows,
    }


def get_population_trend(grid_id: str | None = None) -> list[dict[str, Any]]:
    with get_connection() as conn:
        stats_schema = get_context_statistics_schema(conn)
        context_layer = conn.execute(
            """
            SELECT id::text
            FROM context_layers
            ORDER BY updated_at DESC
            LIMIT 1
            """
        ).fetchone()
        if not context_layer:
            return []

        rows = conn.execute(
            sql.SQL(
                """
            SELECT
              population_year,
              avg(population_count) AS population_count
            FROM {}
            WHERE context_layer_id = %(context_layer_id)s
              AND (%(grid_id)s::text IS NULL OR grid_id = %(grid_id)s::text)
              AND population_count IS NOT NULL
            GROUP BY population_year
            ORDER BY population_year
            """
            ).format(_stats_table(stats_schema, "population_statistics")),
            {"context_layer_id": context_layer["id"], "grid_id": grid_id},
        ).fetchall()
    return rows


def get_land_cover_trend(grid_id: str | None = None) -> list[dict[str, Any]]:
    with get_connection() as conn:
        stats_schema = get_context_statistics_schema(conn)
        context_layer = conn.execute(
            """
            SELECT id::text
            FROM context_layers
            ORDER BY updated_at DESC
            LIMIT 1
            """
        ).fetchone()
        if not context_layer:
            return []

        rows = conn.execute(
            sql.SQL(
                """
            SELECT
              land_cover_year,
              dominant_class,
              class_percentages
            FROM {}
            WHERE context_layer_id = %(context_layer_id)s
              AND (%(grid_id)s::text IS NULL OR grid_id = %(grid_id)s::text)
            ORDER BY land_cover_year
            """
            ).format(_stats_table(stats_schema, "land_cover_statistics")),
            {"context_layer_id": context_layer["id"], "grid_id": grid_id},
        ).fetchall()

    by_year: dict[int, dict[str, Any]] = {}
    for row in rows:
        year = row["land_cover_year"]
        bucket = by_year.setdefault(year, {"land_cover_year": year, "count": 0, "totals": {}})
        bucket["count"] += 1
        for class_value, percent in (row["class_percentages"] or {}).items():
            numeric = float(percent)
            bucket["totals"][str(class_value)] = bucket["totals"].get(str(class_value), 0.0) + numeric

    trend = []
    for year, bucket in sorted(by_year.items()):
        count = max(bucket["count"], 1)
        percentages = {
            class_value: round(total / count, 2)
            for class_value, total in sorted(bucket["totals"].items())
        }
        dominant_class = (
            int(max(percentages, key=percentages.get))
            if percentages
            else None
        )
        trend.append(
            {
                "land_cover_year": year,
                "dominant_class": dominant_class,
                "class_percentages": percentages,
            }
        )
    return trend


def get_dashboard(
    grid_id: str | None = None,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    aggregation: TemporalGranularity = "monthly",
) -> dict[str, Any]:
    params = {"grid_id": grid_id, "start_date": start_date, "end_date": end_date}
    with get_connection() as conn:
        summary = conn.execute(
            """
            WITH latest_stats AS (
              SELECT DISTINCT ON (grid_id, capture_date)
                grid_id,
                capture_date,
                average_ndvi,
                minimum_ndvi,
                maximum_ndvi
              FROM ndvi_statistics
              WHERE (%(grid_id)s::text IS NULL OR grid_id = %(grid_id)s::text)
                AND (%(start_date)s::date IS NULL OR capture_date::date >= %(start_date)s::date)
                AND (%(end_date)s::date IS NULL OR capture_date::date <= %(end_date)s::date)
              ORDER BY grid_id, capture_date, created_at DESC
            )
            SELECT
              avg(average_ndvi) AS average_ndvi,
              min(minimum_ndvi) AS minimum_ndvi,
              max(maximum_ndvi) AS maximum_ndvi
            FROM latest_stats
            """,
            params,
        ).fetchone()
        lowest = conn.execute(
            """
            WITH latest_stats AS (
              SELECT DISTINCT ON (grid_id, capture_date)
                grid_id,
                capture_date,
                average_ndvi
              FROM ndvi_statistics
              WHERE (%(grid_id)s::text IS NULL OR grid_id = %(grid_id)s::text)
                AND (%(start_date)s::date IS NULL OR capture_date::date >= %(start_date)s::date)
                AND (%(end_date)s::date IS NULL OR capture_date::date <= %(end_date)s::date)
              ORDER BY grid_id, capture_date, created_at DESC
            )
            SELECT grid_id, average_ndvi, capture_date
            FROM latest_stats
            WHERE average_ndvi IS NOT NULL
            ORDER BY average_ndvi ASC
            LIMIT 10
            """,
            params,
        ).fetchall()
        highest = conn.execute(
            """
            WITH latest_stats AS (
              SELECT DISTINCT ON (grid_id, capture_date)
                grid_id,
                capture_date,
                average_ndvi
              FROM ndvi_statistics
              WHERE (%(grid_id)s::text IS NULL OR grid_id = %(grid_id)s::text)
                AND (%(start_date)s::date IS NULL OR capture_date::date >= %(start_date)s::date)
                AND (%(end_date)s::date IS NULL OR capture_date::date <= %(end_date)s::date)
              ORDER BY grid_id, capture_date, created_at DESC
            )
            SELECT grid_id, average_ndvi, capture_date
            FROM latest_stats
            WHERE average_ndvi IS NOT NULL
            ORDER BY average_ndvi DESC
            LIMIT 10
            """,
            params,
        ).fetchall()
        historical_trend = conn.execute(
            """
            WITH latest_stats AS (
              SELECT DISTINCT ON (grid_id, capture_date)
                grid_id,
                capture_date,
                average_ndvi,
                average_ndbi
              FROM ndvi_statistics
              WHERE (%(grid_id)s::text IS NULL OR grid_id = %(grid_id)s::text)
                AND (%(end_date)s::date IS NULL OR capture_date::date <= %(end_date)s::date)
              ORDER BY grid_id, capture_date, created_at DESC
            )
            SELECT
              capture_date::date AS date,
              avg(average_ndvi) AS average_ndvi,
              avg(average_ndbi) AS average_ndbi,
              count(average_ndvi) AS ndvi_observation_count,
              count(average_ndbi) AS ndbi_observation_count,
              count(DISTINCT capture_date) AS capture_count
            FROM latest_stats
            GROUP BY capture_date::date
            ORDER BY date
            """,
            params,
        ).fetchall()
        rainfall_area = conn.execute(
            """
            SELECT ra.id::text, ra.area_hash, ST_AsGeoJSON(ra.bbox)::json AS bbox
            FROM rainfall_areas ra
            WHERE (
              %(grid_id)s::text IS NULL
              OR EXISTS (
                SELECT 1
                FROM rainfall_grid_statistics rgs
                WHERE rgs.area_id = ra.id
                  AND rgs.grid_id = %(grid_id)s::text
              )
            )
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            params,
        ).fetchone()
        rainfall_trend = conn.execute(
            """
            SELECT
              capture_date AS date,
              average_rainfall_mm,
              minimum_rainfall_mm,
              maximum_rainfall_mm,
              median_rainfall_mm,
              rainfall_stddev_mm,
              valid_pixel_count,
              source
            FROM rainfall_statistics
            WHERE %(grid_id)s::text IS NULL
              AND source = 'chirps-daily'
              AND area_id = %(area_id)s::uuid
              AND (%(start_date)s::date IS NULL OR capture_date >= %(start_date)s::date)
              AND (%(end_date)s::date IS NULL OR capture_date <= %(end_date)s::date)
            UNION ALL
            SELECT
              capture_date AS date,
              average_rainfall_mm,
              minimum_rainfall_mm,
              maximum_rainfall_mm,
              median_rainfall_mm,
              rainfall_stddev_mm,
              valid_pixel_count,
              source
            FROM rainfall_grid_statistics
            WHERE %(grid_id)s::text IS NOT NULL
              AND grid_id = %(grid_id)s::text
              AND source = 'chirps-daily'
              AND area_id = %(area_id)s::uuid
              AND (%(start_date)s::date IS NULL OR capture_date >= %(start_date)s::date)
              AND (%(end_date)s::date IS NULL OR capture_date <= %(end_date)s::date)
            ORDER BY date
            """,
            {
                "area_id": rainfall_area["id"] if rainfall_area else None,
                "grid_id": grid_id,
                "start_date": start_date,
                "end_date": end_date,
            },
        ).fetchall()

    trend = [
        row
        for row in historical_trend
        if start_date is None or row["date"] >= start_date
    ]
    temporal = build_temporal_analysis(
        [dict(row) for row in historical_trend],
        granularity=aggregation,
        start_date=start_date,
        end_date=end_date,
    )
    return {
        "summary": summary,
        "lowest": lowest,
        "highest": highest,
        "trend": trend,
        "temporal": temporal,
        "rainfall_area": rainfall_area,
        "rainfall_trend": rainfall_trend,
    }
