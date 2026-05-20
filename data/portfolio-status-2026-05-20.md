## PORTFOLIO STATUS — 2026-05-20
_Last updated: scheduled /status run 2026-05-20_

### ACTION ITEMS
- CHANNEL LAPSED — apex 2026-05-19 passed, no breakout detected — RUN /draw-channels (post-earnings)
- NVDA earnings tonight (2026-05-20 AH) — $205C ITM by ~$16.51 (NVDA ~$221.51 intraday), high assignment risk — evaluate post-earnings action on 2026-05-21
- NVDA $205C Jun 5: ELEVATED risk (score 50), ROLL WINDOW, earnings inside DTE — HOLD today, reassess T+1

---

### Roll Scan

DOUBLE BARRIER: DELTA ONLY (channel unvalidated — apex lapsed, run /draw-channels)

```
ROLL SCAN — 2026-05-20
─────────────────────────────────────────────────────────────────────────────
TICKER  STRIKE/EXP      DTE  URGENCY      MODE  BTC EST    REC              NET CREDIT
─────────────────────────────────────────────────────────────────────────────
NVDA    $205C 06/05     16   ROLL WINDOW  HOLD  ~$19-21†   HOLD → eval 5/21  N/A
IBIT    $35P  06/05     16   ROLL WINDOW  HOLD  ~$0.05     HOLD → expire     N/A
─────────────────────────────────────────────────────────────────────────────
QUALIFYING: 0    SUBTHRESHOLD: 0    HOLD: 2    CLOSE: 0
```

⚠ CHANNEL UNVALIDATED — run /draw-channels before executing any roll

**NVDA $205C Jun 5 (ROTH, 16 DTE) — HOLD**
BTC estimated ~$22.80/share at elevated IV (IV ~75% pre-earnings). Position is $15.61 ITM — intrinsic $15.61 + time value ~$7.19. Rolling any Jun 19 strike requires a net debit at current NVDA spot ($220.61). 50% net credit standard (≥$8.56/share) unachievable pre-earnings. Do not BTC before earnings — IV crush post-print will reduce extrinsic. Reassess May 21:
- If NVDA gaps up: accept assignment at $205. CB_effective improves further; re-enter CC post-settlement.
- If NVDA falls post-earnings: BTC on dip, evaluate roll to 45-DTE standard cadence.

**IBIT $35P Jun 5 (HSA, 16 DTE) — HOLD**
IBIT at $43.50, put $8.50 OTM (19.5%), delta ~-0.025. BTC ~$0.05 mid. Entered 2026-05-19 for $0.09. 50% profit threshold ($0.045) not yet reached. No qualifying roll. Hold to expiration. SPAXX double-dip continues on $3,500 collateral.

---

### Price Events Logged
(none — May 19 was a normal pre-earnings session: gap -1.215%, close -0.769%, both below significance thresholds)

---

### Channel Status
Drawing: draw-2026-05-19-003 | Drawn: 2026-05-19 | Regime: ascending_dominant
Apex: 2026-05-19 | T+45 containment: $238.52 (informational — channel unvalidated)
- CHANNEL LAPSED — apex 2026-05-19 passed, no breakout detected — RUN /draw-channels
- Note: NVDA earnings tonight will likely produce a decisive breakout. Draw new channels after May 21 open confirms direction.

---

### Catalyst Landscape — Next 45 Days (2026-05-20 → 2026-07-04)

| Date | Event | Importance | Days Out |
|------|-------|-----------|----------|
| 2026-05-20 | NVDA Q1 FY27 Earnings (CRITICAL — JUST RELEASED AH) | critical | T+0 |
| 2026-05-20 | FOMC Meeting Minutes (May 6-7) | moderate | T+0 |
| 2026-06-10 | CPI — May 2026 | high | T+21 |
| 2026-06-10 | Non-Farm Payrolls — May 2026 | moderate | T+21 |
| 2026-06-10 | TSMC Monthly Revenue — May 2026 | moderate | T+21 |
| 2026-06-11 | PPI — May 2026 | moderate | T+22 |
| 2026-06-18 | FOMC Decision Day | high | T+29 |
| 2026-06-19 | Quarterly OPEX — June 2026 | high | T+30 |

**High-density weeks:** Jun 8-14 (4 events)  
**Post-earnings window:** T+0 through T+5. NVDA CC and IBIT CSP both expire 2026-06-05 (16 DTE); post-earnings drift will inform roll/assignment decisions. Direction established by May 21 open will determine new channel rails via /draw-channels.

---

### Macro Composite

**Score: 17.36 — Bullish dominant** (as of 2026-05-20; carries from 2026-05-18; will update once 2026-05-20 price data available)

- Net bullish: 23.47 | Net bearish: -11.90 | Net directional: 11.58
- F1 multiplier: 1.5x
- Active forces: 11 | Attenuating: 2 | Dormant: 3

**Force State:**
- **Active (11):** A1 (Hyperscaler Capex), A2 (Enterprise AI), B1 (Foundry/Packaging), B2 (Taiwan Risk), B3 (Power Grid), C1 (China Export Controls), D1 (AMD Pressure), D2 (Custom Silicon), E1 (Positioning/Flows), E2 (Cross-Asset Risk), F1 (Narrative Validation)
- **Attenuating (2):** C2 (US Industrial Policy), C3 (Fed Policy)
- **Dormant (3):** A3 (Sovereign AI), C4 (AI Antitrust), D3 (China Domestic Chip)

**Note:** NVDA earnings 2026-05-20 (T+0, AH) just released. Post-earnings price action will drive force reattribution once price data available. Composite score will update in next /status cycle once 2026-05-20 close is captured.

---

### Position Risk

**ROTH IRA — Open Options:**

| Ticker | Type | Strike | Exp | DTE | Direction | Premium | Qty | Risk Tier | Flags |
|--------|------|--------|-----|-----|-----------|---------|-----|-----------|-------|
| NVDA | CALL | 205 | 2026-06-05 | 16 | SHORT | $17.11 | 4 | ELEVATED | EARNINGS T+0 (JUST RELEASED AH); Roll Window (8–21 DTE) |

**HSA — Open Options:**

| Ticker | Type | Strike | Exp | DTE | Direction | Premium | Qty | Risk Tier | Flags |
|--------|------|--------|-----|-----|-----------|---------|-----|-----------|-------|
| IBIT | PUT | 35 | 2026-06-05 | 16 | SHORT | $0.09 | 1 | MODERATE | SPAXX double-dip; same exp as NVDA CC; deeply OTM |

**Risk Summary:**
- 2 open options; both expire 2026-06-05 (16 DTE)
- NVDA CC: ELEVATED (earnings just released AH; position $15.61 ITM; assignment risk high; post-earnings drift T+0–T+5 will drive decision)
- IBIT CSP: MODERATE (defensive deployment, minimal premium $0.09, $8.50 OTM; SPAXX collateral earns yield)
- Overlapping expiration creates coordinated roll/assignment scenario post-earnings drift

---

### Roth IRA

- **NVDA:** 400 shares (4 contracts) | Effective CB: **$170.93** | Mkt: **$220.61** | Unrealized gain: $19,872 (+11.6%)
- **JEPQ:** 1,000 shares | Phase 2 progress: 66.67% | Shares needed: 500
- **Capital Pool:** $9,470.38 (SPAXX idle)
- **Active CCs:** -NVDA260605C205 | 16 DTE | $205 strike | $17.11 premium | ELEVATED risk (earnings T+0; position $15.61 ITM)
- **Scaling:** Phase 1 — 100 shares to next contract milestone (5 contracts) | Timing dependent on post-earnings assignment/roll outcome (likely 1–3 weeks)

### HSA

- **JEPI:** 500 shares | Milestone: 500/1,000 (50% progress) | Next target: 1,000 shares
- **Growth Vehicle:** PPA (exited 2026-04-27) | Status: DORMANT
- **IBIT CSP:** 1 contract | $35 strike | 16 DTE | $0.09 premium | $8.50 OTM; high probability worthless at expiration
- **Capital Pool:** $3,605.04 (SPAXX) | Deployed collateral: $3,500 | Undeployed: $105.04

### Income Summary (trailing 3 months: 2026-02-20 → 2026-05-20)

- **CC premiums (closed):** $1,480
- **CC premiums (pending):** $68.44 (NVDA 260605C205 t003, unresolved; assumes full capture if assigned)
- **CSP premiums:** $0.09 (IBIT 20260605P35 t006)
- **JEPQ dividends:** Unquantified
- **JEPI dividends:** Unquantified
- **SPAXX yield:** Unquantified
- **Quantified total:** $1,548.53 (closed + pending + CSP)
- **Monthly run rate (closed trades only):** ~$493/month

---

### Data Quality

**Current as of 2026-05-20:**
- Positions: 2026-05-19 (IBIT CSP added t006)
- Trades: 2026-05-19 (t006 appended; NVDA CC t003 logged 2026-05-18, entry date unconfirmed)
- Calendar: 2026-05-18 (clean, 0 stale entries; NVDA earnings 2026-05-20 verified against investor.nvidia.com; FOMC minutes 2026-05-20 published)
- Forces: 2026-05-18 (no new logged events 2026-05-19–2026-05-20)
- Composite score: 2026-05-18 (carries through 2026-05-20; will update once 2026-05-20 price and earnings reaction logged)

**Missing data:**
- JEPQ dividend attribution and payment dates
- JEPI dividend attribution and payment dates
- SPAXX yield accrual and statement reconciliation
- NVDA CC t003 confirmed entry date (logged 2026-05-18; execution date unconfirmed)
- 2026-05-20 closing price and post-earnings NVDA move

---

### Next Steps

1. **Monitor 2026-05-21 open post-NVDA earnings.** Earnings released 2026-05-20 AH. May 21 open will establish post-earnings drift direction. Reassess -NVDA260605C205:
   - If NVDA gaps up: accept assignment, improve CB_effective, re-enter CC post-settlement
   - If NVDA gaps down: BTC on the dip to capture IV crush; evaluate roll to 45-DTE cadence per 50% net credit standard
2. **Run /draw-channels (post-May-21 open).** Previous ascending channel apex lapsed 2026-05-19 without breakout. New direction established by May 21 open will inform new rail pair and updated T+45 apex projection for next Mode 1/Mode 2 entry.
3. **Track IBIT CSP through expiration 2026-06-05.** Hold to expiration (high probability worthless). SPAXX double-dip continues on $3,500 collateral.
4. **Coordinate roll/assignment overlaps.** Both open positions expire 2026-06-05 (16 DTE); plan for potential simultaneous roll window post-earnings drift closes (likely 2026-05-27 onward).
5. **Initiate dividend/yield tracking.** Set up recurring capture for JEPQ/JEPI dividend dates and SPAXX statement accrual reconciliation. Required for accurate effective CB and income metrics.
