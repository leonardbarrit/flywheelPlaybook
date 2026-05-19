# Skill: calendar-engine

Maintains and queries the 45-day forward catalyst calendar. Called by `/status` and `/weekend`.

---

## When to invoke

- Every `/status` run — provides the forward window and staleness check
- Every `/weekend` run — provides the catalyst landscape for mode and roll decisions
- When Len asks "what's in the next N days" or "when is the next FOMC/earnings"
- When `verify_calendar.py` flags stale entries — surface action items to Len

---

## Script call sequence for /status

Run all scripts from within `skills/calendar-engine/scripts/`. All scripts require Python 3.11+.

```bash
# 1. Build the forward window (merges calendar.json + computed OPEX + embedded FOMC)
python forward_window.py --from YYYY-MM-DD --days 45

# 2. Check for stale entries (run in parallel with step 1)
python verify_calendar.py --as-of YYYY-MM-DD

# 3. Compute density from the window output
python forward_window.py --from YYYY-MM-DD --days 45 | python compute_density.py
```

Use today's date for YYYY-MM-DD.

---

## Interpreting output

### forward_window.py
- `events[]` — sorted list of all catalyst events in the 45-day window
- `density` — events per ISO week; weeks with `high_density: true` need attention

### verify_calendar.py
- `stale[]` — entries past their staleness threshold. Each has `action` with the URL to check.
- `unverified[]` — entries with null `last_verified_date` — need a first verification pass
- `clean: true` — no action needed

### compute_density.py
- `high_density_weeks[]` — weeks with ≥3 catalyst events; flag in /status output
- `peak_week` — the busiest week in the window

---

## Maintaining calendar.json

`data/calendar.json` holds manually-maintained events (earnings, economic, geopolitical). Do not store computed events (OPEX, FOMC) — those are generated at runtime.

**To add an event:**
Append to `data/calendar.json`:
```json
{
  "date": "YYYY-MM-DD",
  "type": "earnings",
  "ticker": "NVDA",
  "importance": "critical",
  "affects_forces": ["A1", "A2", "A3"],
  "primary_source_url": "https://investor.nvidia.com/...",
  "last_verified_date": "YYYY-MM-DD",
  "confirmed": true,
  "label": "NVDA Q1 FY27 Earnings"
}
```

**To update a verified date:**
Edit the entry's `last_verified_date` to today. If the event date itself changed, update `date` and set `confirmed` accordingly.

**Event types:** `earnings` | `fomc` | `opex` | `economic` | `geopolitical`
**Importance levels:** `critical` | `high` | `moderate` | `low`

---

## Staleness thresholds (from verify_calendar.py)

| Type | Days before flagged stale |
|------|--------------------------|
| earnings | 14 |
| fomc | 30 |
| opex | N/A (computed) |
| economic | 14 |
| geopolitical | 7 |

---

## Earnings calendar position logic

For NVDA earnings specifically, classify the current date into one of three windows:

- **Pre-earnings drift** (T-21 to T-1): Bullish positioning bias, IV ramp. CC premium is elevated. Be cautious entering new CCs — Mode 2 rules apply.
- **Earnings event** (T-0 ± 1): Binary catalyst. Do not open new positions. Evaluate existing positions for Earnings Shield coverage.
- **Post-earnings drift** (T+1 to T+10): Direction set by print. IV crush dominant on short-vol side.
- **Outside window**: Standard mode selection rules apply.

Surface the current window position in every `/status` output.

---

## Key invariant

A hardcoded earnings date CANNOT go stale silently. If `verify_calendar.py` returns any entries in `stale[]` or `unverified[]`, `/status` MUST show these as action items — labeled **CALENDAR VERIFICATION REQUIRED** — before the rest of the status output.
