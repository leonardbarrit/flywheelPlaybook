"""
Recompute composite score from data/forces.json.

Pure function: reads forces.json, computes net_bullish, net_bearish,
applies F1 multiplier, writes data/composite.json, appends to
data/composite_history.json.

Called after every update_force_state.py run and by /status.

Usage:
    py composite.py
    py composite.py --nvda-close 131.25
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


def append_history(result: dict, history_path: Path, nvda_close: float | None) -> None:
    """Upsert a composite snapshot into composite_history.json (one entry per date)."""
    if history_path.exists():
        with open(history_path, encoding="utf-8-sig") as f:
            history = json.load(f)
    else:
        history = []

    today = result["date"]
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
        "nvda_close": nvda_close,
    }

    # Replace existing entry for today if present, otherwise append
    idx = next((i for i, e in enumerate(history) if e["date"] == today), None)
    if idx is not None:
        # Preserve nvda_close from existing entry if not supplied in this run
        if nvda_close is None and history[idx].get("nvda_close") is not None:
            entry["nvda_close"] = history[idx]["nvda_close"]
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
        append_history(result, history_path, args.nvda_close)

    print(json.dumps(output, indent=2))
