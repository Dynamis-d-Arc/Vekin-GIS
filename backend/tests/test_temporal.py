import unittest
from datetime import date

from app.temporal import build_temporal_analysis


def daily_row(value_date: date, ndvi: float, ndbi: float = 0.1, count: int = 1):
    return {
        "date": value_date,
        "average_ndvi": ndvi,
        "average_ndbi": ndbi,
        "ndvi_observation_count": count,
        "ndbi_observation_count": count,
        "capture_count": 1,
    }


class TemporalAnalysisTests(unittest.TestCase):
    def test_monthly_comparisons_anomaly_and_slope(self):
        rows = [
            daily_row(date(2023, 1, 10), 0.2),
            daily_row(date(2024, 1, 10), 0.3),
            daily_row(date(2024, 12, 10), 0.4),
            daily_row(date(2025, 1, 10), 0.5),
        ]

        analysis = build_temporal_analysis(
            rows,
            granularity="monthly",
            start_date=date(2024, 12, 1),
            end_date=date(2025, 1, 31),
        )

        self.assertEqual(analysis["summary"]["period_count"], 2)
        latest = analysis["periods"][-1]
        self.assertAlmostEqual(latest["previous_period_delta_ndvi"], 0.1)
        self.assertAlmostEqual(latest["year_over_year_delta_ndvi"], 0.2)
        self.assertAlmostEqual(latest["historical_mean_ndvi"], 0.25)
        self.assertEqual(latest["historical_sample_count_ndvi"], 2)
        self.assertAlmostEqual(latest["anomaly_ndvi"], 0.25)
        self.assertAlmostEqual(latest["anomaly_zscore_ndvi"], 3.535533906, places=6)

    def test_weekly_aggregation_is_weighted_and_compares_iso_weeks(self):
        rows = [
            daily_row(date(2024, 1, 8), 0.2),
            daily_row(date(2024, 1, 15), 0.3),
            daily_row(date(2025, 1, 6), 0.2, count=1),
            daily_row(date(2025, 1, 7), 0.5, count=3),
            daily_row(date(2025, 1, 13), 0.6),
        ]

        analysis = build_temporal_analysis(
            rows,
            granularity="weekly",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
        )

        first, second = analysis["periods"]
        self.assertAlmostEqual(first["average_ndvi"], 0.425)
        self.assertEqual(first["observation_count"], 4)
        self.assertAlmostEqual(first["year_over_year_delta_ndvi"], 0.225)
        self.assertAlmostEqual(second["previous_period_delta_ndvi"], 0.175)
        self.assertAlmostEqual(second["year_over_year_delta_ndvi"], 0.3)

    def test_empty_analysis_returns_null_slopes(self):
        analysis = build_temporal_analysis([], granularity="monthly")

        self.assertEqual(analysis["periods"], [])
        self.assertIsNone(analysis["summary"]["ndvi_slope_per_30_days"])
        self.assertIsNone(analysis["summary"]["ndbi_slope_per_30_days"])


if __name__ == "__main__":
    unittest.main()
