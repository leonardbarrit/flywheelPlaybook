"""
build_geometry.py -- Phase 4, Layer 5

Pure math. Given accepted channel anchor pairs, computes:
  - Compression rail slope and equation
  - Containment rail offset (sliding-window max close distance from compression rail)
  - Wedge apex using corrected direction-agnostic formula
  - T+45 projection (prevailing containment rail)

This script knows nothing about pivot detection or scoring. It operates
on explicitly supplied anchor coordinates and OHLCV data for containment fitting.

Input:
  --channels  JSON file: list of accepted channel dicts (see schema below)
  --ohlcv     JSON file: OHLCV data (Massive.com or processed format)
  --t45-date  YYYY-MM-DD override for T+45 target date (default: today + 45 trading days)

Channel input schema (one or two channels):
  [
    {
      "channel_id": "asc-2026-04-03",
      "direction": "ascending" | "descending",
      "role": "prevailing" | "opposing" | "unknown",
      "compression_rail": {
        "anchor1": { "date": "YYYY-MM-DD", "price": float },
        "anchor2": { "date": "YYYY-MM-DD", "price": float }
      },
      "containment_anchor": { "date": "YYYY-MM-DD", "price": float },
      "containment_window_days": 30    (optional, default 30)
    }
  ]

Output (stdout): JSON
  {
    "channels": [ { ...input... + slope, offset, projection_t45 } ],
    "wedge": { apex_date, apex_bar, apex_price, apex_days_forward, valid } | null,
    "t45_date": "YYYY-MM-DD",
    "computed_at": "YYYY-MM-DD"
  }

Usage:
    py build_geometry.py --channels data/_tmp_channels.json --ohlcv data/_tmp_ohlcv_4h.json
    py build_geometry.py --channels data/_tmp_channels.json --ohlcv data/_tmp_ohlcv_4h.json --t45-date 2026-07-03
"""

import argparse
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent

BARS_PER_DAY_4H = 1.625
BARS_PER_DAY_1D = 1.0
TRADING_DAYS_PER_WEEK = 5
DEFAULT_CONTAINMENT_WINDOW_DAYS = 30
APEX_MIN_DAYS_FORWARD =   5   # apex closer than this is not actionable
APEX_MAX_DAYS_FORWARD = 120   # apex further than this is suspect


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_json(path: Path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def load_ohlcv(path: Path) -> list[dict]:
    raw = load_json(path)
    if isinstance(raw, dict) and "results" in raw:
        bars = []
        for r in raw["results"]:
            ts_ms = r.get("t", 0)
            dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
            bars.append({
                "date":  dt.strftime("%Y-%m-%d"),
                "open":  float(r["o"]),
                "high":  float(r["h"]),
                "low":   float(r["l"]),
                "close": float(r["c"]),
            })
        return bars
    if isinstance(raw, list):
        return [
            {
                "date":  r.get("date", ""),
                "open":  float(r.get("open",  r.get("o", 0))),
                "high":  float(r.get("high",  r.get("h", 0))),
                "low":   float(r.get("low",   r.get("l", 0))),
                "close": float(r.get("close", r.get("c", 0))),
            }
            for r in raw
        ]
    raise ValueError("Unrecognised OHLCV format")


# ---------------------------------------------------------------------------
# Date / bar index utilities
# ---------------------------------------------------------------------------

def parse_date(s: str) -> date:
    return date.fromisoformat(s[:10])


def add_trading_days(start: date, n: int) -> date:
    """Approximate: skip weekends only (no holiday calendar)."""
    d = start
    added = 0
    while added < n:
        d += timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d


def bar_index_for_date(bars: list[dict], target: date) -> int | None:
    """Return index of the first bar whose date >= target, or None."""
    target_str = target.isoformat()
    for i, b in enumerate(bars):
        if b["date"] >= target_str:
            return i
    return None


def date_for_bar_index(bars: list[dict], idx: int) -> str | None:
    if 0 <= idx < len(bars):
        return bars[idx]["date"]
    return None


def bar_count_between(bars: list[dict], date_a: date, date_b: date) -> float:
    """
    Count bars between two dates using the actual bar list.
    Falls back to approximate calculation if dates are outside bar range.
    """
    idx_a = bar_index_for_date(bars, date_a)
    idx_b = bar_index_for_date(bars, date_b)
    if idx_a is not None and idx_b is not None:
        return float(idx_b - idx_a)
    # Approximate fallback
    delta = (date_b - date_a).days
    trading_approx = delta * 5 / 7
    return trading_approx * BARS_PER_DAY_4H


# ---------------------------------------------------------------------------
# Compression rail
# ---------------------------------------------------------------------------

def compute_slope(anchor1: dict, anchor2: dict, bars: list[dict]) -> float:
    """slope = (price2 - price1) / bar_count_between_anchors"""
    d1 = parse_date(anchor1["date"])
    d2 = parse_date(anchor2["date"])
    bars_apart = bar_count_between(bars, d1, d2)
    if bars_apart == 0:
        raise ValueError(f"Anchor dates are identical or too close: {d1} == {d2}")
    return (anchor2["price"] - anchor1["price"]) / bars_apart


def compression_price_at(anchor1: dict, slope: float, bars: list[dict], target_date: date) -> float:
    """Price on the compression rail at target_date."""
    d1 = parse_date(anchor1["date"])
    bars_from_anchor = bar_count_between(bars, d1, target_date)
    return anchor1["price"] + slope * bars_from_anchor


# ---------------------------------------------------------------------------
# Containment rail offset
# ---------------------------------------------------------------------------

def compute_containment_offset(
    channel: dict,
    slope: float,
    anchor1: dict,
    bars: list[dict],
    window_days: int,
) -> float:
    """
    Sliding-window recency-weighted max close distance from compression rail.

    If a containment_anchor is explicitly supplied, use it directly:
      offset = anchor_price - compression_price_at(anchor_date)

    Otherwise compute from the OHLCV data over the most recent window_days.
    For ascending channels: offset = max(close - compression_rail) > 0
    For descending channels: offset = min(close - compression_rail) < 0
    """
    direction = channel.get("direction", "ascending")

    # Explicit containment anchor overrides computation
    cont_anchor = channel.get("containment_anchor")
    if cont_anchor and cont_anchor.get("date") and cont_anchor.get("price"):
        target_date = parse_date(cont_anchor["date"])
        rail_price  = compression_price_at(anchor1, slope, bars, target_date)
        return round(cont_anchor["price"] - rail_price, 4)

    # Compute from closes over the lookback window
    anchor1_date = parse_date(anchor1["date"])
    all_dates = [parse_date(b["date"]) for b in bars]

    # Restrict to bars after anchor1
    window_distances = []
    for i, b in enumerate(bars):
        bdate = parse_date(b["date"])
        if bdate < anchor1_date:
            continue
        rail = compression_price_at(anchor1, slope, bars, bdate)
        dist = b["close"] - rail
        window_distances.append((bdate, dist))

    if not window_distances:
        return 0.0

    # Use most recent window_days of data (recency preference)
    latest_date = window_distances[-1][0]
    cutoff = latest_date - timedelta(days=window_days)
    recent = [(d, dist) for d, dist in window_distances if d >= cutoff] or window_distances

    if direction == "ascending":
        offset = max(dist for _, dist in recent)
    else:
        offset = min(dist for _, dist in recent)

    return round(offset, 4)


# ---------------------------------------------------------------------------
# Wedge apex (corrected formula)
# ---------------------------------------------------------------------------

def compute_apex(ch_p: dict, ch_o: dict, bars: list[dict], today: date) -> dict:
    """
    Direction-agnostic apex formula.

    For prevailing rail P anchored at (t_P, price_P) with slope_P:
      price_P(t) = price_P + slope_P * (t - t_P)

    For opposing rail O anchored at (t_O, price_O) with slope_O:
      price_O(t) = price_O + slope_O * (t - t_O)

    Solve price_P(t) = price_O(t):
      t = (price_O - price_P - slope_O*t_O + slope_P*t_P) / (slope_P - slope_O)

    t is in bar index units from bar[0].
    """
    slope_P = ch_p["slope"]
    slope_O = ch_o["slope"]

    if abs(slope_P - slope_O) < 1e-9:
        return {"valid": False, "reason": "Rails are parallel — no apex"}

    a1_P = ch_p["compression_rail"]["anchor1"]
    a1_O = ch_o["compression_rail"]["anchor1"]

    # Bar indices for anchor reference points
    t_P = bar_index_for_date(bars, parse_date(a1_P["date"])) or 0
    t_O = bar_index_for_date(bars, parse_date(a1_O["date"])) or 0
    price_P = a1_P["price"]
    price_O = a1_O["price"]

    t_apex = (price_O - price_P - slope_O * t_O + slope_P * t_P) / (slope_P - slope_O)
    t_apex_int = int(round(t_apex))

    apex_date_str = date_for_bar_index(bars, t_apex_int)
    if apex_date_str:
        apex_date = parse_date(apex_date_str)
    else:
        # Extrapolate beyond bar range
        last_bar_date = parse_date(bars[-1]["date"])
        bars_beyond = t_apex_int - len(bars)
        apex_date = add_trading_days(last_bar_date, int(bars_beyond / BARS_PER_DAY_4H))
        apex_date_str = apex_date.isoformat()

    days_forward = (apex_date - today).days

    # Apex price = either rail evaluated at t_apex
    apex_price = price_P + slope_P * (t_apex - t_P)

    valid = APEX_MIN_DAYS_FORWARD <= days_forward <= APEX_MAX_DAYS_FORWARD

    return {
        "valid":             valid,
        "apex_date":         apex_date_str,
        "apex_bar_index":    t_apex_int,
        "apex_price":        round(apex_price, 2),
        "apex_days_forward": days_forward,
        "reason":            None if valid else (
            "Apex in the past"         if days_forward < 0 else
            f"Apex too close ({days_forward}d)" if days_forward < APEX_MIN_DAYS_FORWARD else
            f"Apex too far ({days_forward}d)"
        ),
    }


# ---------------------------------------------------------------------------
# T+45 projection
# ---------------------------------------------------------------------------

def compute_t45(ch_p: dict, bars: list[dict], t45_date: date) -> float:
    """
    Project the prevailing containment rail to t45_date.
    containment_t45 = compression_price_at(t45_date) + offset
    """
    a1 = ch_p["compression_rail"]["anchor1"]
    slope  = ch_p["slope"]
    offset = ch_p["containment_offset"]
    rail_price = compression_price_at(a1, slope, bars, t45_date)
    return round(rail_price + offset, 2)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Channel geometry: slope, offset, apex, T+45")
    parser.add_argument("--channels", required=True, help="Accepted channels JSON file")
    parser.add_argument("--ohlcv",    required=True, help="OHLCV JSON file")
    parser.add_argument("--t45-date", default=None,  help="T+45 target date YYYY-MM-DD (default: today+45 trading days)")
    parser.add_argument("--timeframe", default="4h", choices=["4h", "1d"])
    parser.add_argument("--out",      default=None,  help="Write output JSON to file instead of stdout")
    args = parser.parse_args()

    channels_path = Path(args.channels)
    ohlcv_path    = Path(args.ohlcv)
    if not channels_path.is_absolute():
        channels_path = PROJECT_ROOT / channels_path
    if not ohlcv_path.is_absolute():
        ohlcv_path = PROJECT_ROOT / ohlcv_path

    raw_channels = load_json(channels_path)
    # select_pair.py wraps channels in a metadata envelope; unwrap if present
    if isinstance(raw_channels, dict) and "channels" in raw_channels:
        channels = raw_channels["channels"]
    else:
        channels = raw_channels   # bare list (backward compat)
    bars     = load_ohlcv(ohlcv_path)

    if not bars:
        print(json.dumps({"error": "No OHLCV bars loaded"}))
        sys.exit(1)

    today = parse_date(bars[-1]["date"])

    if args.t45_date:
        t45_date = parse_date(args.t45_date)
    else:
        t45_date = add_trading_days(today, 45)

    # Compute geometry for each channel
    output_channels = []
    for ch in channels:
        a1 = ch["compression_rail"]["anchor1"]
        a2 = ch["compression_rail"]["anchor2"]

        try:
            if a2 is not None:
                slope = compute_slope(a1, a2, bars)
            elif ch.get("slope") is not None:
                # No confirmed second anchor — use pre-scored slope from score_channels.py
                slope = ch["slope"]
            else:
                raise ValueError("anchor2 is null and no pre-scored slope available")
        except ValueError as e:
            ch["error"] = str(e)
            output_channels.append(ch)
            continue

        window_days = ch.get("containment_window_days", DEFAULT_CONTAINMENT_WINDOW_DAYS)
        offset = compute_containment_offset(ch, slope, a1, bars, window_days)

        t45_val = None
        if ch.get("role") == "prevailing" or len(channels) == 1:
            # Temporarily attach slope/offset for t45 computation
            ch_tmp = {**ch, "slope": slope, "containment_offset": offset}
            t45_val = compute_t45(ch_tmp, bars, t45_date)

        ch_out = {
            **ch,
            "slope":              round(slope, 6),
            "containment_offset": offset,
            "projection_t45":     t45_val,
        }
        output_channels.append(ch_out)

    # Compute wedge apex if two channels present
    wedge = None
    prevailing_ch = next((c for c in output_channels if c.get("role") == "prevailing" and "slope" in c), None)
    opposing_ch   = next((c for c in output_channels if c.get("role") == "opposing"   and "slope" in c), None)

    if prevailing_ch and opposing_ch:
        wedge = compute_apex(prevailing_ch, opposing_ch, bars, today)

    result = {
        "computed_at": today.isoformat(),
        "t45_date":    t45_date.isoformat(),
        "channels":    output_channels,
        "wedge":       wedge,
    }

    output = json.dumps(result, indent=2)

    if args.out:
        out_path = Path(args.out)
        if not out_path.is_absolute():
            out_path = PROJECT_ROOT / out_path
        out_path.write_text(output, encoding="utf-8")
        print(f"Geometry written to {out_path}")
        for ch in output_channels:
            if "slope" in ch:
                print(f"  {ch['channel_id']} [{ch['direction']}/{ch.get('role','?')}]"
                      f"  slope={ch['slope']:+.4f}  offset={ch['containment_offset']:+.2f}"
                      + (f"  T+45=${ch['projection_t45']:.2f}" if ch.get('projection_t45') else ""))
        if wedge:
            status = "OK" if wedge["valid"] else f"WARNING: {wedge['reason']}"
            print(f"  Wedge apex: {wedge['apex_date']}  ${wedge['apex_price']:.2f}"
                  f"  T+{wedge['apex_days_forward']}d  [{status}]")
    else:
        print(output)


if __name__ == "__main__":
    main()
