"""
Recompute composite score from data/forces.json.

Pure function: reads forces.json, computes net_bullish, net_bearish,
applies F1 multiplier, writes data/composite.json, upserts today's
entry into data/composite_history.json.

Called after every update_force_state.py run and by /status.

Usage:
    py composite.py
    py composite.py --nvda-open 131.50
    py composite.py --nvda-close 129.80
    py composite.py --nvda-open 131.50 --nvda-close 129.80
    py composite.py --forces data/forces.json --out data/composite.json
    py composite.py --no-history
"""

import argparse
import json
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DEFAULT_FORCES = PROJECT_ROOT / "data" / "forces.json"
DEFAULT_OUT = PROJECT_ROOT / "data" / "composite.json"
DEFAULT_HISTORY = PROJECT_ROOT / "data" / "composite_history.json"


def compute(forces_data: dict) -> dict:
    forces = forces_data["forces"]
    active_states = {"ACTIVE", "REACTIVATED"}

    net_bullish = 0.0
    net_bearish = 0.0
    f1_multiplier = 1.0

    active_count = 0
    attenuating_count = 0
    dormant_count = 0

    active_ids = []
    attenuating_ids = []
    dormant_ids = []

    for force in forces:
        state = force.get("state", "DORMANT")
        if state == "DORMANT":
            dormant_count += 1
            dormant_ids.append(force["id"])
            continue
        if state == "ATTENUATING":
            attenuating_count += 1
            attenuating_ids.append(force["id"])
        elif state in active_states:
            active_count += 1
            active_ids.append(force["id"])

        weight = force.get("weight", 0.0)
        bias = force.get("direction_bias", "neutral")
        ftype = force.get("type", "additive")

        if ftype == "multiplier":
            f1_multiplier = max(f1_multiplier, weight)
            continue

        net_ytd = force.get("net_ytd_reaction", 0.0)
        if bias == "bullish" and net_ytd > 0:
            net_bullish += net_ytd * weight
        elif bias == "bearish" and net_ytd < 0:
            net_bearish += net_ytd * weight

    composite_score = round((net_bullish + net_bearish) * f1_multiplier, 3)

    if composite_score > 2.0:
        interpretation = "bullish_dominant"
    elif composite_score > 0.5:
        interpretation = "bullish_lean"
    elif composite_score < -2.0:
        interpretation = "bearish_dominant"
    elif composite_score < -0.5:
        interpretation = "bearish_lean"
    else:
        interpretation = "balanced"

    return {
        "date": date.today().isoformat(),
        "net_bullish": round(net_bullish, 3),
        "net_bearish": round(net_bearish, 3),
        "net_directional": round(net_bullish + net_bearish, 3),
        "f1_multiplier": round(f1_multiplier, 3),
        "composite_score": composite_score,
        "active_force_count": active_count,
        "attenuating_force_count": attenuating_count,
        "dormant_force_count": dormant_count,
        "interpretation": interpretation,
        "source": "data/forces.json",
        "_active_forces": active_ids,
        "_attenuating_forces": attenuating_ids,
        "_dormant_forces": dormant_ids,
    }


def _intraday_reversal(nvda_open: float | None, nvda_close: float | None,
                        prior_close: float | None) -> bool | None:
    """
    True when the open gap direction and the close direction diverge.
    Gap direction = sign(open - prior_close). Close direction = sign(close - prior_close).
    Returns None if either price is missing.
    """
    if nvda_open is None or nvda_close is None or prior_close is None:
        return None
    gap_dir = nvda_open - prior_close
    close_dir = nvda_close - prior_close
    if gap_dir == 0 or close_dir == 0:
        return None
    return (gap_dir > 0) != (close_dir > 0)


def append_history(result: dict, history_path: Path,
                   nvda_open: float | None, nvda_close: float | None) -> None:
    """Upsert a composite snapshot into composite_history.json (one entry per date)."""
    if history_path.exists():
        with open(history_path, encoding="utf-8-sig") as f:
            history = json.load(f)
    else:
        history = []

    today = result["date"]

    # Prior close for gap calculation — last entry with a recorded close
    prior_close = next(
        (e["nvda_close"] for e in reversed(history)
         if e.get("nvda_close") is not None and e["date"] != today),
        None
    )
    gap_pct = None
    if nvda_open is not None and prior_close is not None:
        gap_pct = round((nvda_open - prior_close) / prior_close * 100, 3)

    reversal = _intraday_reversal(nvda_open, nvda_close, prior_close)

    entry = {
        "date": today,
        "composite_score": result["composite_score"],
        "net_bullish": result["net_bullish"],
        "net_bearish": result["net_bearish"],
        "net_directional": result["net_directional"],
        "f1_multiplier": result["f1_multiplier"],
        "active_forces": result["_active_forces"],
        "attenuating_forces": result["_attenuating_forces"],
        "dormant_forces": result["_dormant_forces"],
        "nvda_open": nvda_open,
        "nvda_close": nvda_close,
        "gap_pct": gap_pct,
        "intraday_reversal": reversal,
    }

    # Upsert: replace today's entry if present, preserving any prices not re-supplied
    idx = next((i for i, e in enumerate(history) if e["date"] == today), None)
    if idx is not None:
        existing = history[idx]
        if nvda_open is None and existing.get("nvda_open") is not None:
            entry["nvda_open"] = existing["nvda_open"]
        if nvda_close is None and existing.get("nvda_close") is not None:
            entry["nvda_close"] = existing["nvda_close"]
        # Recompute derived fields with any preserved prices
        if entry["nvda_open"] is not None and prior_close is not None:
            entry["gap_pct"] = round((entry["nvda_open"] - prior_close) / prior_close * 100, 3)
        entry["intraday_reversal"] = _intraday_reversal(
            entry["nvda_open"], entry["nvda_close"], prior_close
        )
        history[idx] = entry
    else:
        history.append(entry)

    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)


def clean_output(result: dict) -> dict:
    """Remove internal fields before writing composite.json or printing."""
    return {k: v for k, v in result.items() if not k.startswith("_")}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--forces", default=None)
    parser.add_argument("--out", default=None)
    parser.add_argument("--history", default=None)
    parser.add_argument("--nvda-open", type=float, default=None, dest="nvda_open")
    parser.add_argument("--nvda-close", type=float, default=None, dest="nvda_close")
    parser.add_argument("--no-history", action="store_true", dest="no_history")
    args = parser.parse_args()

    forces_path = Path(args.forces) if args.forces else DEFAULT_FORCES
    out_path = Path(args.out) if args.out else DEFAULT_OUT
    history_path = Path(args.history) if args.history else DEFAULT_HISTORY

    with open(forces_path, encoding="utf-8-sig") as f:
        forces_data = json.load(f)

    result = compute(forces_data)
    output = clean_output(result)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    if not args.no_history:
        append_history(result, history_path, args.nvda_open, args.nvda_close)

    print(json.dumps(output, indent=2))
