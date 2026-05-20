"""
score_channels.py -- Phase 4, Layer 3

Generates ranked channel candidates from pivot data.

Algorithm:
  1. Backwards-iterative anchor search: starting from the most recent bar,
     step back in ~1-month increments. At each step, collect the most recent
     high-acceleration pivot of each direction as an anchor candidate.

  2. APH/APL validity gate:
     - Descending (APH): any subsequent bar with high > anchor.high invalidates the anchor.
       Only the most recent local high with no subsequent exceedance qualifies.
     - Ascending (APL): anchor must have compression rail below current close.

  3. For each valid anchor, collect velocity-coherent constituency: subsequent
     same-direction pivots with similar velocity and low acceleration.

  4. Containment offset: estimated from the 85th-percentile of (bar.high - compression_rail)
     since anchor (ascending) or 15th-percentile of (bar.low - compression_rail) (descending).

  5. Sustained support breach gate: score = 0 if price closed on the wrong side of
     the compression rail for MAX_SUPPORT_BREACH_BARS or more consecutive bars at any
     point since the anchor. A breached support rail means the opposing channel dominated
     during that period; the channel never held as described.

  5b. Current-price validity gate: score = 0 if current close is outside
      [compression_rail_today, containment_rail_today] with tolerance.

  6. Score each candidate: trading_days_spanned * (1 / |slope_per_bar|) / recency_discount.

  7. Envelopment bonus: absorb sub-candidates whose pivots fall inside the channel.

  8. Output ranked lists per direction.

Input:
  --pivots    JSON from find_pivots.py
  --ohlcv     OHLCV JSON (Massive.com or processed format)

Output (stdout): JSON with ascending / descending candidate lists.

Usage:
    py score_channels.py --pivots data/_tmp_pivots.json --ohlcv data/_tmp_ohlcv_4h.json
    py score_channels.py --pivots data/_tmp_pivots.json --ohlcv data/_tmp_ohlcv_4h.json --top-n 5
    py score_channels.py --pivots data/_tmp_pivots.json --ohlcv data/_tmp_ohlcv_4h.json --out data/_tmp_candidates.json
"""

import argparse
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent

# ── Tuning parameters ────────────────────────────────────────────────────────
BARS_PER_DAY_4H          = 1.625
LOOKBACK_STEP_DAYS       = 21      # ~1 month between backwards-search steps
MAX_LOOKBACK_STEPS       = 12      # up to 12 months back
VELOCITY_TOL_PCT         = 0.30    # constituency velocity similarity ±30%
ACCEL_LOW_THRESHOLD      = 0.50    # constituency member |accel| < 50% of anchor threshold
RECENCY_DECAY_BASE       = 1.15    # per-step recency discount (steeper than v1 1.05)
MIN_CONSTITUENCY         = 1       # minimum members to be a candidate
ENVELOPMENT_WEIGHT       = 0.25    # fraction of absorbed sub-candidate score
DEFAULT_TOP_N            = 6       # candidates per direction

# Containment offset estimation
CONTAINMENT_PERCENTILE   = 85      # ascending upper-boundary percentile of bar-high distances
MIN_BARS_FOR_CONTAINMENT = 3       # minimum bars since anchor to compute offset

# Current-price validity gate
CHANNEL_VALIDITY_TOL     = 0.06    # 6% tolerance outside channel bounds before score = 0

# Support breach invalidation
# If price closes on the wrong side of the compression rail for this many consecutive bars,
# the opposing channel dominated and this channel is invalid.
# ~8 bars ≈ 2 full trading days (including extended hours at 4.45 bars/day).
MAX_SUPPORT_BREACH_BARS  = 8


# ---------------------------------------------------------------------------
# Loaders
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
                "high":  float(r["h"]),
                "low":   float(r["l"]),
                "close": float(r["c"]),
            })
        return bars
    if isinstance(raw, list):
        return [
            {
                "date":  r.get("date", ""),
                "high":  float(r.get("high",  r.get("h", 0))),
                "low":   float(r.get("low",   r.get("l", 0))),
                "close": float(r.get("close", r.get("c", 0))),
            }
            for r in raw
        ]
    raise ValueError("Unrecognised OHLCV format")


def parse_date(s: str) -> date:
    return date.fromisoformat(s[:10])


def bar_index_for_date(bars: list[dict], target: date) -> int | None:
    target_str = target.isoformat()
    for i, b in enumerate(bars):
        if b["date"] >= target_str:
            return i
    return None


# ---------------------------------------------------------------------------
# Slope from two pivots
# ---------------------------------------------------------------------------

def slope_between(p_anchor: dict, p_vfd: dict, bars: list[dict]) -> float | None:
    d_a   = parse_date(p_anchor["date"])
    d_v   = parse_date(p_vfd["date"])
    idx_a = bar_index_for_date(bars, d_a)
    idx_v = bar_index_for_date(bars, d_v)
    if idx_a is None or idx_v is None or idx_v <= idx_a:
        return None
    return (p_vfd["price"] - p_anchor["price"]) / (idx_v - idx_a)


def compression_at_bar(anchor_price: float, slope: float,
                       anchor_bar: int, bar_idx: int) -> float:
    return anchor_price + slope * (bar_idx - anchor_bar)


# ---------------------------------------------------------------------------
# Containment offset estimation
# ---------------------------------------------------------------------------

def estimate_containment_offset(
    anchor_bar: int,
    anchor_price: float,
    slope: float,
    direction: str,
    bars: list[dict],
) -> float:
    """
    Ascending:  85th-percentile of (bar.high - compression_rail) over all bars since anchor.
                Measures where the upper boundary of price oscillations sits.
    Descending: 15th-percentile of (bar.low  - compression_rail) over all bars since anchor.
                Measures the lower boundary (offset will be negative).

    Falls back to a ±10% price estimate if fewer than MIN_BARS_FOR_CONTAINMENT bars available.
    """
    today_bar = len(bars) - 1
    dists = []
    for i in range(anchor_bar, today_bar + 1):
        comp = compression_at_bar(anchor_price, slope, anchor_bar, i)
        if direction == "ascending":
            dists.append(bars[i]["high"] - comp)
        else:
            dists.append(bars[i]["low"]  - comp)

    if len(dists) < MIN_BARS_FOR_CONTAINMENT:
        # Fallback: rough ±10% of current price
        current_price = bars[today_bar]["close"]
        return current_price * 0.10 if direction == "ascending" else -current_price * 0.10

    if direction == "ascending":
        offset = float(np.percentile(dists, CONTAINMENT_PERCENTILE))
        return max(offset, 1.0)     # must be positive; at least $1
    else:
        offset = float(np.percentile(dists, 100 - CONTAINMENT_PERCENTILE))  # 15th pct
        return min(offset, -1.0)    # must be negative; at least -$1


# ---------------------------------------------------------------------------
# APH/APL validity gates
# ---------------------------------------------------------------------------

def aph_is_valid(anchor: dict, bars: list[dict]) -> bool:
    """
    Descending anchor (APH) is valid ONLY if no subsequent bar has a higher high.
    A subsequent higher high means the anchor's descending trend was never established.
    """
    anchor_bar   = bar_index_for_date(bars, parse_date(anchor["date"]))
    if anchor_bar is None:
        return False
    anchor_price = anchor["price"]
    for i in range(anchor_bar + 1, len(bars)):
        if bars[i]["high"] > anchor_price:
            return False
    return True


def apl_compression_valid(anchor_price: float, slope: float,
                           anchor_bar: int, bars: list[dict]) -> bool:
    """
    Ascending anchor (APL) is valid only if the compression rail is currently below the close.
    If close < compression_rail_today, the channel was broken to the downside.
    """
    today_bar = len(bars) - 1
    comp_today = compression_at_bar(anchor_price, slope, anchor_bar, today_bar)
    current_close = bars[today_bar]["close"]
    return current_close > comp_today


def compression_support_never_breached(
    anchor_bar: int,
    anchor_price: float,
    slope: float,
    direction: str,
    bars: list[dict],
) -> bool:
    """
    Returns False if price sustained a close on the wrong side of the compression rail
    for MAX_SUPPORT_BREACH_BARS or more consecutive bars.

    Ascending:  close below compression rail = opposing channel dominated = invalid.
    Descending: close above compression rail = opposing channel dominated = invalid.

    A momentary 1-2 bar dip (wick, gap open) does not invalidate; only sustained breach does.
    Consecutive count resets on any bar that closes back inside the rail.
    """
    consecutive = 0
    for i in range(anchor_bar, len(bars)):
        comp = compression_at_bar(anchor_price, slope, anchor_bar, i)
        breached = bars[i]["close"] < comp if direction == "ascending" else bars[i]["close"] > comp
        if breached:
            consecutive += 1
            if consecutive >= MAX_SUPPORT_BREACH_BARS:
                return False
        else:
            consecutive = 0
    return True


# ---------------------------------------------------------------------------
# Backwards-iterative anchor search
# ---------------------------------------------------------------------------

def get_anchor_candidates(
    pivots: list[dict],
    direction: str,
    today: date,
    bars: list[dict],
    step_days: int = LOOKBACK_STEP_DAYS,
    max_steps: int = MAX_LOOKBACK_STEPS,
) -> list[tuple[dict, int]]:
    """
    Steps backwards from today in step_days increments.
    At each step, finds the most recent anchor_candidate pivot of the right direction.

    Descending anchors are additionally filtered by aph_is_valid():
    any anchor whose price was subsequently exceeded is dropped entirely.

    Returns list of (pivot, recency_rank) tuples, recency_rank=0 is most recent.
    """
    pivot_type       = "min" if direction == "ascending" else "max"
    anchor_candidates = [p for p in pivots
                         if p["type"] == pivot_type and p["anchor_candidate"]]

    # Pre-filter descending anchors: drop any APH exceeded by a later bar
    if direction == "descending":
        anchor_candidates = [p for p in anchor_candidates if aph_is_valid(p, bars)]

    found: list[tuple[dict, int]] = []
    seen_bar_indices: set[int]    = set()

    for step in range(max_steps):
        cutoff  = today - timedelta(days=step * step_days)
        eligible = [p for p in anchor_candidates
                    if parse_date(p["date"]) <= cutoff
                    and p["bar_index"] not in seen_bar_indices]
        if not eligible:
            continue
        newest = max(eligible, key=lambda p: p["bar_index"])
        seen_bar_indices.add(newest["bar_index"])
        found.append((newest, step))

    return found


# ---------------------------------------------------------------------------
# Constituency building
# ---------------------------------------------------------------------------

def build_constituency(
    anchor: dict,
    all_pivots: list[dict],
    direction: str,
    accel_threshold: float,
    bars: list[dict],
) -> list[dict]:
    """
    Collect subsequent same-direction pivots that are velocity-coherent with the anchor.
    Velocity coherence: |velocity - anchor_velocity| / |anchor_velocity| <= VELOCITY_TOL_PCT
    Low acceleration: |acceleration| < ACCEL_LOW_THRESHOLD * accel_threshold
    """
    pivot_type     = "min" if direction == "ascending" else "max"
    anchor_velocity = anchor.get("velocity")
    if anchor_velocity is None or abs(anchor_velocity) < 1e-6:
        return [anchor]

    members          = [anchor]
    low_accel_limit  = ACCEL_LOW_THRESHOLD * accel_threshold

    for p in all_pivots:
        if p["bar_index"] <= anchor["bar_index"]:
            continue
        if p["type"] != pivot_type:
            continue
        if p.get("velocity") is None:
            continue
        vel_diff = abs(p["velocity"] - anchor_velocity) / (abs(anchor_velocity) + 1e-9)
        if vel_diff > VELOCITY_TOL_PCT:
            continue
        accel = p.get("acceleration")
        if accel is not None and abs(accel) > low_accel_limit and accel_threshold > 0:
            continue
        members.append(p)

    return members


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def score_candidate(
    anchor: dict,
    slope: float | None,
    recency_rank: int,
    today: date,
) -> float:
    if not slope or abs(slope) < 1e-9:
        return 0.0
    anchor_date = parse_date(anchor["date"])
    span_days   = (today - anchor_date).days
    if span_days < 1:
        return 0.0
    quality  = span_days * (1.0 / abs(slope))
    discount = RECENCY_DECAY_BASE ** recency_rank
    return quality / discount


# ---------------------------------------------------------------------------
# Envelopment bonus
# ---------------------------------------------------------------------------

def envelopment_bonus(
    candidate: dict,
    all_candidates_same_dir: list[dict],
    other_dir_candidates: list[dict],
    bars: list[dict],
) -> float:
    slope  = candidate.get("slope")
    offset = candidate.get("containment_offset", 0) or 0
    if slope is None:
        return 0.0

    anchor1       = candidate["compression_rail"]["anchor1"]
    anchor1_price = anchor1["price"]
    anchor1_bar   = bar_index_for_date(bars, parse_date(anchor1["date"])) or 0
    direction     = candidate["direction"]

    bonus = 0.0
    sub_candidates = [c for c in (all_candidates_same_dir + other_dir_candidates)
                      if c.get("channel_id") != candidate.get("channel_id")
                      and c.get("score", 0) < candidate.get("score", 0)]

    for sub in sub_candidates:
        sub_pivots = sub.get("constituency_pivots", [])
        if not sub_pivots:
            continue
        inside_count = 0
        for sp in sub_pivots:
            bar_i = bar_index_for_date(bars, parse_date(sp["date"])) or 0
            comp  = anchor1_price + slope * (bar_i - anchor1_bar)
            cont  = comp + offset
            px    = sp["price"]
            if direction == "ascending":
                inside = comp <= px <= cont
            else:
                inside = cont <= px <= comp
            if inside:
                inside_count += 1
        fraction = inside_count / len(sub_pivots) if sub_pivots else 0.0
        if fraction >= 0.60:
            bonus += ENVELOPMENT_WEIGHT * sub.get("score", 0)

    return bonus


# ---------------------------------------------------------------------------
# Build candidates for one direction
# ---------------------------------------------------------------------------

def build_candidates(
    pivots: list[dict],
    direction: str,
    bars: list[dict],
    today: date,
    accel_threshold: float,
    top_n: int,
) -> list[dict]:
    anchor_list = get_anchor_candidates(pivots, direction, today, bars)
    pivot_type  = "min" if direction == "ascending" else "max"
    today_bar   = len(bars) - 1

    candidates = []
    for rank, (anchor, recency_rank) in enumerate(anchor_list):
        anchor_bar   = bar_index_for_date(bars, parse_date(anchor["date"])) or 0
        anchor_price = anchor["price"]

        # Constituency and VFD/VSR
        constituency = build_constituency(anchor, pivots, direction, accel_threshold, bars)
        vfd          = constituency[1] if len(constituency) > 1 else None

        # Slope: prefer VFD; fall back to latest same-type pivot
        slope = None
        if vfd:
            slope = slope_between(anchor, vfd, bars)
        if slope is None:
            latest_same = [p for p in pivots
                           if p["type"] == pivot_type and p["bar_index"] > anchor_bar]
            if latest_same:
                slope = slope_between(anchor, latest_same[-1], bars)

        # Direction sanity
        if slope is not None:
            if direction == "ascending"  and slope <= 0:
                slope = None
            elif direction == "descending" and slope >= 0:
                slope = None

        # Provisional descending rail: when APH exists but no VSR or second pivot found,
        # fit a least-squares regression through bar HIGHS since the APH anchor.
        # More stable than a 2-point APH→current-close slope over a short lookback.
        # Marked provisional=True so chart renders to apex only (not T+45).
        is_provisional = False
        if slope is None and direction == "descending":
            bars_since_anchor = today_bar - anchor_bar
            if bars_since_anchor >= 3:
                xs  = list(range(bars_since_anchor + 1))
                ys  = [bars[anchor_bar + i]["high"] for i in xs]
                n   = len(xs)
                xm  = sum(xs) / n
                ym  = sum(ys) / n
                num = sum((xi - xm) * (yi - ym) for xi, yi in zip(xs, ys))
                den = sum((xi - xm) ** 2 for xi in xs)
                if den > 1e-9:
                    prov_slope = num / den
                    if prov_slope < 0:
                        slope          = prov_slope
                        is_provisional = True
                        vfd = {
                            "date":  bars[today_bar]["date"],
                            "price": bars[today_bar]["close"],
                            "type":  "provisional_VSR",
                        }

        # ── Containment offset ────────────────────────────────────────────
        containment_offset = None
        if slope is not None:
            containment_offset = estimate_containment_offset(
                anchor_bar, anchor_price, slope, direction, bars)

        # ── Current-price validity gate ───────────────────────────────────
        # Score = 0 if price is outside the channel at today's bar.
        span_score = score_candidate(anchor, slope, recency_rank, today)

        if slope is not None and containment_offset is not None and span_score > 0:
            comp_today = compression_at_bar(anchor_price, slope, anchor_bar, today_bar)
            cont_today = comp_today + containment_offset
            current    = bars[today_bar]["close"]

            if direction == "ascending":
                # comp < price < cont (with tolerance)
                below_rail = current < comp_today * (1 - CHANNEL_VALIDITY_TOL)
                above_cont = current > cont_today * (1 + CHANNEL_VALIDITY_TOL)
                if below_rail or above_cont:
                    span_score = 0.0

            else:  # descending: cont < price < comp (cont is below comp)
                # compression rail is upper boundary (declining from APH)
                # containment rail is lower boundary
                above_rail = current > comp_today * (1 + CHANNEL_VALIDITY_TOL)
                below_cont = current < cont_today * (1 - CHANNEL_VALIDITY_TOL)
                if above_rail or below_cont:
                    span_score = 0.0

        # Also apply ascending compression-rail validity check
        if direction == "ascending" and slope is not None and span_score > 0:
            if not apl_compression_valid(anchor_price, slope, anchor_bar, bars):
                span_score = 0.0

        # Sustained support breach invalidation — opposing channel dominated
        # Skipped for provisional channels (insufficient history to evaluate)
        if slope is not None and span_score > 0 and not is_provisional:
            if not compression_support_never_breached(
                    anchor_bar, anchor_price, slope, direction, bars):
                span_score = 0.0

        # Provisional channels always get a non-zero score so they render
        if is_provisional and slope is not None and span_score == 0.0:
            span_score = 1.0   # nominal — renders but sorts last

        span_days   = (today - parse_date(anchor["date"])).days
        cid = f"{direction[:3]}-{anchor['date']}-r{recency_rank}"

        cand = {
            "channel_id":          cid,
            "direction":           direction,
            "recency_rank":        recency_rank,
            "score":               round(span_score, 2),
            "provisional":         is_provisional,
            "slope":               round(slope, 6) if slope else None,
            "slope_per_bar":       round(slope, 6) if slope else None,
            "span_days":           span_days,
            "constituency_count":  len(constituency),
            "constituency_pivots": constituency,
            "containment_offset":  round(containment_offset, 4) if containment_offset is not None else None,
            "compression_rail": {
                "anchor1": {
                    "date":  anchor["date"],
                    "price": anchor["price"],
                    "type":  "APL" if direction == "ascending" else "APH",
                },
                "anchor2": {
                    "date":  vfd["date"]  if vfd else None,
                    "price": vfd["price"] if vfd else None,
                    "type":  "VFD" if direction == "ascending" else "VSR",
                } if vfd else None,
            },
        }
        candidates.append(cand)

    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates[:top_n]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Score and rank channel candidates")
    parser.add_argument("--pivots",  required=True, help="Pivot JSON from find_pivots.py")
    parser.add_argument("--ohlcv",   required=True, help="OHLCV JSON file")
    parser.add_argument("--top-n",   type=int, default=DEFAULT_TOP_N,
                        help=f"Candidates per direction (default {DEFAULT_TOP_N})")
    parser.add_argument("--out",     default=None, help="Write output to file")
    args = parser.parse_args()

    pivots_path = Path(args.pivots)
    ohlcv_path  = Path(args.ohlcv)
    if not pivots_path.is_absolute():
        pivots_path = PROJECT_ROOT / pivots_path
    if not ohlcv_path.is_absolute():
        ohlcv_path = PROJECT_ROOT / ohlcv_path

    pivot_data      = load_json(pivots_path)
    pivots          = pivot_data["pivots"]
    accel_threshold = pivot_data.get("accel_threshold", 0)
    bars            = load_ohlcv(ohlcv_path)

    if not bars:
        print(json.dumps({"error": "No OHLCV bars loaded"}))
        sys.exit(1)

    today = parse_date(bars[-1]["date"])

    asc_candidates  = build_candidates(pivots, "ascending",  bars, today, accel_threshold, args.top_n)
    desc_candidates = build_candidates(pivots, "descending", bars, today, accel_threshold, args.top_n)

    # Envelopment bonus (requires initial scores and constituency_pivots still attached)
    for c in asc_candidates:
        bonus = envelopment_bonus(c, asc_candidates, desc_candidates, bars)
        c["score"]             = round(c["score"] + bonus, 2)
        c["envelopment_bonus"] = round(bonus, 2)
    for c in desc_candidates:
        bonus = envelopment_bonus(c, desc_candidates, asc_candidates, bars)
        c["score"]             = round(c["score"] + bonus, 2)
        c["envelopment_bonus"] = round(bonus, 2)

    # Re-sort after bonus; strip internal pivot list
    asc_candidates.sort( key=lambda c: c["score"], reverse=True)
    desc_candidates.sort(key=lambda c: c["score"], reverse=True)
    for c in asc_candidates + desc_candidates:
        c.pop("constituency_pivots", None)

    result = {
        "scored_at":  today.isoformat(),
        "parameters": {
            "lookback_step_days":    LOOKBACK_STEP_DAYS,
            "max_lookback_steps":    MAX_LOOKBACK_STEPS,
            "velocity_tol_pct":      VELOCITY_TOL_PCT,
            "accel_low_threshold":   ACCEL_LOW_THRESHOLD,
            "recency_decay_base":    RECENCY_DECAY_BASE,
            "envelopment_weight":    ENVELOPMENT_WEIGHT,
            "containment_percentile": CONTAINMENT_PERCENTILE,
            "channel_validity_tol":  CHANNEL_VALIDITY_TOL,
        },
        "ascending":  asc_candidates,
        "descending": desc_candidates,
    }

    output = json.dumps(result, indent=2)

    if args.out:
        out_path = Path(args.out)
        if not out_path.is_absolute():
            out_path = PROJECT_ROOT / out_path
        out_path.write_text(output, encoding="utf-8")
        print(f"Candidates written to {out_path}")
        print(f"\n  Ascending candidates ({len(asc_candidates)}):")
        for i, c in enumerate(asc_candidates):
            a2      = c["compression_rail"].get("anchor2")
            a2_str  = a2["date"] if a2 and a2.get("date") else "no VFD"
            slope_s = f"{c['slope_per_bar']:+.4f}" if c["slope_per_bar"] is not None else "n/a"
            off_s   = f"${c['containment_offset']:+.2f}" if c["containment_offset"] is not None else "n/a"
            print(f"    [{i+1}] {c['channel_id']}  score={c['score']:.1f}"
                  f"  slope={slope_s}/bar  span={c['span_days']}d"
                  f"  offset={off_s}"
                  f"  anchor={c['compression_rail']['anchor1']['date']}"
                  f"  ${c['compression_rail']['anchor1']['price']:.2f}  VFD={a2_str}")
        print(f"\n  Descending candidates ({len(desc_candidates)}):")
        for i, c in enumerate(desc_candidates):
            a2      = c["compression_rail"].get("anchor2")
            a2_str  = a2["date"] if a2 and a2.get("date") else "no VSR"
            slope_s = f"{c['slope_per_bar']:+.4f}" if c["slope_per_bar"] is not None else "n/a"
            off_s   = f"${c['containment_offset']:+.2f}" if c["containment_offset"] is not None else "n/a"
            print(f"    [{i+1}] {c['channel_id']}  score={c['score']:.1f}"
                  f"  slope={slope_s}/bar  span={c['span_days']}d"
                  f"  offset={off_s}"
                  f"  anchor={c['compression_rail']['anchor1']['date']}"
                  f"  ${c['compression_rail']['anchor1']['price']:.2f}  VSR={a2_str}")
    else:
        print(output)


if __name__ == "__main__":
    main()
