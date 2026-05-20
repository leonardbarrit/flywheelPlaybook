---
description: Standalone roll opportunity scan. Normally runs as Block 4 of /status — invoke directly only for intraday re-evaluation (sharp move against a position, mid-session mode change). Classifies each position into Mode 1/2/3/4/CLOSE/HOLD/ASSIGN, checks buy-to-close pricing, applies the 50% net credit standard.
---

# /scan-rolls

Full roll opportunity scan for all open short option positions. Reads live portfolio state, evaluates urgency, classifies the appropriate Mode, and produces a ranked action table.

---

## Step 1 — Load portfolio state

Read the following files:
- `data/positions.json` — all open short calls and puts (tickers, strikes, expirations, premiums, quantities)
- `data/calendar.json` — earnings dates, FOMC, and other catalyst dates; flag any date that falls inside the DTE window of an open position
- `data/composite.json` — current macro composite score and interpretation
- `data/channel_drawings.json` — most recent (non-superseded) drawing for each ticker; extract the ascending compression rail slope and T+45 containment price (used for Double Barrier check)

Compute DTE for each position as of today. Assign urgency tier:
- **CRITICAL** — ≤ 7 DTE: must roll or let expire this cycle
- **ROLL WINDOW** — 8–21 DTE: 21-DTE management trigger active
- **MONITORING** — 22+ DTE: flag only if Mode 2 or 4 condition applies

---

## Step 2 — Earnings / catalyst calendar check (per position)

For each open position, check whether any catalyst date from `data/calendar.json` falls inside the position's remaining DTE window:

| Condition | Mode gate |
|---|---|
| Catalyst falls inside current DTE (confirmed or estimated) | **Mode 4** — flag for Len; bridge approach available if credit standard met |
| Catalyst outside current DTE | Mode 1/3 path — proceed normally |
| Post-earnings (T+1 to T+10 after event) | Mode 2 Stage 2/3 evaluation if ascending channel intact |

**Earnings Shield rule:** if a position was entered before an earnings date and the date has since shifted into the DTE window, flag as Mode 4 regardless of DTE.

**Mode 2 pre-execution check:** before routing any position to Mode 2 Stage 1, confirm that a post-event 45-DTE expiration exists in the options chain. If not, Mode 2 Stage 1 is blocked — fall back to Mode 4 or hold.

---

## Step 3 — Mode classification

Classify each position. Modes are mutually exclusive per position; calendar gates (Step 2) override urgency-based routing.

### Mode 1 — Standard Income Management
- Trigger: 21-DTE threshold reached OR position at ≥ 50% of original premium profit
- Action: roll up and out — higher strike, later expiration
- Delta target: ≤ 0.22 on the new strike (≈ 78% OTM probability)
- DTE target: ≤ 45 days on the new expiration
- Credit standard: net credit ≥ 50% of original premium = **QUALIFYING**; below 50% = **SUBTHRESHOLD** → recommend hold/expire/close instead
- Double Barrier: new strike must clear both (a) the ascending channel T+45 containment price from the most recent channel drawing AND (b) the 0.22 delta level. The more conservative of the two applies.

### Mode 2 — Conviction-Driven Premium Expansion
- Trigger: pattern-validated catalyst setup; ascending channel intact; price in pre-earnings drift window (T-21 to T-1)
- Delta target: 0.30–0.40 on the new strike (elevated conviction premium)
- DTE: short — expiration just AFTER the catalyst event (not 45-DTE standard)
- **Pre-execution gate:** confirm a post-event 45-DTE expiration exists before proceeding. If not, block Mode 2 Stage 1.
- Stage 1: roll to 0.30–0.40 delta, short DTE past catalyst
- Stage 2 (post-event, if channel intact): swing into post-event drawdown opportunity
- Stage 3: rebound to standard 0.20 delta / 45-DTE cadence
- **Skip Mode 2 entirely if calendar uncertainty exists** (unconfirmed earnings date, or date shifted since entry)
- Assignment is acceptable; expiring worthless is the target
- Two-stage roll trajectory — do not apply the single-roll Mode 4 stopping rule here

### Mode 3 — Offensive Roll
- Trigger: position threatened by a bull-trap rally (≥ 5% move against short strike, reversal characteristics present)
- Execution timing: Amateur Hour (9:30–10:00 AM ET) preferred — avoid chasing intraday momentum
- Action: two-stage roll for rallies ≥ 5%; single roll for smaller moves
- Delta target: ≤ 0.22 on new strike
- Credit standard: net credit ≥ 50% of original premium = QUALIFYING
- Do NOT execute Mode 3 during Amateur Hour on the same day as a major catalyst (FOMC, earnings)

### Mode 4 — Calendar Bridge (flag for Len)
- Trigger: catalyst date (confirmed or estimated) falls inside current position DTE
- Classification only — do not recommend a specific bridge roll. Surface the situation: catalyst date, DTE overlap, whether date is confirmed or estimated.
- If Len elects to bridge: short-DTE CCs expiring before the catalyst, delta ≤ 0.22, 50% net credit standard applies — Mode 4 does not accept net debit
- Stopping rule: single bridge only. Do not chain Mode 4 rolls.

### CLOSE
- Triggered when: position at ≥ 50% profit and roll credit is subthreshold, OR ≤ 7 DTE with no qualifying roll candidate available
- Action: buy to close; do not roll

### HOLD
- Triggered when: position is in MONITORING tier with no calendar gate active and no Mode 2 opportunity
- Action: no action this cycle; re-evaluate at 21 DTE

### ASSIGN
- Triggered when: ITM position where rolling would require a net debit or a strike below Cash Basis; Mode 2 Stage 1 preferred outcome
- Action: accept assignment; update positions.json to reflect assignment; Cash Basis carries forward as the reference for the next position entry

---

## Step 4 — Web search for current options data

For each position in CRITICAL or ROLL WINDOW tier (and any MONITORING position with a Mode 2/4 gate), use web search to find:
1. Current bid/ask on the existing position (buy-to-close cost); report intrinsic vs. extrinsic split
2. Options chain for the same underlying at the target expiration(s): strikes, deltas, bid prices
3. Net credit calculation: (sell-to-open bid) − (buy-to-close ask) = net credit per share

State confidence level if exact chain data isn't available (estimate from current IV level).

---

## Step 5 — Double Barrier check

Read `data/channel_drawings.json`. Identify the active drawing: most recent entry where `notes` does not begin with "SUPERSEDED" and `outcome.resolved` is false.

Determine barrier mode:

**DEGRADED (delta-only)** — apply when any of the following:
- No active drawing exists
- Active drawing has `outcome.resolved = true` (breakout already recorded)
- `apex_predicted_date` < today (lapsed without confirmed breakout)
- `asc_containment_t45` is null

In degraded mode:
- Skip channel barrier
- Apply delta barrier only: new strike delta ≤ 0.22
- Flag every roll recommendation: `⚠ CHANNEL UNVALIDATED — run /draw-channels before executing`
- Add to action table header: `DOUBLE BARRIER: DELTA ONLY (channel unvalidated)`

**FULL (channel + delta)** — apply when active drawing is current and `asc_containment_t45` is non-null:
1. **Channel barrier** — new strike ≥ `asc_containment_t45`
2. **Delta barrier** — new strike delta ≤ 0.22

If a qualifying net credit exists but only at a strike below the channel barrier, flag as **BARRIER CONFLICT** and recommend deferring to the next roll cycle rather than compromising the channel ceiling.

---

## Step 6 — Gamma walls and structural levels (optional)

If requested (or if a position is within 5% of a potential roll strike), run a structural levels scan for each underlying ticker:

**Layer 1 — Open interest concentration:**
Search current options chain for strikes with highest call OI and put OI at near-term expirations. These are the gamma walls — mechanical support/resistance from dealer delta-hedging. Report top 3–5 strikes per side.

**Layer 2 — Insider selling anchors:**
Search recent SEC Form 4 filings (last 6 months) for C-suite and director sales. These price levels function as "good enough to sell" anchors — institutional resistance in practice. Report names, titles, dates, share counts, and prices.

**Layer 3 — Institutional accumulation zones:**
Search recent 13F filings and institutional buying activity. Identify price levels where large buyers have been adding — these reinforce the ascending channel as demand floors.

**Synthesis:** Map all three layers against the current price and the proposed roll strike. A roll strike sitting inside a dense gamma wall cluster has higher probability of meeting resistance and getting called away — factor this into strike selection.

> Note: Gamma walls, insider selling anchors, and accumulation zones are market structure analysis tools supplementing the Double Barrier. They are not part of the core v22 methodology but inform strike selection when the channel ceiling allows a range of choices.

---

## Step 7 — Output

Print the action table sorted by urgency (lowest DTE first):

```
ROLL SCAN — {DATE}
─────────────────────────────────────────────────────────────────────
TICKER  STRIKE/EXP    DTE  URGENCY      MODE    BTC EST   REC             NET CREDIT
NVDA    $200C 05/30   11   CRITICAL     1       $4.20     Roll → $210C 6/27  +$1.85 ✓
IBIT    $35P  06/05   16   ROLL WINDOW  4       $0.04     ⚑ Catalyst overlap — flag for Len
─────────────────────────────────────────────────────────────────────
QUALIFYING: N    SUBTHRESHOLD: N    HOLD: N    CLOSE: N
```

**Qualifying** = net credit ≥ 50% of original premium  
**✓** = passes both Double Barrier rails  
**⚠** = BARRIER CONFLICT (channel ceiling below available strikes)  
**[4]** = Mode 4 stopping rule applies — single roll only

After the table, write a brief action narrative for each CRITICAL and ROLL WINDOW position (2–4 sentences): what to do, when, and why.

Save the full scan to `data/roll-scan-{DATE}.md`.

---

## Key invariants

- The 50% net credit standard applies to all Modes. Mode 4 does not accept net debit.
- Mode 2 requires a post-event 45-DTE expiration to exist before Stage 1 can be executed.
- Mode 4 stopping rule: one roll per calendar correction event. No chained Mode 4 rolls.
- Skip Mode 2 if any calendar date uncertainty exists for that ticker.
- Double Barrier: channel ceiling takes precedence over premium maximization. Do not compromise the ceiling for credit.
- Cash Basis is informational context — it does not change the 50% net credit standard, but accepting assignment when Cash Basis is well below market is often preferable to a net-debit roll.
