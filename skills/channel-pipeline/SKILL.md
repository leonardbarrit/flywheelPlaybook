# channel-pipeline — Phase 4

Generates ranked channel candidates from OHLCV data and renders them for practitioner selection.
Outputs: accepted channel pair → apex date, T+45 strike projection → logged to channel_drawings.json.

---

## Workflow

### Step 1 — Fetch 4h OHLCV (main context, MCP)

```
mcp__Massive_Market_Data__query_data
  endpoint: /v2/aggs/ticker/NVDA/range/4/hour/{from}/{to}
  params: adjusted=true, sort=asc, limit=5000
  from: 3–6 months before today
  to:   today
```

Write raw response to `data/_tmp_ohlcv_4h.json`.

### Step 2 — Find pivots

```powershell
py skills/channel-pipeline/scripts/find_pivots.py \
   --file data/_tmp_ohlcv_4h.json \
   --timeframe 4h \
   --window 5 \
   --out data/_tmp_pivots.json
```

Check output: bar count, pivot count, anchor candidate count.

### Step 3 — Score candidates

```powershell
py skills/channel-pipeline/scripts/score_channels.py \
   --pivots data/_tmp_pivots.json \
   --ohlcv  data/_tmp_ohlcv_4h.json \
   --top-n  6 \
   --out    data/_tmp_candidates.json
```

Review the printed candidate table (ascending + descending, ranked by score).

### Step 4 — Render chart

```powershell
py skills/channel-pipeline/scripts/channel_chart.py \
   --candidates data/_tmp_candidates.json \
   --ohlcv      data/_tmp_ohlcv_4h.json \
   --out        data/_tmp_channel_candidates.png
```

Display the PNG. Show the numbered legend to the practitioner.

**Practitioner judgment gate:** The practitioner reviews the chart and identifies which candidates to keep. Regime classification (the three-way a/b/c question) is made here. The algorithm's suggestion (highest-scoring = prevailing) is advisory only.

### Step 5 — Accept selections

```powershell
py skills/channel-pipeline/scripts/select_pair.py \
   --candidates data/_tmp_candidates.json \
   --ohlcv      data/_tmp_ohlcv_4h.json \
   --accept     "asc-2026-04-03-r0,desc-2026-05-12-r0" \
   --out        data/_tmp_accepted_pair.json
```

If only one direction accepted and iterative pass is wanted:
```powershell
py skills/channel-pipeline/scripts/select_pair.py \
   --candidates    data/_tmp_candidates.json \
   --ohlcv         data/_tmp_ohlcv_4h.json \
   --pivots        data/_tmp_pivots.json \
   --accept        "asc-2026-04-03-r0" \
   --iterative-pass \
   --out           data/_tmp_iterative.json
```

Then re-render chart with `--candidates data/_tmp_iterative.json` and re-accept.

For single-channel (no wedge):
```powershell
py skills/channel-pipeline/scripts/select_pair.py \
   --candidates    data/_tmp_candidates.json \
   --ohlcv         data/_tmp_ohlcv_4h.json \
   --accept        "asc-2026-04-03-r0" \
   --single-channel \
   --out           data/_tmp_accepted_pair.json
```

### Step 6 — Compute geometry

```powershell
py skills/channel-pipeline/scripts/build_geometry.py \
   --channels data/_tmp_accepted_pair.json \
   --ohlcv    data/_tmp_ohlcv_4h.json \
   --out      data/_tmp_geometry.json
```

Outputs: slope, containment offset, apex date/price/days-forward, T+45 projection.

### Step 7 — Log to channel_drawings.json

Use `/log-channel` with the geometry output values, or append directly to
`data/channel_drawings.json` per the schema in `data/MANIFEST.md`.

---

## Human judgment gates

| Gate | What the algorithm provides | What Len decides |
|---|---|---|
| Regime (a/b/c) | Highest-scoring candidate labeled as suggested prevailing | Continuation / new trend / correction |
| Direction | Both ascending and descending candidates shown | Which direction is prevailing, which is opposing |
| Containment anchor | Offset computed from recency-weighted closes | Override if visual position differs |
| Iterative pass | Offer when one direction is missing | Accept or decline (single-channel is valid) |

The algorithm never autonomously selects the final pair. Practitioner selection is always the authoritative step.

---

## Script reference

| Script | Input | Output |
|---|---|---|
| `find_pivots.py` | OHLCV JSON | Pivot list with velocity/acceleration |
| `score_channels.py` | Pivots + OHLCV | Ranked candidates per direction |
| `channel_chart.py` | Candidates + OHLCV | PNG chart with numbered legend |
| `select_pair.py` | Candidates + accepted IDs | Accepted pair or iterative candidates |
| `build_geometry.py` | Accepted pair + OHLCV | Slope, offset, apex, T+45 |

---

## Temp files (not persisted)

All `data/_tmp_*.json` and `data/_tmp_channel_candidates.png` are working files.
They are overwritten on each run and are not tracked in version control.
The only persistent output is the entry appended to `data/channel_drawings.json`.

---

## Tuning parameters

Located at the top of each script. Do not adjust without empirical justification.

| Parameter | Script | Default | Meaning |
|---|---|---|---|
| `window` | find_pivots.py | 5 bars | Local extrema search radius |
| `accel_percentile` | find_pivots.py | 75 | Top N% of acceleration = anchor candidate |
| `LOOKBACK_STEP_DAYS` | score_channels.py | 21 | ~1 month between backwards-search steps |
| `VELOCITY_TOL_PCT` | score_channels.py | 30% | Velocity similarity for constituency |
| `RECENCY_DECAY_BASE` | score_channels.py | 1.05 | Per-step recency discount multiplier |
| `ENVELOPMENT_WEIGHT` | score_channels.py | 0.25 | Absorbed sub-candidate score fraction |
| `DEFAULT_CONTAINMENT_WINDOW_DAYS` | build_geometry.py | 30 | Lookback for containment offset |
| `APEX_MIN_DAYS / APEX_MAX_DAYS` | build_geometry.py | 5 / 120 | Apex sanity check bounds |
