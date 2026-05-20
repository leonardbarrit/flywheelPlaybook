# Weekend Session — 2026-05-20

**Generated:** Wednesday 2026-05-20 (NVDA Q1 FY27 earnings day, after-close print pending)
**Effective for:** Week of 2026-05-25 (Memorial Day week, Mon 5/25 likely closed; trading resumes Tue 5/26)
**NVDA close:** $220.61 (5/19; 5/20 close pending earnings)

---

## Weekly Review

**This week's tape (2026-05-18 → 2026-05-20):**

- **5/18:** Open $131.50 / close $129.80 — this is a stale API artifact carried into composite_history; the 5/20 status corrected it to $222.32 close. Net intraday reversal flagged.
- **5/19:** Gap -1.215%, open $219.62, close $220.61. Pre-earnings de-risking. No significant z-score; no event logged.
- **5/20 (today):** Holding pattern at $220.61 going into AH earnings. Macro composite static at 17.362 (bullish_dominant).

**Composite movement:** Flat at 17.362 since 5/18. Net bullish 23.471 vs. net bearish -11.896, F1 multiplier 1.5×. No new force events recorded since C1 last_event_date 2026-05-18. Active force count 11, attenuating 2 (C2, C3), dormant 3 (A3, C4, D3).

**Force events this week:** None new. C1 event 5/18 (China export controls) is the most recent.

**Roll actions:**
- **5/18:** t003 logged — NVDA $205C Jun 5 STO confirmed at $17.11 premium, 4 contracts. Earnings Shield active.
- **5/19:** t006 logged — IBIT $35P Jun 5 STO at $0.09, 1 contract, HSA SPAXX double-dip.
- **5/20:** Both positions in HOLD per roll scan. No qualifying 50% net credit roll target for NVDA pre-earnings; IBIT $0.05 mid below 50% close threshold ($0.045 net required).

**Prediction accuracy check:** Only one prior weekend report exists (2026-03-20). Its Monday/Tuesday plan called for Mode 1 CC entry Tue 3/24 at $190-195 strike, 45-DTE (~May 8). Actual: position not entered until 5/18 at $205C Jun 5. The 2026-03-20 plan called for SPAXX hold absent extraordinary CSP conditions — actual SPAXX held through quarter. Channel framework used in 3/20 weekend (ascending floor ~$166-168, descending ceiling ~$178-182, wedge resolution 2-4 weeks) — actual: NVDA hit $164.27 APL on 3/31, then ran to $237.96 APH on 5/14, so wedge did NOT resolve in the predicted 2-4 weeks; it bounced off floor and reversed strongly bullish. Macro bias prediction (descending dominant) was wrong-direction — Apr 8 Iran ceasefire + Apr 24 Intel earnings flipped the regime.

---

## Channel State

**Active drawing:** draw-2026-05-19-003 (ascending_dominant, drawn 2026-05-19, 4h timeframe)

- APL anchor: 2026-03-30 $163.50, no VFD confirmed (slope from algorithm regression +0.3254/bar)
- Descending compression: APH 2026-05-14 $237.96 → provisional VSR 2026-05-18 $222.75, slope -1.901/bar
- **Apex predicted:** 2026-05-19 — **LAPSED** as of 2026-05-20 with no clean breakout. T+45 ascending containment: $238.52 (informational only).

**NEW_DRAWING_REQUIRED = TRUE.** The Phase 4 pipeline output is now stale. Roll recommendations for the coming week MUST NOT use Double Barrier from this drawing. User must run `/draw-channels` after Thursday 5/21 open (post-earnings price action) before any roll execution.

NVDA earnings tonight (AH 5/20) will almost certainly produce the decisive breakout. The provisional descending slope (-1.901/bar) is unrealistic over 45d — the wedge is resolving now via the earnings catalyst.

---

## Force Regime

**Driving forces (ACTIVE, bullish-direction):**
- **A1 Hyperscaler Capex** — weight 1.509, net YTD +12.733, last event 4/24 (Intel Q1 corroboration). Dominant force.
- **F1 Narrative Validation** — multiplier 1.5×, four Tier-4 instances YTD (Marvell 3/31, TSMC 4/10/4/17, Intel 4/24). Building trend.
- **B1 Advanced Packaging** — weight 0.845, net +4.493. Stable.
- **E1 Positioning/Flows** — weight 0.696, oscillating, net +0.661.

**Driving forces (ACTIVE, bearish-direction):**
- **C1 China Export Controls** — weight 1.065, net YTD -5.272, most recent event 5/18. Active and weighing.
- **D1 AMD Pressure** — weight 0.701, net -1.939.
- **D2 Custom Silicon** — weight 0.795, net -1.741, last event 4/21 (Google TPU v7).
- **E2 Cross-Asset Risk** — weight 0.721, net -1.347, last event 4/23.

**Fading forces (ATTENUATING):**
- **C2 US Industrial Policy** — 118 days since last significant event, 3 consecutive weak reactions. Attenuation trend stable but the dormancy clock is running.
- **C3 Federal Reserve** — 53 days since last significant, attenuation_trend "building." FOMC minutes today (5/20) may reactivate; CPI 6/10 and FOMC 6/18 are the test events.

**Dormant with no keyword activity:** A3 (Sovereign AI), C4 (AI Antitrust), D3 (China Domestic Chip). None of these have triggered surveillance hits in the past 4 weeks per available data.

**Regime characterization:** Bullish-dominant with a balanced demand-side core (A1+F1 multiplier driving) vs. a politically-driven bearish tail (C1 keeps re-firing). The A1 force has not had a fresh event since 4/24 — its dominance is built on the residual weight of the $650B hyperscaler capex re-rating from February. Tonight's NVDA earnings is the next A1 catalyst; the question is whether it adds or removes weight.

---

## Composite Trajectory

8-week table (data only available since 2026-05-18; insufficient depth for 8-week trend):

| Date | Composite | Net Bull | Net Bear | F1 | Interpretation |
|------|-----------|----------|----------|-----|----------------|
| 2026-05-18 | 17.362 | 23.471 | -11.896 | 1.5× | bullish_dominant |
| 2026-05-19 | null | — | — | — | (price-only entry) |
| 2026-05-20 | 17.362 | 23.471 | -11.896 | 1.5× | bullish_dominant |

**Trend:** Flat at 17.362 — composite_history was seeded 2026-05-18 and lacks the 8-week history needed for trajectory analysis. The score is determined entirely by force states/weights as of that snapshot. No inflection signal possible from this dataset alone.

Implied trajectory from event log (Jan-May 2026): regime ran significantly bearish Jan-Mar (events skewed bearish; -4.38% washout 1/20, -5.46% post-earnings 2/26, -4.16% capitulation 3/26), then flipped sharply bullish on the Apr 8 Iran ceasefire + Apr 24 Intel print combo. Current 17.362 reflects the post-flip bullish regime. The next composite re-evaluation hinges on the 5/20 earnings reaction.

---

## Coming Week — Calendar

**Next 5 trading days (5/21 Thu, 5/22 Fri, 5/25 Mon [Memorial Day — market CLOSED], 5/26 Tue, 5/27 Wed):**

| Date | Event | Importance | Force | T-N to next NVDA earnings |
|------|-------|------------|-------|---------------------------|
| 2026-05-21 | NVDA post-earnings open (T+1) | CRITICAL — price gap from AH 5/20 print | A1, A2, A3, B1, C1, D1, D2, D3 | T+1 (post Q1) |
| 2026-05-22 | T+2 post-earnings drift | high | E1 | T+2 |
| 2026-05-25 | Memorial Day — market closed | — | — | — |
| 2026-05-26 | T+4 post-earnings drift | moderate | E1 | T+4 |
| 2026-05-27 | T+5 post-earnings drift; final post-drift day | moderate | E1 | T+5 |

**High-density windows in 45-day horizon:**
- **Jun 8-14:** CPI (6/10), NFP (6/10 est.), TSMC monthly revenue (6/10 est.), PPI (6/11). Four events in three calendar days. Macro re-pricing risk.
- **Jun 18-19:** FOMC decision (6/18) + quarterly OPEX (6/19). High-impact pair.

**NVDA earnings window:** **EARNINGS EVENT (T+0)** today. Tomorrow opens POST-DRIFT window (T+1 to T+10), running through ~6/3.

**Mode gates:**
- NVDA $205C Jun 5 (16 DTE on 5/20, 11 DTE on 5/26): expiration falls inside post-drift window. Trade is BTC-or-assigned, not a roll candidate at ITM. Mode 4A (DTE-shortening defense) is mooted by the earnings catalyst — the catalyst already fired.
- IBIT $35P Jun 5 (16 DTE on 5/20, 11 DTE on 5/26): no calendar event triggers Mode 4A/4B; default hold to expiration.

---

## Portfolio State

**Open positions (Monday-equivalent DTE shown as of 5/26 Tue open, since Mon 5/25 closed):**

| Position | DTE 5/26 | Mode | Status |
|---|---|---|---|
| NVDA $205C Jun 5 (4 contracts, Roth) | 10 DTE | n/a (legacy) | CRITICAL by 5/26 — entering critical tier (≤7 DTE) by 5/29 Fri |
| IBIT $35P Jun 5 (1 contract, HSA) | 10 DTE | CSP defensive | HOLD; close at 50% profit if achieved |

**Income trajectory (trailing 12-week effort, normalized):**

| Cycle | Premium captured (net) | Notes |
|---|---|---|
| t001/t002: NVDA $200C Apr 17 cycle | $1,480 net | 84% profit close 3/20 |
| t003: NVDA $205C Jun 5 | $17.11 entry (open) | Likely assignment outcome |
| t006: IBIT $35P Jun 5 | $0.09 entry (open) | Hold to expiration likely |

Realized weekly income (12-week avg via t001-t002 cycle): ~$123/week NVDA CC. Excluding JEPQ/JEPI dividends and SPAXX yield (untracked).

**Phase progress (NVDA contract scaling):**
- Current: 400 shares = 4 contracts (Phase 1)
- Target: 500 shares = 5 contracts (Phase 1 complete)
- Gap: 100 shares (~$22,000 at $220 spot)
- SPAXX deployable (Roth): $9,470.38
- Run rate at recent cycle pace (~$1,480/cycle, ~6-8 week cycles): need ~15 cycles or ~2-3 years assuming no acceleration. If t003 ASSIGNS at $205, proceeds ~$82,000 free up but shares vanish — net regression unless re-entered immediately at lower price post-print.

**Critical positions:** None ≤7 DTE on Monday-equivalent. Both positions enter critical tier mid-week if held through 5/29.

---

## Monday/Tuesday Plan

**Reminder:** Mon 5/25 is Memorial Day. "Monday/Tuesday" in this week's plan = **Tue 5/26 / Wed 5/27.** Thu 5/21 and Fri 5/22 are the immediate post-earnings days driving the regime.

### Turnaround Tuesday assessment (for 5/26)

1. **Composite descending or neutral that could reverse?** Composite static at 17.362. No descending signal currently — would require a bearish earnings reaction Thu/Fri to set up.
2. **Monday catalyst creating weakness?** Mon is closed. Thu/Fri post-earnings price action will set the tone for Tue 5/26. If 5/20 AH print is bearish, weakness will run through Thu/Fri/Tue.
3. **Ascending channel intact, price near compression rail?** Channel LAPSED — cannot assess. Need new drawing.
4. **IV elevated enough at target delta?** Post-earnings IV crush will likely collapse IV by Friday close. Tue 5/26 IV likely depressed — premium capture marginal at 0.20 delta.
5. **45-DTE expiration with volume?** July 17 weekly (45 DTE from 5/27); standard weekly volume.

**GO / NO-GO: NO-GO for Turnaround Tuesday CSP entry on 5/26.** Deciding factor: **channel drawing lapsed and IV crush post-earnings collapses the premium generation case.** Reassess once new channel drawn AND post-print IV stabilizes (likely Wed/Thu 5/27-5/28).

### Decision tree — post-earnings (Thu 5/21 priority)

```
IF NVDA opens >$235 Thu 5/21 (strong beat + bullish guide):
    THEN: $205 strike is $30+ ITM. Accept assignment most likely.
         BTC if extrinsic <$1.00 to keep share-side intact.
         Re-entry CC after assignment requires re-purchase of 400 shares.
         Run /draw-channels immediately to capture new ascending regime.

IF NVDA opens $215-235 Thu 5/21 (in-line or modest beat):
    THEN: $205C still ITM by $10-30. BTC ~$15-30 net per share.
         Evaluate roll to 45-DTE ~$230C Jul 17 target.
         50% net credit standard: need net credit ≥$8.56/share. Likely achievable
         only if NVDA in $225-235 zone with IV crush partially complete.
         Run /draw-channels after channel direction confirmed.

IF NVDA opens $200-215 Thu 5/21 (mild disappointment):
    THEN: $205C near-ATM. BTC ~$5-10/share. Strongest roll opportunity.
         Target 45-DTE Jul 17 strike at delta 0.20 (likely $230-240 if rail T+45 holds).
         Run /draw-channels first — confirm regime.

IF NVDA opens <$200 Thu 5/21 (bearish reaction):
    THEN: $205C OTM, extrinsic only. BTC at 50% profit if achievable.
         Position validates Earnings Shield protocol.
         Wait for stabilization before new CC entry.
         Channel likely flips descending-dominant — run /draw-channels.

IF IBIT $35P Jun 5 reaches 50% profit (BTC ~$0.045):
    THEN: Close, redeploy collateral. Look for next 45-DTE OTM CSP entry on
         IBIT at delta ~0.10-0.15 (likely $36-38 strike if IBIT holds $43).

IF position Y reaches 7 DTE (i.e., NVDA $205C on 5/29 Fri):
    THEN: CRITICAL tier. Decision deadline before close 5/29 to avoid weekend gamma.
```

### Specific price levels for the coming week

- **Ascending compression rail at 5/26 open:** Channel lapsed; cannot compute reliably. Stale projection from draw-2026-05-19-003: rail at apex $209.95 on 5/19 + slope 0.3254/bar × ~25 trading bars = ~$218.10 by 5/26 open. **Do not trade off this number — re-draw first.**
- **T+45 ascending containment (stale):** $238.52 — informational ceiling for Jul 17 strike screening.
- **Round-number support/resistance:** $200 (psychological + 50/100-day MAs cluster), $220 (current spot), $240 (recent APH 5/14 $237.96), $250 (next resistance).
- **CSP deployment trigger (NVDA):** No Turnaround Tuesday setup currently active. If post-earnings flush takes NVDA to $200 with IV >50%, evaluate $195 CSP at 0.20 delta 45 DTE — but capital constraint applies (need ~$19,500 collateral per contract; Roth SPAXX $9,470 covers <1 contract).

### Week's catalyst watch list

1. **NVDA Q1 FY27 print (5/20 AH)** — A1 primary driver. Beat magnitude + guide trajectory + China data center commentary determines regime direction for next 4-6 weeks.
2. **TSMC May monthly revenue (~6/10)** — F1 Tier-4 corroboration check. If TSMC May YoY <30%, A1 thesis weakens.
3. **CPI May print (6/10)** — C3 (Fed) catalyst. Hot print revives the attenuating C3 force and pressures growth-tech duration.

---

## Longer-Timeframe Analysis

**Composite score trend (4-8 week horizon):** Insufficient history in composite_history.json to compute a true 8-week trend (data starts 2026-05-18). However, the implied trajectory from the events log shows a clear regime shift Apr 8 (Iran ceasefire) → Apr 24 (Intel earnings = bullish regime confirmation). The bullish regime is now 27 days old. F1 multiplier last refreshed 4/24 — building trend, but no fresh Tier-3/4 corroboration in 26 days. **Implication for CC aggressiveness:** if the next 4 weeks see no fresh F1 reinforcement, F1 will start to mechanically attenuate; the bullish thesis loses scaffolding. Maintain standard delta 0.20 selection on CC; do NOT step up to Mode 2 / delta 0.30+ until earnings tonight confirms continuation.

**Force regime durability:**
- **ACTIVE >4 weeks:** A1 (last event 4/24, 26 days), F1 (4/24, 26 days), B1 (4/17, 31 days), D1 (4/24, 24 days), D2 (4/21, 27 days), E1 (4/24, 24 days), E2 (4/23, 25 days), B2 (4/8, 40 days), B3 (4/24, 24 days), A2 (4/23, 25 days). The full active set is >24 days stale — every active force is approaching the 30-day attenuation watchlist.
- **Newly active:** None in past 30 days.
- **Newly attenuating:** None — C2/C3 attenuating since prior cycle.

**Channel apex prediction accuracy:** Only resolved-drawing data point is the implicit prior wedge from 2026-03-20 weekend (predicted 2-4 week resolution from 3/20 → resolved 3/31 with reversal bounce off $163.50 floor = ~11 days, within window but direction wrong). Current draw-2026-05-19-003 apex predicted 5/19 vs actual: lapsed without breakout — **late, by at least 2 days as of 5/20**, will be resolved by earnings tonight. Pattern emerging: apex predictions tend to be early in flat/range-bound tape; the actual breakout requires a discrete catalyst. Useful for next drawing: weight catalyst dates more heavily than pure geometric convergence.

**Phase trajectory:** 100 shares to next milestone. At current ~$1,480 realized per 6-8 week cycle, premium-funded path = 14-15 cycles or 18-24 months. Pace is decelerating vs. Q1 (one closed cycle in 14 weeks). Acceleration paths: (a) assignment recovery — if t003 assigns at $205 and re-entry possible at $200, no progress lost; (b) JEPQ dividend reinvestment toward NVDA — currently passive.

**Primary regime risk (4-8 week horizon):**
**C1 (China Export Controls) — ACTIVE→ATTENUATING transition risk.** C1 has been the dominant bearish drag (net YTD -5.272). If the rumored framework relief continues (Apr 8 withdrawal of worldwide licensing proposal was the first step), C1 attenuation removes ~1 weight unit from the bearish side, lifting net directional by ~5+ points — significant. Watch for: any Commerce Department announcement softening H200/H20 stance, any China-side reciprocal customs easing, or NVDA earnings call commentary explicitly quantifying China data center re-engagement. Alternatively, **A1 (Hyperscaler Capex) — ACTIVE→ATTENUATING transition risk.** If 5/20 earnings reveals capex deceleration commentary from large customers, A1 weight (1.509, dominant force) starts attenuating — composite drops materially. This is the symmetric risk to C1 relief.

---

## Calibration Status

**Observation counts (per regime class):**

| Regime class | Resolved drawings | Minimum needed | Gap |
|---|---|---|---|
| ascending_dominant | 0 | 3 | 3 |
| descending_dominant | 0 | 3 | 3 |
| converging | 0 | 3 | 3 |

**Total drawings:** 3 (all unresolved; draw-001 superseded, draw-002 superseded by draw-003, draw-003 lapsed today and requires re-draw).

**Threshold discovery:** INSUFFICIENT DATA. Recalibration script returned no proposals. Both `ascending_dominant` and `descending_dominant` minimums are at 0 of 3.

**Script status:**
- `recalibrate_weights.py` ran successfully in PREVIEW mode — produced no proposals (gated on observation count).
- `calibration_report.py` raised `TypeError` on null `composite_score` for 2026-05-19 entry (price-only row). **Script bug — non-blocking.** Fix: filter `None` scores before stats computation. Not addressing this session.

**Largest proposed change:** N/A — no proposals available.

**Apply gate:** N/A. No proposals to apply. When data sufficient, `/recalibrate --apply` will be required after explicit review.

---

## Prediction Accuracy Log

Prior weekend report on file: **2026-03-20** (single entry; weekend-session-2026-03-20.md).

| Predicted | Condition Met? | Action Taken? | Actual Outcome | Accuracy |
|---|---|---|---|---|
| 3/20: Mode 1 CC entry Tue 3/24 at $190-195 strike, 45-DTE | NO — NVDA $172.70 → ran lower to $163.50 (3/31 APL); no rally to $175+ Tue 3/24 | NO entry occurred Tue 3/24 | CC entry deferred until 5/18 ($205C Jun 5) | **MISS** — entry condition not triggered; no fallback re-evaluation logged |
| 3/20: Descending channel dominant, wedge resolves 2-4 weeks downward | Floor held at $163.50 (within $165-168 predicted range); resolution at 11 days but direction wrong | N/A — no entry | Strong bullish reversal Apr 8+ | **WRONG DIRECTION** — geometric floor accuracy good; macro thesis wrong |
| 3/20: CSP unlikely to deploy (capital constraint $765.91) | YES — no CSP entered | Held SPAXX | $765.91 → $9,470.38 SPAXX via accumulation | **CORRECT** — non-deployment correct |
| 3/20: PCE Friday is swing event | Confirmed PCE drove modest reaction | N/A | Reaction modest, regime change came later via Iran ceasefire | **CORRECT** identification, **WRONG** for regime-change attribution |

**Key learning:** The 3/20 plan correctly identified geometric levels (ascending floor $165-168, descending ceiling $178-182, wedge resolution timing) but **completely missed the regime-changing catalysts** (Iran war 3/2-3/6 deepening, then ceasefire 4/8 flipping; Intel 4/24 confirming bullish regime). The channel-as-geometry was useful; the macro thesis built on then-prevailing C1+E2 bearish set failed to anticipate force-state transitions. Implication for current session: do not over-anchor on draw-2026-05-19-003 apex timing; weight tonight's earnings catalyst as the primary regime-determining event.

---

*Session complete. Next scheduled session: weekend of 2026-05-22 / 2026-05-23 (post-earnings, post-FOMC-minutes). Mandatory between now and then: run /draw-channels after Thu 5/21 open to refresh channel state before any roll execution.*
