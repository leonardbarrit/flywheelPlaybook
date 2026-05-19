# Flywheel Playbook — Claude Code Setup Guide

## Prerequisites

1. **Claude Code installed** — `npm install -g @anthropic-ai/claude-code`
2. **Node.js 18+** required for Claude Code
3. **Anthropic API key** or Claude Pro/Max subscription
4. A copy of the Flywheel Playbook v12+ for reference

## Installation

### Step 1: Clone or copy this project
Place the entire `flywheel-claude-code/` directory wherever you keep your projects.

```bash
cd ~/projects/flywheel-claude-code
```

### Step 2: Verify the structure
```
flywheel-claude-code/
├── CLAUDE.md                          # Project memory — loaded every session
├── SETUP.md                           # This file
├── .claude/
│   ├── agents/
│   │   ├── weekend-session.md         # Full weekend analysis sequence
│   │   ├── roll-evaluator.md          # Roll opportunity evaluation
│   │   ├── monday-scanner.md          # Turnaround Tuesday go/no-go
│   │   ├── macro-analyst.md           # Macro event force assignment
│   │   └── portfolio-accountant.md    # Metrics, cost basis, progress
│   └── commands/
│       ├── weekend.md                 # /weekend — run weekend session
│       ├── scan-rolls.md              # /scan-rolls — evaluate all positions
│       ├── macro.md                   # /macro — force assignment
│       └── status.md                  # /status — portfolio snapshot
└── data/
    ├── README.md                      # Schema documentation
    ├── positions.json                 # Your current holdings (edit this first)
    └── trades.json                    # Trade history ledger (starts empty)
```

### Step 3: Enter your positions
Edit `data/positions.json` with your actual holdings:

```json
{
  "roth": {
    "shares": [
      { "ticker": "NVDA", "qty": 400, "avgCost": 135.50, "mktPrice": 180.00 },
      { "ticker": "JEPQ", "qty": 850, "avgCost": 52.30, "mktPrice": 55.00 }
    ],
    "options": [
      {
        "ticker": "-NVDA260501C205",
        "underlying": "NVDA",
        "direction": "SHORT",
        "type": "CALL",
        "strike": 205,
        "expiration": "2026-05-01",
        "dte": 45,
        "premium": 4.40,
        "qty": 4,
        "mode": 1,
        "entryDate": "2026-03-17"
      }
    ],
    "spaxx": 12500
  },
  "hsa": {
    "shares": [
      { "ticker": "JEPI", "qty": 320, "avgCost": 56.00, "mktPrice": 58.50 }
    ],
    "options": [],
    "spaxx": 0
  }
}
```

### Step 4: Launch Claude Code
```bash
cd ~/projects/flywheel-claude-code
claude
```

Claude will read CLAUDE.md automatically and understand the full methodology.

### Step 5: Verify setup
Type `/status` to confirm the portfolio-accountant can read your data.

## Usage

### Weekend Session (Saturday/Sunday)
```
/weekend
```
Runs the full analytical sequence: channel recalibration, macro overlay, Monday/Tuesday plotting, roll scan, and capital deployment decision. Produces a decision tree saved to `data/`.

### Monday Pre-Trade Check (Monday 2-3 PM ET)
```
/monday-scanner
```
Or ask directly: "Run the Monday scanner for Turnaround Tuesday."
Evaluates all 5 CSP entry conditions and produces a GO/NO-GO with recommended strike.

### Roll Evaluation (any time a position needs attention)
```
/scan-rolls
```
Scans all open positions by urgency. Or evaluate a specific position:
"Evaluate the roll on my NVDA $200 call expiring April 17."

### Macro Analysis (weekend or pre-event)
```
/macro
```
Or: "/macro FOMC and CPI this week"
Assigns each event to its channel and derives directional bias.

### Quick Status
```
/status
```
Portfolio snapshot: holdings, scaling progress, income metrics, DTE alerts.

### Recording Trades
Ask the portfolio-accountant directly:
"Record: STO NVDA $210 call, May 15 expiration, 4 contracts at $3.80, Mode 1"

## Subagent Model Routing

| Subagent | Model | Why |
|----------|-------|-----|
| weekend-session | Opus | Complex multi-step analysis with judgment calls |
| macro-analyst | Opus | Causal reasoning across multiple events and layers |
| roll-evaluator | Sonnet | Structured search + math — doesn't need deep reasoning |
| monday-scanner | Sonnet | Checklist evaluation with search — straightforward |
| portfolio-accountant | Haiku | Read/compute/report — fast and cheap |

You can adjust models in each agent's frontmatter. Opus gives better macro analysis; Haiku keeps accounting costs low.

## Tips

- **Run `/weekend` every Saturday** even if you think there's no decision to make. The session exists to confirm that — and occasionally surfaces something you missed.
- **Keep `positions.json` current.** Update market prices when you check the dashboard. Subagents can only work with what's in the file.
- **Review subagent output, don't auto-execute.** These agents prepare analysis and recommendations. You make the decisions. That's the human-in-the-loop line your playbook draws.
- **Use `/macro` before binary events.** Force assignment before an FOMC or CPI print prepares you for both outcomes before the data arrives.
