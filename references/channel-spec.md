# Channel Drawing Spec — Phase 4

Operational specification for NVDA price channel construction in the Flywheel Playbook.
Last updated: 2026-05-19.

This document is the authoritative reference for Phase 4 implementation. It supersedes any channel construction rules in CLAUDE.md where the two conflict.

---

## Purpose

Channel drawing produces two outputs that feed the covered call workflow:

1. **Strike screener input** — The resistance rail projected T+45 days forward gives the price level at which to sell the CC. Selling OTM relative to that projection = favorable entry. The rail does not need to be geometrically perfect; it needs to be directionally credible enough to establish a defensible strike.

2. **Wedge apex timing** — Where the ascending and descending Compression Rails converge. That date is the breakout clock. It drives mode selection (how aggressive to be) and DTE choice (how much time to sell).

Channels are analytical scaffolding, not precision instruments. The deliverable is a projected price level and an apex date, not a geometrically exact rail. Charts are inherently approximate and are used for analysis formulation and speculation, not mechanical execution.

---

## The Three-Way Regime Question

Every channel reading must answer: is recent price action

- **(a) Continuation** — fits the existing dominant channel; old trend intact
- **(b) New trend** — a new opposing channel is real and dominant; prior channel is now subordinate
- **(c) Correction** — short-term deviation within the dominant channel; base trend resumes

The algorithm cannot resolve this. It produces candidate rails for whichever regime is under evaluation. The practitioner picks the interpretation that best fits the weight of evidence, applying recency weighting (see below). The regime determination is the analysis; the channel is the tool that structures it.

This is the Stage 2 classification problem in the Phase 4 pipeline. It stays manual indefinitely unless a reliable automated classifier emerges.

---

## Recency Weighting — Intentional Methodology

More recent price action carries more evidentiary weight when positioning rails. This is not a bias to correct — it is the methodology.

**Rules:**
- Touch evidence from before a breach of the rail is discounted relative to touch evidence after the breach. A resistance level that was broken and did not reassert influence is subordinated to the current rail position.
- When two rail positions are defensible — one with more historic touches, one with more recent touches — the position that captures the most recent confirming touches is preferred.
- Older touch clusters are not ignored; they inform the initial slope estimate. But the final rail position is anchored to the most current expression of where buyers defend (support) or sellers defend (resistance).

**Implication for algorithm:** The containment rail offset is not simply "max close distance from compression rail over the full window." It is the offset that best fits the most recent confirming closes, with older evidence discounted proportionally.

No formula for the decay function has been established yet. This is an open Phase 4 question.

---

## Channel Construction Rules

### Ascending Channel

**Compression Rail (bottom, slope-defining):**
- Anchor 1: APL — Absolute Pivot Low. Lowest bar.low in the analysis window.
- Anchor 2: VFD — Validated Force Defense. First qualifying bar after APL where: (a) bar.low > immediately preceding bar's bar.low, (b) close is inside the channel boundaries.
- Slope = (VFD_price − APL_price) / (VFD_index − APL_index)
- Validates against closing-price evidence only. Wick breaches below the rail do not invalidate it.

**Containment Rail (top, parallel offset):**
- Single anchor. Parallel to Compression Rail at an offset chosen to maximize confirming recent closes near the rail.
- Validates against both closing and wick evidence — a defended wick breach (close comes back inside) is stronger confirmation than a simple touch.
- Wick-only breakouts above the rail that reverse before close do not invalidate the rail; they are "defended breaches" and constitute stronger-than-normal confirmation.
- Closing-price breach of the containment rail is an invalidation signal — re-evaluate rail position or regime.

**Touch hierarchy (descending weight):**
1. Defended breach (wick pierces, close returns inside) — strongest
2. Confirming close at or near the rail — standard
3. Historic touch before a subsequent breach — discounted
4. Isolated wick touch with no closing confirmation — weakest

### Descending Channel

Symmetric to ascending with APH / VSR terminology:
- **APH** — Absolute Pivot High. Highest bar.high in the descending analysis window.
- **VSR** — Validated Supply Rejection. Bar high of the most recent session after APH where: (a) bar.high < immediately preceding bar's bar.high, (b) close is inside the channel boundaries.

**Compression Rail (top, slope-defining):** APH + VSR.
**Containment Rail (bottom, parallel offset):** Single anchor, parallel, earned through confirming touches.

---

## Provisional Channel Mode

When fewer than ~10 bars exist in the channel segment, a VSR (or VFD for ascending) may not yet have emerged. Use provisional mode:

**Provisional compression rail:** APH + most recent close (two anchors, second is temporary).
**Provisional containment rail:** Parallel through the geometric intersection with the opposing channel's containment rail, or through the first available close within the projected channel. No empirical price anchor yet.

Label provisional channels explicitly. Upgrade to confirmed when:
- A qualifying VSR/VFD emerges (compression rail upgrades to binary-anchor validity)
- The containment rail accumulates at least one confirming close (price anchor established)

Provisional channels are valid for analysis and strike projection but carry lower confidence than confirmed channels.

---

## Wedge Construction

The Compression Wedge apex is the intersection of the ascending Compression Rail and the descending Compression Rail:

```
APL_price + slope_asc × x = APH_price + slope_desc × x
x = (APH_price − APL_price) / (slope_asc − slope_desc)
```

where x is the bar index offset from a common reference point.

**Apex as sanity check:** A credible apex should be in the future and within a reasonable range (~15–90 days forward at the time of drawing). An apex that is already behind the current bar, or more than 90 days forward, is a signal to re-examine the anchor choices or the regime classification.

---

## Algorithm Output Specification

The Phase 4 pipeline should return, for each channel:

```json
{
  "channel_id": "asc-2026-03-31",
  "direction": "ascending",
  "status": "confirmed",
  "compression_rail": {
    "anchor1": {"date": "2026-03-31", "price": 164.27, "type": "APL"},
    "anchor2": {"date": "2026-04-07", "price": 171.50, "type": "VFD"},
    "slope": 0.42
  },
  "containment_rail": {
    "anchor": {"date": "2026-05-12", "price": 236.54, "type": "defended_breach"},
    "offset": 48.30
  },
  "projection_t45": 228.50,
  "wedge_apex": {
    "date": "2026-06-02",
    "days_forward": 14
  }
}
```

`projection_t45` is the primary strike screener input. `wedge_apex.days_forward` informs mode and DTE selection.

---

## Replication With Massive.com API

**Endpoint:** `/v2/aggs/ticker/NVDA/range/4/hour/{from}/{to}` for 4-hour bars. Daily bars also valid for longer-window analysis: `/v2/aggs/ticker/NVDA/range/1/day/{from}/{to}`.

**Algorithm sketch:**

```python
# 1. Fetch bars
bars = api.get("/v2/aggs/ticker/NVDA/range/4/hour/{from}/{to}")

# 2. APL — global minimum bar.low in window
apl_idx   = bars["low"].idxmin()
apl_price = bars.loc[apl_idx, "low"]

# 3. VFD — first qualifying bar after APL
#    Criterion: bar.low > prior bar.low AND close > compression_rail(bar)
#    (requires iterative slope estimate since slope depends on VFD)

# 4. Ascending compression rail slope
slope_asc = (vfd_price - apl_price) / (vfd_idx - apl_idx)

# 5. Ascending containment rail offset
#    Simplest proxy: max(close - compression_rail(bar)) over recent N bars
#    Full implementation: recency-weighted max (decay function TBD)

# 6. APH — global maximum bar.high after a qualifying descending breakout
aph_idx   = bars["high"].idxmax()
aph_price = bars.loc[aph_idx, "high"]

# 7. VSR — first qualifying bar after APH (symmetric to VFD)
#    If no VSR yet: use current close as provisional second anchor

# 8. Descending compression rail slope (negative)
slope_desc = (vsr_price - aph_price) / (vsr_idx - aph_idx)

# 9. Descending containment rail
#    If no price anchor: geometric intersection with ascending containment rail
#    Flag as provisional

# 10. Wedge apex
apex_bars_from_apl = (aph_price - apl_price) / (slope_asc - slope_desc)
apex_date = bars.index[apl_idx + int(apex_bars_from_apl)]

# 11. T+45 projections
t45_idx = current_idx + 45 * bars_per_day
asc_containment_t45 = apl_price + slope_asc * (t45_idx - apl_idx) + offset_asc
desc_compression_t45 = aph_price + slope_desc * (t45_idx - aph_idx)
```

---

## Open Questions for Phase 4 Implementation

These are explicitly unresolved. Do not fill with assumptions.

1. **Recency decay function** — How rapidly do older touches lose weight relative to recent ones? No formula established. Initial approach: sliding window (only touches in last N bars count for containment rail positioning), with N to be determined empirically.

2. **VFD iteration** — Computing VFD requires the channel slope, which requires VFD. Resolve with: (a) initial slope estimate from APL + next local low, (b) iterate once to find qualifying VFD, (c) recompute slope. One pass is usually sufficient.

3. **Regime transition detection** — When does a provisional descending channel graduate from "short-term correction" to "new dominant trend"? No rule established. Candidate signals: descending compression rail holds for N bars, ascending containment rail breached on close, wedge apex within 10 days.

4. **Multi-timeframe consistency** — 4-hour channels and daily channels will produce different slopes for the same price action. Which timeframe is authoritative for strike projection? Likely daily for DTE > 21, 4-hour for DTE ≤ 21. Unconfirmed.

5. **Containment rail upgrade path** — How many confirming touches are required to upgrade a provisional containment rail to confirmed? One touch is the minimum stated in v22; a stronger rule (e.g., two independent touches in different sessions) may reduce false confirmations.

---

## What This Spec Does Not Cover

- Oscillating / range-bound regime (no channel, no slope)
- Multi-channel scenarios (ascending channel containing a smaller descending correction)
- Intraday channel construction (sub-4-hour)
- Backtesting or historical accuracy assessment (Phase 3B gate)

These are deferred until the core ascending/descending single-channel case is stable.
