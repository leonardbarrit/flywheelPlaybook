---
description: Update the NVDA macro force dashboard. Runs an incremental pass over new trading days and news events since the last update. Lighter than the comprehensive YTD pass.
---

Use the macro-analyst subagent in Mode 2B (Update Pass) to refresh the NVDA macro force dashboard.

Context:
- Force state lives at `data/forces.json`
- Event ledger lives at `data/events.json` (append-only)
- Outcomes ledger lives at `data/outcomes.json` (append-only)
- Current composite score is in `data/composite.json`
- 15 tracked forces with state machine (ACTIVE / ATTENUATING / DORMANT / REACTIVATED)
- Last update date is in `data/forces.json` under `updated`

If $ARGUMENTS is provided and describes a specific news event, invoke Mode 2C (Event-Driven Update) instead of the general update pass.

The update pass should use the Phase 2 force-attribution scripts:

1. Read `data/forces.json` and identify last update date.
2. For new trading days since last update: screen for significant price moves (|z| ≥ 1.0 vs trailing baseline).
3. For each significant new day: spawn a general-purpose agent for WebSearch-based catalyst research.
4. Classify each event via `skills/force-attribution/scripts/classify_event.py`.
5. Apply state machine transitions via `skills/force-attribution/scripts/update_force_state.py`:
   - ACTIVE → ATTENUATING: 3 consecutive <0.5σ reactions in the force
   - ATTENUATING → DORMANT: weight <0.15 AND 30+ days with no significant event
   - DORMANT → REACTIVATED: new ≥1.5σ event in the category
   - REACTIVATED → ACTIVE: --confirm-active after 2 passes or 14 days sustained signal
6. Append new event records to `data/events.json` (prediction_type="prospective" for new entries).
7. Append new outcome records to `data/outcomes.json`.
8. Recompute composite score via `skills/force-attribution/scripts/composite.py`.
9. Resolve any prior prospective outcomes that can now be evaluated (match realized price direction to predicted direction; append resolved outcome entries).

See `skills/force-attribution/SKILL.md` for Windows-compatible PowerShell invocations using file intermediates.

Report back with:
- Days processed
- New events classified
- State transitions (with reasoning)
- Updated composite score and delta from prior
- Any ambiguous attributions that need user confirmation
