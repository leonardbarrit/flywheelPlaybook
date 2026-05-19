---
description: Scan all open short options for roll opportunities. Checks buy-to-close pricing, finds qualifying roll candidates at delta ≤ 0.22 within 45 DTE, and applies the 50% net credit standard.
---

Use the roll-evaluator subagent to analyze every open short option position.

1. Read `data/positions.json` for all open short calls and puts
2. Read `data/macro-forces/dashboard.md` Earnings Calendar section to detect any catalyst date shifts since position entry
3. For each position, evaluate:
   - Current urgency (critical ≤7 DTE, roll window 8-21, monitoring 22+)
   - **Calendar shift status** — has an earnings or catalyst date moved relative to the position's original DTE? If yes, Mode 4 evaluation is in scope even outside the 21-DTE window
   - Buy-to-close cost estimate (intrinsic + extrinsic split)
   - Roll candidates: up and out, delta ≤ 0.22 (relax for Mode 4), DTE ≤ 45
   - Net credit vs. 50% standard (Mode 1/3) OR catalyst-restoration + bounded debit (Mode 4)

Sort results by urgency (lowest DTE first). Flag any position that is:
- Past the 21-DTE trigger without a qualifying roll available
- At >50% profit (recommend close over roll)
- Threatened by a rally (assess bull trap characteristics — Mode 3)
- **Affected by a calendar shift** — original catalyst displaced from contract life (Mode 4 candidate)
- Already Calendar-Corrected once (single-roll limit — recommend accept assignment, no chained Mode 4 rolls)

Save individual evaluations to `data/roll-eval-{TICKER}-{DATE}.md` and give me a summary table.

Summary table columns: Ticker · Strike/Exp · DTE · Urgency · BTC Est · Mode (1/3/4/CLOSE/HOLD/ASSIGN) · Recommendation · Net Credit-or-Debit · Stopping Rule (Mode 4 only).
