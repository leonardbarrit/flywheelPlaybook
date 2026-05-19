"""
Compute FOMC meeting dates within a forward window.

FOMC schedule is embedded as a constant (sourced from federalreserve.gov,
updated annually). Returns decision-day entries (second day of each meeting)
with days-until computed from a reference date.

Usage:
    python compute_fomc.py                           # 45 days from today
    python compute_fomc.py --from 2026-05-18 --days 45
"""

import argparse
import json
from datetime import date, timedelta


# Fed publishes full-year schedule in January. Update this constant each January.
# Source: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
# Decision day = second day of each meeting.
FOMC_DECISION_DAYS = [
    "2026-01-29",
    "2026-03-19",
    "2026-05-07",
    "2026-06-18",
    "2026-07-30",
    "2026-09-17",
    "2026-10-29",
    "2026-12-10",
]

FOMC_SOURCE_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
FOMC_VERIFIED_DATE = "2026-05-18"


def fomc_in_window(from_date: date, days: int) -> list[dict]:
    """Return FOMC decision days within [from_date, from_date + days]."""
    end = from_date + timedelta(days=days)
    results = []
    for ds in FOMC_DECISION_DAYS:
        d = date.fromisoformat(ds)
        if from_date <= d <= end:
            days_until = (d - from_date).days
            results.append({
                "date": ds,
                "type": "fomc",
                "ticker": None,
                "importance": "high",
                "days_until": days_until,
                "label": f"FOMC Decision Day (T-{days_until})",
                "affects_forces": ["C3", "E2"],
                "primary_source_url": FOMC_SOURCE_URL,
                "last_verified_date": FOMC_VERIFIED_DATE,
                "confirmed": True,
            })
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="from_date", default=None,
                        help="Start date ISO (default: today)")
    parser.add_argument("--days", type=int, default=45,
                        help="Window length in days (default: 45)")
    args = parser.parse_args()

    from_date = date.fromisoformat(args.from_date) if args.from_date else date.today()
    results = fomc_in_window(from_date, args.days)
    print(json.dumps(results, indent=2))
