# /forces

Display current force state table and composite score.

Usage: `/forces`

No arguments.

---

## Execution protocol

### Step 1 — Read source files

Read `data/forces.json` and `data/composite.json`.

### Step 2 — Render composite header

```
Composite Score: {composite_score} — {interpretation}
  Net bullish: {net_bullish}  |  Net bearish: {net_bearish}  |  F1 multiplier: {f1_multiplier}×
  Active: {active_force_count}  |  Attenuating: {attenuating_force_count}  |  Dormant: {dormant_force_count}
  As of: {date}
```

### Step 3 — Render force table

Group by category letter. Within each category, order by force ID.

For each force, display:

```
[STATE] {id} — {name}
  Weight: {weight}  |  Bias: {direction_bias}
  Last event: {last_event_date or "—"}  |  YTD events: {event_counts.total}
  Net YTD reaction: {net_ytd_reaction:+.2f}%
  {attenuation_trend if ATTENUATING}
  {days_since_last_significant if REACTIVATED or ATTENUATING} days since significant event
```

State indicators:
- `[ACTIVE]` — green (ASCII: use `[A]`)
- `[REACTIVATED]` — yellow (ASCII: use `[R]`)
- `[ATTENUATING]` — yellow (ASCII: use `[~]`)
- `[DORMANT]` — gray (ASCII: use `[-]`)

### Step 4 — Render category summary

After each category group, print the category label and aggregate count:

```
Category A (Demand): 3 forces — 2 active, 1 attenuating, 0 dormant
```

### Step 5 — Pattern alerts

Read `references/pattern-library.md`. Check if any confirmed pattern conditions are currently met:

- **A1 + F1-Tier4 Synergy**: if A1 is ACTIVE and an F1-Tier4 event is in the 45-day forward window (from `data/calendar.json`), flag: `PATTERN ALERT: A1+F1-Tier4 synergy — upgrade A1 confidence to HIGH for upcoming event day.`
- **C1 + C2 Cancellation**: if both C1 and C2 are ACTIVE, flag: `PATTERN ALERT: C1+C2 both active — confounded days expected, lower directional confidence.`
- **E1 Streak Amplification**: if E1 is ACTIVE and `net_ytd_reaction` is large (>5.0 or <-5.0), flag: `PATTERN ALERT: E1 streak amplifier — check consecutive day streak.`

If no patterns active, omit this section.

---

## Output example

```
=== Force State Dashboard — 2026-05-18 ===

Composite Score: 17.36 — bullish_dominant
  Net bullish: 23.471  |  Net bearish: -11.896  |  F1 multiplier: 1.5×
  Active: 11  |  Attenuating: 2  |  Dormant: 3

--- Category A: Demand ---
[A] A1 — Hyperscaler Capex Cycle
  Weight: 2.0  |  Bias: bullish
  Last event: 2026-04-24  |  YTD events: 8
  Net YTD reaction: +18.40%

[A] A2 — Enterprise AI Adoption
  Weight: 0.8  |  Bias: bullish
  Last event: 2026-03-15  |  YTD events: 3
  Net YTD reaction: +4.20%

[A] A3 — Sovereign AI / National Compute
  Weight: 0.5  |  Bias: bullish
  Last event: 2026-02-10  |  YTD events: 2
  Net YTD reaction: +2.10%

Category A (Demand): 3 forces — 3 active, 0 attenuating, 0 dormant

...

=== PATTERN ALERTS ===
PATTERN ALERT: C1+C2 both active — confounded days expected, lower directional confidence.
```
