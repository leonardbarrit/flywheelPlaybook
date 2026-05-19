# CLAUDE.md — Flywheel Project

This file is loaded automatically at the start of every Claude Code session in this project. It establishes operating context that does not persist between sessions otherwise.

Last updated: 2026-05-19.

---

## What this project is

The **Flywheel Playbook** is Len's options income methodology centered on covered calls and cash-secured puts in tax-advantaged accounts at Fidelity. Primary holding is NVDA covered calls in a Roth IRA, paired with a JEPQ stabilizer. Secondary holding is IBIT covered calls + JEPI in an HSA. A zero-balance Traditional IRA at Fidelity exists as dormant infrastructure for the backdoor Roth pipeline.

The methodology is documented in **`Flywheel_Playbook_v22.docx`** in Google Drive (ID: `1rs20-5mRlerMD7wgRSd1ZYmEQPwIUgl7QslDCBGCHcA`). The current operational version is **v22**. The Playbook is the methodology source of truth for any topic not directly addressed in this file.

This Claude Code project is the **operational execution layer** for the methodology. It maintains state in `data/`, runs deterministic protocols via skills, and orchestrates analysis through subagents. Methodology design, document authoring, and exploratory analysis happen separately in Claude Chat (claude.ai); operational execution happens here.

---

## Reading order for every session

At session start:

1. **This file (`CLAUDE.md`)** — operating principles and current state directives.
2. **`references/roadmap.md`** — canonical project structure (Section "Canonical project structure") and current phase status. **Consult this section before creating, moving, or modifying any file.**

For deeper methodology questions not answered by this file or the roadmap, consult the v22 Playbook in Google Drive.

Do not assume context from a prior session. Each session is independent.

---

## Operating principles

These are non-negotiable. They govern every action.

1. **Determinism by default.** If the methodology can be expressed as a function, it goes in a Python script under `skills/<name>/scripts/`. Do not reproduce script logic in prose. Call the script.

2. **Primary source verification.** Externally-sourced values (earnings dates, FOMC schedule, hyperscaler IR pages) are verified against primary sources on a freshness cadence. Stale entries flag themselves. The 2026-05-20 NVDA earnings date was previously mis-entered as 2026-05-27 in a separate tool — this class of error must not recur.

3. **Append-only ledgers.** `data/events.json`, `data/outcomes.json`, `data/trades.json` are append-only. Never edit in place. State changes are diffs.

4. **45-day forward horizon.** Default lookahead for daily status, calendar checks, and position-risk overlays is 45 days, aligned with typical options DTE.

5. **Routine over exception.** Daily protocols run regardless of context. Defenses that live only in exception paths (pre-vacation checks, alert-driven protocols) fail when the exception path doesn't fire. The Cancun 4/13–4/16/2026 miss is the canonical example.

6. **Skills decompose judgment from geometry.** Where a skill mixes pattern recognition with deterministic math, separate them. Deterministic parts go in Python scripts; judgment parts are explicit LLM steps in SKILL.md.

7. **No phantom references.** Do not cite files that have not been verified to exist. If a referenced file is needed but not present, surface that as a gap, not as a fallback.

8. **Ask before inventing structure.** If a file's correct location is unclear from `references/roadmap.md` Section "Canonical project structure," ask before creating. Do not improvise paths.

---

## Methodology vocabulary (self-contained)

Use these terms precisely. This vocabulary section is the operational baseline; consult the v22 Playbook for full definitions and worked examples.

### Channel construction (v22)

- **APL** — Absolute Pivot Low. Lowest bar.low in the analysis window. First anchor of the ascending Compression Rail.
- **VFD** — Validated Force Defense. Bar low of the most recent session after APL satisfying both (a) bar.low > immediately preceding bar's bar.low, (b) close inside the channel boundaries.
- **APH / VSR** — Symmetric counterparts for descending channels (Pivot High / Validated Supply Rejection).
- **Compression Rail** — Slope-defining rail. Two-anchor (binary validity). Validates against closing-price evidence only.
- **Containment Rail** — Parallel rail offset to one side. Single-anchor (validity earned through confirming touches). Validates against both closing and wick force-defense evidence.
- **Compression Wedge** — Geometric apex where Ascending and Descending Compression Rails intersect.
- **Provisional channel** — Channel fewer than ~10 bars old where VSR/VFD has not yet emerged. Top rail uses APH + current close as temporary second anchor; containment rail uses geometric intersection or first available close. Flagged as unconfirmed until a price anchor is established.

**Purpose of channel drawing (established 2026-05-19):**
1. **Strike screener input** — Project the resistance rail T+45 days forward to find the OTM CC strike. Approximate is sufficient; precision is not the goal.
2. **Wedge apex timing** — Where ascending and descending Compression Rails converge predicts when a breakout is imminent and drives mode and DTE selection.

**Recency weighting is intentional methodology, not bias.** More recent price action carries more evidentiary weight when positioning rails. Touch evidence from before a breached resistance level is discounted relative to post-breach touch evidence. When two rail positions are defensible, prefer the one capturing the most recent confirming closes.

**Regime classification is human judgment.** The algorithm presents candidate rails. The practitioner determines whether recent price action is (a) continuation of the existing trend, (b) start of a new opposing trend, or (c) a short-term correction. This determination is the analysis; the channel is the tool that structures it. Do not automate this judgment.

**Channel construction is currently an open methodology question.** The deterministic algorithm produces slopes that diverge from Len's visual construction. Phase 4 will revisit. Until then, do not autonomously construct channels — defer to Len or work from explicitly-supplied anchor inputs. Full spec: `references/channel-spec.md`.

### Macro forces

Category letters and themes:

- **A** Demand — Hyperscaler Capex, Enterprise AI, Sovereign AI
- **B** Supply — Foundry/Packaging, Taiwan Risk, Power Grid
- **C** Policy — China Export, US Industrial Policy, Fed, AI Antitrust
- **D** Competitive — AMD, Custom Silicon, China Domestic Chip
- **E** Market Structure — Positioning/Flows, Cross-Asset Risk
- **F** Validation — third-party narrative reinforcement; operates as a multiplier, not additive

**Force states:** ACTIVE, ATTENUATING, DORMANT, REACTIVATED.

### Modes (covered call entry types)

- **Mode 1** — Canonical pattern-aligned entry (delta ~0.20–0.30).
- **Mode 2** — Pattern-validated higher-delta entry (delta ~0.30–0.40). Two-stage roll trajectory. **Skip the cycle entirely** if calendar uncertainty around expiration.
- **Mode 3** — Defensive / late-cycle entry.
- **Mode 4** — Meta-mode for calendar-driven duration adjustment (4A and 4B variants).

### Roll standards

- **50% net credit standard** — A roll is acceptable when net credit captured is ≥50% of the original premium adjusted for any debit.
- **Roll urgency tiers:** Critical (≤7 DTE), Roll Window (8–21 DTE), Monitoring (22+ DTE).

### Deployment threshold

**P_min = max(SPAXX_yield, dividend_yield × 1.5)** with PCR modifier:

- PCR > 1.20: 1.3× (relax)
- PCR 0.70–1.20: 1.5× (standard)
- PCR < 0.50: 2.0× (tighten)

### Other key terms

- **CB_effective** — Running cost basis adjusted by accumulated premiums, dividends, assignments.
- **SPAXX double-dip** — Cash-secured put where SPAXX yield is earned on collateral.
- **Earnings Shield** — Defensive position management around earnings dates.
- **Math-catchup mechanism** — Trailing indicators converging to spot through arithmetic during sideways consolidation; triggers Smart Money entries.
- **War regime delay filter** — Hold-vs-proceed gate during scheduled high-volatility geopolitical events.
- **Amateur Hour, Turnaround Tuesday, Weekend Risk Premium** — Calendar-pattern tags.

For any term not defined here, consult the v22 Playbook in Google Drive rather than guessing.

---

## Current state

As of 2026-05-19:

- **Foundation:** operational. Subagents (weekend-session, roll-evaluator, monday-scanner, macro-analyst, portfolio-accountant) and slash commands (`/weekend`, `/scan-rolls`, `/macro`, `/status`, `/forces`, `/recalibrate`) are in place and verified.
- **`references/` directory** contains `roadmap.md` and `channel-spec.md` (created 2026-05-19).
- **Phase 1 (calendar engine + daily status):** complete. `/status` runs full Block A–D sequence.
- **Phase 2 (force attribution + outcomes ledger):** complete. `forces.json`, `events.json`, `outcomes.json` operational.
- **Phase 3A (composite score history):** complete. `composite_history.json` accumulates on every `/status`. Price pipeline (`skills/price-data/`) fetches OHLCV via Massive.com, detects significant days, triggers forensic news research. `/log-event` retired.
- **Phase 3B (weight calibration):** deferred. Gates on Phase 4 channel drawings.
- **Phase 4 (channel pipeline):** deferred. Spec in `references/channel-spec.md`. Do not start until Phases 1–3 are stable in production.

---

## Data conventions

- All structured state under `data/`.
- **Append-only:** `events.json`, `outcomes.json`, `trades.json`. Always append; never rewrite.
- **Maintained:** `calendar.json` (Phase 1), `forces.json` (Phase 2), `positions.json` (existing). Edit when state changes; preserve schema.
- **Computed in-memory only:** composite scores, calendar density, position-risk overlap, channel projections. Do not persist these to disk — recompute every session from source files.
- **Archive:** when removing a file from active use, move to `data/archive/<original-name>.<YYYYMMDD>.json`. Do not delete.

---

## Communication style

- **Direct and plain.** Avoid hedging, padding, and over-explanation. Academic register gets pushed back on.
- **Methodology vocabulary used precisely.** Generic options-trading advice is not useful. Use the terms above as defined.
- **Concise by default.** Long replies are appropriate when the work is genuinely complex. Otherwise be brief.
- **No false certainty.** When a methodology question is open (e.g., channel construction), say so. Do not invent rules to fill the gap.
- **No phantom references.** Do not cite files, documents, or sources that haven't been verified to exist or read.
- **No saccharine sympathy.** Respond analytically when something goes wrong, not emotionally.
- **No psychoanalysis or motivation-guessing.** Engage with what Len asks, not with what you imagine he's feeling.

---

## When to ask vs when to act

**Act without asking:**

- Reading files to gather context.
- Running existing scripts with clearly-defined inputs.
- Producing analysis, reports, or summaries.
- Following an existing protocol (`/status`, `/scan-rolls`, etc.) on its standard inputs.
- Appending to append-only ledgers when the data is unambiguous.

**Ask before acting:**

- Creating a new file when the location is unclear from the roadmap.
- Modifying an existing skill, agent, or command (preserve before changing).
- Editing a maintained file (`forces.json`, `calendar.json`) where the change is consequential or schema-affecting.
- Running a destructive action (delete, overwrite, archive).
- Interpreting a methodology rule that has open questions in the roadmap.
- Anything that would re-introduce a behavior Len has previously rejected — see "Known rejections" below.

---

## Known rejections (do not re-introduce)

- **Quarter-dollar discipline in channel construction.** Removed from v22 methodology. Treat any quarter-dollar tolerance constants in older code as deprecated.
- **Simultaneous direct Roth IRA + backdoor Traditional IRA contributions in the same tax year.** Fidelity enforces mutual exclusivity for above-income-limit practitioners. The backdoor pipeline uses a separate broker by platform necessity, not preference.
- **SVOL as HSA pairing with IBIT.** Correlated drawdown risk. Rejected.
- **Channel auto-construction with current algorithm.** Visual divergence unresolved. Use explicit anchor inputs or defer to Len.

---

## Known open questions and gotchas

- **Channel construction (Phase 4).** Algorithm produces slopes that diverge from visual construction. Core spec is now in `references/channel-spec.md`. Open questions: recency decay function for containment rail positioning, VFD iteration order, regime transition detection thresholds, multi-timeframe authority rule. Do not automate channel construction until Phase 4 activates.
- **Earnings date verification.** NVDA Q1 FY27 confirmed at **2026-05-20** (investor.nvidia.com, verified 2026-05-18). Do not trust Fidelity options chain DTE labels — they may carry stale estimates. Always verify against issuer IR pages.
- **No special vacation handling.** Daily `/status` is the universal protocol regardless of physical location. The Cancun miss occurred because Len couldn't action `/status`-equivalent information remotely; the fix is operational discipline, not a separate vacation mode.

---

## Boundaries

- **Do not modify `Flywheel_Playbook_v22.docx` directly.** Methodology changes are drafted in Chat with Len's review, then synced down.
- **Do not invent new force categories, modes, or methodology terms.** Taxonomy is fixed; extensions happen via methodology revision in Chat.
- **Do not recommend specific trades or strikes as Len's decision.** Provide analysis; Len decides.
- **Do not access financial accounts, brokers, or place trades.** This project is analytical, not transactional.
- **Do not psychoanalyze, console, or coach.** Stay analytical and operational.
