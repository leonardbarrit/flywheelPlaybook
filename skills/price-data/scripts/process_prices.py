"""
Process NVDA OHLCV data fetched from Massive.com API.

Takes raw OHLCV records, computes gap_pct, close_pct, intraday_reversal,
upserts into composite_history.json, and identifies significant days
that may need news research and force attribution.

Inputs:
  --data PATH     JSON file of OHLCV records (array of objects with
                  date, open, high, low, close, volume fields)
  --history PATH  composite_history.json path (default: data/composite_history.json)
  --events PATH   events.json path for unattributed check (default: data/events.json)

Output (stdout): JSON with keys:
  updated[]       dates that were upserted into history
  significant[]   significant days with price data and reason flags
  unattributed[]  significant days with no event entry in events.json

Significance thresholds:
  GAP_THRESHOLD   = 1.5%   |gap_pct| >= this → gap-significant
  CLOSE_THRESHOLD = 2.0%   |close_pct| >= this → close-significant
  REVERSAL_MIN    = 1.0%   minimum |close_pct| to flag a reversal as significant

Usage:
    py process_prices.py --data data/_tmp_prices.json
    py process_prices.py --data data/_tmp_prices.json --history data/composite_history.json
"""

import argparse
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DEFAULT_HISTORY = PROJECT_ROOT / "data" / "composite_history.json"
DEFAULT_EVENTS  = PROJECT_ROOT / "data" / "events.json"

GAP_THRESHOLD   = 1.5   # |gap_pct| >= this → gap-significant
CLOSE_THRESHOLD = 2.0   # |close_pct| >= this → close-significant
REVERSAL_MIN    = 1.0   # minimum |close_pct| to flag reversal as significant


def load_json(path: Path) -> list | dict:
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def save_json(path: Path, data) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def normalise_record(raw: dict) -> dict | None:
    """Accept multiple field-name conventions from the Massive.com API."""
    date = raw.get("date") or raw.get("Date") or raw.get("t_date")
    open_ = raw.get("open") or raw.get("Open") or raw.get("o")
    high  = raw.get("high") or raw.get("High") or raw.get("h")
    low   = raw.get("low")  or raw.get("Low")  or raw.get("l")
    close = raw.get("close") or raw.get("Close") or raw.get("c")
    volume = raw.get("volume") or raw.get("Volume") or raw.get("v")
    if not date or open_ is None or close is None:
        return None
    return {
        "date": str(date)[:10],
        "open": float(open_),
        "high": float(high) if high is not None else None,
        "low":  float(low)  if low  is not None else None,
        "close": float(close),
        "volume": int(volume) if volume is not None else None,
    }


def compute_derived(rec: dict, prior_close: float | None) -> dict:
    """Add gap_pct, close_pct, intraday_reversal to a normalised record."""
    open_  = rec["open"]
    close  = rec["close"]

    gap_pct   = None
    close_pct = None
    reversal  = None

    if prior_close and prior_close != 0:
        gap_pct   = round((open_ - prior_close) / prior_close * 100, 3)
        close_pct = round((close - prior_close) / prior_close * 100, 3)
        if gap_pct is not None and close_pct is not None:
            # Reversal: open and close in opposite directions
            if gap_pct != 0 and close_pct != 0:
                reversal = (gap_pct > 0) != (close_pct > 0)

    return {**rec, "gap_pct": gap_pct, "close_pct": close_pct, "intraday_reversal": reversal}


def is_significant(rec: dict) -> list[str]:
    """Return list of reason strings if day is significant, else empty list."""
    reasons = []
    gap   = rec.get("gap_pct")
    close = rec.get("close_pct")
    rev   = rec.get("intraday_reversal")

    if gap is not None and abs(gap) >= GAP_THRESHOLD:
        reasons.append(f"gap {gap:+.2f}%")
    if close is not None and abs(close) >= CLOSE_THRESHOLD:
        reasons.append(f"close {close:+.2f}%")
    if rev and close is not None and abs(close) >= REVERSAL_MIN:
        reasons.append("intraday_reversal")
    return reasons


def upsert_history(history: list[dict], rec: dict) -> list[dict]:
    """Upsert a price record into history, preserving composite score fields."""
    today = rec["date"]
    idx = next((i for i, e in enumerate(history) if e["date"] == today), None)

    if idx is not None:
        existing = history[idx]
        merged = {**existing}
        merged["nvda_open"]  = rec["open"]
        merged["nvda_close"] = rec["close"]
        merged["gap_pct"]    = rec.get("gap_pct")
        merged["intraday_reversal"] = rec.get("intraday_reversal")
        history[idx] = merged
    else:
        history.append({
            "date": today,
            "composite_score": None,
            "net_bullish": None,
            "net_bearish": None,
            "net_directional": None,
            "f1_multiplier": None,
            "active_forces": None,
            "attenuating_forces": None,
            "dormant_forces": None,
            "nvda_open": rec["open"],
            "nvda_close": rec["close"],
            "gap_pct": rec.get("gap_pct"),
            "intraday_reversal": rec.get("intraday_reversal"),
        })

    return history


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    parser.add_argument("--history", default=None)
    parser.add_argument("--events", default=None)
    args = parser.parse_args()

    history_path = Path(args.history) if args.history else DEFAULT_HISTORY
    events_path  = Path(args.events)  if args.events  else DEFAULT_EVENTS

    raw_records = load_json(Path(args.data))
    history     = load_json(history_path)
    events      = load_json(events_path) if isinstance(load_json(events_path), list) else []

    # Build set of dates already in events.json
    attributed_dates = {e["date"] for e in events if isinstance(e, dict) and "date" in e}

    # Build prior-close lookup from existing history
    history_by_date = {e["date"]: e for e in history}
    sorted_history  = sorted(history, key=lambda e: e["date"])

    def get_prior_close(date: str) -> float | None:
        candidates = [
            e["nvda_close"]
            for e in sorted_history
            if e["date"] < date and e.get("nvda_close") is not None
        ]
        return candidates[-1] if candidates else None

    updated      = []
    significant  = []
    unattributed = []

    # Sort incoming records by date
    normalised = [normalise_record(r) for r in raw_records]
    normalised = [r for r in normalised if r is not None]
    normalised.sort(key=lambda r: r["date"])

    for rec in normalised:
        prior_close = get_prior_close(rec["date"])
        rec = compute_derived(rec, prior_close)
        history = upsert_history(history, rec)

        # Update sorted_history and history_by_date for subsequent gap calculations
        history_by_date[rec["date"]] = rec
        sorted_history = sorted(history, key=lambda e: e["date"])

        updated.append(rec["date"])

        reasons = is_significant(rec)
        if reasons:
            sig_entry = {
                "date": rec["date"],
                "open": rec["open"],
                "close": rec["close"],
                "gap_pct": rec.get("gap_pct"),
                "close_pct": rec.get("close_pct"),
                "intraday_reversal": rec.get("intraday_reversal"),
                "reasons": reasons,
            }
            significant.append(sig_entry)
            if rec["date"] not in attributed_dates:
                unattributed.append(sig_entry)

    # Write updated history
    history.sort(key=lambda e: e["date"])
    save_json(history_path, history)

    result = {
        "updated": updated,
        "updated_count": len(updated),
        "significant": significant,
        "significant_count": len(significant),
        "unattributed": unattributed,
        "unattributed_count": len(unattributed),
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
