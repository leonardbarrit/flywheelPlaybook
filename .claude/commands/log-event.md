# /log-event

Log a market event into the force attribution pipeline. Classifies the event, updates force states, recomputes the composite score, and appends to events.json and outcomes.json.

Usage: `/log-event "event description" [--ticker TICKER] [--date YYYY-MM-DD] [--open-pct N] [--close-pct N] [--z-score N]`

All arguments after the description are optional. If `--date` is omitted, today's date is used. Supply `--open-pct` for the gap open move and `--close-pct` for the day's close move. When both are supplied and their directions diverge, `intraday_reversal` is set to true on the event entry.

---

## Execution protocol

### Step 1 — Classify

```powershell
py skills/force-attribution/scripts/classify_event.py "$ARGS[0]" | Out-File -Encoding utf8 data\_tmp_classify.json
```

Read `data\_tmp_classify.json`.

If `ambiguous: true`:
- Use the `llm_prompt` field to resolve classification manually against `references/force-event-mapping.md`.
- Set `confidence: "medium"` for the resolved entry.
- Do not proceed until classification is resolved.

### Step 2 — Update force state

Using the `primary_force_id` and `direction` from Step 1:

```powershell
py skills/force-attribution/scripts/update_force_state.py `
    --force {primary_force_id} `
    --direction {direction} `
    --z-score {z_score} `
    --close-pct {close_pct} `
    --date {date} `
    --event-id "{event_id}"
```

`event-id` format: `YYYY-MM-DD-<slug>` where slug is a short lowercase hyphenated summary of the catalyst.

Capture and display any state transition log lines.

### Step 3 — Recompute composite

```powershell
py skills/force-attribution/scripts/composite.py
```

Display the resulting composite_score and interpretation.

### Step 4 — Append to events.json

Read the current `data/events.json`. Build a new entry with this schema:

```json
{
  "id": "{event_id}",
  "date": "{date}",
  "catalyst_summary": "{description}",
  "source_url": null,
  "force_attributions": [
    {"force_id": "{primary_force_id}", "direction": "{direction}", "weight_share": 1.0}
  ],
  "f1_attribution": null,
  "open_pct": {open_pct or null},
  "close_pct": {close_pct or null},
  "intraday_reversal": {true if open_pct and close_pct have opposite signs, else null},
  "z_score_close": {z_score},
  "z_score_volume": null,
  "reaction_class": null,
  "gap_priority": null,
  "confounded": {confounded},
  "confidence": "{confidence}",
  "close_pct_api": {close_pct or null},
  "predicted_direction": "{direction}",
  "realized_direction": null,
  "resolved": false,
  "realized_date": null,
  "prediction_type": "prospective",
  "accuracy": null
}
```

If `secondary_forces` were returned by classify, include them in `force_attributions` with `weight_share` distributed proportionally (primary gets 0.60, each secondary gets equal share of remaining 0.40). If F1 tier was returned, populate `f1_attribution`.

Append the entry to the array in `events.json` and write the file.

### Step 5 — Append to outcomes.json

Read `data/outcomes.json`. Create one outcome entry per force in `force_attributions`:

```json
{
  "outcome_id": "{event_id}-{force_id}",
  "event_id": "{event_id}",
  "date_logged": "{today}",
  "force_id": "{force_id}",
  "predicted_direction": "{direction for this force}",
  "prediction_type": "prospective",
  "resolved": false,
  "realized_direction": null,
  "realized_date": null,
  "accuracy": null
}
```

Append all outcome entries and write the file.

### Step 6 — Output summary

Print a concise summary:

```
Event logged: {event_id}
Primary force: {primary_force_id} ({direction}) — confidence: {confidence}
Secondary forces: {list or "none"}
State transitions: {list or "none"}
Composite score: {composite_score} ({interpretation})
Entries appended: events.json (+1), outcomes.json (+{N})
```

---

## Key invariants

- `prediction_type` is always `"prospective"` for `/log-event` entries.
- Never edit existing entries in events.json or outcomes.json — append only.
- If z_score or close_pct are not supplied, use 0.0 and note in the summary.
- Clean up `data\_tmp_classify.json` after use.
