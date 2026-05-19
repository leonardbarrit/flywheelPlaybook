"""
Channel drawing correlation report — Phase 3B.

Reads data/channel_drawings.json and data/events.json.
For resolved drawings, identifies which macro force events
preceded the breakout within a lookback window, and whether
the breakout was premature (before predicted apex).

Outputs:
  - Per-drawing outcome summary
  - Force frequency table for premature breakouts
  - Force frequency table for on-time/late breakouts
  - Forces that most consistently appear before premature breakouts
    (candidate "breakout-forcing" forces for Phase 3B calibration)

Usage:
    py channel_correlation.py
    py channel_correlation.py --lookback 14
    py channel_correlation.py --drawings data/channel_drawings.json
    py channel_correlation.py --min-drawings 3
"""

import argparse
import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DEFAULT_DRAWINGS = PROJECT_ROOT / "data" / "channel_drawings.json"
DEFAULT_EVENTS   = PROJECT_ROOT / "data" / "events.json"

DEFAULT_LOOKBACK_DAYS = 14   # days before breakout to search for force events
MIN_DRAWINGS_FOR_STATS = 3   # minimum resolved drawings before frequency stats are meaningful


def load_json(path: Path):
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def parse_date(s) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def events_in_window(events: list[dict], end_date: date, lookback_days: int) -> list[dict]:
    """Return events with date in [end_date - lookback_days, end_date]."""
    start = end_date - timedelta(days=lookback_days)
    return [
        e for e in events
        if parse_date(e.get("date")) and start <= parse_date(e["date"]) <= end_date
    ]


def force_ids_from_event(event: dict) -> list[str]:
    attributions = event.get("force_attributions", [])
    return [a["force_id"] for a in attributions if "force_id" in a]


def render(drawings: list[dict], events: list[dict], lookback_days: int, min_drawings: int) -> str:
    resolved = [d for d in drawings if d.get("outcome", {}).get("resolved")]
    premature = [d for d in resolved if d["outcome"].get("premature") is True]
    on_time   = [d for d in resolved if d["outcome"].get("premature") is False]
    unresolved = [d for d in drawings if not d.get("outcome", {}).get("resolved")]

    lines = []
    lines.append("=== CHANNEL DRAWING CORRELATION REPORT -- Phase 3B ===")
    lines.append(f"Lookback window: {lookback_days} days before breakout")
    lines.append(f"Total drawings: {len(drawings)} | Resolved: {len(resolved)} | Unresolved: {len(unresolved)}")
    lines.append(f"  Premature breakouts: {len(premature)} | On-time/late: {len(on_time)}")
    lines.append("")

    # --- Per-drawing summary ---
    lines.append("--- Drawing Outcomes ---")
    if not resolved:
        lines.append("  No resolved drawings yet.")
    else:
        lines.append(f"  {'ID':<25} {'Drawn':<12} {'Apex Pred':<12} {'Breakout':<12} {'Error':>8} {'Premature':>10} {'Direction':<12} Forces Preceding")
        lines.append("  " + "-" * 110)
        for d in resolved:
            o = d["outcome"]
            apex = d.get("wedge", {}).get("apex_predicted_date") or "—"
            bd   = o.get("breakout_date") or "—"
            err  = o.get("apex_prediction_error_days")
            err_str = f"{err:+d}d" if err is not None else "—"
            pre  = "YES" if o.get("premature") else "NO"
            dirn = o.get("breakout_direction") or "—"
            fids = ", ".join(o.get("preceding_force_event_ids", [])) or "—"
            lines.append(f"  {d['drawing_id']:<25} {d['drawn_date']:<12} {apex:<12} {bd:<12} {err_str:>8} {pre:>10} {dirn:<12} {fids}")

    lines.append("")

    # --- Unresolved drawings ---
    if unresolved:
        lines.append("--- Pending Resolution ---")
        for d in unresolved:
            apex = d.get("wedge", {}).get("apex_predicted_date") or "not computable"
            days_fwd = d.get("wedge", {}).get("apex_days_forward_at_drawing")
            days_str = f"(T+{days_fwd} at drawing)" if days_fwd else ""
            lines.append(f"  {d['drawing_id']} | drawn {d['drawn_date']} | apex {apex} {days_str} | regime {d.get('regime','—')}")
        lines.append("")

    # --- Force frequency analysis ---
    if len(resolved) < min_drawings:
        lines.append(f"--- Force Frequency Analysis ---")
        lines.append(f"  Insufficient resolved drawings ({len(resolved)} < {min_drawings} minimum).")
        lines.append(f"  Accumulate more resolved drawings before frequency stats are meaningful.")
        return "\n".join(lines)

    # Build force frequency tables using events.json
    prem_force_counts = defaultdict(int)
    ontime_force_counts = defaultdict(int)

    for d in premature:
        bd = parse_date(d["outcome"].get("breakout_date"))
        if not bd:
            continue
        window_events = events_in_window(events, bd, lookback_days)
        for e in window_events:
            for fid in force_ids_from_event(e):
                prem_force_counts[fid] += 1

    for d in on_time:
        bd = parse_date(d["outcome"].get("breakout_date"))
        if not bd:
            continue
        window_events = events_in_window(events, bd, lookback_days)
        for e in window_events:
            for fid in force_ids_from_event(e):
                ontime_force_counts[fid] += 1

    all_forces = sorted(set(list(prem_force_counts.keys()) + list(ontime_force_counts.keys())))

    lines.append("--- Force Frequency Before Breakout ---")
    lines.append(f"  (Events within {lookback_days} days before breakout date)")
    lines.append("")
    lines.append(f"  {'Force':<8} {'Premature':>10} {'On-time/Late':>13} {'Premature%':>12} {'Signal':>8}")
    lines.append("  " + "-" * 58)

    candidates = []
    for fid in all_forces:
        pc = prem_force_counts[fid]
        oc = ontime_force_counts[fid]
        total = pc + oc
        pct = pc / total * 100 if total > 0 else 0.0
        # Signal: force appears in premature window significantly more than on-time
        signal = "CANDIDATE" if pct >= 66 and pc >= 2 else ""
        if signal:
            candidates.append(fid)
        lines.append(f"  {fid:<8} {pc:>10} {oc:>13} {pct:>11.0f}% {signal:>8}")

    lines.append("")
    if candidates:
        lines.append("--- Breakout-Forcing Force Candidates ---")
        lines.append(f"  Forces appearing in >=66% of premature breakout windows with >=2 occurrences:")
        for fid in candidates:
            lines.append(f"    {fid}: {prem_force_counts[fid]} premature / {prem_force_counts[fid] + ontime_force_counts[fid]} total")
        lines.append("")
        lines.append("  Interpretation: these forces, when active in the {lookback_days}-day window")
        lines.append("  before a compression wedge resolution, are associated with premature breakouts.")
        lines.append("  Candidates for elevated weight in Phase 3B composite score calibration.")
    else:
        lines.append("--- Breakout-Forcing Force Candidates ---")
        lines.append("  No candidates meet threshold (>=66% premature association, >=2 occurrences).")
        lines.append("  More resolved drawings needed, or lookback window may need adjustment.")

    lines.append("")
    lines.append("--- Phase 3B Readiness ---")
    lines.append(f"  Resolved drawings:  {len(resolved)}")
    lines.append(f"  Premature:          {len(premature)}")
    lines.append(f"  On-time/late:       {len(on_time)}")
    lines.append(f"  Force candidates:   {len(candidates)}")
    lines.append(f"  Minimum for stats:  {min_drawings}")
    if len(resolved) >= min_drawings and len(premature) >= 2 and candidates:
        lines.append("  STATUS: Sufficient data for preliminary calibration pass.")
        lines.append("  Run recalibrate_weights.py when Phase 4 channel observations are available.")
    else:
        lines.append("  STATUS: Data collection phase. Continue logging channel drawings and resolving outcomes.")

    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--drawings", default=None)
    parser.add_argument("--events", default=None)
    parser.add_argument("--lookback", type=int, default=DEFAULT_LOOKBACK_DAYS,
                        help="Days before breakout to search for force events")
    parser.add_argument("--min-drawings", type=int, default=MIN_DRAWINGS_FOR_STATS,
                        help="Minimum resolved drawings before frequency stats are shown")
    args = parser.parse_args()

    drawings_path = Path(args.drawings) if args.drawings else DEFAULT_DRAWINGS
    events_path   = Path(args.events)   if args.events   else DEFAULT_EVENTS

    drawings = load_json(drawings_path)
    if isinstance(drawings, dict):
        drawings = [drawings]

    events = load_json(events_path)
    if not isinstance(events, list):
        events = []

    print(render(drawings, events, args.lookback, args.min_drawings))
