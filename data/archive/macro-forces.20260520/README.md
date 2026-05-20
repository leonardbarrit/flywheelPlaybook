# NVDA Macro Force Dashboard — Data Directory

This directory implements the NVDA macro force tracking dashboard with statistical baselines, event decomposition, and state-machine-driven force monitoring.

## Files & Schema

### `nvda-ohlcv-ytd.csv` — Source Price Data
YTD daily OHLCV exported from Fidelity. Columns: Date, Open, High, Low, Close, % Change, % Change vs Average, Volume, MA(10 EMA), MA(200 SMA).

### `baselines.json` — Rolling Statistical Baselines
Rolling 20-day realized volatility and average volume. Computed per trading day from `nvda-ohlcv-ytd.csv`. Used as denominator for z-score computation on event days.

### `significant-days.json` — Screened Candidate Event Days
Trading days where |close_z| ≥ 1.0 OR |volume_z| ≥ 1.5 OR |range_z| ≥ 1.5. These are the candidate days for event attribution.

### `forces.json` — Master Force Registry
One entry per tracked force (up to 15). Current state, weight, direction, event history references, and attenuation trend.

### `events/YYYY-MM-DD-{slug}.json` — Individual Event Records
Full event records with OHLCV impact, z-scores, gap classification, attribution confidence, and confounding events list.

### `composite.json` — Current Composite Score
Net bullish − net bearish with F1 (validation) multiplier applied. Derived from active forces.

### `dashboard.md` — Human-Readable Render
Current state summary, per-force breakdown, notable patterns, recent events. The view intended for reading.

### `dormant/` — Archived Event Logs for Dormant Forces
When a force transitions to DORMANT, its event history moves here. Tokens not spent maintaining unless reactivated.

### `analysis/` — Pattern Analysis Outputs
Discovered synergies, cancellations, attenuation curves, force interaction matrices.

## Force Taxonomy (15 forces across 6 categories)

**Category A — Demand-Side**
- A1: Hyperscaler Capex Cycle
- A2: Enterprise AI Adoption
- A3: Sovereign AI / National Infrastructure

**Category B — Supply-Side**
- B1: Advanced Packaging & Foundry Capacity (CoWoS, HBM)
- B2: Taiwan Geopolitical Risk
- B3: Power & Grid Infrastructure

**Category C — Policy**
- C1: China Export Controls
- C2: US Industrial Policy
- C3: Federal Reserve Policy
- C4: AI & Antitrust Regulation

**Category D — Competitive**
- D1: AMD Competitive Pressure
- D2: Custom Silicon Displacement
- D3: China Domestic Chip Capability

**Category E — Market Structure**
- E1: Positioning & Flows
- E2: Cross-Asset Risk Regime

**Category F — Narrative Integrity**
- F1: Narrative Validation / 3rd Party Corroboration (acts as multiplier on A, not additive)

## State Machine

Each force has a state:
- **ACTIVE** — monitored every update pass
- **ATTENUATING** — weight declining, flagged for dormancy check
- **DORMANT** — zero maintenance cost until reactivated
- **REACTIVATED** — recently woken, full monitoring for 2 passes or 14 days

Transitions:
- ACTIVE → ATTENUATING: 3 consecutive events with <0.5σ reaction
- ATTENUATING → DORMANT: weight <0.15 AND 30 days without significant event
- DORMANT → REACTIVATED: new event with ≥1.5σ price reaction OR ≥2% absolute move
- REACTIVATED → ACTIVE: 2 update passes of sustained signal
- REACTIVATED → DORMANT: no follow-through in 14 days

## Reaction Classification (z-score bands)

- |z| < 1.0 → negligible (within noise)
- 1.0 ≤ |z| < 1.5 → notable
- 1.5 ≤ |z| < 2.5 → significant
- 2.5 ≤ |z| < 3.5 → major
- |z| ≥ 3.5 → regime-changing

## Gap Priority Framework

- **Critical**: |gap| >3% AND close maintains 70%+ of gap
- **High**: |gap| >2% with hold OR 1-3% gap with extension
- **Moderate**: |gap| 1-2%
- **Low**: |gap| <1%
- **Failed Gap**: significant gap, >50% filled same day (diagnostic of weak information)

## Attribution Methodology

**Isolated events** (no other significant event within ±1 trading day): full reaction attributed to single force, contributes to that force's baseline mean/std.

**Confounded events** (≥2 significant events in window): log all co-occurring forces, attempt decomposition using isolated baselines:
- `residual = R_observed − Σ baselines`
- `|residual| < 1σ`: **additive** — each force gets baseline weight
- `residual > 1σ, same sign`: **synergy** — forces amplify, flag for pattern library
- `residual > 1σ, opposite sign`: **cancellation** — forces partially oppose, Layer 3 finding
- `|residual| > 2σ, inconsistent direction`: **regime shift** — something else acting, investigate

**Sample size rule**: baseline requires N ≥ 3 isolated instances. Below that, force stays magnitude-attributed until sample accumulates.

## Update Cadence

- **Comprehensive pass**: one-time initial baseline (this run). Covers YTD.
- **Standard update**: weekly, triggered by `/weekend` or `/macro-update`. Runs only on ACTIVE/ATTENUATING/REACTIVATED forces.
- **Event-driven update**: on significant news, triggered by user. Scans for force classification and reactivation candidacy.

## Files Owned By Subagents

The `macro-analyst` subagent owns this directory. It reads, writes, and maintains all files except `nvda-ohlcv-ytd.csv` (user-provided via Fidelity export).
