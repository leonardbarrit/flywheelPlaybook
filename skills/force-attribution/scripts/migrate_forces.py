"""
One-time migration: data/macro-forces/forces.json → data/forces.json

Adds two new fields per force required by Phase 2 state machine:
  - consecutive_weak_reactions: int  (counter for ACTIVE→ATTENUATING transition)
  - days_since_last_significant: int | null  (for ATTENUATING→DORMANT transition)

Also adds root-level metadata fields.
Run from project root:
    py skills/force-attribution/scripts/migrate_forces.py
"""

import json
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
SRC = PROJECT_ROOT / "data" / "macro-forces" / "forces.json"
DST = PROJECT_ROOT / "data" / "forces.json"
COMPOSITE_SRC = PROJECT_ROOT / "data" / "macro-forces" / "composite.json"
COMPOSITE_DST = PROJECT_ROOT / "data" / "composite.json"

TODAY = date.today().isoformat()


def days_since(date_str: str | None) -> int | None:
    if not date_str:
        return None
    last = date.fromisoformat(date_str)
    return (date.today() - last).days


def migrate():
    with open(SRC, encoding="utf-8-sig") as f:
        src = json.load(f)

    forces = src["forces"]
    migrated_forces = []
    for force in forces:
        last_event = force.get("last_event_date")
        d_since = days_since(last_event)

        # consecutive_weak_reactions: only meaningful for ACTIVE/ATTENUATING.
        # Set to 0 for ACTIVE (we don't have per-event reaction history to compute
        # this retroactively; it resets on the next update pass).
        # ATTENUATING forces get 3 (they hit the threshold to enter that state).
        state = force.get("state", "ACTIVE")
        if state == "ATTENUATING":
            consec_weak = 3
        else:
            consec_weak = 0

        migrated_forces.append({
            **force,
            "consecutive_weak_reactions": consec_weak,
            "days_since_last_significant": d_since,
        })

    out = {
        "schema_version": "2",
        "updated": src.get("updated"),
        "migrated": TODAY,
        "source": "migrated from data/macro-forces/forces.json (Phase 2)",
        "forces": migrated_forces,
    }

    with open(DST, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"Migrated {len(migrated_forces)} forces -> {DST}")

    # Migrate composite.json to data/ root
    with open(COMPOSITE_SRC, encoding="utf-8-sig") as f:
        composite = json.load(f)
    composite["source"] = "migrated from data/macro-forces/composite.json (Phase 2)"
    with open(COMPOSITE_DST, "w", encoding="utf-8") as f:
        json.dump(composite, f, indent=2, ensure_ascii=False)
    print(f"Migrated composite -> {COMPOSITE_DST}")


if __name__ == "__main__":
    migrate()
