---
description: Portfolio status check — current holdings, scaling progress, income metrics, capital pool, 45-day catalyst landscape, and position-risk overlay.
---

Use the portfolio-accountant subagent to generate a full Phase 1+2 status report.

The agent should execute this sequence in order:

**Block A — Calendar (run first, results needed by Block C)**
1. Run `py skills/calendar-engine/scripts/forward_window.py --from TODAY --days 45` and save to `data\_tmp_window.json`
2. Run `py skills/calendar-engine/scripts/verify_calendar.py --as-of TODAY`
3. Run `py skills/calendar-engine/scripts/compute_density.py --window data\_tmp_window.json` for density summary

**Block B — Portfolio snapshot (run in parallel with Block A)**
4. Read `data/positions.json` and `data/trades.json`
5. Calculate effective cost basis for all NVDA lots
6. Compute trailing 3-month income metrics
7. Report scaling roadmap progress

**Block C — Composite score + history log (run in parallel with Block A)**
8. If NVDA close price is available (supplied in arguments or from positions.json mktPrice), run:
   `py skills/force-attribution/scripts/composite.py --nvda-close {price}`
   Otherwise run:
   `py skills/force-attribution/scripts/composite.py`
   This recomputes composite.json AND upserts today's entry into composite_history.json.

**Block D — Position risk (requires Block A output)**
9. Run `py skills/position-risk/scripts/compute_overlap.py --window data\_tmp_window.json` → save to `data\_tmp_overlap.json`
10. Run `py skills/position-risk/scripts/risk_score.py --overlap data\_tmp_overlap.json`

**Block E — Assemble report**
11. If verify_calendar returns any stale or unverified entries, lead the report with CALENDAR VERIFICATION REQUIRED action items (one per stale entry, with its primary_source_url)
12. Then produce the full status report in the format below

Report format:

```
## PORTFOLIO STATUS — [DATE]

### ACTION ITEMS
[If stale calendar entries: "CALENDAR VERIFICATION REQUIRED — [ticker/type] last verified [date], check: [URL]"]
[If CRITICAL or ELEVATED risk positions: surface them here with score and flags]
[If no open options: note that]
[If no action items: "No action items."]

### Catalyst Landscape — Next 45 Days ([from_date] → [to_date])
[List each event: date | label | importance | days_until]
[Flag high-density weeks]
[NVDA earnings window position: PRE-EARNINGS DRIFT T-N / EARNINGS EVENT / POST-EARNINGS DRIFT T+N / OUTSIDE WINDOW]

### Macro Composite
Score: [composite_score] — [interpretation]
Net bullish: [net_bullish] | Net bearish: [net_bearish] | F1 multiplier: [f1_multiplier]×
Active forces: [active_force_count] | Attenuating: [attenuating_force_count] | Dormant: [dormant_force_count]
[As of: composite date. If composite.json missing or stale (>7 days), flag: "COMPOSITE STALE — run /macro-update"]

### Position Risk
[For each open option: ticker | strike | exp | DTE | risk_tier | flags]
[If no open options: "No open option positions."]

### Roth IRA
- NVDA: XXX shares (X contracts) | Effective CB: $XXX.XX | Mkt: $XXX
- JEPQ: X,XXX shares | Phase 2 progress: XX%
- Capital Pool: $X,XXX (SPAXX $X,XXX)
- Active CCs: [list with DTE and risk tier]
- Scaling: Phase X — X shares to next contract milestone

### HSA
- JEPI: XXX shares | Milestone: [current] → [next target]
- Growth Vehicle: [ticker] | Status: [hold/exited]
- IBIT: [shares if post-pivot] | CCs: [if active]

### Income Summary (trailing 3 months)
- CC premiums: $X,XXX
- CSP premiums: $XXX
- JEPQ dividends: $XXX
- SPAXX yield: $XXX
- Monthly run rate: $X,XXX
```

Write the full report to `data/portfolio-status-YYYY-MM-DD.md` before responding. Return the report as your response.
