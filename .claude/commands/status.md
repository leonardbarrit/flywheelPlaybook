---
description: Single-call analysis kickoff. Runs all analytical blocks in sequence — price pipeline, force state update, calendar, channel check, roll scan — then spawns portfolio-accountant for metrics. Produces a complete current-state report with no intermediate human gates.
---

# /status

Runs Blocks 0–5 in sequence. Blocks 0–4 execute in the main context (MCP + web search required). Block 5 runs in the portfolio-accountant subagent (file reads only). Main context assembles the final report.

---

## Block 0 — Price pipeline

**Step 0.1 — Determine fetch window**

Read `data/composite_history.json`. Find the most recent entry where `nvda_close` is not null → `last_close_date`. If none, default to 90 days before today.

**Step 0.2 — Fetch OHLCV**

Call `mcp__Massive_Market_Data__query_data` for NVDA daily OHLCV from `last_close_date + 1` through today. Write raw response to `data\_tmp_prices.json`.

If API returns no new records: skip Steps 0.3–0.5. Set `PRICE_FLAG = (none)`. No logged events this block.

**Step 0.3 — Process prices**

```powershell
py skills/price-data/scripts/process_prices.py --data data\_tmp_prices.json | Out-File -Encoding utf8 data\_tmp_price_result.json
```

Read `data\_tmp_price_result.json`. Extract `unattributed[]`.

**Step 0.4 — Research, keyword scan, ledger write**

For each entry in `unattributed[]`: spawn a general-purpose agent (WebSearch). Brief:

> Research NVDA price action on {date}. Move: open {open}, close {close}, gap {gap_pct}%, close {close_pct}%, reversal: {intraday_reversal}, reasons: {reasons}.
> Identify the primary macro force: A1 Hyperscaler Capex | A2 Enterprise AI | A3 Sovereign AI | B1 Foundry/Packaging | B2 Taiwan Risk | B3 Power Grid | C1 China Export Controls | C2 US Industrial Policy | C3 Fed Policy | C4 AI Antitrust | D1 AMD | D2 Custom Silicon | D3 China Domestic Chip | E1 Positioning/Flows | E2 Cross-Asset Risk | F1 Narrative Validation.
> Return: force_id | direction (bullish/bearish/unknown) | confidence (HIGH/MEDIUM/LOW) | catalyst (1 sentence) | confounded (true/false) | full_text (all article/analysis text found, verbatim).
> If no clear catalyst after 2 search rounds: return E1 | direction=unknown | confidence=LOW.

For each finding:

```powershell
# Passive surveillance — check full article text against all dormant/attenuating forces
py skills/force-attribution/scripts/match_keywords.py `
    --text "{full_text}" --inactive-only | Out-File -Encoding utf8 data\_tmp_keyword_scan.txt

# Write primary attribution to ledger
py skills/price-data/scripts/log_price_event.py `
    --date {date} --force-id {force_id} --direction {direction} `
    --confidence {confidence} --catalyst "{catalyst}" `
    --confounded {true|false} --close-pct {close_pct} --gap-pct {gap_pct}
```

Collect per finding:
- Log output line from `log_price_event.py` → append to `LOGGED_EVENTS`
- Surveillance flags from `data\_tmp_keyword_scan.txt` → append to `SURVEILLANCE_FLAGS`
- Research values: `{date, force_id, direction, confidence, close_pct, event_id}` → append to `NEW_ATTRIBUTIONS`

**Step 0.5 — Extract price flag**

From `data\_tmp_price_result.json`, find today's entry:
- `nvda_close` populated → `PRICE_FLAG = --nvda-close {close}` ; `NVDA_PRICE = {close}`
- `nvda_open` only → `PRICE_FLAG = --nvda-open {open}` ; `NVDA_PRICE = {open}`
- Neither → `PRICE_FLAG = (none)` ; `NVDA_PRICE = (none)`

**Step 0.6 — Update market prices in positions.json**

Read `data/positions.json`. For each ticker in `shares[]` across all accounts, fetch current price via `mcp__Massive_Market_Data__query_data` (or extract from already-fetched OHLCV if available). Update each `mktPrice` field in place. Update `_updated` to today's date.

- NVDA: use `NVDA_PRICE` already extracted in Step 0.5 if available; otherwise fetch
- JEPQ, JEPI, IBIT: fetch via Massive Market Data
- If a price fetch fails for a ticker: leave `mktPrice` at its prior value; note inline

Write the updated `data/positions.json`. This is the only step that writes to positions.json during a status run.

---

## Block 1 — Force state update

For each entry in `NEW_ATTRIBUTIONS`:

```powershell
py skills/force-attribution/scripts/update_force_state.py `
    --force {force_id} --direction {direction} `
    --close-pct {close_pct} --confidence {confidence} `
    --date {date} --event-id "{event_id}"
```

Collect any `TRANSITION:` lines from output → `FORCE_TRANSITIONS`.

After all attributions processed, recompute composite:

```powershell
py skills/force-attribution/scripts/composite.py {PRICE_FLAG}
```

Read `data/composite.json`. Extract: `composite_score`, `interpretation`, `net_bullish`, `net_bearish`, `f1_multiplier`, `active_force_count`, `attenuating_force_count`, `dormant_force_count`.

If no new attributions: run `composite.py {PRICE_FLAG}` alone to update history with today's price.

---

## Block 2 — Calendar engine

```powershell
py skills/calendar-engine/scripts/forward_window.py --from {TODAY} --days 45 | Out-File -Encoding utf8 data\_tmp_window.json
py skills/calendar-engine/scripts/verify_calendar.py --as-of {TODAY}
py skills/calendar-engine/scripts/compute_density.py --window data\_tmp_window.json
```

Capture verify_calendar.py output → `STALE_ENTRIES` (any line flagging a stale or unverified entry).

---

## Block 3 — Channel check

Read `data/channel_drawings.json`. Identify the active drawing: most recent entry where `notes` does not begin with "SUPERSEDED" and `outcome.resolved` is false.

Initialize: `NEW_DRAWING_REQUIRED = false`, `CHANNEL_RESOLVED = false`, `CHANNEL_LAPSED = false`.

If no active drawing:
- Set `CHANNEL_FLAGS = ["NO ACTIVE DRAWING — run /draw-channels"]`
- Set `NEW_DRAWING_REQUIRED = true`
- Skip remaining steps.

Otherwise extract from active drawing:
- `drawing_id`, `drawn_date`, `regime`, `timeframe`
- `apex_predicted_date`, `asc_containment_t45` from `wedge`
- Ascending compression rail: `apl_date`, `apl_price`, `slope_asc` = `ascending_channel.compression_rail.slope_per_4h_bar`
- Descending compression rail (if present): `aph_date`, `aph_price`, `slope_desc` = `descending_channel.compression_rail.slope_per_4h_bar`

**Step 3.1 — Mechanical breakout detection** (requires `NVDA_PRICE` and non-null slopes)

Bars per day: 1.625 for 4h timeframe, 1.0 for 1d.

```
asc_rail_today  = apl_price + slope_asc  × trading_days(apl_date,  TODAY) × bars_per_day
desc_rail_today = aph_price + slope_desc × trading_days(aph_date, TODAY) × bars_per_day  [if desc rail present]
```

Evaluate (only if NVDA_PRICE available and relevant slope is non-null):

- If desc rail present and `NVDA_PRICE > desc_rail_today`:
  → Ascending breakout detected
  → `py skills/force-calibration/scripts/log_outcome.py --drawing-id {drawing_id} --breakout-date {TODAY} --breakout-direction ascending --breakout-price {NVDA_PRICE}`
  → Set `CHANNEL_RESOLVED = true`, `NEW_DRAWING_REQUIRED = true`
  → Add to CHANNEL_FLAGS: `"CHANNEL RESOLVED — ascending breakout {TODAY} ${NVDA_PRICE} (desc rail ${desc_rail_today:.2f}) — RUN /draw-channels"`

- Else if `NVDA_PRICE < asc_rail_today`:
  → Descending breakout detected
  → `py skills/force-calibration/scripts/log_outcome.py --drawing-id {drawing_id} --breakout-date {TODAY} --breakout-direction descending --breakout-price {NVDA_PRICE}`
  → Set `CHANNEL_RESOLVED = true`, `NEW_DRAWING_REQUIRED = true`
  → Add to CHANNEL_FLAGS: `"CHANNEL RESOLVED — descending breakout {TODAY} ${NVDA_PRICE} (asc rail ${asc_rail_today:.2f}) — RUN /draw-channels"`

If NVDA_PRICE unavailable or required slope is null: skip breakout detection; note inline.

**Step 3.2 — Apex lapse check** (skip if CHANNEL_RESOLVED)

- If `apex_predicted_date` < today:
  → Set `CHANNEL_LAPSED = true`, `NEW_DRAWING_REQUIRED = true`
  → Add to CHANNEL_FLAGS: `"CHANNEL LAPSED — apex {apex_predicted_date} passed, no breakout detected — RUN /draw-channels"`

**Step 3.3 — Ceiling proximity check** (skip if NEW_DRAWING_REQUIRED; requires NVDA_PRICE and asc_containment_t45)

- If `NVDA_PRICE > asc_containment_t45` → add: `"CHANNEL CEILING BREACHED — NVDA ${NVDA_PRICE} above T+45 containment ${asc_containment_t45}, run /draw-channels"`
- Else if `NVDA_PRICE > asc_containment_t45 × 0.95` → add: `"APPROACHING CHANNEL CEILING — NVDA ${NVDA_PRICE} within 5% of T+45 containment ${asc_containment_t45}"`

---

## Block 4 — Position risk + Roll scan

**Step 4.1 — Position risk**

```powershell
py skills/position-risk/scripts/compute_overlap.py --window data\_tmp_window.json | Out-File -Encoding utf8 data\_tmp_overlap.json
py skills/position-risk/scripts/risk_score.py --overlap data\_tmp_overlap.json
```

Capture risk_score.py output → `RISK_SCORES`.

**Step 4.2 — Load roll scan inputs**

Read:
- `data/positions.json` — all open short calls and puts
- `data/calendar.json` — catalyst dates
- `data/composite.json` — current macro score
- Active drawing from `data/channel_drawings.json` — `asc_containment_t45` for Double Barrier

Compute DTE for each position as of today. Assign urgency:
- **CRITICAL** ≤ 7 DTE
- **ROLL WINDOW** 8–21 DTE
- **MONITORING** 22+ DTE

**Step 4.3 — Calendar gate per position**

For each position, check whether any catalyst date from `data/calendar.json` falls inside its remaining DTE window. Apply Mode gates per scan-rolls.md Step 2 rules. Flag any Earnings Shield conditions.

**Step 4.4 — Mode classification**

Classify each position (Mode 1/2/3/4/CLOSE/HOLD/ASSIGN) per scan-rolls.md Step 3 rules. Calendar gates override urgency-based routing.

**Step 4.5 — Options chain data (CRITICAL and ROLL WINDOW only)**

For each position in CRITICAL or ROLL WINDOW tier: use web search to find current bid/ask on the existing position and options chain data at target expiration(s). Compute net credit per share. State confidence if exact chain data unavailable.

**Step 4.6 — Double Barrier check**

If `NEW_DRAWING_REQUIRED = true` (channel resolved, lapsed, or absent):
- Skip channel barrier
- Apply delta barrier only: new strike delta ≤ 0.22
- Flag every roll recommendation: `⚠ CHANNEL UNVALIDATED — run /draw-channels before executing`
- Add to action table header: `DOUBLE BARRIER: DELTA ONLY (channel unvalidated)`

Otherwise (active drawing with valid geometry):
- Channel barrier: new strike ≥ `asc_containment_t45`
- Delta barrier: new strike delta ≤ 0.22
- Flag BARRIER CONFLICT if qualifying credit exists only below the channel ceiling

**Step 4.7 — Produce action table and save**

Build the roll action table sorted by urgency (lowest DTE first):

```
ROLL SCAN — {DATE}
─────────────────────────────────────────────────────────────────────
TICKER  STRIKE/EXP    DTE  URGENCY      MODE    BTC EST   REC             NET CREDIT
─────────────────────────────────────────────────────────────────────
QUALIFYING: N    SUBTHRESHOLD: N    HOLD: N    CLOSE: N
```

Write narrative for each CRITICAL and ROLL WINDOW position (what to do, when, why).

Save full roll scan to `data/roll-scan-{TODAY}.md`.

Collect condensed table and narratives → `ROLL_SUMMARY`.

---

## Block 5 — Portfolio metrics (subagent)

Spawn the **portfolio-accountant** subagent. Pass:
- `TODAY`
- `PRICE_FLAG`
- `LOGGED_EVENTS`
- `SURVEILLANCE_FLAGS`
- `FORCE_TRANSITIONS`
- `CHANNEL_FLAGS`
- `ROLL_SUMMARY`

Subagent returns `PORTFOLIO_BLOCK` (Roth IRA, HSA, Income Summary sections).

---

## Block 6 — Report assembly

Assemble the final report from all block outputs. Write to `data/portfolio-status-{TODAY}.md` before responding.

```
## PORTFOLIO STATUS — {TODAY}

### ACTION ITEMS
[CHANNEL_FLAGS — staleness and ceiling flags, one line each]
[STALE_ENTRIES from Block 2 — calendar verification failures]
[FORCE_TRANSITIONS — any DORMANT reactivations or unexpected state changes]
[CRITICAL / ELEVATED positions from RISK_SCORES]
[If nothing: "No action items."]

### Roll Scan
[ROLL_SUMMARY — full action table and position narratives]

### Force Surveillance
[SURVEILLANCE_FLAGS — one line per flagged dormant/attenuating force]
[If none: omit]

### Price Events Logged
[LOGGED_EVENTS — one line per event written this session]
[If none: omit]

### Channel Status
Drawing: {drawing_id} | Drawn: {drawn_date} | Regime: {regime}
Apex: {apex_predicted_date} | T+45 containment: ${asc_containment_t45}
[Any CHANNEL_FLAGS]
[If no active drawing: "No active drawing — run /draw-channels"]

### Catalyst Landscape — Next 45 Days ({TODAY} → {TODAY+45})
[From data\_tmp_window.json — DATE | LABEL | IMPORTANCE | T-N]
High-density weeks: [list or "none"]
NVDA earnings window: [PRE-DRIFT T-N | EARNINGS EVENT | POST-DRIFT T+N | OUTSIDE WINDOW]

### Macro Composite
Score: {composite_score} — {interpretation}
Net bullish: {net_bullish} | Net bearish: {net_bearish} | F1: {f1_multiplier}×
Active: {active} | Attenuating: {attenuating} | Dormant: {dormant}
[If NVDA_PRICE available: "NVDA: ${NVDA_PRICE}"]
[If intraday_reversal=true: "INTRADAY REVERSAL"]
[If FORCE_TRANSITIONS non-empty: list each transition]

{PORTFOLIO_BLOCK}
```

---

## Failure handling

Each block is independent. If a block fails, note the failure inline, skip that section of the report, and continue. Do not abort the run.

- Block 0 MCP failure → no price data; skip Blocks 0.3–0.5 and Block 1 force updates; continue from Block 2
- Block 1 script failure → log error; composite.py still runs; continue
- Block 2 script failure → calendar section shows "SCRIPT ERROR — verify manually"
- Block 3 → channel section shows error; continue
- Block 4 web search unavailable → roll scan shows BTC estimates as "unavailable"; still classify modes from positions data
- Block 5 subagent failure → portfolio section shows "SUBAGENT ERROR"; rest of report still valid
