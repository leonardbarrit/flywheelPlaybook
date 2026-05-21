# Changelog

All notable changes to the Flywheel Playbook operational system are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0] — 2026-05-20

First tagged release. Covers the full build from initial commit through Phase 4 operational status. All core phases (1–4) are running; Phase 3B calibration is active and gated on channel drawing accumulation.

### Added

**Project foundation**
- Initial operational layer: `CLAUDE.md`, `data/positions.json`, `data/trades.json`, `data/calendar.json`, `data/forces.json`
- Subagents: `weekend-session` (Opus), `roll-evaluator` (Sonnet), `macro-analyst` (Opus), `portfolio-accountant` (Haiku)
- Slash commands: `/status`, `/weekend`, `/scan-rolls`, `/macro`, `/forces`, `/recalibrate`, `/log-channel`
- Skills: `calendar-engine`, `position-risk`, `force-attribution`
- `data/MANIFEST.md` — canonical file inventory

**Phase 3A — Composite score history** *(2026-05-18)*
- `data/composite_history.json` — daily composite score snapshots; one entry per `/status` run
- `skills/force-calibration/scripts/calibration_report.py` — read-only score trajectory viewer
- `/recalibrate` command — calibration report + weight proposal preview (apply gate: manual only)

**Price data pipeline** *(2026-05-18)*
- `skills/price-data/scripts/process_prices.py` — OHLCV fetch, gap and reversal detection, history upsert
- `skills/price-data/scripts/log_price_event.py` — appends attributed price events to `events.json` and `outcomes.json`
- Open/close price distinction and intraday reversal detection added to price processing
- `/status` Block A0 moved to main context (MCP required); subagent receives processed prices as arguments
- `/log-event` retired — replaced by automated pipeline

**Phase 4 — Channel drawing system** *(2026-05-19)*
- `skills/channel-pipeline/` — consolidated pipeline (5 prior channel-* directories merged to 1):
  - `find_pivots.py` — pivot detection with velocity and acceleration characterization
  - `score_channels.py` — direction-agnostic candidate scoring with recency discount
  - `channel_chart.py` — multi-candidate chart for practitioner selection via toggle
  - `select_pair.py` — iterative pass for missing direction; apex window filter
  - `build_geometry.py` — containment offset, apex (corrected formula), T+45 projection
- `data/channel_drawings.json` — append-on-draw, update-on-resolve ledger
- `/log-channel` command — manual anchor entry; computes slope, apex, T+45; logs to `channel_drawings.json`
- `/draw-channels` command — full automated pipeline triggered by `NEW_DRAWING_REQUIRED`
- `skills/force-calibration/scripts/log_outcome.py` — logs resolved breakout outcomes
- `skills/force-calibration/scripts/recalibrate_weights.py` — weight calibration against channel observations (gated: ≥3 resolved drawings per regime class)
- `skills/force-calibration/scripts/channel_correlation.py` — force event × breakout timing correlation
- `references/channel-spec.md` — full Phase 4 specification; apex formula correction documented
- First channel drawing logged: `draw-2026-05-19-002` (ascending_dominant, 4h, NVDA)

**Documentation and cleanup** *(2026-05-20)*
- `README.md` — project overview for GitHub
- `CLAUDE.md` rewritten lean: negative rules offloaded to individual skills; Mode 4A/4B collapsed to Mode 4; Mode 1 and Mode 3 explicitly marked as the only recommended modes
- `roll-evaluator.md` fully rewritten: bidirectional calendar shift check; Mode 4 surfaces situation only
- `references/roadmap.md` — Phase 4 marked operational; verified agent and command lists
- `data/MANIFEST.md` — archive section updated; schema corrections

### Fixed

- **Apex formula** — prior wedge intersection formula was missing the `t_aph` correction term, producing an apex date ~30+ bars too early. Corrected in `references/channel-spec.md` and `/log-channel`
- **IBIT round-number levels** — prior document referenced `$50K/$100K` increments (BTC futures pricing). Corrected to `$5` increments consistent with IBIT ETF price range (~$35–55)
- **`/status` Block A0 context** — MCP tools (market data) are unavailable inside subagents. Block A0 moved to main context; subagent receives results as arguments

### Removed / Archived

- `data/macro-forces/` — Phase 2 development directory (50 files) archived to `data/archive/macro-forces.20260520/`. Canonical data migrated to `data/` root during Phase 2
- `skills/force-attribution/scripts/reconstruct_events.py`, `migrate_forces.py` — one-time Phase 2 bootstrap scripts archived
- `.claude/agents/aggregate-analyst.md`, `monday-scanner.md` — retired; superseded by `/status` and `weekend-session`
- `.claude/commands/log-event.md`, `macro-update.md`, `report.md` — retired; replaced by automated pipeline and `/status`
- `data/_tmp_*.py`, `data/_tmp_*.png` — dev artifacts deleted
- Stale March 2026 session outputs archived (`macro-force-2026-03-23.md`, `weekend-session-2026-03-20.md`, `roll-eval-NVDA-2026-03-20.md`)

### Changed

- **Mode 4A/4B → Mode 4** — collapsed across all skills and commands (`scan-rolls.md`, `status.md`, `weekend-session.md`, `roll-evaluator.md`). Operationally identical response in both cases; single label reduces cognitive overhead
- **`.gitignore`** — added `data/_tmp_*.py` and `data/_tmp_*.png` patterns

---

## Unreleased

### Phase 3B calibration
- Gate: ≥3 resolved channel drawings per regime class (currently: 1 of 3 minimum, ascending_dominant)
- `recalibrate_weights.py` is built and runs in preview mode; `--apply` flag commits changes to `forces.json`
- Every approved weight change will be committed with observation count and threshold in the message

### Pending methodology items
- `/calendar` and `/verify-calendar` commands (Phase 1 slots — calendar engine scripts exist, commands not yet wired)
- Test data fixtures for historical scenario replay (e.g., 2026-04-14 breakout)
- Daily status notification path for action items (mobile/email)
