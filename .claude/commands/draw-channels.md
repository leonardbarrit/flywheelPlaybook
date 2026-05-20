---
description: Run the channel pipeline — fetch OHLCV, find pivots, score candidates, render chart, accept practitioner selections, compute geometry, log to channel_drawings.json. Invoke when NEW_DRAWING_REQUIRED is flagged by /status Block 3.
---

# /draw-channels

Runs the full channel pipeline from data fetch through geometry logging. Requires practitioner judgment at the selection gate. All steps run in the main context (MCP tools required for Step 1).

---

## Step 1 — Fetch 4h OHLCV

Determine the fetch window: read `data/_tmp_ohlcv_4h.json` if it exists. Check the last bar's date. If the file is absent or the last bar is more than 2 trading days stale, fetch fresh data.

```
mcp__Massive_Market_Data__query_data
  endpoint: /v2/aggs/ticker/NVDA/range/4/hour/{from}/{to}
  params: adjusted=true, sort=asc, limit=5000
  from: 6 months before today
  to:   today
```

Write raw response to `data/_tmp_ohlcv_4h.json`. Report: bar count and date range.

If the existing file is current (last bar ≤ 2 trading days ago), skip the fetch and reuse it. Say so.

---

## Step 2 — Find pivots

```powershell
py skills/channel-pipeline/scripts/find_pivots.py `
   --file data/_tmp_ohlcv_4h.json `
   --timeframe 4h `
   --window 5 `
   --out data/_tmp_pivots.json
```

Report: bar count, pivot count, anchor candidate count.

---

## Step 3 — Score candidates

```powershell
py skills/channel-pipeline/scripts/score_channels.py `
   --pivots data/_tmp_pivots.json `
   --ohlcv  data/_tmp_ohlcv_4h.json `
   --top-n  6 `
   --out    data/_tmp_candidates.json
```

Print the candidate table (ascending + descending, ranked by score).

---

## Step 4 — Render chart

```powershell
py skills/channel-pipeline/scripts/channel_chart.py `
   --candidates data/_tmp_candidates.json `
   --ohlcv      data/_tmp_ohlcv_4h.json `
   --out        data/_tmp_channel_candidates.png
```

Display the PNG. Print the numbered legend.

---

## ⛔ JUDGMENT GATE — stop here

Present the candidate table and chart to Len. Ask:

> Which candidates do you want to accept? (e.g. "1 and 7", "1 only", "1 only — no iterative pass")

Do not proceed past this point until Len responds with his selection.

**If Len accepts both an ascending and a descending candidate** → proceed to Step 5A (wedge pair).

**If Len accepts only one direction and wants an iterative pass** → proceed to Step 5B.

**If Len accepts only one direction with no iterative pass** → proceed to Step 5C (single-channel).

---

## Step 5A — Accept pair (wedge)

```powershell
py skills/channel-pipeline/scripts/select_pair.py `
   --candidates data/_tmp_candidates.json `
   --ohlcv      data/_tmp_ohlcv_4h.json `
   --accept     "{comma-separated IDs or numbers}" `
   --out        data/_tmp_accepted_pair.json
```

---

## Step 5B — Iterative pass (one direction missing)

```powershell
py skills/channel-pipeline/scripts/select_pair.py `
   --candidates    data/_tmp_candidates.json `
   --ohlcv         data/_tmp_ohlcv_4h.json `
   --pivots        data/_tmp_pivots.json `
   --accept        "{accepted ID}" `
   --iterative-pass `
   --out           data/_tmp_iterative.json
```

Re-render with `--candidates data/_tmp_iterative.json`. Display chart. Return to judgment gate for the new candidates.

Once Len selects from the iterative candidates, run select_pair.py with both accepted IDs and `--out data/_tmp_accepted_pair.json`.

---

## Step 5C — Single channel (no wedge)

```powershell
py skills/channel-pipeline/scripts/select_pair.py `
   --candidates    data/_tmp_candidates.json `
   --ohlcv         data/_tmp_ohlcv_4h.json `
   --accept        "{accepted ID}" `
   --single-channel `
   --out           data/_tmp_accepted_pair.json
```

---

## Step 6 — Compute geometry

```powershell
py skills/channel-pipeline/scripts/build_geometry.py `
   --channels data/_tmp_accepted_pair.json `
   --ohlcv    data/_tmp_ohlcv_4h.json `
   --out      data/_tmp_geometry.json
```

Report: slope, containment offset, apex date/price/days-forward, T+45 projection.

---

## Step 7 — Log to channel_drawings.json

Invoke `/log-channel` with the geometry values. Pass all confirmed anchors, the regime Len identified at the judgment gate, and a note summarizing the pipeline run.

---

## Error handling

| Error | Action |
|---|---|
| MCP fetch returns 0 bars | Check date range; retry with wider window |
| `find_pivots.py` finds < 5 anchor candidates | Report and continue — scorer handles sparse pivots |
| `score_channels.py` produces 0 scored candidates in one direction | Note it; offer iterative pass at judgment gate |
| `build_geometry.py` errors on null anchor2 | Script uses pre-scored slope fallback — if it still fails, report the error and proceed to log with pipeline slope from notes |
| Apex outside sanity window (< 5d or > 120d) | Report the warning; log the drawing with the computed value — do not discard |
