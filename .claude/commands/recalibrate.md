# /recalibrate

Run the force calibration report. Shows composite score trend, force state transitions, and Phase 3B readiness.

Phase 3A only — no weight changes. Weight calibration is deferred to Phase 3B, which gates on Phase 4 channel drawings.

Usage: `/recalibrate` or `/recalibrate --last 30`

---

## Execution protocol

```powershell
py skills/force-calibration/scripts/calibration_report.py
```

Or with a window limit:
```powershell
py skills/force-calibration/scripts/calibration_report.py --last 30
```

Return the full report output as your response. No files are modified.

---

## Phase 3B note

Weight recalibration is not yet implemented. It activates when:
1. Phase 4 channel drawings exist with dated ascending/descending/wedge dominance periods
2. Those observations can be matched against `data/composite_history.json`
3. A threshold separating ascending/descending/wedge score bands is identified from the data

Until then, `/recalibrate` is a read-only trend viewer. The composite score thresholds in composite.py are arbitrary placeholders — do not use them as operational signals.
