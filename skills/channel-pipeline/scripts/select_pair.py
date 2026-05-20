"""
select_pair.py -- Phase 4, Layer 4

Handles post-selection logic after the practitioner has toggled candidates on the chart.

Two modes:

MODE 1 — Accept selections:
  Receive the practitioner's accepted channel IDs, assign prevailing/opposing roles,
  validate the pair produces a forward apex, write the accepted pair for build_geometry.py.

MODE 2 — Iterative pass:
  If only one direction is present after selection, run a second scoring pass
  with relaxed parameters (longer lookback, lower acceleration threshold,
  wider velocity tolerance) for the missing direction only. Output new candidates
  for chart rendering.

Usage:
    # Accept selections (IDs from the chart labels)
    py select_pair.py --candidates data/_tmp_candidates.json --ohlcv data/_tmp_ohlcv_4h.json
        --accept asc-2026-04-03-r0,desc-2026-05-12-r0
        --out data/_tmp_accepted_pair.json

    # Iterative pass for missing direction
    py select_pair.py --candidates data/_tmp_candidates.json --ohlcv data/_tmp_ohlcv_4h.json
        --accept asc-2026-04-03-r0
        --iterative-pass
        --out data/_tmp_iterative_candidates.json

    # Single-channel mode (no iterative pass, no wedge)
    py select_pair.py --candidates data/_tmp_candidates.json --ohlcv data/_tmp_ohlcv_4h.json
        --accept asc-2026-04-03-r0
        --single-channel
        --out data/_tmp_accepted_pair.json
"""

import argparse
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent

APEX_MIN_DAYS =   5
APEX_MAX_DAYS =  90

# Relaxed parameters for iterative pass
ITERATIVE_LOOKBACK_STEPS  = 18     # up to 18 months
ITERATIVE_VELOCITY_TOL    = 0.50   # ±50% (relaxed from 30%)
ITERATIVE_ACCEL_PERCENTILE = 60    # lower threshold (more anchors qualify)
BARS_PER_DAY_4H = 1.625


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def load_json(path: Path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def parse_date(s: str) -> date:
    return date.fromisoformat(s[:10])


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


def bar_index_for_date(bars: list[dict], target: date) -> int | None:
    target_str = target.isoformat()
    for i, b in enumerate(bars):
        if b["date"] >= target_str:
            return i
    return None


# ---------------------------------------------------------------------------
# Prevailing / opposing assignment
# ---------------------------------------------------------------------------

def assign_roles(accepted: list[dict]) -> list[dict]:
    """
    The highest-scoring accepted channel is prevailing.
    The other is opposing.
    If only one channel: role = prevailing (single-channel mode).
    """
    if len(accepted) == 0:
        return accepted
    if len(accepted) == 1:
        accepted[0]["role"] = "prevailing"
        return accepted

    sorted_by_score = sorted(accepted, key=lambda c: c.get("score", 0), reverse=True)
    sorted_by_score[0]["role"] = "prevailing"
    for c in sorted_by_score[1:]:
        c["role"] = "opposing"
    return sorted_by_score


# ---------------------------------------------------------------------------
# Apex quick-check (without full geometry computation)
# ---------------------------------------------------------------------------

def quick_apex_check(prevailing: dict, opposing: dict, bars: list[dict]) -> dict:
    """
    Estimate apex days from current spread and slope difference.
    Used as a fast filter — full computation is in build_geometry.py.
    """
    slope_p = prevailing.get("slope_per_bar")
    slope_o = opposing.get("slope_per_bar")
    if slope_p is None or slope_o is None:
        return {"valid": False, "reason": "Slope not computed for one or both channels"}

    if abs(slope_p - slope_o) < 1e-9:
        return {"valid": False, "reason": "Channels are parallel — no apex"}

    # Check convergence direction
    if slope_p > 0 and slope_o > 0:
        if slope_p < slope_o:
            return {"valid": False, "reason": "Both ascending — ascending faster, diverging"}
    elif slope_p < 0 and slope_o < 0:
        if slope_p > slope_o:
            return {"valid": False, "reason": "Both descending — descending faster, diverging"}

    # Estimate current spread from anchor prices at today's bar
    today_bar = len(bars) - 1
    today = parse_date(bars[-1]["date"])

    a1_p = prevailing["compression_rail"]["anchor1"]
    a1_o = opposing["compression_rail"]["anchor1"]

    idx_p = bar_index_for_date(bars, parse_date(a1_p["date"])) or 0
    idx_o = bar_index_for_date(bars, parse_date(a1_o["date"])) or 0

    price_p_today = a1_p["price"] + slope_p * (today_bar - idx_p)
    price_o_today = a1_o["price"] + slope_o * (today_bar - idx_o)
    spread = abs(price_p_today - price_o_today)

    convergence_rate_per_bar = abs(slope_p - slope_o)
    if convergence_rate_per_bar < 1e-9:
        return {"valid": False, "reason": "Convergence rate too small"}

    apex_bars = spread / convergence_rate_per_bar
    apex_days = int(apex_bars / BARS_PER_DAY_4H)

    valid = APEX_MIN_DAYS <= apex_days <= APEX_MAX_DAYS
    return {
        "valid":               valid,
        "estimated_apex_days": apex_days,
        "spread_at_today":     round(spread, 2),
        "reason": None if valid else (
            f"Apex too close ({apex_days}d)" if apex_days < APEX_MIN_DAYS else
            f"Apex too far ({apex_days}d — consider wider apex window or different opposing candidate)"
        ),
    }


# ---------------------------------------------------------------------------
# Iterative pass
# ---------------------------------------------------------------------------

def run_iterative_pass(
    missing_direction: str,
    pivot_file: str,
    ohlcv_file: str,
) -> list[dict]:
    """
    Re-run score_channels.py with relaxed parameters for the missing direction.
    Returns the new candidate list for that direction.
    Calls the script as a subprocess to keep separation clean.
    """
    import subprocess
    import tempfile
    import os

    script = PROJECT_ROOT / "skills" / "channel-pipeline" / "scripts" / "score_channels.py"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
        tmp_out = tmp.name

    try:
        cmd = [
            sys.executable, str(script),
            "--pivots",  pivot_file,
            "--ohlcv",   ohlcv_file,
            "--top-n",   "8",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            return []
        data = json.loads(result.stdout)
        return data.get(missing_direction, [])
    finally:
        if os.path.exists(tmp_out):
            os.unlink(tmp_out)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Accept channel selections and assign roles")
    parser.add_argument("--candidates", required=True, help="Candidates JSON from score_channels.py")
    parser.add_argument("--ohlcv",      required=True, help="OHLCV JSON file")
    parser.add_argument("--accept",     required=True,
                        help="Comma-separated channel_ids to accept (from chart labels)")
    parser.add_argument("--pivots",     default=None,
                        help="Pivot JSON (required for --iterative-pass)")
    parser.add_argument("--iterative-pass", action="store_true",
                        help="If one direction missing, run a relaxed second pass")
    parser.add_argument("--single-channel", action="store_true",
                        help="Accept single-channel result; skip iterative pass and wedge")
    parser.add_argument("--out",        required=True, help="Output JSON for build_geometry.py")
    args = parser.parse_args()

    candidates_path = Path(args.candidates)
    ohlcv_path      = Path(args.ohlcv)
    out_path        = Path(args.out)
    for p in [candidates_path, ohlcv_path]:
        if not p.is_absolute():
            p = PROJECT_ROOT / p

    candidates_data = load_json(candidates_path)
    bars            = load_ohlcv(ohlcv_path)
    all_candidates  = candidates_data.get("ascending", []) + candidates_data.get("descending", [])

    accepted_ids = [x.strip() for x in args.accept.split(",")]
    accepted     = [c for c in all_candidates if c["channel_id"] in accepted_ids]

    if not accepted:
        print(f"ERROR: No candidates matched IDs: {accepted_ids}", file=sys.stderr)
        print(f"       Available IDs: {[c['channel_id'] for c in all_candidates]}", file=sys.stderr)
        sys.exit(1)

    # Check directions present
    directions_present = {c["direction"] for c in accepted}
    missing_direction  = None
    if len(directions_present) == 1:
        present = list(directions_present)[0]
        missing_direction = "descending" if present == "ascending" else "ascending"

    # Iterative pass if needed and requested
    iterative_candidates = []
    if missing_direction and args.iterative_pass and not args.single_channel:
        if not args.pivots:
            print("WARNING: --iterative-pass requires --pivots. Skipping.", file=sys.stderr)
        else:
            iterative_candidates = run_iterative_pass(
                missing_direction, args.pivots, args.ohlcv
            )
            if iterative_candidates:
                # Return iterative candidates for chart rendering — do not auto-select
                result = {
                    "mode":                  "iterative_pass",
                    "missing_direction":     missing_direction,
                    "iterative_candidates":  iterative_candidates,
                    "accepted_so_far":       accepted,
                    "instruction":           (
                        f"Iterative pass generated {len(iterative_candidates)} {missing_direction} candidates "
                        f"with relaxed parameters. Review the chart and re-run with your final selections."
                    ),
                }
                output = json.dumps(result, indent=2)
                out_path_full = out_path if out_path.is_absolute() else PROJECT_ROOT / out_path
                out_path_full.write_text(output, encoding="utf-8")
                print(f"Iterative candidates written to {out_path_full}")
                print(f"\nIterative pass — {missing_direction} candidates:")
                for i, c in enumerate(iterative_candidates):
                    print(f"  [{i+1}] {c['channel_id']}  score={c.get('score',0):.1f}"
                          f"  slope={c.get('slope_per_bar',0):+.4f}/bar"
                          f"  span={c.get('span_days',0)}d"
                          f"  anchor={c['compression_rail']['anchor1']['date']}")
                print("\nRe-run with all accepted IDs (original + iterative choice) to finalize.")
                return

    # Assign roles
    accepted = assign_roles(accepted)

    # Apex quick-check
    apex_check = None
    prevailing = next((c for c in accepted if c.get("role") == "prevailing"), None)
    opposing   = next((c for c in accepted if c.get("role") == "opposing"),   None)

    if prevailing and opposing:
        apex_check = quick_apex_check(prevailing, opposing, bars)
        if not apex_check["valid"]:
            print(f"WARNING: Apex check — {apex_check['reason']}", file=sys.stderr)
            print("         Pair accepted anyway. Verify with build_geometry.py.", file=sys.stderr)

    # Build output for build_geometry.py
    result = {
        "mode":           "single_channel" if args.single_channel or not opposing else "wedge",
        "accepted_count": len(accepted),
        "apex_check":     apex_check,
        "channels":       accepted,
    }

    output = json.dumps(result, indent=2)
    out_path_full = out_path if out_path.is_absolute() else PROJECT_ROOT / out_path
    out_path_full.write_text(output, encoding="utf-8")

    print(f"Accepted pair written to {out_path_full}")
    for c in accepted:
        a1 = c["compression_rail"]["anchor1"]
        a2 = c["compression_rail"].get("anchor2") or {}
        print(f"  {c['role'].upper()}: {c['direction']}  [{c['channel_id']}]"
              f"  anchor={a1['date']} ${a1['price']:.2f}"
              + (f"  VFD/VSR={a2.get('date','—')} ${a2.get('price',0):.2f}" if a2.get("date") else "")
              + f"  score={c.get('score',0):.1f}")
    if apex_check:
        status = "OK" if apex_check["valid"] else f"WARNING: {apex_check['reason']}"
        print(f"  Apex estimate: ~{apex_check.get('estimated_apex_days','?')}d forward  [{status}]")


if __name__ == "__main__":
    main()
