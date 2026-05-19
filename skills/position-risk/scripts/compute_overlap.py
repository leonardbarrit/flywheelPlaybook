"""
Compute the overlap matrix: open positions × calendar events.

For each open option position, returns all calendar events that fall between
today (the from_date) and expiration. This is the raw overlap data;
risk_score.py converts it to scored output.

Inputs:
  - data/positions.json  (open options)
  - forward_window.py output (piped or --window file)

Usage:
    python forward_window.py --from 2026-05-18 --days 45 | python compute_overlap.py
    python compute_overlap.py --window window.json --positions data/positions.json

Output:
    {
      "as_of": ISO,
      "positions": [
        {
          "ticker": "NVDA",
          "type": "CALL",
          "strike": 205,
          "expiration": "2026-06-20",
          "dte": 33,
          "direction": "SHORT",
          "account": "ROTH",
          "events_in_window": [ ... ],
          "critical_events": [ importance == "critical" ],
          "earnings_in_window": bool,
          "fomc_in_window": bool,
          "high_importance_count": int,
        }
      ]
    }
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
PROJECT_ROOT = HERE.parent.parent.parent
DEFAULT_POSITIONS = PROJECT_ROOT / "data" / "positions.json"


def load_positions(path: Path) -> list[dict]:
    """Extract open option positions from positions.json."""
    with open(path, encoding="utf-8-sig") as f:
        data = json.load(f)

    positions = []
    for account in ("roth", "hsa", "trad_ira"):
        acct = data.get(account, {})
        for opt in acct.get("options", []):
            positions.append({**opt, "account": account.upper()})
    return positions


def compute_overlap(positions: list[dict], window: dict, as_of: date) -> dict:
    events = window.get("events", [])

    result_positions = []
    for pos in positions:
        exp = date.fromisoformat(pos["expiration"])
        dte = (exp - as_of).days

        # Events between today and expiration (inclusive)
        in_window = []
        for evt in events:
            evt_date = date.fromisoformat(evt["date"])
            if as_of <= evt_date <= exp:
                in_window.append(evt)

        critical = [e for e in in_window if e.get("importance") == "critical"]
        high_imp = [e for e in in_window if e.get("importance") in ("critical", "high")]
        earnings_overlap = any(e.get("type") == "earnings" for e in in_window)
        fomc_overlap = any(e.get("type") == "fomc" for e in in_window)

        result_positions.append({
            "ticker": pos.get("underlying") or pos.get("ticker"),
            "type": pos.get("type"),
            "strike": pos.get("strike"),
            "expiration": pos.get("expiration"),
            "dte": dte,
            "direction": pos.get("direction"),
            "account": pos.get("account"),
            "premium": pos.get("premium"),
            "mode": pos.get("mode"),
            "qty": pos.get("qty"),
            "events_in_window": in_window,
            "critical_events": critical,
            "earnings_in_window": earnings_overlap,
            "fomc_in_window": fomc_overlap,
            "high_importance_count": len(high_imp),
            "total_event_count": len(in_window),
        })

    return {
        "as_of": as_of.isoformat(),
        "position_count": len(result_positions),
        "positions": result_positions,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--window", default=None,
                        help="Path to forward_window.py output JSON. Reads stdin if omitted.")
    parser.add_argument("--positions", default=None,
                        help="Path to positions.json")
    parser.add_argument("--as-of", dest="as_of", default=None,
                        help="Reference date ISO (default: today)")
    args = parser.parse_args()

    as_of = date.fromisoformat(args.as_of) if args.as_of else date.today()
    positions_path = Path(args.positions) if args.positions else DEFAULT_POSITIONS

    if args.window:
        with open(args.window, encoding="utf-8-sig") as f:
            window = json.load(f)
    else:
        raw = sys.stdin.read().lstrip("﻿")
        window = json.loads(raw)

    positions = load_positions(positions_path)
    result = compute_overlap(positions, window, as_of)
    print(json.dumps(result, indent=2))
