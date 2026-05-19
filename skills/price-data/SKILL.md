# Price Data Skill

Automated NVDA OHLCV fetch, gap/reversal detection, and news research trigger.
Replaces the manual `/log-event` workflow for price-driven force attribution.

---

## Purpose

The price pipeline runs automatically as part of every `/status` call:

1. **Fetch** — Query Massive.com API for NVDA OHLCV since the last history entry.
2. **Process** — Detect gaps, close moves, and intraday reversals. Upsert into composite_history.json.
3. **Research** — For significant days with no entry in events.json, spawn a news research agent to identify macro force candidates.

The output feeds composite history and flags days that need force attribution, without requiring the practitioner to identify the force in real time.

---

## Trigger

This skill runs as Block A0 of every `/status` invocation. It does not have a standalone slash command.

---

## Step 1 — Determine fetch window

Read `data/composite_history.json`. Find the most recent date with `nvda_close` populated:

```powershell
# This is done inline in the /status block, not as a separate script.
# Parse last_date from composite_history.json entries where nvda_close != null.
# If no such entry exists, default to 90 days ago.
```

---

## Step 2 — Fetch OHLCV from Massive.com

Use `mcp__Massive_Market_Data__query_data` to fetch NVDA daily OHLCV from `last_date + 1 day` through today.

Expected response: array of objects with fields in one of these conventions:
- `date | open | high | low | close | volume`
- `Date | Open | High | Low | Close | Volume`
- `t_date | o | h | l | c | v`

Save raw response to `data/_tmp_prices.json`:

```powershell
# mcp__Massive_Market_Data__query_data result → write to data\_tmp_prices.json
```

If the API returns no data (no new trading days since last fetch), skip Steps 3–4 and note in status.

---

## Step 3 — Process prices

```powershell
py skills/price-data/scripts/process_prices.py --data data\_tmp_prices.json | Out-File -Encoding utf8 data\_tmp_price_result.json
```

Read `data/_tmp_price_result.json`. Fields:

```json
{
  "updated": ["2026-05-19", "2026-05-20"],
  "updated_count": 2,
  "significant": [
    {
      "date": "2026-05-20",
      "open": 135.20,
      "close": 128.45,
      "gap_pct": 2.81,
      "close_pct": -1.19,
      "intraday_reversal": true,
      "reasons": ["gap +2.81%", "intraday_reversal"]
    }
  ],
  "significant_count": 1,
  "unattributed": [...],
  "unattributed_count": 1
}
```

`significant` = days meeting any threshold (gap ≥ 1.5%, close ≥ 2.0%, reversal with close ≥ 1.0%).
`unattributed` = significant days with no entry in `data/events.json`.

---

## Step 4 — News research (conditional)

**Trigger:** `unattributed_count > 0`.

Spawn a general-purpose agent with WebSearch access. Brief:

```
Research NVDA price action on [date(s)]. Each date had significant price movement:
[list date: reason, open, close, gap_pct, close_pct, intraday_reversal]

For each date:
1. Search "[NVDA OR Nvidia] news [date]" and adjacent days.
2. Identify the most likely macro force driver from this taxonomy:
   A1 Hyperscaler Capex | A2 Enterprise AI | A3 Sovereign AI
   B1 Foundry/Packaging | B2 Taiwan Risk | B3 Power Grid
   C1 China Export Controls | C2 US Industrial Policy | C3 Fed Policy | C4 AI Antitrust
   D1 AMD | D2 Custom Silicon | D3 China Domestic Chip
   E1 Positioning/Flows | E2 Cross-Asset Risk
   F1 Narrative Validation (multiplier)
3. Note the direction (bullish/bearish) and a 1-sentence summary of the catalyst.
4. Flag if the move appears confounded (multiple simultaneous drivers).

Return a structured list: date | force_id | direction | confidence | catalyst_summary | confounded
```

Display the research findings to the user for review. **Do not write to events.json automatically.** The user reviews and decides whether to accept the attribution.

---

## Step 5 — Update composite.py call

After Block A0 produces prices, the composite.py call in Block C of `/status` uses the most recently fetched open/close for today:

- If today's date is in `updated[]` and today's `nvda_close` is populated: pass `--nvda-close`
- If today's date is in `updated[]` and only `nvda_open` was available: pass `--nvda-open`
- Otherwise: run composite.py without price flags (macro forces only)

---

## Significance thresholds

| Threshold     | Value | Trigger |
|---------------|-------|---------|
| GAP_THRESHOLD | 1.5%  | `abs(gap_pct) >= 1.5` |
| CLOSE_THRESHOLD | 2.0% | `abs(close_pct) >= 2.0` |
| REVERSAL_MIN  | 1.0%  | intraday reversal AND `abs(close_pct) >= 1.0` |

---

## Data files touched

| File | Operation | Notes |
|------|-----------|-------|
| `data/_tmp_prices.json` | Write | Raw API response. Gitignored. |
| `data/_tmp_price_result.json` | Write | process_prices.py output. Gitignored. |
| `data/composite_history.json` | Upsert | Price fields only. Composite score fields preserved. |
| `data/events.json` | Read only | Cross-reference for attribution check. Never written by this skill. |

---

## Retirement note

`/log-event` is retired. This pipeline replaces it. Force attribution is now:
1. Detected automatically via price thresholds.
2. Researched forensically by news agent.
3. Reviewed and accepted by the practitioner.
4. Written to events.json only after practitioner confirms.
