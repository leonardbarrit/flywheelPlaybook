# Flywheel Playbook — Operational System

A Claude Code–based execution layer for a systematic options income methodology focused on covered calls and cash-secured puts in tax-advantaged accounts.

---

## What this is

The Flywheel Playbook is an options income strategy built around NVDA covered calls in a Roth IRA and IBIT cash-secured puts in an HSA. The core idea: premium income compounds share count over time (the flywheel), guided by a macro force model that tracks what is actually moving the underlying.

This repository is the **operational layer** — not the strategy itself. It contains:

- **Data files** — portfolio state, trade log, force model, event ledger, channel drawings
- **Skills** — deterministic Python scripts that handle math the LLM shouldn't reproduce
- **Subagents** — specialized Claude agents for weekly synthesis, roll evaluation, and portfolio accounting
- **Commands** — slash commands that run analytical protocols end-to-end

The methodology source of truth is the Flywheel Playbook v22 document. Everything here is a distillation of that into executable form.

---

## Daily workflow

```
/status          ← Run every trading day (fetches prices, updates force model, scans rolls)
/weekend         ← Run Saturday/Sunday (weekly synthesis, forward plan, calibration preview)
/draw-channels   ← Run when /status flags NEW_DRAWING_REQUIRED (channel breakout or apex lapse)
/scan-rolls      ← Intraday re-evaluation only (Block 4 of /status handles daily roll scan)
```

`/status` is the single daily entry point. It runs six sequential blocks:
1. **Price pipeline** — fetches OHLCV, detects significant moves, researches catalysts, attributes to macro forces
2. **Force state update** — updates the force model and composite score
3. **Calendar engine** — 45-day catalyst window, staleness checks
4. **Channel check** — mechanical breakout detection, apex lapse detection
5. **Roll scan** — DTE urgency, mode classification, net credit math for all open positions
6. **Portfolio metrics** — income summary, phase progress, position details

---

## Architecture

```
flywheel-claude-code/
│
├── CLAUDE.md                    Project identity loaded every session
│
├── data/
│   ├── positions.json           Current portfolio (maintained per trade)
│   ├── trades.json              Trade log (append-only)
│   ├── calendar.json            45-day catalyst calendar with primary-source verification
│   ├── forces.json              Macro force taxonomy + current state
│   ├── events.json              Attributed price event ledger (append-only)
│   ├── outcomes.json            Predicted vs realized direction ledger (append-only)
│   ├── composite_history.json   Daily composite score snapshots
│   ├── channel_drawings.json    Channel drawings with computed geometry and outcomes
│   └── archive/                 Retired files (never deleted)
│
├── references/
│   ├── roadmap.md               Canonical project structure and phase plan
│   ├── channel-spec.md          Phase 4 channel construction specification
│   ├── pattern-library.md       Empirical force interaction patterns
│   ├── force-event-mapping.md   Event type → force ID lookup
│   └── data-sources.md          Primary source URLs per event type
│
├── skills/                      Deterministic Python scripts per domain
│   ├── calendar-engine/         Forward window, OPEX, FOMC, staleness checks
│   ├── position-risk/           Position × calendar overlap and risk scoring
│   ├── force-attribution/       Force state machine, composite score, keyword surveillance
│   ├── force-calibration/       Score history, channel correlation, weight calibration
│   ├── price-data/              OHLCV processing, event logging
│   └── channel-pipeline/        Pivot detection, candidate scoring, geometry, charting
│
└── .claude/
    ├── agents/                  Subagent definitions (weekend-session, roll-evaluator, etc.)
    └── commands/                Slash command definitions (/status, /weekend, etc.)
```

---

## Macro force model

NVDA price action is modeled as a composite of 16 forces across 6 categories:

| Category | Forces |
|---|---|
| **A — Demand** | A1 Hyperscaler Capex · A2 Enterprise AI · A3 Sovereign AI |
| **B — Supply** | B1 Foundry/Packaging · B2 Taiwan Risk · B3 Power Grid |
| **C — Policy** | C1 China Export Controls · C2 US Industrial Policy · C3 Fed Policy · C4 AI Antitrust |
| **D — Competitive** | D1 AMD · D2 Custom Silicon · D3 China Domestic Chip |
| **E — Market Structure** | E1 Positioning/Flows · E2 Cross-Asset Risk |
| **F — Validation** | F1 Narrative Validation (multiplier, not additive) |

Each force has a state (ACTIVE / ATTENUATING / DORMANT / REACTIVATED), a weight, and a direction bias. The composite score drives channel regime classification and covered call aggressiveness.

---

## Options management modes

| Mode | Trigger | Action |
|---|---|---|
| **Mode 1** | 21-DTE threshold or 50% profit | Roll up and out — delta ≤ 0.22, ≤ 45 DTE |
| **Mode 2** | Pre-earnings conviction setup | Higher delta (0.30–0.40), short DTE past catalyst — *classification only* |
| **Mode 3** | Bull-trap rally ≥ 5% against strike | Offensive roll — same delta/credit standard |
| **Mode 4** | Catalyst date inside or awkwardly near DTE | Calendar bridge — surfaces situation for practitioner decision |

**Only Mode 1 and Mode 3 are recommended.** Modes 2 and 4 are classified and surfaced; the practitioner decides whether to act.

The **50% net credit standard** applies to all modes: net credit from a roll must be ≥ 50% of the original premium collected. Subthreshold rolls are not executed.

The **Double Barrier** governs strike selection: new strike must clear both (1) the ascending channel T+45 containment price and (2) delta ≤ 0.22. Degrades to delta-only when no active channel drawing exists.

---

## Channel drawing system

Price channels are constructed from OHLCV data via a four-stage pipeline:

```
find_pivots.py → score_channels.py → channel_chart.py → build_geometry.py
```

The pipeline produces ranked channel candidates. The practitioner selects the accepted pair from a rendered chart. The system computes slope, apex date, and T+45 strike projection — the ceiling for covered call strike selection.

Channels are logged to `data/channel_drawings.json` with full anchor parameters, computed geometry, macro composite context at time of drawing, and an outcome block updated when the breakout resolves. This data feeds Phase 3B weight calibration.

---

## Calibration (Phase 3B)

As channel drawings accumulate, `recalibrate_weights.py` matches resolved breakout outcomes against composite score history to discover the score thresholds separating ascending, descending, and converging regimes — and adjusts force weights so the composite score crosses those thresholds more reliably.

**Gate condition:** minimum 3 resolved drawings per regime class before calibration runs.
**Apply gate:** weight proposals are never auto-applied. The practitioner reviews and runs `/recalibrate --apply` to commit.
**Audit trail:** every approved weight change is committed to git with the observation count and threshold.

---

## Key invariants

- **No execution.** This system produces analysis and recommendations. No trades are placed automatically.
- **Practitioner decides.** Analysis includes specific numbers; the practitioner decides whether to act.
- **Accounts are isolated.** Roth IRA, HSA, and Traditional IRA are legally separate. No cross-account logic.
- **Earnings dates from issuer IR pages only.** Fidelity chain labels carry stale estimates. The canonical source is always the company's investor relations page.
- **Append-only ledgers.** `events.json`, `outcomes.json`, and `trades.json` are never edited — only appended. State changes are new entries.

---

## Subagents

| Agent | Model | Role |
|---|---|---|
| `weekend-session` | Opus | Weekly synthesis: reviews daily status reports, characterizes force regime, builds Monday/Tuesday plan, runs calibration preview |
| `roll-evaluator` | Sonnet | Detailed roll evaluation for a single position: BTC estimate, candidates, net credit math, Mode classification |
| `macro-analyst` | Opus | Forward-looking force assignment for dual-channel framework; macro event attribution |
| `portfolio-accountant` | Haiku | Portfolio metrics block: income summary, phase progress, position details |

---

## Data conventions

| Type | Convention | Files |
|---|---|---|
| Append-only | Never edit existing entries | `events.json`, `outcomes.json`, `trades.json` |
| Maintained | Edit in place; preserve schema | `positions.json`, `forces.json`, `calendar.json`, `composite_history.json` |
| Hybrid | Append on draw; update outcome in place | `channel_drawings.json` |
| Computed | Never persist to disk | Composite scores, overlap matrices, calendar density |
| Archive | Move to `data/archive/`; never delete | Any retired file |
