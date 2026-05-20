# Channel Drawing Spec — Phase 4

Operational specification for NVDA price channel construction in the Flywheel Playbook.
Last updated: 2026-05-19.

This document is the authoritative reference for Phase 4 implementation. It supersedes any channel construction rules in CLAUDE.md where the two conflict.

---

## Purpose

Channel drawing produces two outputs that feed the covered call workflow:

1. **Strike screener input** — The prevailing containment rail projected T+45 days forward gives the price level at which to sell the CC. Selling OTM relative to that projection = favorable entry. The rail does not need to be geometrically perfect; it needs to be directionally credible enough to establish a defensible strike.

2. **Wedge apex timing** — Where the prevailing and opposing Compression Rails converge. That date is the breakout clock. It drives mode selection (how aggressive to be) and DTE choice (how much time to sell).

Channels are analytical scaffolding, not precision instruments. The deliverable is a projected price level and an apex date, not a geometrically exact rail.

---

## The Three-Way Regime Question

Every channel reading must answer: is recent price action

- **(a) Continuation** — fits the existing dominant channel; old trend intact
- **(b) New trend** — a new opposing channel is real and dominant; prior channel is now subordinate
- **(c) Correction** — short-term deviation within the dominant channel; base trend resumes

The algorithm cannot resolve this. It produces scored candidate channels and proposes a prevailing/opposing pair. The practitioner makes the final determination by selecting among candidates. This stays manual indefinitely.

---

## Recency Weighting — Intentional Methodology

More recent price action carries more evidentiary weight when positioning rails.

- Touch evidence from before a breach of the rail is discounted relative to touch evidence after the breach.
- When two rail positions are defensible, prefer the one capturing the most recent confirming closes.
- Older touch clusters inform the initial slope estimate but do not override recent evidence.

**Implication for the algorithm:** The backwards-iterative anchor search prioritizes recent inflection points over historically significant but superseded ones. The recency discount in the scoring function operationalizes this — older anchors require proportionally stronger length×slope quality to compete.

No formula for the recency decay function has been established. This is an open Phase 4 question.

---

## Interaction Model

The Phase 4 pipeline replaces manual anchor input with algorithm-proposed candidate selection.

**Old model (manual):** Practitioner reads 6 anchor prices from the Fidelity chart, supplies them as arguments, command computes and logs. High data-entry burden; algorithm adds little.

**New model (candidate selection):**

```
1. Algorithm runs → generates ranked candidate channels (both directions)
2. Chart rendered → all candidates visible simultaneously with labels
3. Practitioner toggles off incorrect candidates → accepted set is authoritative
4. If only one direction remains → iterative pass offered (elective)
5. Geometry runs on accepted set → apex, T+45, containment offset computed
6. Result logged to channel_drawings.json
```

Human input collapses to one judgment step: view the candidate chart, reject the wrong ones, optionally request a second pass for a missing direction. The algorithm handles all anchor identification, slope computation, and geometry.

---

## Algorithm Design

### Layer 1 — Pivot Detection

Using trendln (or equivalent), identify all local minima and maxima in the OHLCV window.

At each pivot compute:
- **Velocity** — Δprice from the previous pivot to this one (first finite difference of the pivot sequence)
- **Acceleration** — Δvelocity from the prior interval to this one (second finite difference)

**Pivot classification:**
- High acceleration = genuine inflection point = anchor candidate (APL/APH)
- Low acceleration = sustained directional move = constituency member or containment evidence

The acceleration threshold for "genuine inflection" is determined empirically from the first batch of confirmed drawings. No fixed value established yet.

### Layer 2 — Candidate Channel Generation (Direction-Agnostic)

For each high-acceleration pivot, generate a candidate channel in its natural direction:
- Low pivot (local minimum) → ascending channel candidate
- High pivot (local maximum) → descending channel candidate

**Backwards-iterative anchor search:** Starting from today, step back in approximately one-month increments. At each step, the most recent high-acceleration pivot of each direction is the anchor candidate at that lookback depth. This ensures recency-first ordering without hard cutoffs and mirrors the manual drawing process.

For each anchor, collect its **constituency**: subsequent same-direction pivots satisfying:
- Similar velocity signature (within a defined tolerance — calibrate empirically)
- Low acceleration (they are oscillations, not new inflections)

The velocity coherence requirement is the primary width control. Pivots with divergent velocity belong to a different trend regime and cannot join the channel constituency regardless of their position.

**Envelopment scoring (optional bonus):** For each candidate channel, check how many lower-scoring sub-candidates of either direction have their pivots contained within the channel's rail boundaries. Each absorbed sub-candidate adds a fraction of its score to the absorbing channel. This rewards channels that structurally explain the smaller directional moves rather than competing with them.

### Layer 3 — Scoring

Applied identically to all candidates regardless of direction:

```
quality_score = trading_days_spanned × (1 / |slope_per_bar|)
final_score   = (quality_score + envelopment_bonus) / recency_discount(anchor_age_days)
```

**Bias toward longer and shallower trends:** The length×(1/slope) product amplifies naturally. A channel twice as long and half as steep scores 4× higher. This mirrors the methodology preference for structural equilibrium trends over momentum bursts. Shallow trends also produce low internal acceleration in their constituencies — the two criteria reinforce without separate tuning.

**Recency discount:** Increases with anchor age. A recent anchor that is also long and shallow wins outright. An older anchor with exceptional quality can overcome the discount if the quality gap is large. There is no hard recency cutoff — the discount is continuous.

### Layer 4 — Human Selection

The chart renders all candidate channels simultaneously:
- Ascending candidates in one color family, descending in another
- Each labeled with: rank, score, slope ($/bar), span (trading days)
- Compression and containment rails shown together per candidate — the full channel visible, not just the slope rail
- Candidates numbered for reference

Practitioner input: specify which candidates to reject (by number). Remaining candidates are accepted. The accepted set is authoritative — the algorithm's prevailing/opposing suggestion is advisory only.

**Iterative pass (elective):**

After selection, check: are both directions represented?

- Both directions present → proceed to geometry. No iterative pass.
- Only one direction present → offer an iterative pass for the missing direction.
  - Iterative pass relaxes parameters: longer lookback window, lower acceleration threshold, wider velocity tolerance.
  - Generates a new candidate set for the missing direction only.
  - Practitioner selects from the new set or declines.
  - Declining is valid — a single-channel result (no wedge) still produces a T+45 strike projection.

### Layer 5 — Geometry

**Containment rail offset:** Parallel to the accepted compression rail. Offset = recency-weighted maximum distance from the compression rail to qualifying closes in the window. Recent confirming closes weighted more heavily. Specific decay function TBD (open question).

**Wedge apex — corrected general formula (direction-agnostic):**

For prevailing channel P anchored at (t_P, price_P) with slope_P, and opposing channel O anchored at (t_O, price_O) with slope_O:

```
# Rail equations (t = bar index from common reference)
price_P(t) = price_P + slope_P × (t - t_P)
price_O(t) = price_O + slope_O × (t - t_O)

# Apex: solve price_P(t) = price_O(t)
t_apex = (price_O - price_P - slope_O × t_O + slope_P × t_P) / (slope_P - slope_O)
```

Note: the prior formula `(APH - APL) / (slope_asc - slope_desc)` was incorrect — it implicitly assumed both rails share the same anchor reference point. The corrected formula uses each rail's own anchor coordinates.

**Apex sanity check:** A credible apex should be forward-looking and within a reasonable range (10–90 days at time of drawing). An apex in the past, or beyond 90 days, is a signal to re-examine anchor choices or regime classification.

**Opposing channel apex constraint:** During Layer 2 candidate generation for the opposing direction, filter out candidates where the implied apex falls outside the actionable window:

```
convergence_rate = |slope_opposing| + |slope_prevailing|   (if converging)
apex_days        = current_spread_between_rails / convergence_rate
constraint:      apex_days ∈ [10, 60]   (days — calibrate empirically)
```

Among candidates satisfying the window: prefer most recent anchor, then shallowest slope. A shallow opposing channel means measured sustained resistance — structurally real, not a spike, and produces an apex in a useful timeframe.

**T+45 projections:**

```
t45_bars_from_P_anchor = bar_count(P_anchor_date, today + 45 trading days)
prevailing_containment_t45 = price_P + slope_P × t45_bars_from_P_anchor + offset_P
```

This is the primary strike screener output.

---

## Channel Construction Rules

### Vocabulary

- **APL** — Absolute Pivot Low. Lowest bar.low in the ascending analysis window. First anchor of the ascending Compression Rail.
- **VFD** — Validated Force Defense. First qualifying bar after APL where: (a) bar.low > immediately preceding bar's bar.low, (b) close is inside the channel boundaries.
- **APH** — Absolute Pivot High. Highest bar.high in the descending analysis window.
- **VSR** — Validated Supply Rejection. Symmetric to VFD for descending channels.

These labels describe the pivot types for each direction. The assignment of which channel is "prevailing" and which is "opposing" is determined by scoring, not by direction.

### Compression Rail

Two-anchor, slope-defining. Validates against closing-price evidence only. Wick breaches do not invalidate the rail.

### Containment Rail

Parallel to compression rail at an offset that maximizes confirming recent closes near the rail. Single-anchor (validity earned through confirming touches). Validates against both closing and wick evidence.

**Touch hierarchy (descending weight):**
1. Defended breach (wick pierces, close returns inside) — strongest
2. Confirming close at or near the rail — standard
3. Historic touch before a subsequent breach — discounted
4. Isolated wick touch with no closing confirmation — weakest

### Provisional Channel Mode

When fewer than ~10 bars exist in the channel segment:
- **Provisional compression rail:** anchor1 + most recent close (second anchor is temporary)
- **Provisional containment rail:** parallel through geometric intersection with the opposing channel, or first available close within the projected channel

Label provisional channels explicitly. Upgrade when:
- A qualifying VFD/VSR emerges (compression rail achieves binary-anchor validity)
- The containment rail accumulates at least one confirming close

Provisional channels are valid for analysis and strike projection but carry lower confidence.

---

## Algorithm Output Specification

For each accepted channel:

```json
{
  "channel_id": "asc-2026-04-03",
  "direction": "ascending",
  "role": "prevailing",
  "status": "confirmed",
  "score": 142.7,
  "compression_rail": {
    "anchor1": {"date": "2026-04-03", "price": 164.27, "type": "APL"},
    "anchor2": {"date": "2026-04-10", "price": 171.50, "type": "VFD"},
    "slope_per_4h_bar": 0.643,
    "trading_days_spanned": 47
  },
  "containment_rail": {
    "anchor": {"date": "2026-05-13", "price": 226.96, "type": "confirmed_touch"},
    "offset": 32.43
  },
  "projection_t45": 265.00,
  "wedge": {
    "apex_date": "2026-06-02",
    "apex_days_forward": 14,
    "apex_price": 214.50
  }
}
```

`projection_t45` is the primary strike screener input. `wedge.apex_days_forward` informs mode and DTE selection.

---

## Directory Structure

```
skills/channel-pipeline/
├── SKILL.md
└── scripts/
    ├── find_pivots.py       pivot detection; velocity/acceleration at each pivot
    ├── score_channels.py    candidate scoring; envelopment; ranked output per direction
    ├── channel_chart.py     multi-candidate render with labels; primary interaction surface
    ├── select_pair.py       iterative pass logic; apex window filter for opposing candidates
    └── build_geometry.py    containment offset; apex (corrected formula); T+45 projection
```

### Build Order

1. `find_pivots.py` — foundational; deterministic; testable against known OHLCV data
2. `build_geometry.py` — define clean output interface before working inward; pure math
3. `score_channels.py` — scoring, velocity coherence, envelopment
4. `channel_chart.py` — multi-candidate visualization; central to interaction model
5. `select_pair.py` — iterative pass, apex window filter
6. `SKILL.md` — documents the selection workflow and human judgment gates

---

## Open Questions

These are explicitly unresolved. Do not fill with assumptions.

1. **Recency decay function** — Sliding window vs exponential decay for containment offset weighting; N to be determined empirically from first confirmed drawings.

2. **Velocity tolerance for constituency grouping** — How similar must pivot velocities be to count as the same channel (±X% of anchor velocity); calibrate against manual drawings.

3. **Acceleration threshold for anchor qualification** — What magnitude constitutes a genuine inflection; data-driven from the first pivot output batch.

4. **Apex window bounds** — `[10, 60]` days suggested for opposing channel filter; unconfirmed. Narrower window tightens opposing channel selection; wider permits more candidates.

5. **Multi-timeframe authority** — 4h vs daily for different DTE ranges. Likely daily for DTE > 21, 4h for DTE ≤ 21. Unconfirmed.

6. **trendln vs custom pivot detection** — trendln provides velocity/acceleration natively and may be sufficient for Layer 1. A custom implementation may be needed if trendln's window parameters cannot be tuned adequately for the backwards-iterative search pattern.

7. **Containment rail upgrade threshold** — How many confirming touches are required to upgrade provisional to confirmed. One touch is the v22 minimum; a stronger rule (two independent touches in different sessions) may reduce false confirmations.

8. **Envelopment bonus weight** — How much absorbed sub-candidate score to add to the parent channel. Calibrate empirically; start at a modest fraction (e.g., 0.25× absorbed score) to prevent a wide channel from gaming the metric.

---

## What This Spec Does Not Cover

- Oscillating / range-bound regime (no channel, no slope)
- Intraday channel construction (sub-4-hour)
- Backtesting or historical accuracy assessment (Phase 3B gate)
- Multi-ticker channels

These are deferred until the core single-ticker case is stable.
