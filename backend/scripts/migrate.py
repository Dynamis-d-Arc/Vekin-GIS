from pathlib import Path
import sys

import psycopg
from dotenv import load_dotenv

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.config import get_settings


def main() -> None:
    load_dotenv()
    settings = get_settings()
    init_dir = Path(__file__).resolve().parents[2] / "database" / "init"
    with psycopg.connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            for sql_file in sorted(init_dir.glob("*.sql")):
                if "seed" in sql_file.stem:
                    continue
                cur.execute(sql_file.read_text(encoding="utf-8"))
        conn.commit()
    print("Migrations applied.")


if __name__ == "__main__":
    main()
