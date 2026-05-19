"""
Compute event density within the forward window.

Reads forward_window.py output (piped or from file) and returns
events-per-week counts with high-density flags (>=3 events/week).

Designed to be called after forward_window.py in a pipeline:
    python forward_window.py | python compute_density.py

Or standalone against a saved window file:
    python compute_density.py --window window.json

Output:
    {
      "weeks": [
        {
          "iso_week": "2026-W21",
          "label": "May 18–24",
          "event_count": 2,
          "high_density": false,
          "events": [ list of event summaries ]
        }
      ],
      "high_density_weeks": [ list of week labels ],
      "peak_week": { iso_week, event_count }
    }
"""

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path


def iso_week_label(iso_week: str) -> str:
    """Convert '2026-W21' to 'May 18-24' style label."""
    year, week = iso_week.split("-W")
    # ISO week starts on Monday
    monday = date.fromisocalendar(int(year), int(week), 1)
    sunday = monday + timedelta(days=6)
    if monday.month == sunday.month:
        return f"{monday.strftime('%b')} {monday.day}-{sunday.day}"
    else:
        return f"{monday.strftime('%b')} {monday.day}-{sunday.strftime('%b')} {sunday.day}"


def compute_density(window: dict) -> dict:
    events = window.get("events", [])

    weeks: dict[str, dict] = {}
    for evt in events:
        d = date.fromisoformat(evt["date"])
        iso_week = d.strftime("%G-W%V")
        if iso_week not in weeks:
            weeks[iso_week] = {"events": [], "count": 0}
        weeks[iso_week]["events"].append({
            "date": evt["date"],
            "label": evt.get("label") or evt.get("type", ""),
            "importance": evt.get("importance", ""),
            "days_until": evt.get("days_until"),
        })
        weeks[iso_week]["count"] += 1

    result_weeks = []
    for iso_week in sorted(weeks.keys()):
        wk = weeks[iso_week]
        result_weeks.append({
            "iso_week": iso_week,
            "label": iso_week_label(iso_week),
            "event_count": wk["count"],
            "high_density": wk["count"] >= 3,
            "events": wk["events"],
        })

    high_density = [w for w in result_weeks if w["high_density"]]
    peak = max(result_weeks, key=lambda w: w["event_count"]) if result_weeks else None

    return {
        "from_date": window.get("from_date"),
        "to_date": window.get("to_date"),
        "total_events": len(events),
        "weeks": result_weeks,
        "high_density_weeks": [w["label"] for w in high_density],
        "peak_week": {"iso_week": peak["iso_week"], "event_count": peak["event_count"]} if peak else None,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--window", default=None,
                        help="Path to forward_window.py output JSON. Reads stdin if omitted.")
    args = parser.parse_args()

    if args.window:
        with open(args.window, encoding="utf-8-sig") as f:
            window = json.load(f)
    else:
        # sys.stdin on Windows may include BOM if file was piped from PS Out-File
        raw = sys.stdin.read().lstrip("﻿")
        window = json.loads(raw)

    result = compute_density(window)
    print(json.dumps(result, indent=2))
