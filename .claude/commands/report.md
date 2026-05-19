---
description: Aggregate view of all recent analysis — portfolio snapshot, macro regime, active opportunities, decision tree, and pending actions. Synthesizes the latest data files from all agents without re-running analysis.
---

Use the aggregate-analyst subagent to produce a unified master summary from all recent data files.

The agent will:
1. Read `data/positions.json` and `data/trades.json` for current state
2. Read `data/macro-forces/dashboard.md` for regime and composite score
3. Find and read the most recent file from each category: weekend-session, macro-force, roll-eval, monday-scan, portfolio-status
4. Flag any files older than 7 days as stale
5. Synthesize into a master report covering portfolio snapshot, macro regime, active opportunities, HSA pivot gate, decision tree, and pending actions sorted by urgency

Write the full report to `data/aggregate-YYYY-MM-DD.md` and return a brief summary with the top action item.
