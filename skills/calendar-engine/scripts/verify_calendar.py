"""
Stale-entry detector for data/calendar.json.

Flags calendar entries whose last_verified_date is older than the staleness
threshold for their event type. Does NOT auto-fetch or auto-update — it
produces a list of entries requiring human verification and provides the
primary_source_url for each.

Staleness thresholds (days):
  earnings           14
  fomc               30
  opex               N/A (computed — never stale)
  economic           14
  geopolitical        7

Usage:
    python verify_calendar.py                    # check all entries
    python verify_calendar.py --as-of 2026-05-18
    python verify_calendar.py --calendar path/to/calendar.json
"""

import argparse
import json
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).parent
PROJECT_ROOT = HERE.parent.parent.parent
DEFAULT_CALENDAR = PROJECT_ROOT / "data" / "calendar.json"

STALENESS_DAYS: dict[str, int | None] = {
    "earnings":     14,
    "fomc":         30,
    "opex":         None,   # computed, never stale
    "economic":     14,
    "geopolitical":  7,
}


def check_calendar(calendar_path: Path, as_of: date) -> dict:
    """
    Returns:
        {
          "as_of": ISO,
          "total_entries": int,
          "stale": [ { entry + days_stale, threshold } ],
          "unverified": [ entries where last_verified_date is null ],
          "ok": int,
        }
    """
    if not calendar_path.exists():
        return {"error": f"calendar.json not found at {calendar_path}"}

    with open(calendar_path, encoding="utf-8-sig") as f:
        entries = json.load(f)

    stale = []
    unverified = []
    ok_count = 0

    for entry in entries:
        evt_type = entry.get("type", "")
        threshold = STALENESS_DAYS.get(evt_type)

        if threshold is None:
            # computed type — skip
            ok_count += 1
            continue

        lv = entry.get("last_verified_date")
        if not lv:
            unverified.append({**entry, "reason": "last_verified_date is null"})
            continue

        last_verified = date.fromisoformat(lv)
        age_days = (as_of - last_verified).days
        if age_days > threshold:
            stale.append({
                **entry,
                "days_stale": age_days,
                "threshold_days": threshold,
                "action": f"Verify against: {entry.get('primary_source_url', 'no URL on record')}",
            })
        else:
            ok_count += 1

    return {
        "as_of": as_of.isoformat(),
        "total_entries": len(entries),
        "stale_count": len(stale),
        "unverified_count": len(unverified),
        "ok_count": ok_count,
        "stale": stale,
        "unverified": unverified,
        "clean": len(stale) == 0 and len(unverified) == 0,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", dest="as_of", default=None,
                        help="Reference date ISO (default: today)")
    parser.add_argument("--calendar", default=None,
                        help="Path to calendar.json")
    args = parser.parse_args()

    as_of = date.fromisoformat(args.as_of) if args.as_of else date.today()
    calendar_path = Path(args.calendar) if args.calendar else DEFAULT_CALENDAR

    result = check_calendar(calendar_path, as_of)
    print(json.dumps(result, indent=2))
