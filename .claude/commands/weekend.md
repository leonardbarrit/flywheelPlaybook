---
description: Weekend analytical session. Synthesizes the week's daily status reports, reads prior weekend reports for longitudinal context, produces a forward-looking decision tree for the coming week (Monday-Tuesday focus), longer-timeframe trajectory analysis, and calibration status. Invoke Saturday or Sunday after the final /status of the week has run.
---

# /weekend

Spawns the weekend-session Opus subagent to run the full weekend analytical sequence.

## Prerequisites

The most recent `/status` run should be from Friday (or the most recent trading day). The weekend session reads status outputs — it does not re-run price pipeline, force attribution, or roll scan.

If Friday's `/status` has not been run, run it first.

## What the subagent produces

1. **Weekly review** — what happened this week: composite score movement, force events, price attributions, roll actions, and accuracy check against last weekend's predictions
2. **Channel state** — active drawing status, apex timing, NEW_DRAWING_REQUIRED flag
3. **Force regime** — which forces are driving the composite, which are fading, which dormant forces showed keyword activity
4. **Composite trajectory** — 8-week score trend with weekly averages
5. **Calendar** — next 5 trading days detailed; 45-day flags; NVDA earnings window positioning
6. **Portfolio state** — open positions with Monday DTE, income trajectory, phase progress
7. **Monday/Tuesday plan** — GO/NO-GO, decision tree with trigger prices, Turnaround Tuesday conditions
8. **Longer-timeframe analysis** — 4–8 week composite trend, force regime durability, channel apex accuracy pattern, phase trajectory, primary regime risk to watch
9. **Calibration status** — runs `calibration_report.py` and `recalibrate_weights.py` (preview only); reports observation count vs. minimum threshold; if sufficient data, includes weight change proposals for review. Proposals are never auto-applied — `/recalibrate --apply` is required to commit any changes.
10. **Prediction accuracy log** — prior weekend predictions vs. what actually occurred

## Output

Full report written to `data/weekend-session-{TODAY}.md`.

Response is under 400 words covering: weekly summary, channel state, macro regime, Monday/Tuesday setup with trigger price, one longer-view observation, calibration observation count.

## Invoke

Spawn the weekend-session subagent with today's date and the instruction to run its full analytical sequence.
