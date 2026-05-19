# Skill: position-risk

Computes per-position risk scores by overlaying open options positions against the 45-day catalyst calendar. Called by `/status` after the calendar-engine produces the forward window.

---

## When to invoke

- Every `/status` run — surfaces which positions have elevated risk
- Every `/weekend` run — used to determine roll urgency and mode selection
- Any time Len asks "is my position safe through [date/event]"

---

## Script call sequence

Run from `skills/position-risk/scripts/`. Requires Python 3.11+.

```bash
# Full pipeline (most common — pipe forward_window into overlap into risk)
python skills/calendar-engine/scripts/forward_window.py --from TODAY --days 45 \
  | python skills/position-risk/scripts/compute_overlap.py \
  | python skills/position-risk/scripts/risk_score.py

# Or with intermediate files (for debugging)
python forward_window.py --from TODAY --days 45 > /tmp/window.json
python compute_overlap.py --window /tmp/window.json > /tmp/overlap.json
python risk_score.py --overlap /tmp/overlap.json
```

---

## Risk scoring model

### Score components (additive, capped at 100)

| Condition | Points |
|-----------|--------|
| Earnings event inside expiration window | +40 |
| FOMC inside expiration window | +15 |
| Other high-importance event, per event (max 2) | +10 |
| DTE ≤ 7 with any event in window | +20 |
| DTE ≤ 21 (roll window) | +10 |

### Risk tiers

| Score | Tier | Action |
|-------|------|--------|
| 60+ | CRITICAL | Immediate action — surface in red, block on this |
| 40–59 | ELEVATED | Roll evaluation triggered — invoke roll-evaluator |
| 20–39 | MODERATE | Watch closely — note in status |
| 0–19 | LOW | Monitoring only |

---

## Interpreting output

### risk_score.py output
- `action_required[]` — positions at ELEVATED or CRITICAL tier, sorted by score descending
- `positions[].flags[]` — plain-English list of what is driving the score
- `positions[].earnings_window` — for NVDA: current window relative to next earnings (pre-drift / event / post-drift / null)

### Earnings Shield check
If any NVDA position has `earnings_in_window: true`:
1. Check the mode on entry (`positions[].mode`)
2. Mode 1: Earnings Shield standard — verify strike is above current channel resistance
3. Mode 2: High alert — two-stage roll trajectory may need acceleration; consider closing if < 7 DTE to earnings
4. Any mode: Surface as a CRITICAL flag regardless of score if DTE to earnings < 7

---

## When there are no open options

`compute_overlap.py` will return `"position_count": 0` and an empty `positions[]`. This is a valid state — report it as "No open option positions" and skip the risk section of `/status`.

---

## Roll urgency integration

The risk tier maps directly to roll urgency tiers from the Playbook:

| Risk Tier | Roll Urgency |
|-----------|-------------|
| CRITICAL | Critical (≤7 DTE) — invoke roll-evaluator immediately |
| ELEVATED | Roll Window (8–21 DTE) — invoke roll-evaluator in this session |
| MODERATE | Monitoring (22+ DTE) — note DTE, no action yet |
| LOW | Monitoring — no action |
