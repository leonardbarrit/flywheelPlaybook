"""
One-time reconstruction script: build data/events.json and data/outcomes.json
from the 35 per-file event records in data/macro-forces/events/.

API-verified close_pct values (Massive.com, pulled 2026-05-18) are embedded
as a lookup so realized_direction is ground-truth, not copied from the per-file
records (which were hand-entered).

predicted_direction is derived from the dominant force attribution by weight_share.
For retrospective events, accuracy is computable immediately.

Run from project root:
    py skills/force-attribution/scripts/reconstruct_events.py
"""

import json
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent

# ---------------------------------------------------------------------------
# API-verified close_pct for every event date (Massive.com, 2026-01-02 range pull)
# Positive = bullish realized, Negative = bearish realized, ~0 = neutral
# ---------------------------------------------------------------------------
API_CLOSE_PCT: dict[str, float] = {
    "2026-01-08": -2.1522,
    "2026-01-09": -0.0973,
    "2026-01-14": -1.4370,
    "2026-01-15":  2.1350,
    "2026-01-20": -4.3817,
    "2026-01-21":  2.9483,
    "2026-01-22":  0.8292,
    "2026-01-26": -0.6394,
    "2026-01-29":  0.5169,
    "2026-02-02": -2.8881,
    "2026-02-03": -2.8393,
    "2026-02-04": -3.4102,
    "2026-02-06":  7.8718,
    "2026-02-09":  2.4972,
    "2026-02-19": -0.0426,
    "2026-02-25":  1.4052,
    "2026-02-26": -5.4561,
    "2026-02-27": -4.1646,
    "2026-03-02":  2.9855,
    "2026-03-06": -3.0108,
    "2026-03-20": -3.2818,
    "2026-03-24": -0.2505,
    "2026-03-25":  1.9863,
    "2026-03-26": -4.1639,
    "2026-03-31":  5.5882,
    "2026-04-02":  0.9331,
    "2026-04-06":  0.1409,
    "2026-04-08":  2.2347,
    "2026-04-09":  1.0051,
    "2026-04-10":  2.5665,
    "2026-04-14":  3.8033,
    "2026-04-17":  1.6789,
    "2026-04-21": -1.0789,
    "2026-04-23": -1.4123,
    "2026-04-24":  4.3228,
}

NEUTRAL_THRESHOLD = 0.30  # |close_pct| below this → realized_direction = "neutral"


def realized_direction(close_pct: float | None) -> str:
    if close_pct is None:
        return "neutral"
    if close_pct > NEUTRAL_THRESHOLD:
        return "bullish"
    if close_pct < -NEUTRAL_THRESHOLD:
        return "bearish"
    return "neutral"


def predicted_direction(force_attributions: list[dict]) -> str:
    """Dominant force attribution by weight_share determines predicted direction."""
    if not force_attributions:
        return "neutral"
    dominant = max(force_attributions, key=lambda f: f.get("weight_share", 0))
    return dominant.get("direction", "neutral")


def accuracy(pred: str, real: str) -> bool | None:
    """None when predicted neutral — no directional prediction was made."""
    if pred == "neutral":
        return None
    return pred == real


def primary_force(force_attributions: list[dict]) -> str | None:
    if not force_attributions:
        return None
    return max(force_attributions, key=lambda f: f.get("weight_share", 0)).get("force_id")


def build_event_entry(raw: dict) -> dict:
    date = raw["date"]
    close_pct = API_CLOSE_PCT.get(date)
    pred = predicted_direction(raw.get("force_attributions", []))
    real = realized_direction(close_pct)
    acc = accuracy(pred, real)

    return {
        "id": raw["id"],
        "date": date,
        "catalyst_summary": raw.get("primary_catalyst", {}).get("description", ""),
        "source_url": raw.get("primary_catalyst", {}).get("source_url"),
        "force_attributions": raw.get("force_attributions", []),
        "f1_attribution": raw.get("f1_attribution"),
        "z_score_close": raw.get("statistical_context", {}).get("close_move_sigma"),
        "z_score_volume": raw.get("statistical_context", {}).get("volume_sigma"),
        "reaction_class": raw.get("reaction_classification", {}).get("close"),
        "gap_priority": raw.get("gap_priority"),
        "confounded": raw.get("confounded", False),
        "confidence": raw.get("confidence"),
        "close_pct_api": close_pct,
        "predicted_direction": pred,
        "realized_direction": real,
        "resolved": True,
        "realized_date": date,
        "prediction_type": "retrospective",
        "accuracy": acc,
    }


def build_outcome_entry(event: dict, idx: int) -> dict:
    pf = primary_force(event["force_attributions"])
    return {
        "outcome_id": f"o{idx:04d}",
        "event_id": event["id"],
        "date_logged": event["date"],
        "force_id": pf,
        "predicted_direction": event["predicted_direction"],
        "prediction_type": event["prediction_type"],
        "resolved": event["resolved"],
        "realized_direction": event["realized_direction"],
        "realized_date": event["realized_date"],
        "accuracy": event["accuracy"],
    }


def main():
    events_dir = PROJECT_ROOT / "data" / "macro-forces" / "events"
    out_events = PROJECT_ROOT / "data" / "events.json"
    out_outcomes = PROJECT_ROOT / "data" / "outcomes.json"

    # Read and sort all per-file event records
    raw_records = []
    for f in sorted(events_dir.glob("*.json")):
        with open(f, encoding="utf-8-sig") as fh:
            raw_records.append(json.load(fh))
    raw_records.sort(key=lambda r: r["date"])

    events = [build_event_entry(r) for r in raw_records]
    outcomes = [build_outcome_entry(e, i + 1) for i, e in enumerate(events)]

    with open(out_events, "w", encoding="utf-8") as fh:
        json.dump(events, fh, indent=2, ensure_ascii=False)

    with open(out_outcomes, "w", encoding="utf-8") as fh:
        json.dump(outcomes, fh, indent=2, ensure_ascii=False)

    # Summary
    resolved = sum(1 for e in events if e["resolved"])
    accurate = [e for e in events if e["accuracy"] is True]
    inaccurate = [e for e in events if e["accuracy"] is False]
    neutral_pred = [e for e in events if e["predicted_direction"] == "neutral"]
    print(f"Events written:   {len(events)}")
    print(f"Outcomes written: {len(outcomes)}")
    print(f"All resolved:     {resolved}/{len(events)}")
    print(f"Directional predictions: {len(events) - len(neutral_pred)}")
    print(f"  Accurate:   {len(accurate)}")
    print(f"  Inaccurate: {len(inaccurate)}")
    print(f"  Neutral (no pred): {len(neutral_pred)}")
    if (len(accurate) + len(inaccurate)) > 0:
        pct = len(accurate) / (len(accurate) + len(inaccurate)) * 100
        print(f"  Accuracy rate: {pct:.1f}%")


if __name__ == "__main__":
    main()
