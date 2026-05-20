# data/ Manifest

Phase 1+2 deliverable. Documents every file under `data/`, its owner phase, schema, and status.
Last updated: 2026-05-20.

---

## Active files

### `positions.json`
- **Owner:** Pre-Phase-1 (existing)
- **Maintained by:** Portfolio-accountant agent via Fidelity screenshot workflow
- **Schema:** `{ _updated, _source, roth: { shares[], options[], spaxx, pendingSettlement }, hsa: { shares[], options[], openOrders[], spaxx } }`
- **Update cadence:** Each session when prices have changed; after every trade
- **Convention:** Edit in place — this is maintained state, not append-only

### `trades.json`
- **Owner:** Pre-Phase-1 (existing)
- **Maintained by:** Portfolio-accountant agent
- **Schema:** Append-only array of trade records: `{ id, date, account, action, ticker, type, strike, expiration, premium, qty, notes }`
- **Update cadence:** Append after every trade execution
- **Convention:** Append-only — never edit existing records

### `forces.json`
- **Owner:** Phase 2 (migrated from `data/archive/macro-forces.20260520/forces.json`)
- **Maintained by:** `skills/force-attribution/scripts/update_force_state.py`; macro-analyst agent
- **Schema:** `{ schema_version, updated, forces[] }` where each force has: `{ id, name, category, type, state, weight, trigger_keywords[], direction_bias, net_ytd_reaction, event_counts, last_event_date, consecutive_weak_reactions, days_since_last_significant, attenuation_trend }`
- **Update cadence:** After every force attribution pass via /status or /macro
- **Convention:** Maintained in place — update_force_state.py edits it directly. Not append-only.

### `composite.json`
- **Owner:** Phase 2 (migrated from `data/archive/macro-forces.20260520/composite.json`)
- **Maintained by:** `skills/force-attribution/scripts/composite.py`
- **Schema:** `{ date, net_bullish, net_bearish, net_directional, f1_multiplier, composite_score, active_force_count, attenuating_force_count, dormant_force_count, interpretation, source }`
- **Update cadence:** After every /log-event or /macro-update pass (composite.py is called after update_force_state.py)
- **Convention:** Overwritten in place on each recompute.

### `events.json`
- **Owner:** Phase 2 (reconstructed from `data/archive/macro-forces.20260520/events/` per-file records)
- **Maintained by:** `skills/price-data/scripts/log_price_event.py` (automated via /status); macro-analyst agent
- **Schema:** Append-only array. Each entry: `{ id, date, catalyst_summary, source_url, force_attributions[], f1_attribution, z_score_close, z_score_volume, reaction_class, gap_priority, confounded, confidence, close_pct_api, predicted_direction, realized_direction, resolved, realized_date, prediction_type, accuracy }`
  - `prediction_type`: `"retrospective"` (backfilled) or `"prospective"` (forward-looking, out-of-sample)
- **Update cadence:** Auto-appended by /status Block 0 on attributed significant days; manual append for event-driven updates
- **Convention:** Append-only — never edit existing entries

### `outcomes.json`
- **Owner:** Phase 2 (migrated from per-file event records)
- **Maintained by:** `skills/price-data/scripts/log_price_event.py` (automated via /status); macro-analyst agent
- **Schema:** Append-only array. Each entry: `{ outcome_id, event_id, date_logged, force_id, predicted_direction, prediction_type, resolved, realized_direction, realized_date, accuracy }`
  - One entry per force_id in force_attributions; outcome_id format: `{event_id}-{force_id}`
  - Resolved outcomes appended as new entries — originals not edited
- **Update cadence:** Append on every /log-event; resolved entries appended when outcome confirmed
- **Convention:** Append-only — never edit existing entries

### `calendar.json`
- **Owner:** Phase 1
- **Maintained by:** calendar-engine skill; user verifies stale entries flagged by `verify_calendar.py`
- **Schema:** Array of event objects: `{ date, type, ticker, importance, affects_forces[], primary_source_url, last_verified_date, confirmed }`
  - `type`: `"earnings"` | `"fomc"` | `"opex"` | `"economic"` | `"geopolitical"`
  - `importance`: `"critical"` | `"high"` | `"moderate"` | `"low"`
  - `affects_forces[]`: list of force IDs (e.g. `["A1","C3"]`) that this event bears on
  - `last_verified_date`: ISO date string of last human verification against `primary_source_url`
  - `confirmed`: boolean — false = estimated, true = issuer-confirmed
- **Update cadence:** Seed at Phase 1 start; append new events as they enter the 45-day window; update `last_verified_date` when verified
- **Convention:** Maintained (not append-only) — existing entries are updated when dates are confirmed or verified

### `README.md`
- **Owner:** Pre-Phase-1 (existing)
- **Status:** Predates this MANIFEST. Contains useful schema notes. Superseded by MANIFEST once MANIFEST is complete. Keep until Phase 2 is stable, then archive.

### Session output files
Point-in-time analysis outputs written by agents. Pattern: `<type>-YYYY-MM-DD.md`.
- `portfolio-status-*.md` — daily /status report (portfolio-accountant)
- `weekend-session-*.md` — weekly /weekend synthesis report
- `roll-scan-*.md` — /scan-rolls output
- `roll-eval-{TICKER}-*.md` — individual roll evaluation (roll-evaluator)
- `macro-force-*.md` — weekly force assignment (macro-analyst)

---

### `composite_history.json`
- **Owner:** Phase 3A
- **Maintained by:** `skills/force-attribution/scripts/composite.py` (called by every `/status` run)
- **Schema:** Array of daily snapshots: `{ date, composite_score, net_bullish, net_bearish, net_directional, f1_multiplier, active_forces[], attenuating_forces[], dormant_forces[], nvda_close }`
  - One entry per date. If `/status` runs multiple times in a day, the last run wins (NVDA close is preserved if not re-supplied).
  - `nvda_close`: populated when NVDA price is available in `/status` arguments or positions.json; otherwise null.
- **Update cadence:** Every `/status` run
- **Convention:** Written by composite.py only. Do not edit manually.

### `channel_drawings.json`
- **Owner:** Phase 3B / Phase 4
- **Maintained by:** `/log-channel` command; outcome fields updated on breakout resolution
- **Schema:** Array of drawing records. Each entry: `{ drawing_id, drawn_date, timeframe, ticker, regime, notes, ascending_channel: { compression_rail, containment_rail }, descending_channel: { compression_rail, containment_rail }, wedge: { apex_predicted_date, apex_days_forward_at_drawing, apex_basis, asc_containment_t45, desc_compression_t45 }, macro_context: { composite_score, composite_date, active_forces[], attenuating_forces[], dormant_forces[], f1_multiplier }, outcome: { resolved, breakout_date, breakout_direction, breakout_price, apex_prediction_error_days, premature, preceding_force_event_ids[], notes } }`
- **Update cadence:** Append new drawing on each `/log-channel` call. Update outcome block in place when breakout is resolved.
- **Convention:** New drawings are append-only. Outcome blocks are edited in place (channel drawings are maintained state). Never delete an entry — log corrections as new entries referencing the superseded drawing_id.
- **Correlation analysis:** `skills/force-calibration/scripts/channel_correlation.py` — identifies force events preceding breakouts, flags breakout-forcing force candidates.

## Phase 3B files (not yet active — gates on Phase 4)

- `channel_observations.json` — dated channel dominance observations (ascending/descending/wedge) sourced from Len's Phase 4 channel drawings. Calibration input for recalibrate_weights.py. Superseded in scope by `channel_drawings.json` which captures this and more.

---

## Archive

`data/archive/` holds files removed from active use. See individual files for archive date in name.

- `artifacts.20260518/` — Claude Chat–era JSX/HTML exploration artifacts
- `SETUP.20260518.md` — stale setup guide (referenced v12 playbook)
- `CLAUDE.20260518.md` — old CLAUDE.md version
- `macro-forces.20260520/` — legacy Phase 2 development directory; migrated to data/ root 2026-05-18; archived 2026-05-20. Contains: per-file events/, forces.json (no trigger_keywords), composite.json (frozen Apr 24), dashboard.md (contains stale earnings date error), baselines.json, nvda-ohlcv-ytd.csv, analysis scripts.
- `reconstruct_events.py` — one-time migration script (Phase 2 bootstrap); archived 2026-05-20
- `migrate_forces.py` — one-time migration script (Phase 2 bootstrap); archived 2026-05-20
- `macro-force-2026-03-23.md` — stale March session output; archived 2026-05-20
- `weekend-session-2026-03-20.md` — stale March session output; archived 2026-05-20
- `roll-eval-NVDA-2026-03-20.md` — stale March session output; archived 2026-05-20
