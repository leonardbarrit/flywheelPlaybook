"""
Apply a new event attribution to data/forces.json in place.

State machine transitions:
  ACTIVE      -> ATTENUATING:  3 consecutive events with |z| < 0.5
  ATTENUATING -> DORMANT:      weight < 0.15 AND days_since_last_significant >= 30
  DORMANT     -> ACTIVE:       research attributes a significant event (confidence HIGH/MEDIUM)
  DORMANT     -> REACTIVATED:  research attributes an event with LOW confidence — watch for corroboration
  REACTIVATED -> ACTIVE:       next attributed event for this force, regardless of magnitude
  REACTIVATED -> DORMANT:      no follow-through attribution in 14 days

Reactivation is analysis-driven, not price-signal-driven.
match_keywords.py flags dormant forces showing keyword activity in news —
that surfaces them for researcher attention. The attribution itself (via
log_price_event.py → update_force_state.py) is what drives the state change.

--confirm-active is RETIRED. Reactivation confirmation happens through a
second research attribution, not a manual flag.

Usage:
    py update_force_state.py \\
        --force C1 \\
        --direction bearish \\
        --z-score -1.8 \\
        --close-pct -2.8 \\
        --confidence HIGH \\
        --date 2026-05-20 \\
        --event-id "2026-05-20-bis-new-restrictions"
"""

import argparse
import json
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
FORCES_FILE = PROJECT_ROOT / "data" / "forces.json"

WEAK_Z_THRESHOLD = 0.5      # |z| below this = weak reaction
SIGNIFICANT_Z = 1.5         # |z| at or above = significant (reactivation trigger)
SIGNIFICANT_PCT = 2.0       # |close_pct| at or above = significant
DORMANT_WEIGHT = 0.15       # weight below this → eligible for DORMANT
DORMANT_DAYS = 30           # days without significant event → DORMANT
REACTIVATED_DAYS = 14       # days without follow-through → back to DORMANT


def load_forces() -> dict:
    with open(FORCES_FILE, encoding="utf-8-sig") as f:
        return json.load(f)


def save_forces(data: dict) -> None:
    data["updated"] = date.today().isoformat()
    with open(FORCES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def days_since(date_str: str | None) -> int:
    if not date_str:
        return 9999
    return (date.today() - date.fromisoformat(date_str)).days


def apply_event(forces_data: dict, force_id: str, direction: str,
                z_score: float, close_pct: float, event_date: str,
                event_id: str | None, confidence: str = "MEDIUM") -> tuple[dict, list[str]]:
    """
    Update the force entry and run state machine. Returns (updated data, log lines).
    """
    log = []
    forces = forces_data["forces"]
    force = next((f for f in forces if f["id"] == force_id), None)
    if force is None:
        raise ValueError(f"Force ID {force_id!r} not found in forces.json")

    old_state = force["state"]

    # Update event counts
    direction_key = direction if direction in ("bullish", "bearish", "neutral") else "neutral"
    force["event_counts"]["total"] += 1
    force["event_counts"][direction_key] += 1
    force["last_event_date"] = event_date

    is_significant = abs(z_score) >= SIGNIFICANT_Z or abs(close_pct) >= SIGNIFICANT_PCT
    is_weak = abs(z_score) < WEAK_Z_THRESHOLD

    # Track consecutive weak reactions
    if is_weak:
        force["consecutive_weak_reactions"] = force.get("consecutive_weak_reactions", 0) + 1
    else:
        force["consecutive_weak_reactions"] = 0

    if is_significant:
        force["days_since_last_significant"] = 0
    else:
        # Recompute from date
        force["days_since_last_significant"] = days_since(event_date)

    # State machine transitions
    new_state = old_state

    if old_state == "ACTIVE":
        if force["consecutive_weak_reactions"] >= 3:
            new_state = "ATTENUATING"
            force["attenuation_trend"] = "building"
            log.append(f"TRANSITION: {force_id} ACTIVE -> ATTENUATING (3 consecutive weak reactions)")

    elif old_state == "ATTENUATING":
        if force.get("weight", 1.0) < DORMANT_WEIGHT and force.get("days_since_last_significant", 0) >= DORMANT_DAYS:
            new_state = "DORMANT"
            log.append(f"TRANSITION: {force_id} ATTENUATING -> DORMANT (weight={force['weight']:.3f}, days_since={force.get('days_since_last_significant')})")
        elif is_significant:
            # Significant event while attenuating — don't promote yet, just reset weak counter
            force["consecutive_weak_reactions"] = 0
            log.append(f"NOTE: {force_id} significant event while ATTENUATING — consecutive_weak_reactions reset")

    elif old_state == "DORMANT":
        # Reactivation is analysis-driven: the research attribution IS the signal.
        # HIGH/MEDIUM confidence → go directly to ACTIVE (analyst confirmed relevancy)
        # LOW confidence → REACTIVATED (watch for corroborating attribution)
        conf_upper = confidence.upper()
        if conf_upper in ("HIGH", "MEDIUM"):
            new_state = "ACTIVE"
            log.append(f"TRANSITION: {force_id} DORMANT -> ACTIVE (research attribution, confidence={conf_upper})")
        else:
            new_state = "REACTIVATED"
            log.append(f"TRANSITION: {force_id} DORMANT -> REACTIVATED (LOW confidence attribution — awaiting corroboration)")

    elif old_state == "REACTIVATED":
        if force.get("days_since_last_significant", 0) >= REACTIVATED_DAYS:
            new_state = "DORMANT"
            log.append(f"TRANSITION: {force_id} REACTIVATED -> DORMANT (no follow-through in {REACTIVATED_DAYS}d)")
        else:
            # Any new attribution while REACTIVATED confirms — promote to ACTIVE
            new_state = "ACTIVE"
            log.append(f"TRANSITION: {force_id} REACTIVATED -> ACTIVE (corroborating attribution received)")

    force["state"] = new_state
    if new_state != old_state:
        log.append(f"  State: {old_state} -> {new_state}")

    return forces_data, log


def confirm_active(forces_data: dict, force_id: str) -> tuple[dict, list[str]]:
    """Promote REACTIVATED -> ACTIVE after 2 confirmed passes."""
    force = next((f for f in forces_data["forces"] if f["id"] == force_id), None)
    if force is None:
        raise ValueError(f"Force ID {force_id!r} not found")
    log = []
    if force["state"] == "REACTIVATED":
        force["state"] = "ACTIVE"
        force["attenuation_trend"] = "stable"
        log.append(f"TRANSITION: {force_id} REACTIVATED -> ACTIVE (confirmed)")
    else:
        log.append(f"NOTE: {force_id} is {force['state']}, not REACTIVATED — no change")
    return forces_data, log


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force",      required=True)
    parser.add_argument("--direction",  default="neutral")
    parser.add_argument("--z-score",    type=float, default=0.0, dest="z_score")
    parser.add_argument("--close-pct",  type=float, default=0.0, dest="close_pct")
    parser.add_argument("--confidence", default="MEDIUM",
                        help="Research confidence: HIGH | MEDIUM | LOW (drives DORMANT reactivation path)")
    parser.add_argument("--date",       default=date.today().isoformat())
    parser.add_argument("--event-id",   default=None, dest="event_id")
    args = parser.parse_args()

    data = load_forces()
    data, log = apply_event(data, args.force, args.direction,
                            args.z_score, args.close_pct,
                            args.date, args.event_id, args.confidence)

    save_forces(data)
    for line in log:
        print(line)
    if not log:
        print(f"Updated {args.force}: no state transition")
