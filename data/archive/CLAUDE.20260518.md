# Flywheel Playbook — Claude Code Operating Manual

## Project Purpose

This is an options income methodology operating inside tax-advantaged accounts (Roth IRA + HSA). The system generates volatility revenue through covered calls and cash-secured puts on a concentrated position, compounds premiums into contract count expansion, and accelerates a retirement timeline. This is not a hobby — it is a structured compounding engine.

## Active Accounts & Vehicles

**Roth IRA (Fidelity) — Active Derivatives Engine**
- Primary vehicle: NVDA (covered calls, CSPs, swing trades)
- Income stabilizer: JEPQ (~10% annualized distributions, monthly)
- Cash sweep: SPAXX (~4% yield on idle collateral — "double-dipping")
- Options access: Level 1 & 2 with limited margin (settlement bypass, not leverage)

**HSA (Fidelity) — Parallel Accumulation System**
- Income stabilizer: JEPI (S&P 500 exposure, DRIP until 500 shares then DRIP stops — JEPI is NEVER sold)
- Growth vehicle: Regime-appropriate buy-and-hold during accumulation phase (separate from JEPI; this exits at pivot, not JEPI)
- Post-pivot vehicle: IBIT (Bitcoin ETF, covered calls after 500 JEPI + macro gate)
- Options access: Level 1 only (covered calls — no CSPs in HSA)

## Core Mechanics

**Covered Call Entry (Mode 1 — Income Generation)**
- Duration: 45-DTE standard entry
- Strike selection: Double Barrier — both must be satisfied independently:
  1. Structural: Above ascending channel resistance projected forward to expiration + round number
  2. Statistical: 0.20 delta confirmation (≈80% OTM probability)
- Management: Close at 50% profit OR roll at 21 DTE

**Covered Call Mode 2 — Planned Directional Exit**
- Triggered by high-conviction bearish catalyst (tariffs, sector rotation, descending channel dominance)
- Strike informed by descending channel upper boundary — may be ATM or ITM
- Assignment is the intended outcome — a pre-planned exit with premium attached

**Covered Call Mode 3 — Offensive Roll**
- Triggered when existing CC is threatened by a rally showing bull trap characteristics
- Execute during Amateur Hour (9:30-10:00 AM), especially Tuesdays
- Buy back current call at inflated IV, sell new call higher strike / later exp for NET CREDIT
- 50% net credit standard: roll must produce ≈50% of original premium as credit
- Two-stage roll for 5%+ rallies: near-dated defensive first, then return to 45-DTE

**Covered Call Mode 4 — Calendar Correction**
- Triggered by an exogenous calendar shift (most commonly an earnings date confirmation) that displaces a catalyst out of the original DTE, invalidating the setup's exit-mechanism premise
- Authorization criteria (ALL required):
  1. Original strike+DTE was selected with a specific volatility catalyst inside contract life as the planned exit mechanism — not just generic IV decay
  2. Catalyst date has confirmed to move outside original DTE
  3. New DTE places the displaced catalyst back inside contract life
  4. Strike adjusted to absorb price action that occurred during the dislocation window
  5. Net debit is bounded and pre-defined before execution
- Distinct from Mode 3: triggered by exogenous date change, not market action; explicitly accepts net debit (the 50% net credit standard does NOT apply)
- Distinct from Mode 2: does not plan for assignment; restores the original exit-by-decay mechanism
- Discipline rules:
  - **Single-roll limit per displacement event** — no recursive Calendar Corrections on the same trade
  - **Pre-committed stopping rule** — log the gap-through-strike scenario before execution (e.g., "if NVDA gaps to $X on print, accept assignment, do not roll")
  - **Bounded debit** — roll cost should not exceed realistic premium recovery of the new contract under the restored thesis
- Failure mode: catalyst delivers a directional move that overwhelms IV crush, leaving new strike further ITM than the dislocation window predicted. Single-roll limit caps losses from this failure mode.

**Turnaround Tuesday CSP (Roth IRA Only)**
- ALL five conditions required simultaneously:
  1. Monday close ≥1% below Friday close
  2. IBS below 0.20 preferred (close near session low)
  3. No Tuesday binary catalysts that could extend weakness
  4. IV elevated — Weekend Risk Premium is present
  5. Capital pool has available collateral
- Entry: Monday 3:00-4:00 PM ET
- Duration: 2-DTE (Monday to Wednesday expiration)
- Strike: 0.20-0.30 delta put at or below ascending channel floor
- Exit: 40-50% of premium Tuesday AM during IV crush; 3% defensive exit if underlying breaks

**Monday/Wednesday NVDA Short-Dated Options (New in 2026)**
- NVDA now has Monday and Wednesday expirations available for the nearest two weeks — a new trading vehicle as of 2026
- Earnings Shield: do not open a position on this vehicle whose expiration spans the NVDA earnings week
- This rule is scoped to the Mon/Wed short-dated vehicle only. The Flywheel Playbook 45-DTE covered calls and Turnaround Tuesday 2-DTE CSPs have no restriction on expiration spanning earnings — expiration is chosen on its own merits
- The only earnings-driven management action on any existing Flywheel position is Mode 4, which requires the earnings date to have shifted from the estimate assumed at entry

**Capital Deployment Priority**
1. Swing trade if velocity to contract expansion exceeds CSP accumulation rate
2. 2-DTE CSP if all five Turnaround Tuesday conditions met
3. SPAXX (capital earns 4% floor return while waiting)

## Technical Analysis

**Chart methodology**: OHLC bar chart. Only the RIGHT TICK (closing price) governs analysis. Intraday wicks are noted but never anchor channels.

**Dual-channel construction**: Ascending + descending channels drawn simultaneously from closing prices. The compression wedge predicts timing of breakout. Macro event force assignment predicts direction.

**Force assignment layers**:
- Layer 1: Event's fundamental demand/supply character (stable, teachable)
- Layer 2: Regime context — what market has already priced (develops with experience)
- Layer 3: Sequencing effects between multiple events (highest skill, longest to develop)

**Weekend session**: Switch to 4-hour OHLC bars for higher-resolution channel geometry. Session is conditional — if no roll to evaluate and no capital to deploy, session is optional.

## Scaling Roadmap

**Roth IRA**
- Phase 1: Scale to 5 NVDA covered call contracts
- Phase 2: Fortify JEPQ to 1,500 shares
- Phase 3: Scale to 10 NVDA contracts
- Phase 4+: Non-linear compounding — each expansion accelerates the next

**HSA Milestones**
- 250 JEPI shares: meaningful dividend base
- 500 JEPI shares: PIVOT TRIGGER — DRIP stops, growth vehicle exits, IBIT enters
- 1,000 JEPI shares: mature income stabilizer
- 1,500 JEPI shares: full-scale compounding

**HSA Pivot Gate**: 500 JEPI shares AND favorable macro regime at midterm elections (conflict de-escalated, Fed cutting/paused, crypto regulatory clarity)

## Risk Rules

- 3% defensive exit on CSPs if underlying breaks below strike
- Wash Sale Firewall: Roth IRA in absolute isolation from any taxable account trading same tickers
- No 0DTE at Fidelity without $1M equity — system uses 2-DTE by design
- Concentration is the engine, not a flaw — NVDA/JEPQ correlation (76-78%) is accepted
- Assignment is a feature: capital-efficient share acquisition at a self-selected price

## Data Directory

Position data, scan results, and trade history are stored in `./data/`. Subagents read from and write to this directory. See `data/README.md` for schema.

When creating, modifying, or locating any skill, agent, command, script, reference, or data file, consult references/roadmap.md section "Canonical project structure" before placing files. Do not invent new directory locations. If the appropriate location is unclear, ask before proceeding.

## Subagents

Five specialized subagents are configured in `.claude/agents/`:
- `weekend-session` — Runs the full weekend analytical sequence
- `roll-evaluator` — Evaluates roll opportunities for specific positions
- `monday-scanner` — Pre-trade checklist for Turnaround Tuesday qualification
- `macro-analyst` — Assigns macro events to force channels
- `portfolio-accountant` — Tracks metrics, cost basis, scaling progress

## Slash Commands

- `/weekend` — Kicks off the weekend session workflow
- `/scan-rolls` — Scan all open positions for roll opportunities
- `/macro` — Run macro event force assignment for the coming week
- `/status` — Portfolio status and scaling progress summary
