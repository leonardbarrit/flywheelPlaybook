"""
Recompute composite score from data/forces.json.

Pure function: reads forces.json, computes net_bullish, net_bearish,
applies F1 multiplier, writes data/composite.json.

Called after every update_force_state.py run.

Usage:
    py composite.py
    py composite.py --forces data/forces.json --out data/composite.json
"""

import argparse
import json
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DEFAULT_FORCES = PROJECT_ROOT / "data" / "forces.json"
DEFAULT_OUT = PROJECT_ROOT / "data" / "composite.json"


def compute(forces_data: dict) -> dict:
    forces = forces_data["forces"]
    active_states = {"ACTIVE", "REACTIVATED"}

    net_bullish = 0.0
    net_bearish = 0.0
    f1_multiplier = 1.0

    active_count = 0
    attenuating_count = 0
    dormant_count = 0

    for force in forces:
        state = force.get("state", "DORMANT")
        if state == "DORMANT":
            dormant_count += 1
            continue
        if state == "ATTENUATING":
            attenuating_count += 1
        elif state in active_states:
            active_count += 1

        weight = force.get("weight", 0.0)
        bias = force.get("direction_bias", "neutral")
        ftype = force.get("type", "additive")

        if ftype == "multiplier":
            # F1 — captures as a multiplier on net_bullish
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
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--forces", default=None)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    forces_path = Path(args.forces) if args.forces else DEFAULT_FORCES
    out_path = Path(args.out) if args.out else DEFAULT_OUT

    with open(forces_path, encoding="utf-8-sig") as f:
        forces_data = json.load(f)

    result = compute(forces_data)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(json.dumps(result, indent=2))
