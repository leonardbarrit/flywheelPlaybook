# Flywheel Roadmap

Living document. Phases are sequenced by dependency, not calendar.

Last updated: 2026-05-20.

---

## Current state (2026-05-20)

**Verified operational components:**
- `CLAUDE.md` at project root.
- 4 subagents: weekend-session (Opus), roll-evaluator (Sonnet), macro-analyst (Opus), portfolio-accountant (Haiku). monday-scanner retired — `/status` is sufficient.
- Slash commands: `/weekend`, `/scan-rolls`, `/macro`, `/status`, `/forces`, `/recalibrate`, `/draw-channels`, `/log-channel`.
- `data/positions.json` and `data/trades.json`, maintained manually after trades.

**Reference content:**
- `references/roadmap.md` — this document.
- `references/channel-spec.md` — Phase 4 pipeline spec and open algorithm questions.

**Methodology source of truth:**
- `Flywheel_Playbook_v22.docx` in Google Drive (ID: `1rs20-5mRlerMD7wgRSd1ZYmEQPwIUgl7QslDCBGCHcA`). This is the canonical methodology document. All other methodology content in this project is a distillation or operational subset.

---

## Architectural principles

These are non-negotiable. They govern every action.

1. **Determinism by default.** Where the methodology can be expressed as a function, it goes in a Python script under `skills/<name>/scripts/`. The LLM calls the script; it does not reproduce the logic.

2. **Primary source verification.** Externally-sourced values (earnings dates, FOMC schedule, hyperscaler IR pages) are verified against their source URL on a freshness cadence. Stale entries flag themselves.

3. **Append-only ledgers.** `events.json`, `outcomes.json`, `trades.json` are append-only. State changes are diffs.

4. **45-day horizon as standard.** Daily status, calendar lookahead, and position-risk overlays default to 45 days forward, aligned with typical options DTE.

5. **Routine over exception.** Protocols run daily, not just before special events. Cancun-class failures occur when defenses live in exception paths that don't fire.

6. **Skills decompose judgment from geometry.** Skills isolate the parts of the methodology that require pattern recognition from the parts that are deterministic math, so each can be reasoned about independently.

7. **No phantom references.** Documents do not cite files that have not been verified to exist. Scheduled files are marked by phase; existing files are marked verified; nothing else is named as if it were available.

---

## Canonical project structure

This is the authoritative directory layout. When Claude Code creates or modifies any skill, agent, command, script, or data file, files go where this tree indicates. Tags:

- `[verified]` — confirmed by user or visible to me in `/mnt/project/`.
- `[per memory — verify]` — believed to exist based on prior session context; Code should verify before relying.
- `Phase N` — scheduled for that phase, does not yet exist.
- (no tag) — convention slot; may or may not exist.

Paths for `agents/` and `commands/` should match the conventions of the existing Claude Code project. If those directories currently use `.claude/`-prefixed locations, adjust accordingly.

```
flywheel-claude-code/
├── CLAUDE.md                                  [per memory — verify]   Methodology memory loaded every Code session
│
├── data/
│   ├── MANIFEST.md                            Phase 1                 File inventory + status
│   ├── positions.json                         [per memory — verify]   Current portfolio
│   ├── trades.json                            [per memory — verify]   Trade log
│   ├── calendar.json                          Phase 1                 Maintained primary-source catalyst calendar
│   ├── forces.json                            Phase 2                 Force taxonomy + current state
│   ├── events.json                            Phase 2                 Append-only attributed event log
│   ├── outcomes.json                          Phase 2                 Append-only per-force directional ledger
│   ├── composite_history.json                 Phase 3A                Time-series of composite scores (one entry per date)
│   └── archive/                               Phase 1                 Archived data (preserved, out of active path)
│       └── README.md                          Phase 1
│
├── references/
│   ├── roadmap.md                             [verified]              This document
│   ├── channel-spec.md                        [verified]              Phase 4 channel construction spec
│   ├── data-sources.md                        Phase 1                 Primary source URLs per event type
│   ├── force-event-mapping.md                 Phase 2                 Event type → affected force IDs lookup
│   └── pattern-library.md                     Phase 2                 Empirical patterns documented
│
├── skills/                                                            Each skill is a directory with SKILL.md + scripts
│   ├── calendar-engine/                       Phase 1
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── compute_opex.py                                        3rd-Friday math; quarterly OPEX flagged
│   │       ├── compute_fomc.py                                        Reads reference schedule, computes days-until
│   │       ├── forward_window.py                                      Today + 45 days → events in window
│   │       ├── verify_calendar.py                                     Stale-entry detector against primary sources
│   │       └── compute_density.py                                     Events per week within window
│   │
│   ├── position-risk/                         Phase 1
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── compute_overlap.py                                     Open position × calendar → overlap matrix
│   │       └── risk_score.py                                          Per-position risk score
│   │
│   ├── force-attribution/                     Phase 2
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── classify_event.py                                      Event description → force IDs via mapping
│   │       ├── update_force_state.py                                  State machine: ACTIVE/ATTENUATING/DORMANT/REACTIVATED; analysis-driven reactivation
│   │       ├── match_keywords.py                                      Passive force surveillance — scan text against trigger_keywords
│   │       └── composite.py                                           Pure function over forces.json → composite score
│   │
│   ├── force-calibration/                     Phase 3A/3B
│   │   ├── SKILL.md                           Phase 3A
│   │   └── scripts/
│   │       ├── calibration_report.py          Phase 3A                Composite score trend viewer (read-only)
│   │       ├── channel_correlation.py         Phase 3B                Force events vs breakout timing correlation
│   │       ├── log_outcome.py                 Phase 3B                Log realized channel dominance observations
│   │       └── recalibrate_weights.py         Phase 3B                Adjust force weights against channel observations
│   │
│   ├── price-data/                            Phase 3A
│   │   ├── SKILL.md                                                   Fetch-process-research pipeline documentation
│   │   └── scripts/
│   │       ├── process_prices.py                                      OHLCV → gap/reversal detection, history upsert
│   │       └── log_price_event.py                                     Append attributed price event to events.json + outcomes.json
│   │
│   └── channel-pipeline/                      Phase 4                 Consolidated pipeline — spec in references/channel-spec.md
│       ├── SKILL.md
│       └── scripts/
│           ├── find_pivots.py                                         Pivot detection; velocity/acceleration characterization
│           ├── score_channels.py                                      Candidate scoring; envelopment; ranked output per direction
│           ├── channel_chart.py                                       Multi-candidate render with labels; primary interaction surface
│           ├── select_pair.py                                         Iterative pass logic; apex window filter for opposing candidates
│           └── build_geometry.py                                      Containment offset; apex (corrected formula); T+45 projection
│
├── agents/                                                            (or `.claude/agents/` per existing convention)
│   ├── weekend-session.md                     [verified]              Opus — synthesis layer; reads /status outputs; 10 blocks including calibration preview
│   ├── roll-evaluator.md                      [verified]              Sonnet — roll evaluation; Mode 1/2/3/4A/4B classification
│   ├── macro-analyst.md                       [verified]              Opus — force attribution for new events (Modes 1 and 2)
│   └── portfolio-accountant.md                [verified]              Haiku — portfolio metrics block for /status
│   (monday-scanner.md archived — superseded by /status)
│
└── commands/                                                          (or `.claude/commands/` per existing convention)
    ├── /weekend                               [verified]              Synthesis layer; reads week's /status outputs; 10 blocks W0–W10
    ├── /scan-rolls                            [verified]              Standalone; invoke only for intraday re-evaluation (Block 4 of /status handles daily)
    ├── /macro                                 [verified]              Force assignment for coming week; Mode 1 output
    ├── /status                                [verified]              Single daily kickoff: Blocks 0–5 (price→force→calendar→channel→roll→metrics)
    ├── /draw-channels                         [verified]              Full channel pipeline: OHLCV→pivots→score→chart→select→geometry→log; triggered by NEW_DRAWING_REQUIRED
    ├── /log-channel                           [verified]              Manual channel anchor entry; computes apex and T+45 projection; logs to channel_drawings.json
    ├── /forces                                [verified]              Current force state dump
    ├── /recalibrate                           [verified]              Calibration report + weight proposals; integrated into /weekend Block W10
    ├── /calendar                              Phase 1                 Show forward catalyst window
    ├── /verify-calendar                       Phase 1                 Manual trigger for staleness check
    └── /log-event                             RETIRED                 Replaced by automated price pipeline
```

### Conventions

- **Skill naming.** kebab-case folder names. SKILL.md at the root of each skill folder. Scripts under `scripts/`.
- **Data files.** All under `data/`. Append-only ledgers (`events.json`, `outcomes.json`, `trades.json`) are never edited in place — only appended.
- **References.** Markdown in `references/`. Read on demand. Skills with persistent rules embed those rules in their SKILL.md, not in `references/`.
- **Archive.** Anything moved out of active use goes to `data/archive/<original-name>.<YYYYMMDD>.json`. Never deleted unless truly never-needed.
- **Path convention for `agents/` and `commands/`.** Follow whatever convention the existing project uses. Verify before placing new files.

### Pre-Phase-1 cleanup

Before any Phase 1 file is added to `data/`:
1. In a Claude Code session, run an inventory of the current `data/` directory.
2. Classify each file: **active** (keep), **rename** (functional replacement coming), **archive** (move to `data/archive/`), **delete** (truly obsolete).
3. Execute the archive/delete actions in Code.
4. Create initial `data/MANIFEST.md` documenting the post-cleanup state.

This is a prerequisite to Phase 1 deliverables.

---

## CLAUDE.md integration

For this roadmap to function as the canonical structural reference, `CLAUDE.md` should include a directive along these lines:

> When creating, modifying, or locating any skill, agent, command, script, reference, or data file, consult `references/roadmap.md` section "Canonical project structure" before placing files. Do not invent new directory locations. If the appropriate location is unclear, ask before proceeding.

This converts the roadmap from a passive document into an active enforcement mechanism for project structure.

---

## Phase 1 — Calendar engine + daily status (immediate)

**Goal:** A daily `/status` invocation that surfaces the 45-day catalyst landscape, identifies position-risk overlaps, and flags any calendar entry whose primary-source verification is stale.

### Prerequisites
- Pre-Phase-1 `data/` directory cleanup (see above).
- `data/MANIFEST.md` created.

### Deliverables

**Data:**
- `data/calendar.json` — structured calendar with entries: `{ date, type, ticker, importance, affects_forces[], primary_source_url, last_verified_date, confirmed }`. Maintained.
- `references/data-sources.md` — primary source URLs for each event type (NVDA IR, hyperscaler IR pages, FOMC schedule, TSMC IR).

**Skill: `skills/calendar-engine/`** (per canonical tree)

**Skill: `skills/position-risk/`** (per canonical tree)

**Enhanced `/status` command:**
- Spot & active channel state (carryover from current `/status`)
- Open positions with P&L, DTE, distance to strike
- 45-day catalyst landscape from `forward_window.py`
- Position-risk overlap from `compute_overlap.py`
- Action items: roll thresholds, expiration-catalyst overlaps, channel boundary breaches, calendar verification staleness

### Acceptance criteria
- A hardcoded earnings date can't go stale silently. If `verify_calendar.py` flags a stale entry, `/status` shows the flag in its action items section.
- The 4/14/2026 scenario reproduced in test data shows the right warnings: 5/20 earnings inside the 5/22 expiration window, hyperscaler earnings 4/29–4/30 in the path.

---

## Phase 2 — Force attribution + outcomes ledger (next)

**Goal:** Convert the dashboard's manual event-logging workflow into a deterministic command pipeline, and start writing predictions/outcomes to a ledger that Phase 3 can learn from.

### Deliverables

**Data:**
- `data/forces.json` — force taxonomy migrated from dashboard state. Force IDs, names, categories, current state, weight, attenuation trend.
- `data/events.json` — append-only event log.
- `data/outcomes.json` — append-only predicted-vs-realized ledger.

**References:**
- `references/force-event-mapping.md` — lookup: event type → affected force IDs.
- `references/pattern-library.md` — empirical patterns documented.

**Skill: `skills/force-attribution/`** (per canonical tree)

**New slash commands:** `/forces` (per canonical tree). `/log-event` was built but retired in favor of the automated price pipeline (see price-data skill below).

### Acceptance criteria
- The end-of-day workflow becomes: `/status` detects any significant move automatically (via price pipeline), researches it, and surfaces attribution candidates for review. `forces.json` is updated once the user confirms.

---

## Phase 3 — Force calibration (split into 3A and 3B)

### Design principle

Macro force data (composite score) and price action observations (channel dominance) are collected independently to avoid confirmation bias. The composite score accumulates on its own timeline; channel dominance observations come from Len's chart readings once Phase 4 produces channel drawings. Only after the two datasets exist independently does calibration run.

---

### Phase 3A — Composite score history (active)

**Goal:** Persist the composite score over time as an independent variable. Every `/status` run appends a snapshot to `data/composite_history.json`. No weight changes. No channel input.

**Deliverables:**

- `data/composite_history.json` — one entry per date: composite_score, net_bullish, net_bearish, f1_multiplier, active/attenuating/dormant force lists, NVDA close (if supplied). Updated by `composite.py`, piggybacked on `/status`.
- `skills/force-calibration/scripts/calibration_report.py` — read-only trend viewer: score trajectory, score statistics, force state transitions, Phase 3B readiness summary.
- `skills/force-calibration/SKILL.md`
- `.claude/commands/recalibrate.md` — invokes calibration_report.py; documents Phase 3B deferral.

**Acceptance criteria:**
- Every `/status` run appends to composite_history.json without any user action.
- `/recalibrate` shows the score trajectory and makes no changes to any file.

**Status: Complete as of 2026-05-18.**

---

### Phase 3B — Threshold discovery + weight calibration (active as of 2026-05-19)

**Goal:** Match composite score history against dated channel dominance observations from Phase 4 channel drawings. Discover the score thresholds separating ascending / descending / wedge regimes. Then adjust force weights so the composite score crosses those thresholds more reliably.

**Gate condition:** Minimum 3 resolved channel drawings per regime class before recalibration runs. First drawing logged 2026-05-19 (ascending_dominant, provisional VSR — resolves when breakout confirmed).

**Deliverables (built):**

- `data/channel_drawings.json` — append-on-draw, update-on-resolve ledger. Each entry: anchor parameters, computed slopes, apex prediction, T+45 strike projection, macro composite context at time of drawing, outcome block (breakout date, direction, apex error, premature flag, preceding force event IDs).
- `skills/force-calibration/scripts/channel_correlation.py` — reads channel_drawings.json + events.json; identifies force events in a lookback window before each breakout; builds frequency tables for premature vs on-time breakouts; flags candidate "breakout-forcing" forces for Phase 3B weight calibration.
- `/log-channel` command — practitioner supplies anchor dates/prices from Fidelity chart; command computes slope, apex, T+45 projection, reads macro context, appends to channel_drawings.json.
- `skills/force-calibration/scripts/recalibrate_weights.py` — matches channel_drawings outcomes against composite_history; identifies score thresholds; adjusts force weights in forces.json with guardrails (minimum N observations per force, maximum ±15% weight change per cycle). Every run produces a human-readable diff for approval before committing.
- Updated `/recalibrate` — adds weight-change mode once 3B activates.

**Acceptance criteria:**
- `recalibrate_weights.py` requires explicit approval before writing to forces.json.
- Every approved weight change is committed to git with message: `recalibrate: YYYY-MM-DD -- <force> +/-N% -- N=X obs, threshold=Y`.
- `git log data/forces.json` shows weight evolution over time.
- The composite.py interpretation thresholds (currently arbitrary) are replaced with empirically derived values once the threshold is confirmed across sufficient observations.

---

## Phase 4 — Channel drawing pipeline (operational as of 2026-05-19)

**Goal:** A deterministic channel-construction pipeline that produces ranked channel candidates from OHLC data, renders them for practitioner selection, and computes apex and T+45 projections from the accepted pair.

**Status:** `/draw-channels` runs the full pipeline end-to-end. Triggered automatically when `/status` Block 3 sets `NEW_DRAWING_REQUIRED` (breakout detected, apex lapsed, or no active drawing exists). `/log-channel` remains available for manual anchor entry.

Full specification: `references/channel-spec.md`.

### Pipeline overview

```
[ OHLC bars ]
    ↓
find_pivots.py       → pivots with velocity and acceleration at each point
    ↓
score_channels.py    → ranked candidate channels (both directions); direction-agnostic scoring
    ↓
channel_chart.py     → multi-candidate chart rendered; practitioner selects via toggle
    ↓
select_pair.py       → iterative pass (elective) if one direction missing; apex window filter
    ↓
build_geometry.py    → containment offset; apex; T+45 projection
    ↓
[ Accepted channel pair → channel_drawings.json → strike screener, /status ]
```

### Key design decisions (established 2026-05-19)

- **Direction-agnostic scoring.** Prevailing vs opposing is determined by the scoring function (length × (1/slope) × recency discount), not by assuming ascending = prevailing.
- **Backwards-iterative anchor search.** Start from today, step back in ~1-month increments. The most recent high-acceleration inflection point is the anchor candidate at each lookback depth. Mirrors manual drawing practice.
- **Velocity/acceleration pivot characterization.** High acceleration = genuine inflection (anchor candidate). Low acceleration = oscillation (constituency member). Velocity similarity groups pivots belonging to the same trend.
- **Candidate selection, not confirmation.** The practitioner sees all candidates on a chart and rejects incorrect ones. Algorithm handles all anchor identification and geometry. Regime classification (the three-way a/b/c question) remains human judgment.
- **Iterative pass (elective).** If only one direction is selected, an optional second pass generates candidates for the missing direction with relaxed parameters. Single-channel result (no wedge) is valid for T+45 strike projection.
- **Corrected apex formula.** Prior formula was missing the t_aph correction term. Corrected general form in channel-spec.md.

### Build order

1. `find_pivots.py` — foundational; deterministic; testable against known OHLCV data
2. `build_geometry.py` — define clean output interface first; pure math
3. `score_channels.py` — scoring, velocity coherence, envelopment bonus
4. `channel_chart.py` — multi-candidate visualization; central to interaction model
5. `select_pair.py` — iterative pass, apex window filter
6. `SKILL.md` — documents the selection workflow and human judgment gates

### Open algorithm questions

See `references/channel-spec.md` Section "Open Questions" for the full list. These are active refinement items, not blockers: recency decay function, velocity tolerance for constituency grouping, acceleration threshold for anchor qualification, apex window bounds, trendln vs custom pivot detection.

---

## Cross-cutting future considerations

- **Daily status notification.** If `/status` runs but no human reads it, it's no defense against a Cancun-class miss. Worth thinking about a notification path (email, mobile push) when action items appear, separate from the protocol that produces them.
- **Test data fixtures.** Each phase should ship with a frozen test scenario that reproduces a historical case (e.g., the 4/14 breakout) and verifies the system would have raised the right flags at the right time.
- **Backfill of `events.json` and `outcomes.json`.** Phase 3 calibration is only useful with sufficient data. Migrating the dashboard's historical event log into the Claude Code structure is a one-time effort that pays off when Phase 3 activates.
