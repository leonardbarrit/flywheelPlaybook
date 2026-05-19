"""
Compute options expiration dates.

Returns the 3rd Friday of each month. Flags quarterly OPEX (March, June,
September, December). Outputs are consumed by forward_window.py.

Usage:
    python compute_opex.py --months 3           # next 3 months of OPEX
    python compute_opex.py --from 2026-05-18 --days 45  # OPEX within window
"""

import argparse
import json
from datetime import date, timedelta


QUARTERLY_MONTHS = {3, 6, 9, 12}


def third_friday(year: int, month: int) -> date:
    """Return the 3rd Friday of the given month."""
    first = date(year, month, 1)
    # weekday(): Monday=0 ... Friday=4
    days_to_friday = (4 - first.weekday()) % 7
    first_friday = first + timedelta(days=days_to_friday)
    return first_friday + timedelta(weeks=2)


def opex_in_window(from_date: date, days: int) -> list[dict]:
    """Return all OPEX dates within [from_date, from_date + days]."""
    end = from_date + timedelta(days=days)
    results = []

    # Scan months that could contain an OPEX in the window
    year, month = from_date.year, from_date.month
    while True:
        tf = third_friday(year, month)
        if tf > end:
            break
        if tf >= from_date:
            is_quarterly = month in QUARTERLY_MONTHS
            results.append({
                "date": tf.isoformat(),
                "type": "opex",
                "ticker": None,
                "importance": "high" if is_quarterly else "moderate",
                "quarterly": is_quarterly,
                "label": f"{'Quarterly ' if is_quarterly else ''}OPEX — {tf.strftime('%B %Y')}",
                "affects_forces": ["E1"],
                "primary_source_url": None,
                "last_verified_date": None,
                "confirmed": True,
            })
        # Advance to next month
        month += 1
        if month > 12:
            month = 1
            year += 1

    return results


def opex_for_months(n: int, from_date: date | None = None) -> list[dict]:
    """Return OPEX dates for the next n months."""
    if from_date is None:
        from_date = date.today()
    return opex_in_window(from_date, days=n * 31)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="from_date", default=None,
                        help="Start date ISO (default: today)")
    parser.add_argument("--days", type=int, default=45,
                        help="Window length in days (default: 45)")
    parser.add_argument("--months", type=int, default=None,
                        help="Number of months (overrides --days)")
    args = parser.parse_args()

    from_date = date.fromisoformat(args.from_date) if args.from_date else date.today()
    if args.months:
        results = opex_for_months(args.months, from_date)
    else:
        results = opex_in_window(from_date, args.days)

    print(json.dumps(results, indent=2))
