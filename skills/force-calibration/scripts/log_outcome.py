"""
log_outcome.py — Phase 3B

Resolve a channel drawing by updating its outcome block in data/channel_drawings.json.
Computes apex_prediction_error_days and the premature flag from the supplied breakout date.

channel_drawings.json is append-only for NEW entries but outcome blocks
are updated in-place when a drawing resolves.

Usage:
    # Resolve a drawing
    py log_outcome.py \\
        --drawing-id draw-2026-05-19-003 \\
        --breakout-date 2026-05-25 \\
        --breakout-direction ascending \\
        --breakout-price 240.00 \\
        [--preceding-events E001,E002] \\
        [--notes "free text"]

    # List all drawings (resolved + pending)
    py log_outcome.py --list

    # List only unresolved drawings
    py log_outcome.py --list --unresolved
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DEFAULT_DRAWINGS = PROJECT_ROOT / "data" / "channel_drawings.json"

VALID_DIRECTIONS = ("ascending", "descending")


def load_json(path: Path) -> list:
    if not path.exists():
        print(f"ERROR: {path} not found", file=sys.stderr)
        sys.exit(1)
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def write_json(path: Path, data) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def parse_date(s: str) -> date:
    try:
        return date.fromisoformat(s[:10])
    except (ValueError, TypeError) as e:
        print(f"ERROR: invalid date '{s}': {e}", file=sys.stderr)
        sys.exit(1)


def compute_apex_error(drawing: dict, breakout_date: date) -> int | None:
    """apex_prediction_error_days = breakout_date - apex_predicted_date (negative = premature)."""
    wedge = drawing.get("wedge") or {}
    apex_str = wedge.get("apex_predicted_date")
    if not apex_str:
        return None
    apex_date = date.fromisoformat(apex_str[:10])
    return (breakout_date - apex_date).days


def cmd_list(drawings: list, unresolved_only: bool) -> None:
    shown = 0
    header = f"{'Drawing ID':<28} {'Drawn':<12} {'Regime':<22} {'Apex Pred':<12} {'Resolved':<10} {'Direction':<12} {'Notes'}"
    print(header)
    print("-" * 110)
    for d in drawings:
        outcome = d.get("outcome") or {}
        resolved = outcome.get("resolved", False)
        if unresolved_only and resolved:
            continue
        apex = (d.get("wedge") or {}).get("apex_predicted_date") or "—"
        dirn = outcome.get("breakout_direction") or "—"
        res_str = "YES" if resolved else "NO"
        notes_preview = (d.get("notes") or "")[:50]
        print(f"{d['drawing_id']:<28} {d['drawn_date']:<12} {d.get('regime','—'):<22} {apex:<12} {res_str:<10} {dirn:<12} {notes_preview}")
        shown += 1
    print(f"\n{shown} drawing(s) shown.")


def cmd_resolve(drawings: list, args, drawings_path: Path) -> None:
    drawing_id = args.drawing_id
    target = next((d for d in drawings if d["drawing_id"] == drawing_id), None)

    if not target:
        print(f"ERROR: drawing '{drawing_id}' not found in {drawings_path}", file=sys.stderr)
        sys.exit(1)

    outcome = target.get("outcome") or {}
    if outcome.get("resolved"):
        print(f"ERROR: drawing '{drawing_id}' is already resolved on {outcome.get('breakout_date')}.", file=sys.stderr)
        print("To amend a resolved drawing, edit channel_drawings.json directly and note the amendment.", file=sys.stderr)
        sys.exit(1)

    # Parse inputs
    breakout_date = parse_date(args.breakout_date)
    direction = args.breakout_direction.lower()
    if direction not in VALID_DIRECTIONS:
        print(f"ERROR: --breakout-direction must be one of: {VALID_DIRECTIONS}", file=sys.stderr)
        sys.exit(1)

    try:
        breakout_price = float(args.breakout_price)
    except (ValueError, TypeError):
        print(f"ERROR: --breakout-price must be a number, got '{args.breakout_price}'", file=sys.stderr)
        sys.exit(1)

    preceding_events = []
    if args.preceding_events:
        preceding_events = [e.strip() for e in args.preceding_events.split(",") if e.strip()]

    # Compute derived fields
    apex_error = compute_apex_error(target, breakout_date)
    premature = (apex_error < 0) if apex_error is not None else None

    # Build updated outcome block
    new_outcome = {
        "resolved": True,
        "breakout_date": breakout_date.isoformat(),
        "breakout_direction": direction,
        "breakout_price": breakout_price,
        "apex_prediction_error_days": apex_error,
        "premature": premature,
        "preceding_force_event_ids": preceding_events,
        "notes": args.notes or None,
    }

    # Update in place
    target["outcome"] = new_outcome
    write_json(drawings_path, drawings)

    # Report
    print(f"Drawing resolved: {drawing_id}")
    print(f"  Breakout:   {breakout_date}  ${breakout_price:.2f}  ({direction})")
    if apex_error is not None:
        wedge = target.get("wedge") or {}
        apex_pred = wedge.get("apex_predicted_date")
        if premature:
            print(f"  Apex error: {apex_error:+d}d  (PREMATURE — breakout {abs(apex_error)}d before predicted apex {apex_pred})")
        else:
            print(f"  Apex error: {apex_error:+d}d  (on-time/late — predicted apex {apex_pred})")
    else:
        print(f"  Apex error: not computable (no apex_predicted_date in wedge block)")
    if preceding_events:
        print(f"  Preceding events: {', '.join(preceding_events)}")
    if args.notes:
        print(f"  Notes: {args.notes}")
    print(f"\nFile updated: {drawings_path}")
    print("\nNext steps:")
    print("  Run channel_correlation.py to refresh force frequency tables.")
    print("  Run recalibrate_weights.py to check Phase 3B calibration readiness.")


def main():
    parser = argparse.ArgumentParser(
        description="Resolve a channel drawing outcome in channel_drawings.json"
    )
    parser.add_argument("--drawings", default=None, help="Path to channel_drawings.json")

    sub = parser.add_subparsers(dest="cmd")

    # --list mode (positional flag)
    parser.add_argument("--list", action="store_true", help="List all drawings")
    parser.add_argument("--unresolved", action="store_true", help="Show only unresolved drawings (with --list)")

    # Resolve arguments
    parser.add_argument("--drawing-id", help="Drawing ID to resolve (e.g. draw-2026-05-19-003)")
    parser.add_argument("--breakout-date", help="YYYY-MM-DD breakout date")
    parser.add_argument("--breakout-direction", help="ascending or descending")
    parser.add_argument("--breakout-price", help="Price at breakout close")
    parser.add_argument("--preceding-events", help="Comma-separated event IDs from events.json")
    parser.add_argument("--notes", help="Free text notes")

    args = parser.parse_args()

    drawings_path = Path(args.drawings) if args.drawings else DEFAULT_DRAWINGS
    drawings = load_json(drawings_path)
    if not isinstance(drawings, list):
        print(f"ERROR: {drawings_path} must be a JSON array", file=sys.stderr)
        sys.exit(1)

    if args.list:
        cmd_list(drawings, args.unresolved)
        return

    # Resolve mode — require all resolve fields
    required = ["drawing_id", "breakout_date", "breakout_direction", "breakout_price"]
    missing = [f"--{r.replace('_', '-')}" for r in required if not getattr(args, r, None)]
    if missing:
        print(f"ERROR: missing required arguments for resolve: {', '.join(missing)}", file=sys.stderr)
        print("Use --list to see drawing IDs, or --help for usage.", file=sys.stderr)
        sys.exit(1)

    cmd_resolve(drawings, args, drawings_path)


if __name__ == "__main__":
    main()
