# Skill: Force Calibration

Phase 3A: reads composite score history and renders a trend report.
Phase 3B: deferred — gates on Phase 4 channel drawings providing realized channel dominance observations.

The separation is intentional: macro force data (composite score) accumulates independently of price action/channel observations to avoid confirmation bias in calibration.

---

## Data files

| File | Type | Purpose |
|---|---|---|
| `data/composite_history.json` | Time-series (one entry per date) | Composite score snapshots over time. Updated by every `composite.py` run (piggybacked on `/status`). |
| `data/forces.json` | Maintained | Force state — source for composite recomputation. |

`composite_history.json` is the Phase 3A independent variable. Phase 3B will join it against channel dominance observations from Phase 4.

---

## Phase 3A — Trend report

```powershell
py skills/force-calibration/scripts/calibration_report.py

# Last 30 entries only
py skills/force-calibration/scripts/calibration_report.py --last 30
```

Read-only. No data files modified.

### Output sections

- **Score history table**: date, composite_score, net_bullish, net_bearish, f1_multiplier, active force count, NVDA close (if recorded), active force IDs
- **Score statistics**: mean, std, min, max, range, current
- **Force state transitions**: dates when forces moved between ACTIVE / ATTENUATING / DORMANT
- **Phase 3B readiness**: entry count, NVDA closes recorded, waiting condition

---

## Composite score logging (automatic via /status)

`composite.py` is called as part of every `/status` run (Block C). It:
1. Recomputes composite from `data/forces.json`
2. Overwrites `data/composite.json`
3. Upserts today's entry into `data/composite_history.json` (one entry per date; if run multiple times today, the last run wins — NVDA close is preserved if not re-supplied)

To include NVDA close in the history entry:
```powershell
py skills/force-attribution/scripts/composite.py --nvda-close 131.25
```

If `--nvda-close` is not supplied, the field records `null` for that date.

---

## Phase 3B — Weight calibration (deferred)

Not yet implemented. Activates when Phase 4 channel drawings exist.

Phase 3B will:
1. Accept dated channel dominance observations (ascending / descending / wedge) sourced from Len's chart readings
2. Match those observations against `composite_history.json` entries for the same date ranges
3. Run `calibration_report.py` in threshold-discovery mode to identify score bands corresponding to each channel state
4. Run `recalibrate_weights.py` to adjust force weights so composite score crosses the discovered threshold more reliably
5. Every weight change committed to git with structured message: `recalibrate: YYYY-MM-DD -- <force> +/-N% -- N=X obs`

Scripts not yet built: `log_outcome.py`, `recalibrate_weights.py`.

---

## Key invariants

- `composite_history.json` is never manually edited. Only `composite.py` writes to it.
- No weight changes occur during Phase 3A. `forces.json` is not modified by any calibration script until Phase 3B.
- The composite score thresholds in `composite.py` (`>2.0 = bullish_dominant`, etc.) are arbitrary placeholders and must not be used as operational signals until Phase 3B replaces them with empirically derived values.
