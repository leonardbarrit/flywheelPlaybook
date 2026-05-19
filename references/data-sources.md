# Data Sources Reference

Primary source URLs for each calendar event type. Used by `verify_calendar.py` to route staleness checks.
Last updated: 2026-05-18.

---

## NVDA Earnings

- **Primary source:** https://investor.nvidia.com/financial-information/financial-results/default.aspx
- **Staleness threshold:** 14 days
- **Confirmation signal:** Issuer posts confirmed date on IR page. Until then, mark `confirmed: false`.
- **Known dates:**
  - Q1 FY27: **2026-05-20** (confirmed 2026-05-18 via investor.nvidia.com)
  - Q2 FY27: ~August 2026 (estimate — not yet posted)

## FOMC Meetings

- **Primary source:** https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
- **Staleness threshold:** 30 days
- **Note:** Fed publishes the full year schedule in January. Dates rarely change; verify once per quarter.
- **2026 meeting dates (decision day, second day of meeting):**
  - Jan 29 ✓ (past)
  - Mar 19 ✓ (past)
  - May 7 ✓ (past)
  - Jun 18
  - Jul 30
  - Sep 17
  - Oct 29
  - Dec 10

## Hyperscaler Earnings

Each company posts its next earnings date on its IR page once confirmed. Check ahead of every 45-day window open.

| Company | IR Page |
|---------|---------|
| Microsoft (MSFT) | https://www.microsoft.com/en-us/investor/earnings/default.aspx |
| Amazon (AMZN) | https://ir.aboutamazon.com/quarterly-results/default.aspx |
| Alphabet/Google (GOOGL) | https://abc.xyz/investor/ |
| Meta (META) | https://investor.fb.com/financials/quarterly-earnings/default.aspx |

- **Staleness threshold:** 14 days
- **Importance classification:** `"high"` by default; upgrade to `"critical"` if NVDA guidance or capex language expected
- **Affects forces:** A1 (Hyperscaler Capex Cycle), A2 (Enterprise AI Adoption)

## TSMC Monthly Revenue

- **Primary source:** https://ir.tsmc.com/english/financials/monthly-revenue
- **Staleness threshold:** 30 days
- **Cadence:** Released ~10th of each month for the prior month
- **Affects forces:** B1 (Advanced Packaging & Foundry), A1

## Economic Releases (CPI, PPI, PCE, NFP)

- **CPI/PPI:** https://www.bls.gov/schedule/news_release/cpi.htm
- **PCE:** https://www.bea.gov/data/personal-consumption-expenditures-price-index
- **Non-Farm Payrolls:** https://www.bls.gov/schedule/news_release/empsit.htm
- **Staleness threshold:** 14 days
- **Affects forces:** C3 (Federal Reserve Policy), E2 (Cross-Asset Risk Regime)

## Options Expiration (OPEX)

- **Computed:** `skills/calendar-engine/scripts/compute_opex.py` — 3rd Friday of each month; quarterly OPEX (March, June, September, December) flagged separately
- **No external URL** — pure calendar math
- **Importance:** `"moderate"` (standard monthly); `"high"` (quarterly OPEX)
- **Affects forces:** E1 (Positioning & Flows)

## China Export Controls / Policy Events

- **Primary sources:** BIS Federal Register (https://www.federalregister.gov/agencies/industry-and-security-bureau), White House press releases
- **Staleness threshold:** 7 days when geopolitical situation is elevated; 30 days otherwise
- **Affects forces:** C1 (China Export Controls), B2 (Taiwan Geopolitical Risk), D3 (China Domestic Chip Capability)
