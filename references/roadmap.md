# Flywheel Roadmap

Living document. Phases are sequenced by dependency, not calendar. Channel work in Phase 4 is exploratory — the pipeline below is the current working hypothesis and is subject to revision as we learn more.

Last updated: 2026-05-18.

---

## Current state (2026-05-18)

**Verified operational components (per project memory; verify before relying):**
- `CLAUDE.md` at project root.
- 5 subagent definitions: weekend-session (Opus), roll-evaluator (Sonnet), monday-scanner (Sonnet), macro-analyst (Opus), portfolio-accountant (Haiku).
- 4 slash commands: `/weekend`, `/scan-rolls`, `/macro`, `/status`.
- `data/positions.json` and `data/trades.json`, maintained via Fidelity screenshot workflow.

**Verified reference content:**
- `references/roadmap.md` — this document.

**Methodology source of truth:**
- `Flywheel_Playbook_v22.docx` in Google Drive (ID: `1rs20-5mRlerMD7wgRSd1ZYmEQPwIUgl7QslDCBGCHcA`). This is the canonical methodology document. All other methodology content in this project is a distillation or operational subset.

**Inherited issues to fix:**
- Earnings calendar dates have historically been entered manually with no primary-source verification. The 2026-05-20 NVDA earnings date was mis-entered as 2026-05-27 in a prior dashboard. Primary-source verification is a Phase 1 requirement.
- `data/` directory contains files from prior iterations that may be obsolete. Pre-Phase-1 cleanup pass required (see below).

**Open methodology questions:**
- Channel construction (Compression Rail / Containment Rail) is unresolved. The deterministic algorithm produces slopes that diverge from visual construction. Quarter-dollar discipline has been removed from the methodology. The right rule for selecting the second Compression Rail anchor remains open. **The channel skill is not blocking other work and is deferred to Phase 4.**

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
│   │       ├── update_force_state.py                                  Recompute ACTIVE/ATTENUATING/DORMANT
│   │       └── composite.py                                           Pure function over forces.json → composite score
│   │
│   ├── force-calibration/                     Phase 3A/3B
│   │   ├── SKILL.md                           Phase 3A
│   │   └── scripts/
│   │       ├── calibration_report.py          Phase 3A                Composite score trend viewer (read-only)
│   │       ├── log_outcome.py                 Phase 3B                Log realized channel dominance observations
│   │       └── recalibrate_weights.py         Phase 3B                Adjust force weights against channel observations
│   │
│   ├── price-data/                            Phase 3A
│   │   ├── SKILL.md                                                   Fetch-process-research pipeline documentation
│   │   └── scripts/
│   │       └── process_prices.py                                      OHLCV → gap/reversal detection, history upsert
│   │
│   ├── channel-pivots/                        Phase 4                 Exploratory — spec subject to revision
│   ├── channel-regime/                        Phase 4                 Exploratory — spec subject to revision
│   ├── channel-slope/                         Phase 4                 Exploratory — spec subject to revision
│   ├── channel-anchors/                       Phase 4                 Exploratory — spec subject to revision
│   └── channel-geometry/                      Phase 4                 Exploratory — spec subject to revision
│
├── agents/                                                            (or `.claude/agents/` per existing convention)
│   ├── weekend-session.md                     [per memory — verify]   Opus — strategic review
│   ├── roll-evaluator.md                      [per memory — verify]   Sonnet — roll evaluation
│   ├── monday-scanner.md                      [per memory — verify]   Sonnet — entry opportunities
│   ├── macro-analyst.md                       [per memory — verify]   Opus — force attribution for new events
│   └── portfolio-accountant.md                [per memory — verify]   Haiku — enhanced in Phase 1 to produce daily /status
│
└── commands/                                                          (or `.claude/commands/` per existing convention)
    ├── /weekend                               [per memory — verify]
    ├── /scan-rolls                            [per memory — verify]
    ├── /macro                                 [per memory — verify]
    ├── /status                                [per memory — verify]   Enhanced in Phase 1 with 45-day catalyst landscape
    ├── /calendar                              Phase 1                 Show forward catalyst window
    ├── /verify-calendar                       Phase 1                 Manual trigger for staleness check
    ├── /log-event                             RETIRED                 Replaced by automated price pipeline
    ├── /forces                                Phase 2                 Current force state dump
    └── /recalibrate                           Phase 3A                Trend viewer now; weight recalibration in Phase 3B
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

### Phase 3B — Threshold discovery + weight calibration (gates on Phase 4)

**Goal:** Match composite score history against dated channel dominance observations from Phase 4 channel drawings. Discover the score thresholds separating ascending / descending / wedge regimes. Then adjust force weights so the composite score crosses those thresholds more reliably.

**Gate condition:** Phase 4 must produce channel drawings with dated dominance periods before Phase 3B can activate.

**Deliverables (not yet built):**

- `skills/force-calibration/scripts/log_outcome.py` — accepts dated channel dominance observations (ascending / descending / wedge) sourced from Len's chart readings. Appends to a new `data/channel_observations.json` ledger.
- `skills/force-calibration/scripts/recalibrate_weights.py` — matches channel_observations against composite_history; identifies score thresholds; adjusts force weights in forces.json with guardrails (minimum N observations per force, maximum ±15% weight change per cycle). Every run produces a human-readable diff for approval before committing.
- Updated `/recalibrate` — adds weight-change mode once 3B activates.

**Acceptance criteria:**
- `recalibrate_weights.py` requires explicit approval before writing to forces.json.
- Every approved weight change is committed to git with message: `recalibrate: YYYY-MM-DD -- <force> +/-N% -- N=X obs, threshold=Y`.
- `git log data/forces.json` shows weight evolution over time.
- The composite.py interpretation thresholds (currently arbitrary) are replaced with empirically derived values once the threshold is confirmed across sufficient observations.

---

## Phase 4 — Channel drawing pipeline (deferred, exploratory)

**Goal:** A deterministic channel-construction pipeline that produces visually-correct Compression and Containment Rails from OHLC data.

### Status: Working hypothesis only

The stage decomposition below is the current best guess based on how a human reads a chart sequentially. The sequence has not been validated by implementation. Stages may be merged, split, reordered, or replaced. The hybrid stage-2 approach (manual regime annotation) is the intended starting point because building an autonomous regime classifier is non-trivial and the manual path unblocks stages 3–5 quickly.

### Working pipeline hypothesis

```
[ OHLC bars ]
    ↓
1. channel-pivots         → list of structural pivots
    ↓
2. channel-regime         → segments tagged oscillating | ascending-contained | descending-contained
    ↓
3. channel-slope          → slope per contained segment, anchored on pivots
    ↓
4. channel-anchors        → final (pivot-A, pivot-B) for slope rail; offset anchor for containment rail
    ↓
5. channel-geometry       → rail equations, touch counts, breakout flags, projections
    ↓
[ Channel object → strike screener, status, etc. ]
```

### Per-stage notes

**Stage 1 — channel-pivots**
- Likely deterministic: swing high/low identification with parameterized window (e.g., bar is a swing low if `bar.low` is lower than the N bars before and after).
- Output: `[{ bar_index, type: "swing_high" | "swing_low", value, sigma_significance }]`
- Open question: is a single window-N parameter enough, or do we need multi-scale pivot detection?

**Stage 2 — channel-regime**
- Hardest stage. Distinguishing range-bound oscillation from directional containment.
- **Starting approach: manual annotation.** User marks each segment. Skills downstream read the annotation. This unblocks stages 3–5.
- **Later approach (if needed): autonomous classifier.** Statistical (ADF, Hurst, slope-of-pivot-regression) or LLM pattern recognition.

**Stage 3 — channel-slope**
- Deterministic given a contained segment and its pivots.
- Open question: least-squares fit through all pivots, pivot-pair extremes, or the v22 "most recent VFD after APL" rule. The visual-construction question we hit in v22 lives here.

**Stage 4 — channel-anchors**
- Deterministic given correct slope and pivot inputs.
- Slope rail anchors: which pivots define the rail.
- Containment rail offset: parallel line maximizing touch count along its length.

**Stage 5 — channel-geometry**
- Pure math.
- Rail equations, touch counts, breakout detection, forward projection, strike screener output.

### Build order when this phase activates

1. Stage 1 first (pivots are foundational and largely deterministic).
2. Stage 5 next (define clean interface).
3. Stage 4 (anchor-selection logic with cleanly-typed inputs).
4. Stage 3 (slope derivation rule TBD — possibly multiple variants behind a flag).
5. Stage 2 manual annotation interface.
6. Stage 2 autonomous classifier — optional upgrade.

### Decisions explicitly deferred to Phase 4 activation

- Swing pivot window size (single or multi-scale).
- Slope derivation rule (least-squares vs pivot-pair vs Appendix-D's VFD/VSR rule).
- Whether stage 2 stays manual indefinitely or graduates to an autonomous classifier.
- Whether Compression Rail validation should accept wick touches (currently spec'd as closing-only).
- Whether the closing-price tolerance is right at all timeframes or should scale with bar resolution.

These are intentionally open. Re-derive at activation time rather than committing now.

---

## Cross-cutting future considerations

- **Daily status notification.** If `/status` runs but no human reads it, it's no defense against a Cancun-class miss. Worth thinking about a notification path (email, mobile push) when action items appear, separate from the protocol that produces them.
- **Test data fixtures.** Each phase should ship with a frozen test scenario that reproduces a historical case (e.g., the 4/14 breakout) and verifies the system would have raised the right flags at the right time.
- **Backfill of `events.json` and `outcomes.json`.** Phase 3 calibration is only useful with sufficient data. Migrating the dashboard's historical event log into the Claude Code structure is a one-time effort that pays off when Phase 3 activates.
