---
description: Force calibration tool. Phase 3A = composite score trend viewer (read-only). Phase 3B = threshold discovery and weight adjustment proposals against resolved channel drawings.
---

# /recalibrate

Two-mode calibration tool. Default invocation runs Phase 3A trend report (read-only). Phase 3B mode activates when resolved channel drawings exist.

---

## Mode 1 — Phase 3A trend report (always available)

```powershell
py skills/force-calibration/scripts/calibration_report.py

# Last 30 entries only
py skills/force-calibration/scripts/calibration_report.py --last 30
```

Read-only. Shows composite score trajectory, statistics, force state transitions, NVDA price data, and Phase 3B readiness. No files modified.

---

## Mode 2 — Phase 3B correlation scan

Requires at least one resolved channel drawing in `data/channel_drawings.json`.

```powershell
py skills/force-calibration/scripts/channel_correlation.py
# With custom lookback (default: 14 days)
py skills/force-calibration/scripts/channel_correlation.py --lookback 21
```

Reports force frequency before premature vs on-time breakouts. Identifies candidate "breakout-forcing" forces. Read-only.

---

## Mode 3 — Phase 3B weight calibration

```powershell
# Preview proposed weight changes (no files modified)
py skills/force-calibration/scripts/recalibrate_weights.py

# Apply proposed changes to forces.json (requires explicit invocation)
py skills/force-calibration/scripts/recalibrate_weights.py --apply
```

### What it does

1. Reads `data/channel_drawings.json` (resolved drawings only)
2. Reads `data/composite_history.json` (score history)
3. Reads `data/forces.json` (current weights)
4. Discovers score thresholds separating ascending/descending/converging regime classes
5. Computes force activation rates by regime
6. Proposes weight adjustments proportional to directional accuracy signal

### Guardrails

- Minimum 3 resolved drawings per regime class before threshold discovery runs
- Minimum 3 force observations before any weight change is proposed
- Maximum ±15% weight change per force per calibration cycle
- F1 (multiplier type) is never adjusted
- DORMANT forces (weight = 0) are never adjusted
- Default mode is PREVIEW — prints diff, writes nothing
- `--apply` writes to forces.json and prints the git commit command

### After applying changes

Commit to git:
```
git commit data/forces.json -m "recalibrate: YYYY-MM-DD -- <force> +/-N% -- N=X obs, threshold=Y"
```

Then re-run `/status` to confirm the updated composite score.

---

## Resolving a channel drawing (prerequisite for Phase 3B calibration)

When a channel breakout occurs:

```powershell
py skills/force-calibration/scripts/log_outcome.py \
    --drawing-id draw-2026-05-19-003 \
    --breakout-date 2026-05-25 \
    --breakout-direction ascending \
    --breakout-price 240.00 \
    --preceding-events "E001,E002" \
    --notes "Broke ascending containment on earnings gap"
```

List current drawings:
```powershell
py skills/force-calibration/scripts/log_outcome.py --list
py skills/force-calibration/scripts/log_outcome.py --list --unresolved
```

---

## Key invariants

- The composite score thresholds in `composite.py` (`>2.0 = bullish_dominant` etc.) are arbitrary placeholders. Do not use them as operational signals until Phase 3B replaces them with empirically derived values.
- No weight changes occur without running `recalibrate_weights.py --apply` explicitly. The script never self-applies.
- Every applied weight change must be committed to git with a structured message (see above).
- `composite_history.json` is never manually edited — only `composite.py` writes to it.
