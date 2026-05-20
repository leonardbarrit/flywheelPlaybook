# Pattern Library

Empirical patterns observed in the NVDA force attribution dataset (2026 YTD).
Updated as new patterns are confirmed. Each pattern requires ≥3 confirming instances before graduation from "candidate" to "confirmed."

Last updated: 2026-05-20. Seeded from data/archive/macro-forces.20260520/dashboard.md and decomposition.json.

---

## Confirmed patterns (≥3 instances)

### A1 + F1-Tier4 Synergy
- **Forces:** A1 (Hyperscaler Capex Cycle) + F1 Tier 4 (adjacent AI supplier)
- **Description:** When a Tier 4 adjacent supplier (TSMC, Intel, SK Hynix) independently corroborates AI capex demand on the same day, the realized NVDA move exceeds what A1 alone predicts. The F1 multiplier (1.5×) understates the synergy in high-conviction instances.
- **Observed instances:** 2026-03-31 (Marvell), 2026-04-10 (TSMC monthly), 2026-04-17 (TSMC earnings), 2026-04-24 (Intel Q1 FY26)
- **Pattern type:** synergy (residual > 1σ, same sign)
- **Implication:** When F1-Tier4 event is scheduled, upgrade A1 channel confidence to HIGH for that day's position management.

### C1 + C2 Cancellation
- **Forces:** C1 (China Export Controls) + C2 (US Industrial Policy)
- **Description:** When tariff tightening (C2) is announced simultaneously with export-control clarification (C1 — which can be bullish if it unlocks China revenue), the forces partially cancel. Net move is smaller than either force alone would predict.
- **Observed instances:** 2026-01-14 (Section 232 + exemption carve-outs), 2026-01-15 (BIS case-by-case + TSMC deal), 2026-01-20 (China blocking post-clarification)
- **Pattern type:** cancellation (residual opposite sign > 1σ)
- **Implication:** Days with simultaneous C1 + C2 attribution → set `confounded: true`, lower confidence on directional prediction.

### E1 Amplification (streak days)
- **Forces:** E1 (Positioning & Flows)
- **Description:** After 10+ consecutive up days, E1 CTA/trend-chasing adds 0.5–1.0% to A1-driven moves. After 5+ consecutive down days, E1 systematic de-risking subtracts similarly.
- **Observed instances:** 2026-04-14 through 2026-04-24 (18-day semiconductor streak); 2026-01-20 through 2026-02-04 (extended bearish run)
- **Pattern type:** amplifier (not a separate force event — E1 weight raised during confirmed streaks)
- **Implication:** When tracking a streak of 10+ days, add E1 "streak amplifier" note to status. In Mode 1 CC selection, raise target strike by 3–5% if ascending streak active.

---

## Candidate patterns (1–2 instances, not yet confirmed)

### Pre-earnings drift decay
- **Forces:** E1, A1
- **Description:** In the 5–10 trading days before NVDA earnings, IV ramp drives positioning behavior (E1 bullish). But in the final 2–3 days (T-2 to T-1), profit-taking on pre-earnings longs creates a small bearish drift. Net effect: bullish T-21 to T-3, then flat-to-bearish T-3 to T-1.
- **Instances:** 2026-02-19 to 2026-02-25 (pre-Q4 FY26 earnings)
- **Implication:** Mode 2 CC entries in the T-21 to T-10 window capture the bulk of pre-earnings IV premium; entering after T-10 captures less.

### Post-earnings IV crush acceleration
- **Forces:** E1, A1
- **Description:** After a post-earnings selloff (A1 miss or guidance disappointment), E1 short-vol covering drives a faster-than-expected mean-reversion in IV. CC positions benefit more quickly than DTE math would suggest.
- **Instances:** 2026-02-26 to 2026-03-02 (post-Q4 FY26 earnings recovery)
- **Implication:** After earnings miss + selloff, monitor for rapid IV crush within 5 trading days. BTC threshold may be hit sooner than 21-DTE trigger suggests.

### Weekend risk accumulation (geopolitical)
- **Forces:** B2, C1, E2
- **Description:** Geopolitical news released over Friday close (or 3-day weekend) accumulates without intraday hedging. The gap-open Monday exceeds what the news alone would predict by 1–2%. Gap priority upgrades from "moderate" to "high" for 3-day weekends.
- **Instances:** 2026-01-20 (MLK 3-day weekend + China customs blocking)
- **Implication:** Before 3-day weekends when B2 or C1 forces are ACTIVE, flag War Regime Delay Filter. Do not open new positions Friday afternoon when elevated geopolitical risk is present.

---

## Pattern graduation criteria

A candidate pattern graduates to confirmed when:
1. ≥3 instances with consistent residual direction and magnitude
2. Residual > 1σ (synergy/cancellation) or consistent amplification factor documented
3. Documented in at least one `/log-event` entry with `confounded: true` and decomposition note

Patterns are retired when they produce 3+ consecutive false predictions after graduation.
