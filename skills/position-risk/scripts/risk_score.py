"""
Compute per-position risk scores from the overlap matrix.

Risk score components (additive, capped at 100):
  - Earnings overlap:        +40 pts
  - FOMC overlap:            +15 pts
  - Other high-importance:   +10 pts each (max +20)
  - DTE ≤ 7 with any event:  +20 pts (critical DTE flag)
  - DTE ≤ 21 (roll window):  +10 pts base

Risk tiers:
  0–19:   LOW     — monitoring only
  20–39:  MODERATE — watch closely
  40–59:  ELEVATED — roll evaluation triggered
  60+:    CRITICAL — immediate action required

Usage:
    python forward_window.py | python compute_overlap.py | python risk_score.py
    python risk_score.py --overlap overlap.json
"""

import argparse
import json
import sys
from pathlib import Path


RISK_TIERS = [
    (60, "CRITICAL",  "Immediate action required"),
    (40, "ELEVATED",  "Roll evaluation triggered"),
    (20, "MODERATE",  "Watch closely"),
    (0,  "LOW",       "Monitoring only"),
]


def score_position(pos: dict) -> dict:
    score = 0
    flags = []

    dte = pos.get("dte", 999)

    # Earnings overlap
    if pos.get("earnings_in_window"):
        score += 40
        flags.append("EARNINGS inside expiration window")

    # FOMC overlap
    if pos.get("fomc_in_window"):
        score += 15
        flags.append("FOMC inside expiration window")

    # Other high-importance events (beyond earnings/FOMC already counted)
    non_earnings_fomc_high = [
        e for e in pos.get("events_in_window", [])
        if e.get("importance") in ("critical", "high")
        and e.get("type") not in ("earnings", "fomc")
    ]
    extra = min(len(non_earnings_fomc_high) * 10, 20)
    if extra > 0:
        score += extra
        flags.append(f"{len(non_earnings_fomc_high)} other high-importance event(s) in window (+{extra}pts)")

    # DTE risk
    if dte <= 7 and pos.get("total_event_count", 0) > 0:
        score += 20
        flags.append(f"CRITICAL DTE: {dte} days with {pos['total_event_count']} event(s)")
    elif dte <= 21:
        score += 10
        flags.append(f"Roll window: DTE={dte}")

    score = min(score, 100)

    # Determine tier
    tier_name, tier_desc = "LOW", "Monitoring only"
    for threshold, name, desc in RISK_TIERS:
        if score >= threshold:
            tier_name, tier_desc = name, desc
            break

    # Earnings window position (for NVDA specifically)
    earnings_window = None
    for evt in pos.get("critical_events", []):
        if evt.get("type") == "earnings" and evt.get("ticker") == "NVDA":
            days_until = evt.get("days_until", 0)
            if days_until == 0:
                earnings_window = "EARNINGS EVENT"
            elif 1 <= days_until <= 10:
                earnings_window = f"POST-EARNINGS DRIFT (T+{days_until - days_until})"
            elif days_until <= 21:
                earnings_window = f"PRE-EARNINGS DRIFT (T-{days_until})"

    return {
        "ticker": pos.get("ticker"),
        "type": pos.get("type"),
        "strike": pos.get("strike"),
        "expiration": pos.get("expiration"),
        "dte": dte,
        "direction": pos.get("direction"),
        "account": pos.get("account"),
        "risk_score": score,
        "risk_tier": tier_name,
        "risk_description": tier_desc,
        "flags": flags,
        "earnings_window": earnings_window,
        "events_in_window": pos.get("events_in_window", []),
        "action_required": tier_name in ("CRITICAL", "ELEVATED"),
    }


def score_all(overlap: dict) -> dict:
    positions = overlap.get("positions", [])
    scored = [score_position(p) for p in positions]
    scored.sort(key=lambda p: p["risk_score"], reverse=True)

    action_required = [p for p in scored if p["action_required"]]
    max_score = max((p["risk_score"] for p in scored), default=0)

    return {
        "as_of": overlap.get("as_of"),
        "position_count": len(scored),
        "max_risk_score": max_score,
        "action_required_count": len(action_required),
        "positions": scored,
        "action_required": action_required,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--overlap", default=None,
                        help="Path to compute_overlap.py output JSON. Reads stdin if omitted.")
    args = parser.parse_args()

    if args.overlap:
        with open(args.overlap, encoding="utf-8-sig") as f:
            overlap = json.load(f)
    else:
        raw = sys.stdin.read().lstrip("﻿")
        overlap = json.loads(raw)

    result = score_all(overlap)
    print(json.dumps(result, indent=2))
