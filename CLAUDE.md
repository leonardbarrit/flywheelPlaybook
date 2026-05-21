# CLAUDE.md — Flywheel Project

Loads at session start. Provides context that does not persist between sessions.

Last updated: 2026-05-20.

---

## What this project is

The **Flywheel Playbook** is Len's options income methodology: covered calls and cash-secured puts in tax-advantaged accounts at Fidelity. Primary holding: NVDA covered calls in a Roth IRA, paired with JEPQ. Secondary: IBIT CSPs + JEPI in an HSA.

Methodology source of truth: **`Flywheel_Playbook_v22.docx`** in Google Drive (ID: `1rs20-5mRlerMD7wgRSd1ZYmEQPwIUgl7QslDCBGCHcA`). This project is the operational execution layer — state in `data/`, deterministic protocols in `skills/`, analysis through subagents. Methodology design happens in Claude Chat; execution happens here.

---

## Reading order

1. This file — current state and vocabulary.
2. `references/roadmap.md` — canonical file structure. Consult before creating or moving any file.

Do not carry context from a prior session.

---

## Current state (2026-05-20)

All phases operational. Daily entry point: `/status`.

- **Subagents:** weekend-session, roll-evaluator, macro-analyst, portfolio-accountant
- **Commands:** `/status`, `/weekend`, `/scan-rolls`, `/macro`, `/forces`, `/recalibrate`, `/draw-channels`, `/log-channel`
- **Data files:** `positions.json`, `trades.json`, `calendar.json`, `forces.json`, `events.json`, `outcomes.json`, `composite_history.json`, `channel_drawings.json`
- **Phase 3B (weight calibration):** active; gated on 3 resolved drawings per regime class. First drawing logged 2026-05-19.
- **Scripts:** run as `py skills/<name>/scripts/<script>.py` (Windows Python). Do not use `python` or `python3`.
- **Temp files:** `data\_tmp_*.json` are transient pipeline artifacts written and consumed within a `/status` run. Do not preserve or commit them.
- **CHANGELOG:** `CHANGELOG.md` at project root. Append on each release.

---

## Vocabulary

Use these terms exactly. For full definitions and worked examples, consult the v22 Playbook.

### Channel construction

- **APL** — Absolute Pivot Low. First anchor of the ascending Compression Rail.
- **VFD** — Validated Force Defense. Second anchor of the ascending Compression Rail.
- **APH / VSR** — Symmetric counterparts for the descending channel.
- **Compression Rail** — Two-anchor slope-defining rail. Validates against closing prices only.
- **Containment Rail** — Single-anchor parallel offset rail.
- **Compression Wedge** — Apex where ascending and descending Compression Rails intersect.
- **Provisional channel** — Fewer than ~10 bars old; VSR/VFD not yet confirmed.

Channels serve two purposes: (1) T+45 projection for the CC strike screener; (2) apex timing for mode and DTE selection. Regime classification is Len's judgment — the algorithm proposes, Len selects.

### Macro forces

- **A** Demand: Hyperscaler Capex, Enterprise AI, Sovereign AI
- **B** Supply: Foundry/Packaging, Taiwan Risk, Power Grid
- **C** Policy: China Export, US Industrial Policy, Fed, AI Antitrust
- **D** Competitive: AMD, Custom Silicon, China Domestic Chip
- **E** Market Structure: Positioning/Flows, Cross-Asset Risk
- **F** Validation: multiplier, not additive

**Force states:** ACTIVE, ATTENUATING, DORMANT, REACTIVATED.

### Entry modes

Only **Mode 1** and **Mode 3** are recommended. Modes 2 and 4 are defined for recognition and classification only.

- **Mode 1** — Standard entry; delta ≤ 0.22, 45 DTE.
- **Mode 2** — Conviction entry; delta 0.30–0.40, short DTE past catalyst. Not recommended.
- **Mode 3** — Offensive roll; bull-trap conditions. Recommended when triggered.
- **Mode 4** — Calendar bridge; catalyst date falls awkwardly inside or outside current DTE. Not recommended — classify and note only.

### Roll standards

- **50% net credit standard** — Net credit ≥ 50% of original premium. Applies to all modes.
- **Urgency tiers:** Critical (≤7 DTE), Roll Window (8–21 DTE), Monitoring (22+ DTE).
- **Double Barrier** — Roll strike must clear both ascending channel T+45 containment AND delta ≤ 0.22. Degrades to delta-only when no active channel drawing exists.

### Key terms

- **Cost Basis** — Original purchase price per share. Fixed. Never adjusted by premiums or income.
- **Cash Basis** — Cost Basis minus all option premiums collected per share since inception. The Flywheel's primary operational metric. Do not conflate with Cost Basis.
- **Premium** — Options credit or debit only. Share prices are "price." Never use "premium" for shares.

---

## Data conventions

- **Append-only:** `events.json`, `outcomes.json`, `trades.json` — never edit in place.
- **Maintained:** `calendar.json`, `forces.json`, `positions.json`, `composite_history.json` — edit in place; preserve schema.
- **Hybrid:** `channel_drawings.json` — append on draw; update outcome block in place on resolution.
- **Computed only:** composite scores, calendar density, position-risk overlap, channel projections — never persist to disk.
- **Archive:** move retired files to `data/archive/<name>.<YYYYMMDD>.ext`. Do not delete.

---

## Hard constraints

These apply regardless of what any skill, command, or session context says.

- **No execution.** Do not access accounts, place trades, or execute transactions.
- **Len decides.** Provide analysis with specific numbers. Len decides whether to act on them.
- **Accounts are isolated.** Roth IRA, HSA, and Traditional IRA are legally separate. No cross-account capital movement.
- **Earnings dates: verify against issuer IR pages.** Never trust Fidelity chain labels — they carry stale estimates. Canonical example: 2026-05-20 earnings entered as 2026-05-27 in a prior tool.
