"""
Phase 3A calibration report — composite score trend viewer.

Reads data/composite_history.json and reports:
  - Score trajectory with force state snapshots
  - Score statistics (mean, std, min, max)
  - Force state transitions (when forces changed state)
  - NVDA close prices where recorded
  - Score range context for eventual threshold discovery

Does NOT modify any data files. Read-only.

Phase 3B (weight calibration) is deferred until Phase 4 channel drawings
provide realized channel dominance observations to calibrate against.

Usage:
    py calibration_report.py
    py calibration_report.py --history data/composite_history.json
    py calibration_report.py --last 30
"""

import argparse
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DEFAULT_HISTORY = PROJECT_ROOT / "data" / "composite_history.json"


def load_history(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def score_stats(entries: list[dict]) -> dict:
    scores = [e["composite_score"] for e in entries]
    if not scores:
        return {}
    mean = sum(scores) / len(scores)
    variance = sum((s - mean) ** 2 for s in scores) / len(scores)
    std = variance ** 0.5
    return {
        "count": len(scores),
        "mean": round(mean, 3),
        "std": round(std, 3),
        "min": round(min(scores), 3),
        "max": round(max(scores), 3),
        "range": round(max(scores) - min(scores), 3),
        "current": round(scores[-1], 3),
    }


def detect_transitions(entries: list[dict]) -> list[dict]:
    """Identify dates when a force moved between active/attenuating/dormant buckets."""
    transitions = []
    for i in range(1, len(entries)):
        prev = entries[i - 1]
        curr = entries[i]

        prev_active = set(prev.get("active_forces", []))
        curr_active = set(curr.get("active_forces", []))
        prev_atten = set(prev.get("attenuating_forces", []))
        curr_atten = set(curr.get("attenuating_forces", []))
        prev_dorm = set(prev.get("dormant_forces", []))
        curr_dorm = set(curr.get("dormant_forces", []))

        moved = []
        for fid in curr_active - prev_active:
            from_state = "ATTENUATING" if fid in prev_atten else "DORMANT"
            moved.append(f"{fid}: {from_state} -> ACTIVE")
        for fid in curr_atten - prev_atten:
            from_state = "ACTIVE" if fid in prev_active else "DORMANT"
            moved.append(f"{fid}: {from_state} -> ATTENUATING")
        for fid in curr_dorm - prev_dorm:
            from_state = "ACTIVE" if fid in prev_active else "ATTENUATING"
            moved.append(f"{fid}: {from_state} -> DORMANT")

        if moved:
            transitions.append({"date": curr["date"], "changes": moved})

    return transitions


def render(entries: list[dict], stats: dict, transitions: list[dict]) -> str:
    lines = []
    lines.append("=== FORCE CALIBRATION REPORT -- Phase 3A ===")
    lines.append(f"Status: Data collection. Weight calibration deferred to Phase 3B (gates on Phase 4 channel drawings).")
    lines.append("")

    if not entries:
        lines.append("No history entries found. Run /status to begin accumulating data.")
        return "\n".join(lines)

    lines.append(f"--- Score History ({stats['count']} entries) ---")
    lines.append(f"{'Date':<12} {'Score':>8} {'Net Bull':>10} {'Net Bear':>10} {'F1':>5} {'Active':>7} {'NVDA':>8}  Forces Active")
    lines.append("-" * 90)
    for e in entries:
        nvda = f"  {e['nvda_close']:.2f}" if e.get("nvda_close") else "     -"
        active_str = ", ".join(e.get("active_forces", []))
        lines.append(
            f"{e['date']:<12} {e['composite_score']:>8.3f} {e['net_bullish']:>10.3f} "
            f"{e['net_bearish']:>10.3f} {e['f1_multiplier']:>5.2f} "
            f"{len(e.get('active_forces', [])):>7}  {nvda}  {active_str}"
        )

    lines.append("")
    lines.append("--- Score Statistics ---")
    lines.append(f"  Mean:    {stats['mean']:>8.3f}")
    lines.append(f"  Std dev: {stats['std']:>8.3f}")
    lines.append(f"  Min:     {stats['min']:>8.3f}")
    lines.append(f"  Max:     {stats['max']:>8.3f}")
    lines.append(f"  Range:   {stats['range']:>8.3f}")
    lines.append(f"  Current: {stats['current']:>8.3f}")
    lines.append("")
    lines.append("  Note: Current interpretation thresholds (>2.0 bullish_dominant etc.) are")
    lines.append("  arbitrary placeholders. Threshold discovery requires Phase 4 channel data.")

    if transitions:
        lines.append("")
        lines.append("--- Force State Transitions ---")
        for t in transitions:
            lines.append(f"  {t['date']}:")
            for c in t["changes"]:
                lines.append(f"    {c}")

    lines.append("")
    lines.append("--- Phase 3B Readiness ---")
    lines.append(f"  History entries: {stats['count']}")
    lines.append(f"  NVDA close recorded: {sum(1 for e in entries if e.get('nvda_close'))}")
    lines.append(f"  Waiting on: Phase 4 channel drawings with dated dominance periods")
    lines.append(f"  Calibration will match composite score history against realized channel observations.")

    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", default=None)
    parser.add_argument("--last", type=int, default=None,
                        help="Show only the last N entries")
    args = parser.parse_args()

    history_path = Path(args.history) if args.history else DEFAULT_HISTORY
    history = load_history(history_path)

    if args.last and len(history) > args.last:
        history = history[-args.last:]

    stats = score_stats(history)
    transitions = detect_transitions(history)
    print(render(history, stats, transitions))
