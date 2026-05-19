"""
Build the 45-day forward catalyst window.

Merges:
  - data/calendar.json  (manually maintained events: earnings, economic, geopolitical)
  - compute_opex.py     (computed OPEX dates)
  - compute_fomc.py     (embedded FOMC schedule)

Returns events sorted by date, with computed days_until from the reference date.

Usage:
    python forward_window.py                           # 45 days from today
    python forward_window.py --from 2026-05-18 --days 45
    python forward_window.py --from 2026-05-18 --days 45 --calendar path/to/calendar.json
"""

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).parent
PROJECT_ROOT = HERE.parent.parent.parent
DEFAULT_CALENDAR = PROJECT_ROOT / "data" / "calendar.json"

# Import sibling scripts as modules
sys.path.insert(0, str(HERE))
from compute_opex import opex_in_window
from compute_fomc import fomc_in_window


def load_calendar(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def forward_window(from_date: date, days: int, calendar_path: Path) -> dict:
    """
    Merge all event sources into a single sorted window.

    Returns:
        {
          "from_date": ISO,
          "to_date": ISO,
          "days": int,
          "events": [sorted event objects with days_until],
          "density": { "YYYY-Www": int },   # events per ISO week
        }
    """
    end = from_date + timedelta(days=days)

    # Computed sources
    opex_events = opex_in_window(from_date, days)
    fomc_events = fomc_in_window(from_date, days)

    # Manually maintained calendar
    raw_calendar = load_calendar(calendar_path)
    calendar_events = []
    for evt in raw_calendar:
        d = date.fromisoformat(evt["date"])
        if from_date <= d <= end:
            calendar_events.append(evt)

    # Merge and sort
    all_events = opex_events + fomc_events + calendar_events
    all_events.sort(key=lambda e: e["date"])

    # Annotate days_until
    for evt in all_events:
        d = date.fromisoformat(evt["date"])
        evt["days_until"] = (d - from_date).days

    # Density: count events per ISO calendar week
    density: dict[str, int] = {}
    for evt in all_events:
        d = date.fromisoformat(evt["date"])
        iso_week = d.strftime("%G-W%V")
        density[iso_week] = density.get(iso_week, 0) + 1

    # Flag high-density weeks (>=3 events)
    density_flags = {wk: {"count": ct, "high_density": ct >= 3}
                     for wk, ct in density.items()}

    return {
        "from_date": from_date.isoformat(),
        "to_date": end.isoformat(),
        "days": days,
        "event_count": len(all_events),
        "events": all_events,
        "density": density_flags,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="from_date", default=None,
                        help="Start date ISO (default: today)")
    parser.add_argument("--days", type=int, default=45,
                        help="Window length in days (default: 45)")
    parser.add_argument("--calendar", default=None,
                        help="Path to calendar.json (default: data/calendar.json)")
    args = parser.parse_args()

    from_date = date.fromisoformat(args.from_date) if args.from_date else date.today()
    calendar_path = Path(args.calendar) if args.calendar else DEFAULT_CALENDAR

    result = forward_window(from_date, args.days, calendar_path)
    print(json.dumps(result, indent=2))
