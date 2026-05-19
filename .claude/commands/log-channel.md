# /log-channel

Record a channel drawing into `data/channel_drawings.json`. Computes slope, apex, and T+45 projection from supplied anchors. Cross-references current composite.json for macro context at time of drawing.

Usage:
```
/log-channel
  --apl-date YYYY-MM-DD --apl-price N
  --vfd-date YYYY-MM-DD --vfd-price N          (omit if VFD not yet identified)
  --aph-date YYYY-MM-DD --aph-price N          (omit if no descending channel)
  --vsr-date YYYY-MM-DD --vsr-price N          (omit if provisional — current close used)
  --asc-cont-date YYYY-MM-DD --asc-cont-price N  (ascending containment rail anchor)
  --desc-cont-date YYYY-MM-DD --desc-cont-price N  (omit if geometric intersection only)
  --regime ascending_dominant|descending_dominant|converging
  --timeframe 4h|1d                            (default 4h)
  --note "free text"
```

All anchor arguments refer to price pivots the practitioner reads directly from the Fidelity chart.

---

## Execution protocol

### Step 1 — Validate inputs

Required minimum: `--apl-date`, `--apl-price`, `--regime`.

If `--vfd-date` and `--vfd-price` are absent, mark compression rail status `"partial"` and log VFD as null. Slope and apex are not computable without VFD; mark them null.

If `--aph-date` and `--aph-price` are absent, omit the descending channel block entirely.

If `--vsr-date` and `--vsr-price` are absent but APH is supplied, use today's close as provisional VSR and mark descending compression rail status `"provisional"`.

### Step 2 — Compute derived values

When both compression rail anchors are available (APL + VFD, or APH + VSR):

**Slope (price per bar):**
For 4h bars: count 4-hour bars between anchor dates (approximately 6.5 trading hours/day ÷ 4h = ~1.6 bars/day).
For 1d bars: count calendar trading days between anchor dates.

```
slope = (anchor2_price - anchor1_price) / bar_count(anchor1_date, anchor2_date)
```

**Containment rail offset:**
```
offset = asc_cont_price - (apl_price + slope * bar_count(apl_date, asc_cont_date))
```

**Wedge apex (bar index from APL):**
```
# Where ascending compression rail = descending compression rail
# apl_price + slope_asc * x = aph_price + slope_desc * x
# x = (aph_price - apl_price) / (slope_asc - slope_desc)
apex_bars_from_apl = (aph_price - apl_price) / (slope_asc - slope_desc)
apex_date = apl_date + apex_bars_from_apl bars
apex_days_forward = trading_days(today, apex_date)
```

**T+45 projections (from today):**
```
t45_bars_from_apl = bar_count(apl_date, today + 45 trading days)
asc_containment_t45 = apl_price + slope_asc * t45_bars_from_apl + offset_asc
desc_compression_t45 = aph_price + slope_desc * bar_count(aph_date, today + 45 trading days)
```

If slopes are not computable (partial status), set T+45 projections to null.

### Step 3 — Read macro context

Read `data/composite.json`. Extract: `composite_score`, `date`, `active_force_count`, `attenuating_force_count`, `dormant_force_count`, `f1_multiplier`. Read `data/forces.json` for active/attenuating/dormant force ID lists.

### Step 4 — Build and append entry

Generate `drawing_id` as `draw-{today}-{NNN}` where NNN is a zero-padded sequence number (count existing entries for today + 1).

Build entry per this schema:

```json
{
  "drawing_id": "draw-YYYY-MM-DD-NNN",
  "drawn_date": "YYYY-MM-DD",
  "timeframe": "4h|1d",
  "ticker": "NVDA",
  "regime": "ascending_dominant|descending_dominant|converging",
  "notes": "{--note value or null}",

  "ascending_channel": {
    "compression_rail": {
      "anchor1": {"date": "{apl_date}", "price": {apl_price}, "type": "APL", "confirmed": true},
      "anchor2": {"date": "{vfd_date or null}", "price": {vfd_price or null}, "type": "VFD", "confirmed": {true if supplied, false if null}},
      "slope_per_4h_bar": {computed or null},
      "status": "confirmed|partial|provisional"
    },
    "containment_rail": {
      "anchor": {"date": "{asc_cont_date}", "price": {asc_cont_price}, "type": "confirmed_touch|defended_breach", "confirmed": true},
      "offset_from_compression": {computed or null},
      "status": "confirmed|provisional"
    }
  },

  "descending_channel": {
    "compression_rail": {
      "anchor1": {"date": "{aph_date}", "price": {aph_price}, "type": "APH", "confirmed": true},
      "anchor2": {"date": "{vsr_date}", "price": {vsr_price}, "type": "VSR|provisional_VSR", "confirmed": {true if VSR, false if provisional}},
      "slope_per_4h_bar": {computed or null},
      "status": "confirmed|provisional"
    },
    "containment_rail": {
      "anchor": {"date": "{desc_cont_date or null}", "price": {desc_cont_price or null}, "type": "confirmed_touch|geometric_intersection", "confirmed": {true if supplied, false if geometric}},
      "offset_from_compression": {computed or null},
      "status": "confirmed|provisional"
    }
  },

  "wedge": {
    "apex_predicted_date": "{computed or null}",
    "apex_days_forward_at_drawing": {computed or null},
    "apex_basis": "computed|visual_estimate",
    "asc_containment_t45": {computed or null},
    "desc_compression_t45": {computed or null}
  },

  "macro_context": {
    "composite_score": {from composite.json},
    "composite_date": "{composite.json date}",
    "active_forces": [{list from forces.json}],
    "attenuating_forces": [{list}],
    "dormant_forces": [{list}],
    "f1_multiplier": {value}
  },

  "outcome": {
    "resolved": false,
    "breakout_date": null,
    "breakout_direction": null,
    "breakout_price": null,
    "apex_prediction_error_days": null,
    "premature": null,
    "preceding_force_event_ids": [],
    "notes": null
  }
}
```

Read `data/channel_drawings.json`, append the new entry, write the file.

### Step 5 — Output summary

```
Channel drawing logged: {drawing_id}
Regime: {regime} | Timeframe: {timeframe}
Ascending compression: APL {apl_date} ${apl_price} → VFD {vfd_date or "not yet"} ${vfd_price or "—"}
  Slope: {slope or "not computable"} | Containment offset: {offset or "not computable"}
Descending compression: APH {aph_date} ${aph_price} → VSR {vsr_date} ${vsr_price} ({provisional if applicable})
Wedge apex: {apex_date or "not computable"} (T+{days} from today)
T+45 projections: Asc containment ${asc_t45 or "—"} | Desc compression ${desc_t45 or "—"}
Macro composite: {composite_score} as of {composite_date}
```

---

## Resolving an outcome

When a breakout occurs (price closes outside both channel boundaries, or price action clearly breaks one rail), update the outcome block:

```
/log-channel --resolve {drawing_id}
  --breakout-date YYYY-MM-DD
  --breakout-direction ascending|descending
  --breakout-price N
  --preceding-events {event_id1,event_id2,...}   (from events.json)
  --notes "free text"
```

Computed fields on resolution:
- `apex_prediction_error_days = breakout_date - apex_predicted_date` (negative = premature)
- `premature = true if apex_prediction_error_days < 0`

Read channel_drawings.json, find the entry by drawing_id, update its outcome block, write the file.

---

## Key invariants

- `channel_drawings.json` is append-only for new drawings. Outcome updates edit the existing entry in place (unlike events.json — channels are maintained state, not a pure ledger).
- Never delete a drawing entry. If a channel was drawn incorrectly, log a corrected version as a new entry and note the superseded drawing_id in `notes`.
- Provisional channels are valid entries. Log them; upgrade in place when they become confirmed.
