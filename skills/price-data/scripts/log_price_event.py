"""
log_price_event.py — price-data pipeline write step

Appends one force-attributed price event to data/events.json and data/outcomes.json.
Called from /status Step 4 for each research finding on an unattributed significant day.

This is the downstream write that was previously suppressed ("Do NOT write to events.json").
Running it during /status closes the loop: price action → research → ledger → calibration.

Usage:
    py log_price_event.py \\
        --date 2026-05-20 \\
        --force-id A1 \\
        --direction bullish \\
        --confidence HIGH \\
        --catalyst "NVDA Q1 FY27 beat; revenue guidance raised 15 pct" \\
        --confounded false \\
        --close-pct 8.5 \\
        --gap-pct 7.2

    # Preview without writing
    py log_price_event.py ... --dry-run

Outputs: prints summary of entries written (or would write in dry-run mode).
"""

import argparse
import json
import re
import sys
from datetime import date as _date
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DEFAULT_EVENTS   = PROJECT_ROOT / "data" / "events.json"
DEFAULT_OUTCOMES = PROJECT_ROOT / "data" / "outcomes.json"

MAJOR_CLOSE_THRESHOLD = 3.0   # |close_pct| >= this -> reaction_class "major"


def load_json(path: Path) -> list:
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def save_json(path: Path, data: list) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def slugify(text: str, max_len: int = 40) -> str:
    """Convert catalyst summary to a short slug for use in the event ID."""
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:max_len]


def next_outcome_id(outcomes: list) -> str:
    """Generate the next sequential outcome ID: oNNNN."""
    ids = [e.get("outcome_id", "") for e in outcomes if e.get("outcome_id", "").startswith("o")]
    nums = []
    for oid in ids:
        try:
            nums.append(int(oid[1:]))
        except ValueError:
            pass
    next_num = (max(nums) + 1) if nums else 1
    return f"o{next_num:04d}"


def event_exists(events: list, date_str: str) -> bool:
    """Return True if events.json already has an entry for this date."""
    return any(e.get("date") == date_str for e in events)


def build_event(
    date_str: str,
    force_id: str,
    direction: str,
    confidence: str,
    catalyst: str,
    confounded: bool,
    close_pct: float | None,
    gap_pct: float | None,
) -> dict:
    event_id = f"{date_str}-{slugify(catalyst)}"

    close_abs = abs(close_pct) if close_pct is not None else 0
    reaction_class = "major" if close_abs >= MAJOR_CLOSE_THRESHOLD else "minor"

    return {
        "id": event_id,
        "date": date_str,
        "catalyst_summary": catalyst,
        "source_url": None,
        "force_attributions": [
            {
                "force_id": force_id,
                "direction": direction,
                "weight_share": 1.0,
                "f1_tier": None,
                "rationale": catalyst,
            }
        ],
        "f1_attribution": None,
        "z_score_close": None,
        "z_score_volume": None,
        "reaction_class": reaction_class,
        "gap_priority": "auto",
        "confounded": confounded,
        "confidence": confidence.upper(),
        "close_pct_api": close_pct,
        "predicted_direction": direction,
        "realized_direction": direction,
        "resolved": True,
        "realized_date": date_str,
        "prediction_type": "retrospective",
        "accuracy": None,
        "source": "status_pipeline",
    }


def build_outcome(event_id: str, outcome_id: str, date_str: str, force_id: str, direction: str) -> dict:
    return {
        "outcome_id": outcome_id,
        "event_id": event_id,
        "date_logged": _date.today().isoformat(),
        "force_id": force_id,
        "predicted_direction": direction,
        "prediction_type": "retrospective",
        "resolved": True,
        "realized_direction": direction,
        "realized_date": date_str,
        "accuracy": None,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Append one attributed price event to events.json and outcomes.json"
    )
    parser.add_argument("--date",       required=True, help="YYYY-MM-DD event date")
    parser.add_argument("--force-id",   required=True, help="Force ID (e.g. A1, C1)")
    parser.add_argument("--direction",  required=True, help="bullish | bearish | unknown")
    parser.add_argument("--confidence", required=True, help="HIGH | MEDIUM | LOW")
    parser.add_argument("--catalyst",   required=True, help="1-sentence catalyst summary")
    parser.add_argument("--confounded", required=True, help="true | false")
    parser.add_argument("--close-pct",  type=float, default=None, dest="close_pct",
                        help="Close-to-close pct change (e.g. 8.5 for +8.5%%)")
    parser.add_argument("--gap-pct",    type=float, default=None, dest="gap_pct",
                        help="Overnight gap pct (e.g. 7.2 for +7.2%%)")
    parser.add_argument("--events",     default=None, help="Override events.json path")
    parser.add_argument("--outcomes",   default=None, help="Override outcomes.json path")
    parser.add_argument("--dry-run",    action="store_true", dest="dry_run",
                        help="Print what would be written; do not modify files")
    args = parser.parse_args()

    # Parse confounded
    confounded_str = args.confounded.strip().lower()
    if confounded_str in ("true", "1", "yes"):
        confounded = True
    elif confounded_str in ("false", "0", "no"):
        confounded = False
    else:
        print(f"ERROR: --confounded must be true or false, got '{args.confounded}'", file=sys.stderr)
        sys.exit(1)

    events_path   = Path(args.events)   if args.events   else DEFAULT_EVENTS
    outcomes_path = Path(args.outcomes) if args.outcomes else DEFAULT_OUTCOMES

    events   = load_json(events_path)
    outcomes = load_json(outcomes_path)

    # Skip if already attributed
    if event_exists(events, args.date):
        print(f"SKIP: events.json already has an entry for {args.date}. No changes written.")
        sys.exit(0)

    event = build_event(
        date_str   = args.date,
        force_id   = args.force_id,
        direction  = args.direction,
        confidence = args.confidence,
        catalyst   = args.catalyst,
        confounded = confounded,
        close_pct  = args.close_pct,
        gap_pct    = args.gap_pct,
    )

    outcome_id = next_outcome_id(outcomes)
    outcome = build_outcome(
        event_id   = event["id"],
        outcome_id = outcome_id,
        date_str   = args.date,
        force_id   = args.force_id,
        direction  = args.direction,
    )

    if args.dry_run:
        print("DRY RUN — no files modified")
        print(f"\nevents.json would append:")
        print(json.dumps(event, indent=2))
        print(f"\noutcomes.json would append:")
        print(json.dumps(outcome, indent=2))
        return

    events.append(event)
    outcomes.append(outcome)

    save_json(events_path, events)
    save_json(outcomes_path, outcomes)

    direction_tag = args.direction.upper()
    conf_tag = args.confidence.upper()
    print(f"Logged: {args.date} | {args.force_id} | {direction_tag} | {conf_tag} | {args.catalyst[:60]}")
    print(f"  event_id:   {event['id']}")
    print(f"  outcome_id: {outcome_id}")
    print(f"  events.json  -> {events_path} ({len(events)} total entries)")
    print(f"  outcomes.json -> {outcomes_path} ({len(outcomes)} total entries)")


if __name__ == "__main__":
    main()
