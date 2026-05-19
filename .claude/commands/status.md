---
description: Portfolio status check — current holdings, scaling progress, income metrics, capital pool, 45-day catalyst landscape, and position-risk overlay.
---

Use the portfolio-accountant subagent to generate a full Phase 1+2 status report.

The agent should execute this sequence in order:

**Block A0 — Price fetch (run first; results feed Block C)**

1. Read `data/composite_history.json`. Find the most recent entry where `nvda_close` is not null. Use that date as `last_close_date`. If none exists, default to 90 days ago.

2. Call `mcp__Massive_Market_Data__query_data` (or `mcp__Massive_Market_Data__search_endpoints` first if the endpoint is unknown) for NVDA daily OHLCV from `last_close_date + 1` through today. Save raw output to `data\_tmp_prices.json`.

3. If `data\_tmp_prices.json` contains records, run:
   ```powershell
   py skills/price-data/scripts/process_prices.py --data data\_tmp_prices.json | Out-File -Encoding utf8 data\_tmp_price_result.json
   ```
   Read `data\_tmp_price_result.json`. Note `updated[]`, `significant[]`, `unattributed[]`.

4. If `unattributed_count > 0`: spawn a general-purpose agent with WebSearch to research each unattributed significant day. Brief the agent with: date, open, close, gap_pct, close_pct, intraday_reversal, reasons. Ask it to identify the most likely macro force (from the A1–F1 taxonomy), direction, confidence, and a 1-sentence catalyst summary for each date. **Do not write to events.json.** Surface findings to the user for review.

5. From `data\_tmp_price_result.json`, extract today's prices for Block C:
   - If today is in `updated[]` and `nvda_close` is populated: carry `nvda_close` to Block C.
   - If today is in `updated[]` and only `nvda_open` is populated: carry `nvda_open` to Block C.
   - Otherwise: no price flag for Block C.

**Block A — Calendar (run after A0; results needed by Block D)**
6. Run `py skills/calendar-engine/scripts/forward_window.py --from TODAY --days 45` and save to `data\_tmp_window.json`
7. Run `py skills/calendar-engine/scripts/verify_calendar.py --as-of TODAY`
8. Run `py skills/calendar-engine/scripts/compute_density.py --window data\_tmp_window.json` for density summary

**Block B — Portfolio snapshot (run in parallel with Block A)**
9. Read `data/positions.json` and `data/trades.json`
10. Calculate effective cost basis for all NVDA lots
11. Compute trailing 3-month income metrics
12. Report scaling roadmap progress

**Block C — Composite score + history log (run after Block A0)**
13. Run composite.py with prices from Block A0:
    - Close price available: `py skills/force-attribution/scripts/composite.py --nvda-close {close}`
    - Open price only: `py skills/force-attribution/scripts/composite.py --nvda-open {open}`
    - Neither: `py skills/force-attribution/scripts/composite.py`
    This recomputes composite.json AND upserts today's entry into composite_history.json.
    Gap % (open vs prior close) and intraday_reversal are computed automatically.

**Block D — Position risk (requires Block A output)**
14. Run `py skills/position-risk/scripts/compute_overlap.py --window data\_tmp_window.json` → save to `data\_tmp_overlap.json`
15. Run `py skills/position-risk/scripts/risk_score.py --overlap data\_tmp_overlap.json`

**Block E — Assemble report**
16. If verify_calendar returns any stale or unverified entries, lead with CALENDAR VERIFICATION REQUIRED action items (one per stale entry, with its primary_source_url)
17. If unattributed significant days were found in Block A0, include a PRICE RESEARCH PENDING section with the news agent findings
18. Then produce the full status report in the format below

Report format:

```
## PORTFOLIO STATUS — [DATE]

### ACTION ITEMS
[If stale calendar entries: "CALENDAR VERIFICATION REQUIRED — [ticker/type] last verified [date], check: [URL]"]
[If CRITICAL or ELEVATED risk positions: surface them here with score and flags]
[If no open options: note that]
[If no action items: "No action items."]

### Price Research Pending
[If unattributed significant days exist:]
[DATE | open | close | gap_pct% | close_pct% | reversal | reasons]
[Force research findings from news agent: force_id | direction | confidence | catalyst]
[Prompt: "Review and confirm attribution with /confirm-attribution or dismiss."]
[If no unattributed days: omit this section entirely]

### Catalyst Landscape — Next 45 Days ([from_date] → [to_date])
[List each event: date | label | importance | days_until]
[Flag high-density weeks]
[NVDA earnings window position: PRE-EARNINGS DRIFT T-N / EARNINGS EVENT / POST-EARNINGS DRIFT T+N / OUTSIDE WINDOW]

### Macro Composite
Score: [composite_score] — [interpretation]
Net bullish: [net_bullish] | Net bearish: [net_bearish] | F1 multiplier: [f1_multiplier]×
Active forces: [active_force_count] | Attenuating: [attenuating_force_count] | Dormant: [dormant_force_count]
[If nvda_open recorded: "NVDA open: $X.XX | Gap: +/-X.XX% vs prior close"]
[If intraday_reversal=true: "INTRADAY REVERSAL — open direction diverged from close"]
[If composite.json missing or stale (>7 days): "COMPOSITE STALE — run /macro-update"]

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
