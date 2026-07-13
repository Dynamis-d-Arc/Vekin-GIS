import unittest
from datetime import date

from app.openmeteo import _parse_open_meteo_daily, open_meteo_archive_url


class OpenMeteoTests(unittest.TestCase):
    def test_url_requests_daily_temperature_and_rainfall(self):
        url = open_meteo_archive_url(
            latitude=13.7563,
            longitude=100.5018,
            start_date=date(2026, 7, 1),
            end_date=date(2026, 7, 2),
            base_url="https://archive-api.open-meteo.com/v1/archive",
        )

        self.assertIn("latitude=13.7563", url)
        self.assertIn("longitude=100.5018", url)
        self.assertIn("start_date=2026-07-01", url)
        self.assertIn("end_date=2026-07-02", url)
        self.assertIn("temperature_2m_mean%2Cprecipitation_sum", url)

    def test_parse_daily_weather_rows(self):
        rows = _parse_open_meteo_daily(
            {
                "daily": {
                    "time": ["2026-07-01", "2026-07-02"],
                    "temperature_2m_mean": [29.4, None],
                    "precipitation_sum": [3.2, 0.0],
                }
            }
        )

        self.assertEqual(rows[0]["date"], date(2026, 7, 1))
        self.assertEqual(rows[0]["temperature_c"], 29.4)
        self.assertEqual(rows[0]["rainfall_mm"], 3.2)
        self.assertIsNone(rows[1]["temperature_c"])


if __name__ == "__main__":
    unittest.main()
