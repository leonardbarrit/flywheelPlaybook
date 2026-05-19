# Skill: Force Attribution

Classifies market events into force IDs, updates the force state machine, and recomputes the composite score.

Invoked by: `/log-event` (prospective), `macro-analyst` agent (analysis), `reconstruct_events.py` (retrospective backfill, one-time).

---

## Script call sequence

All scripts use the `py` launcher. Use file intermediates — do NOT pipe between `py` processes in PowerShell 5.1.

### Step 1 — Classify the event

```powershell
py skills/force-attribution/scripts/classify_event.py "event description" --ticker NVDA | Out-File -Encoding utf8 data\_tmp_classify.json
```

Or from JSON input:
```powershell
py skills/force-attribution/scripts/classify_event.py --json '{"description": "...", "ticker": "NVDA"}' | Out-File -Encoding utf8 data\_tmp_classify.json
```

Read the output. If `ambiguous: true` is set, use the `llm_prompt` field to resolve manually, then proceed with the resolved `primary_force_id` and `direction`.

### Step 2 — Update force state

```powershell
py skills/force-attribution/scripts/update_force_state.py `
    --force A1 `
    --direction bullish `
    --z-score 2.1 `
    --close-pct 3.4 `
    --date 2026-05-20 `
    --event-id "2026-05-20-nvda-earnings-beat"
```

Use the `primary_force_id` and `direction` from Step 1. Supply `--z-score` and `--close-pct` from the day's NVDA price data. `--event-id` format: `YYYY-MM-DD-<slug>`.

Log output will include any state transitions (e.g., `TRANSITION: A1 ACTIVE -> ATTENUATING`).

To confirm REACTIVATED → ACTIVE after 2 passes or 14 days:
```powershell
py skills/force-attribution/scripts/update_force_state.py --confirm-active A1
```

### Step 3 — Recompute composite score

```powershell
py skills/force-attribution/scripts/composite.py
```

This reads `data/forces.json` and writes `data/composite.json`. Print output shows the full composite object.

---

## Appending to events.json and outcomes.json

After Steps 1–3, append the event and outcome records to the append-only ledgers. These are **never edited in place**.

### events.json entry schema

```json
{
  "id": "2026-05-20-nvda-earnings-beat",
  "date": "2026-05-20",
  "catalyst_summary": "NVDA Q1 FY27 earnings beat: revenue $44.1B vs $43.3B est, datacenter +73% YoY",
  "source_url": "https://investor.nvidia.com/...",
  "force_attributions": [
    {"force_id": "A1", "direction": "bullish", "weight_share": 0.70},
    {"force_id": "F1", "direction": "bullish", "weight_share": 0.30}
  ],
  "f1_attribution": {"tier": 1, "entity": "NVDA itself", "multiplier": 0.1},
  "z_score_close": 2.1,
  "z_score_volume": 1.3,
  "reaction_class": "significant",
  "gap_priority": "high",
  "confounded": false,
  "confidence": "high",
  "close_pct_api": null,
  "predicted_direction": "bullish",
  "realized_direction": null,
  "resolved": false,
  "realized_date": null,
  "prediction_type": "prospective",
  "accuracy": null
}
```

For `/log-event` entries: `prediction_type` is always `"prospective"`. `realized_direction`, `resolved`, `realized_date`, `accuracy` are null/false until outcome is logged.

### outcomes.json entry schema

```json
{
  "outcome_id": "2026-05-20-nvda-earnings-beat-A1",
  "event_id": "2026-05-20-nvda-earnings-beat",
  "date_logged": "2026-05-20",
  "force_id": "A1",
  "predicted_direction": "bullish",
  "prediction_type": "prospective",
  "resolved": false,
  "realized_direction": null,
  "realized_date": null,
  "accuracy": null
}
```

One outcome entry per force_id in force_attributions. `outcome_id` format: `{event_id}-{force_id}`.

---

## Resolving an outcome

When realized_direction is known (next trading day or when the event resolves):

1. Read the event entry from `events.json` by id.
2. Compute `accuracy`: `"correct"` if predicted == realized, `"incorrect"` if both non-neutral and opposite, `null` if either is neutral.
3. Append a **corrected** outcome entry to `outcomes.json` with `resolved: true`. Do not edit the original entry.

---

## Output interpretation

### composite.json fields

| Field | Meaning |
|---|---|
| `composite_score` | Net directional signal (net_bullish + net_bearish) × F1 multiplier |
| `interpretation` | `bullish_dominant` (>2.0), `bullish_lean` (>0.5), `bearish_dominant` (<-2.0), `bearish_lean` (<-0.5), `balanced` |
| `active_force_count` | Forces in ACTIVE or REACTIVATED state |
| `attenuating_force_count` | Forces in ATTENUATING state |
| `dormant_force_count` | Forces in DORMANT state |

### State transition log

`update_force_state.py` prints transition lines to stdout. Save these in the event `catalyst_summary` or operational log if relevant. The state machine transitions are:

| From | To | Trigger |
|---|---|---|
| ACTIVE | ATTENUATING | 3 consecutive events with \|z\| < 0.5 |
| ATTENUATING | DORMANT | weight < 0.15 AND days_since_last_significant ≥ 30 |
| DORMANT | REACTIVATED | \|z\| ≥ 1.5 OR \|close_pct\| ≥ 2.0% |
| REACTIVATED | ACTIVE | `--confirm-active` (after 2 passes or 14 days) |
| REACTIVATED | DORMANT | no follow-through: days_since_last_significant ≥ 14 |

---

## Ambiguous event resolution

When `classify_event.py` returns `ambiguous: true`:

1. Read the `llm_prompt` field.
2. Apply the Flywheel force taxonomy to resolve: primary force ID, direction, secondary forces, F1 tier.
3. Consult `references/force-event-mapping.md` for the canonical mapping table.
4. Use `confidence: "medium"` for LLM-resolved events; `confidence: "high"` for keyword-matched.
5. Proceed with Step 2 using the resolved values.

---

## Key invariants

- `events.json` and `outcomes.json` are append-only. Never edit in place.
- `forces.json` is a maintained file — `update_force_state.py` edits it in place. This is correct.
- `composite.json` is a maintained file — `composite.py` overwrites it. This is correct.
- `prediction_type: "prospective"` for all `/log-event` entries. Only `reconstruct_events.py` writes `"retrospective"`.
- Phase 3 calibration must weight prospective entries more heavily due to look-ahead bias in retrospective entries.
