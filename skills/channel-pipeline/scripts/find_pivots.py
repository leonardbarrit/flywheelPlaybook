"""
find_pivots.py -- Phase 4, Layer 1

Identifies local minima and maxima (pivot points) in OHLCV data.
At each pivot computes velocity (delta-price from prior pivot) and
acceleration (delta-velocity from prior interval).

Classification:
  High |acceleration| = genuine inflection point = anchor candidate (APL/APH)
  Low  |acceleration| = oscillation = constituency member or containment evidence

Input: Massive.com 4h OHLCV JSON  { "results": [{t, o, h, l, c, v}, ...] }
       OR processed OHLCV JSON     [{ "date": "YYYY-MM-DD", "open", "high", "low", "close" }, ...]

Output (stdout): JSON
  {
    "ticker": str,
    "timeframe": str,
    "bars_per_day": float,
    "window": int,
    "accel_threshold": float,
    "bar_count": int,
    "pivot_count": int,
    "anchor_candidate_count": int,
    "pivots": [ { bar_index, date, type, price, close, velocity, acceleration, anchor_candidate } ]
  }

Usage:
    py find_pivots.py --file data/_tmp_ohlcv_4h.json
    py find_pivots.py --file data/_tmp_ohlcv_4h.json --window 3 --ticker NVDA
    py find_pivots.py --file data/_tmp_ohlcv_4h.json --accel-percentile 66
    py find_pivots.py --file data/_tmp_ohlcv_4h.json --out data/_tmp_pivots.json
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent

DEFAULT_WINDOW           = 5     # bars each side for local extrema detection
DEFAULT_ACCEL_PERCENTILE = 75    # top N% of |acceleration| = anchor candidate
BARS_PER_DAY_4H          = 1.625 # 6.5 market hours / 4h per bar
BARS_PER_DAY_1D          = 1.0


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_ohlcv(path: Path) -> list[dict]:
    """
    Accept two formats:
      A) Massive.com raw: { "results": [{t, o, h, l, c, v}, ...] }
      B) Processed array: [{ "date": "YYYY-MM-DD", "open", "high", "low", "close" }, ...]
    Returns unified list of dicts with keys: date, open, high, low, close, volume.
    """
    with open(path, encoding="utf-8-sig") as f:
        raw = json.load(f)

    # Format A: dict with "results" key
    if isinstance(raw, dict) and "results" in raw:
        bars = []
        for r in raw["results"]:
            ts_ms = r.get("t", 0)
            dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
            bars.append({
                "date":   dt.strftime("%Y-%m-%d"),
                "time":   dt.strftime("%Y-%m-%d %H:%M"),
                "open":   float(r["o"]),
                "high":   float(r["h"]),
                "low":    float(r["l"]),
                "close":  float(r["c"]),
                "volume": float(r.get("v", 0)),
            })
        return bars

    # Format B: already processed array
    if isinstance(raw, list):
        bars = []
        for r in raw:
            bars.append({
                "date":   r.get("date", ""),
                "time":   r.get("date", ""),
                "open":   float(r.get("open", r.get("o", 0))),
                "high":   float(r.get("high", r.get("h", 0))),
                "low":    float(r.get("low",  r.get("l", 0))),
                "close":  float(r.get("close", r.get("c", 0))),
                "volume": float(r.get("volume", r.get("v", 0))),
            })
        return bars

    raise ValueError(f"Unrecognised OHLCV format in {path}")


# ---------------------------------------------------------------------------
# Pivot detection
# ---------------------------------------------------------------------------

def find_local_extrema(bars: list[dict], window: int) -> list[dict]:
    """
    Scan all bars. A bar is a local minimum if its low is the minimum
    within [i-window, i+window]. A bar is a local maximum if its high
    is the maximum within [i-window, i+window].

    When two adjacent bars tie for the extremum, only the first is kept.
    """
    n = len(bars)
    pivots = []
    seen_indices: set[int] = set()

    for i in range(window, n - window):
        lo_window = [bars[j]["low"]  for j in range(i - window, i + window + 1)]
        hi_window = [bars[j]["high"] for j in range(i - window, i + window + 1)]

        center_low  = bars[i]["low"]
        center_high = bars[i]["high"]

        is_min = center_low  == min(lo_window)
        is_max = center_high == max(hi_window)

        if is_min and i not in seen_indices:
            seen_indices.add(i)
            pivots.append({
                "bar_index": i,
                "date":  bars[i]["date"],
                "time":  bars[i]["time"],
                "type":  "min",
                "price": center_low,
                "close": bars[i]["close"],
                "open":  bars[i]["open"],
                "velocity":     None,
                "acceleration": None,
                "anchor_candidate": False,
            })

        if is_max and i not in seen_indices:
            seen_indices.add(i)
            pivots.append({
                "bar_index": i,
                "date":  bars[i]["date"],
                "time":  bars[i]["time"],
                "type":  "max",
                "price": center_high,
                "close": bars[i]["close"],
                "open":  bars[i]["open"],
                "velocity":     None,
                "acceleration": None,
                "anchor_candidate": False,
            })

    pivots.sort(key=lambda p: p["bar_index"])
    return pivots


# ---------------------------------------------------------------------------
# Velocity and acceleration
# ---------------------------------------------------------------------------

def compute_kinematics(pivots: list[dict]) -> list[dict]:
    """
    Velocity[i]     = price[i] - price[i-1]          (first finite difference)
    Acceleration[i] = velocity[i] - velocity[i-1]    (second finite difference)

    Computed over the combined pivot sequence regardless of type (min or max),
    sorted by bar_index. This captures the magnitude of each swing.
    """
    for i, p in enumerate(pivots):
        if i == 0:
            p["velocity"]     = None
            p["acceleration"] = None
        elif i == 1:
            p["velocity"]     = round(p["price"] - pivots[i - 1]["price"], 4)
            p["acceleration"] = None
        else:
            v_prev = pivots[i - 1]["velocity"]
            v_curr = p["price"] - pivots[i - 1]["price"]
            p["velocity"]     = round(v_curr, 4)
            p["acceleration"] = round(v_curr - v_prev, 4)
    return pivots


def classify_anchors(pivots: list[dict], percentile: float) -> tuple[list[dict], float]:
    """
    Anchor candidates = pivots whose |acceleration| is in the top (100-percentile)%.
    Returns updated pivots and the computed threshold value.
    """
    accels = [abs(p["acceleration"]) for p in pivots if p["acceleration"] is not None]
    if not accels:
        return pivots, 0.0

    threshold = float(np.percentile(accels, percentile))

    for p in pivots:
        if p["acceleration"] is not None:
            p["anchor_candidate"] = abs(p["acceleration"]) >= threshold
        else:
            p["anchor_candidate"] = False

    return pivots, threshold


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Pivot detection with velocity/acceleration")
    parser.add_argument("--file",    required=True,  help="OHLCV JSON file (Massive.com or processed)")
    parser.add_argument("--ticker",  default="NVDA",  help="Ticker symbol (metadata only)")
    parser.add_argument("--timeframe", default="4h", choices=["4h", "1d"])
    parser.add_argument("--window",  type=int,   default=DEFAULT_WINDOW,
                        help=f"Bars each side for local extrema (default {DEFAULT_WINDOW})")
    parser.add_argument("--accel-percentile", type=float, default=DEFAULT_ACCEL_PERCENTILE,
                        help=f"Percentile threshold for anchor_candidate (default {DEFAULT_ACCEL_PERCENTILE})")
    parser.add_argument("--out",     default=None, help="Write output JSON to file instead of stdout")
    args = parser.parse_args()

    bars_per_day = BARS_PER_DAY_4H if args.timeframe == "4h" else BARS_PER_DAY_1D

    data_path = Path(args.file)
    if not data_path.is_absolute():
        data_path = PROJECT_ROOT / data_path

    bars = load_ohlcv(data_path)
    if len(bars) < args.window * 2 + 1:
        print(json.dumps({"error": f"Insufficient bars ({len(bars)}) for window={args.window}"}))
        sys.exit(1)

    pivots = find_local_extrema(bars, args.window)
    pivots = compute_kinematics(pivots)
    pivots, accel_threshold = classify_anchors(pivots, args.accel_percentile)

    anchor_count = sum(1 for p in pivots if p["anchor_candidate"])

    result = {
        "ticker":               args.ticker,
        "timeframe":            args.timeframe,
        "bars_per_day":         bars_per_day,
        "window":               args.window,
        "accel_percentile":     args.accel_percentile,
        "accel_threshold":      round(accel_threshold, 4),
        "bar_count":            len(bars),
        "pivot_count":          len(pivots),
        "anchor_candidate_count": anchor_count,
        "date_range": {
            "from": bars[0]["date"] if bars else None,
            "to":   bars[-1]["date"] if bars else None,
        },
        "pivots": pivots,
    }

    output = json.dumps(result, indent=2)

    if args.out:
        out_path = Path(args.out)
        if not out_path.is_absolute():
            out_path = PROJECT_ROOT / out_path
        out_path.write_text(output, encoding="utf-8")
        # Brief summary to stdout
        mins  = sum(1 for p in pivots if p["type"] == "min")
        maxes = sum(1 for p in pivots if p["type"] == "max")
        print(f"Pivots written to {out_path}")
        print(f"  Bars: {len(bars)} | Pivots: {len(pivots)} (min={mins}, max={maxes})")
        print(f"  Anchor candidates: {anchor_count} (|accel| >= {accel_threshold:.2f})")
        print(f"  Date range: {result['date_range']['from']} to {result['date_range']['to']}")
    else:
        print(output)


if __name__ == "__main__":
    main()
