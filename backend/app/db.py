from collections.abc import Iterator
from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import get_settings


pool = ConnectionPool(
    conninfo=get_settings().database_url,
    kwargs={"row_factory": dict_row},
    open=False,
)


def open_pool() -> None:
    pool.open()


def close_pool() -> None:
    pool.close()


@contextmanager
def get_connection() -> Iterator:
    with pool.connection() as connection:
        yield connection

