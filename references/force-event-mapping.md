# Force-Event Mapping Reference

Machine-readable lookup: event type → affected force IDs with direction hints.
Used by `classify_event.py` for initial keyword-based classification before LLM refinement.

Last updated: 2026-05-18.

---

## Mapping table

| Event keyword / type | Primary force | Direction bias | Secondary forces | Notes |
|---|---|---|---|---|
| hyperscaler_earnings (MSFT/AMZN/GOOGL/META) beat | A1 | bullish | A2, F1-Tier3 | F1 Tier 3 multiplier if capex language strong |
| hyperscaler_earnings miss | A1 | bearish | A2, E1 | Check capex guidance specifically |
| hyperscaler_capex_increase | A1 | bullish | A2 | Beats on capex guidance most impactful |
| hyperscaler_capex_pause | A1 | bearish | D2 | Custom silicon displacement risk amplified |
| enterprise_ai_adoption_signal | A2 | bullish | A1 | |
| sovereign_ai_deal | A3 | bullish | A1 | Country-level GPU purchases |
| tsmc_earnings beat | B1 | bullish | A1, F1-Tier4 | F1 Tier 4: adjacent AI supplier |
| tsmc_earnings miss | B1 | bearish | A1 | |
| tsmc_monthly_revenue beat | B1 | bullish | A1 | Monthly revenue ~10th of month |
| cowos_hbm_capacity_expansion | B1 | bullish | A1 | Supply-side validation of AI demand |
| taiwan_strait_tension | B2 | bearish | E2 | Risk-off regime amplifies |
| taiwan_strait_deescalation | B2 | bullish | E2 | |
| power_grid_ai_datacenter | B3 | bullish | A1 | Utility/HVAC capex signals AI build |
| export_restriction_new | C1 | bearish | B2, D3 | BIS rule, entity list addition |
| export_restriction_lifted | C1 | bullish | A1 | H200/Blackwell China access restored |
| export_restriction_clarified | C1 | mixed | — | Read direction from specific language |
| us_tariff_chip | C2 | bearish | B1, C1 | Section 232 class events |
| us_industrial_policy_pro | C2 | bullish | A3 | CHIPS Act funding, domestic fab |
| fomc_hold_dovish | C3 | bullish | E2 | Dovish dissents = bullish for growth |
| fomc_hold_hawkish | C3 | bearish | E2 | Hawkish language = bearish for duration |
| fomc_cut | C3 | bullish | E2 | |
| fomc_hike | C3 | bearish | E2 | |
| cpi_beat (higher than expected) | C3 | bearish | E2 | Delays cuts |
| cpi_miss (lower than expected) | C3 | bullish | E2 | Accelerates cuts |
| ai_antitrust_action | C4 | bearish | D2 | DOJ/FTC action against AI platform |
| amd_gpu_launch | D1 | bearish | — | Competitive threat to NVDA GPU share |
| amd_earnings_weak | D1 | bullish | — | Validates NVDA competitive moat |
| custom_silicon_win (MSFT/AMZN/GOOGL displacing GPU) | D2 | bearish | A1 | TPU, Trainium, MTIA displacement |
| china_domestic_chip_advance | D3 | bearish | C1 | Huawei Ascend, Cambricon progress |
| intel_earnings beat | F1-Tier4 | bullish | A1, B3 | Adjacent AI supplier corroboration |
| intel_earnings miss | E2 | bearish | — | Risk-off if macro-driven |
| opex (monthly) | E1 | neutral | — | Positioning reset, no directional bias |
| opex (quarterly) | E1 | mixed | E2 | Can amplify pre-existing move |
| nvda_earnings beat | A1 | bullish | A2, A3, F1-Tier1 | F1 Tier 1 (NVDA itself = 0.1x multiplier) |
| nvda_earnings miss | A1 | bearish | D1, D2 | |
| nvda_product_launch | A1 | bullish | B1 | New GPU/platform announcement |
| nvda_deal_investment | F1 | bullish | A1 | NVDA-backed investment = Tier 1-2 |
| vix_spike | E2 | bearish | E1 | Cross-asset risk-off |
| vix_compression | E2 | bullish | E1 | Risk-on regime |
| broad_selloff_no_nvda_catalyst | E1 | bearish | E2 | Correlation-driven, not force-specific |
| broad_rally_no_nvda_catalyst | E1 | bullish | E2 | |

---

## F1 tier reference (multiplier, not additive)

| Tier | Who | Multiplier |
|------|-----|-----------|
| 1 | NVDA itself | 0.1× |
| 2 | NVDA partners/investees | 0.3× |
| 3 | NVDA major customers (hyperscalers) | 0.7× |
| 4 | Adjacent AI suppliers (TSMC, Intel, SK Hynix, Micron, Arista) | 1.5× |
| 5 | Non-stakeholders (utilities, REITs, HVAC) | 2.0× |

F1 is applied as a multiplier to the A-category force on the same day, not as a standalone additive force.

---

## Ambiguous event types (flag for LLM judgment)

- Mixed earnings (beat revenue, miss EPS, guide down)
- Geopolitical events with secondary chip implications
- Regulatory actions that could read as C1, C2, or C4 depending on language
- NVDA-specific analyst downgrades (could be D1/D2 if competitive, or E1 if sentiment)
- Multi-force days where decomposition is needed — log as `confounded: true`

When ambiguous: classify to primary force with `confidence: "low"`, set `confounded: true`, and note secondary candidates in force_attributions.
