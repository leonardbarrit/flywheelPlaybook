---
description: Run macro event force assignment for the coming week. Assigns each economic event to its natural channel (ascending/demand or descending/supply) and derives a directional bias for the compression wedge.
---

Use the macro-analyst subagent to perform force assignment for $ARGUMENTS.

If no arguments provided, analyze the full coming week.

The analyst will:
1. Inventory all macro events on the calendar
2. Assign each to ascending (demand) or descending (supply) channel
3. Apply regime context weighting
4. Assess sequencing effects between events
5. Derive directional bias: ascending dominant, descending dominant, or balanced

Save the force map to `data/macro-force-YYYY-MM-DD.md` and give me the directional bias with implications for CC mode selection and CSP deployment posture.
