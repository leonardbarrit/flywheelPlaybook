# Roll Evaluation Scan -- 2026-03-20

**Scan date:** 2026-03-20
**Accounts scanned:** Roth IRA (Fidelity), HSA (Fidelity)
**Source:** `data/positions.json` (updated 2026-03-20, 8:26 PM ET)

---

## Positions Scanned

### Roth IRA

`roth.options`: EMPTY -- no open short option positions.

**Context:** The last covered call (4x NVDA $200C, Apr 17 expiration) was closed on
2026-03-20 at $0.69/share, representing 84% profit ($3.70/share captured, $1,480 net
on 4 contracts). Trade ID t002 in `trades.json`. Settlement pending: $278.69 (clears
Monday 2026-03-23).

### HSA

`hsa.options`: EMPTY -- no open short option positions.

**Context:** HSA holds 268.456 JEPI shares (DRIP active) and 100 PPA shares with a
GTC sell order at $186.22. HSA is Level 1 only; no covered calls until PPA exit
proceeds or additional contributions create a JEPI-covered-call position.

---

## Roll Candidates Evaluated

| Account | Position | DTE | Urgency | BTC Cost | Net Credit | Action |
|---------|----------|-----|---------|----------|------------|--------|
| Roth IRA | (none) | -- | -- | -- | -- | -- |
| HSA | (none) | -- | -- | -- | -- | -- |

**Positions requiring roll evaluation: 0**

---

## Flags

No positions triggered any of the standard flags:

- Past 21-DTE trigger without qualifying roll: N/A
- Greater than 50% profit (close over roll): N/A (position was already closed)
- Threatened by rally / bull trap assessment: N/A

---

## Confidence Level

Pricing data confidence: N/A -- no open positions to price.
Data source confidence: HIGH -- positions.json confirmed empty; trade ledger confirms
the BTC executed today (t002).

---

## Next Action

The roll evaluator has no work to do this cycle. The next action belongs to the
covered call writer.

**NEXT ACTION: Write new Mode 1 CC -- Tuesday 2026-03-24 AM (preferred), Wednesday
2026-03-25 at the latest.**

Parameters from weekend session plan:

| Parameter | Target |
|-----------|--------|
| Underlying | NVDA (Roth IRA) |
| Contracts | 4 |
| Mode | 1 (income generation) |
| DTE at entry | ~45 days (~May 8, 2026 expiration) |
| Strike | $190 minimum; $195 if $190 delta > 0.20 |
| Delta target | 0.20 (80% OTM probability) |
| Double Barrier | Strike must be above ascending channel resistance (~$188-192 projected to May) AND a round number ($190 or $195) |
| Earnings Shield | May 8 expiration precedes NVDA Q1 FY2027 earnings (expected late May); CLEAR |
| Entry window | Tuesday 9:30-10:00 AM ET (Amateur Hour) preferred |
| IV note | Use any AM IV spike from Consumer Confidence data uncertainty |

**Capital available for collateral (CC requires no collateral -- shares are held):**
440 NVDA shares held in Roth IRA fully covers 4 contracts.

**SPAXX available:** $765.91 post-settlement. Hold in SPAXX; not needed as CC collateral.

---

*Scan complete. No roll action required. File written per roll-evaluator schema.*
