---
description: Portfolio status check — current holdings, scaling progress, income metrics, capital pool, 45-day catalyst landscape, and position-risk overlay.
---

## Execution model

Block A0 and news research run in the **main context** (MCP tools required).
All other blocks run inside the **portfolio-accountant subagent**.

---

## MAIN CONTEXT — Block A0 (run this before spawning the subagent)

**Step 1 — Determine fetch window**

Read `data/composite_history.json`. Find the most recent entry where `nvda_close` is not null. That date is `last_close_date`. If none exists, default to 90 days before today.

**Step 2 — Fetch OHLCV**

Call `mcp__Massive_Market_Data__query_data` for NVDA daily OHLCV from `last_close_date + 1` through today. If the correct endpoint is unknown, call `mcp__Massive_Market_Data__search_endpoints` first. Write the raw response to `data\_tmp_prices.json`.

If the API returns no new records (no trading days since last fetch), skip Steps 3–5. No price flag for Block C.

**Step 3 — Process prices**

```powershell
py skills/price-data/scripts/process_prices.py --data data\_tmp_prices.json | Out-File -Encoding utf8 data\_tmp_price_result.json
```

Read `data\_tmp_price_result.json`. Extract:
- `updated[]` — dates upserted into composite_history.json
- `significant[]` — days meeting gap/close/reversal thresholds
- `unattributed[]` — significant days with no entry in events.json

**Step 4 — News research (conditional, main context only)**

If `unattributed_count > 0`: spawn a general-purpose agent (WebSearch) for each unattributed day. Brief:

> Research NVDA price action on [date]. Significant move: open [open], close [close], gap [gap_pct]%, close [close_pct]%, reversal: [true/false], reasons: [reasons].
> Identify the most likely macro force from: A1 Hyperscaler Capex | A2 Enterprise AI | A3 Sovereign AI | B1 Foundry/Packaging | B2 Taiwan Risk | B3 Power Grid | C1 China Export Controls | C2 US Industrial Policy | C3 Fed Policy | C4 AI Antitrust | D1 AMD | D2 Custom Silicon | D3 China Domestic Chip | E1 Positioning/Flows | E2 Cross-Asset Risk | F1 Narrative Validation.
> Return: force_id | direction (bullish/bearish) | confidence (HIGH/MEDIUM/LOW) | 1-sentence catalyst summary | confounded (true/false).
> If no clear catalyst found after 2 search rounds, return E1 | direction=unknown | confidence=LOW.

Collect research findings. Do NOT write to events.json.

**Step 5 — Extract prices for Block C**

From `data\_tmp_price_result.json`, find today's entry in `updated[]`:
- If today's `nvda_close` is populated → `PRICE_FLAG = --nvda-close {close}`
- Else if today's `nvda_open` is populated → `PRICE_FLAG = --nvda-open {open}`
- Otherwise → `PRICE_FLAG = (none)`

---

## SUBAGENT — portfolio-accountant

Spawn the portfolio-accountant subagent. Pass in:
- `TODAY` — today's date as YYYY-MM-DD
- `PRICE_FLAG` — from Step 5 above (may be empty)
- `UNATTRIBUTED_FINDINGS` — the research table from Step 4 (may be empty)

The subagent runs Blocks A, B, C, D, and E (report assembly).

---

## Report format (assembled by subagent)

```
## PORTFOLIO STATUS — [DATE]

### ACTION ITEMS
[CALENDAR VERIFICATION REQUIRED — [ticker/type] last verified [date], check: [URL]]
[CRITICAL or ELEVATED risk positions with score and flags]
[If no action items: "No action items."]

### Price Research Pending
[If unattributed significant days exist:]
  DATE | open | close | gap_pct% | close_pct% | reversal | reasons
  Force: force_id | direction | confidence | catalyst
[If none: omit section entirely]

### Catalyst Landscape — Next 45 Days ([from] → [to])
[DATE | LABEL | IMPORTANCE | T-N]
High-density weeks: [list or "none"]
NVDA earnings window: [PRE-DRIFT T-N | EARNINGS EVENT | POST-DRIFT T+N | OUTSIDE WINDOW]

### Macro Composite
Score: [composite_score] — [interpretation]
Net bullish: [net_bullish] | Net bearish: [net_bearish] | F1 multiplier: [f1_multiplier]×
Active: [count] | Attenuating: [count] | Dormant: [count]
[If nvda_open recorded: "NVDA open: $X.XX | Gap: +/-X.XX% vs prior close"]
[If intraday_reversal=true: "INTRADAY REVERSAL — open direction diverged from close"]
[If composite.json missing or >7 days old: "COMPOSITE STALE — run /macro-update"]

### Position Risk
[TICKER STRIKE EXP | DTE | RISK_TIER | flags]
[If none: "No open option positions."]

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

Write the full report to `data/portfolio-status-YYYY-MM-DD.md` before responding.
