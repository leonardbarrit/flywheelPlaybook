import { useState, useMemo, useEffect, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";

/* ─── PALETTE ─── */
const C = {
  bg: "#070b13",
  surface: "#0d131e",
  card: "#121a28",
  cardHi: "#172238",
  border: "#1d2a44",
  borderHi: "#2a3a5c",
  text: "#dde5f2",
  textDim: "#8090ac",
  textMuted: "#4a5874",

  primary: "#3b82f6",
  primaryDim: "#1e3a5f",
  primaryGlow: "#60a5fa",

  green: "#22c55e",
  greenDim: "#14532d",
  red: "#ef4444",
  redDim: "#7f1d1d",
  amber: "#f59e0b",
  amberDim: "#78350f",
  cyan: "#06b6d4",
  cyanDim: "#155e75",
  purple: "#a855f7",
  purpleDim: "#581c87",
  pink: "#ec4899",
  pinkDim: "#831843",
  gray: "#475569",
  grayDim: "#1e293b",
};

const CAT_COLOR = { A: C.green, B: C.cyan, C: C.amber, D: C.red, E: C.purple, F: C.pink };
const CAT_NAME = { A: "Demand", B: "Supply", C: "Policy", D: "Competitive", E: "Market Structure", F: "Validation" };
const STATE_COLOR = { ACTIVE: C.green, ATTENUATING: C.amber, DORMANT: C.gray, REACTIVATED: C.cyan };

const font = {
  mono: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  sans: "'SF Pro Display', 'Segoe UI', system-ui, -apple-system, sans-serif",
};

const STORAGE_KEY = "flywheel-macro-v1";
const SCHEMA_VERSION = "1.0";

/* ════════════════════════════════════════════════════════════════════
   BASELINE DATA — generated 2026-04-24 from data/macro-forces/
   This is the fallback if no clipboard update has been applied.
   ════════════════════════════════════════════════════════════════════ */

const DEFAULT_COMPOSITE = {
  date: "2026-04-24",
  net_bullish: 18.322,
  net_bearish: -13.221,
  net_directional: 5.102,
  f1_multiplier: 1.15,
  composite_score: 5.867,
  active_force_count: 11,
  attenuating_force_count: 2,
  dormant_force_count: 3,
  interpretation: "bullish_dominant",
};

const DEFAULT_FORCES = [
  { id: "A1", name: "Hyperscaler Capex Cycle", category: "A", type: "additive", state: "ACTIVE", weight: 1.509, direction_bias: "bullish", net_ytd_reaction: 12.733, attenuation_trend: "stable", events_total: 18, events_isolated: 12, events_confounded: 6, events_bullish: 12, events_bearish: 6, last_event_date: "2026-04-24" },
  { id: "A2", name: "Enterprise AI Adoption", category: "A", type: "additive", state: "ACTIVE", weight: 0.889, direction_bias: "bearish", net_ytd_reaction: -0.766, attenuation_trend: "thin sample", events_total: 3, events_isolated: 1, events_confounded: 2, events_bullish: 1, events_bearish: 2, last_event_date: "2026-04-23" },
  { id: "A3", name: "Sovereign AI", category: "A", type: "additive", state: "DORMANT", weight: 0, direction_bias: "neutral", net_ytd_reaction: 0, attenuation_trend: "no events", events_total: 0, events_isolated: 0, events_confounded: 0, events_bullish: 0, events_bearish: 0, last_event_date: null },
  { id: "B1", name: "Foundry & Packaging (CoWoS, HBM)", category: "B", type: "additive", state: "ACTIVE", weight: 0.845, direction_bias: "bullish", net_ytd_reaction: 4.493, attenuation_trend: "stable", events_total: 6, events_isolated: 4, events_confounded: 2, events_bullish: 6, events_bearish: 0, last_event_date: "2026-04-17" },
  { id: "B2", name: "Taiwan Geopolitical Risk", category: "B", type: "additive", state: "ACTIVE", weight: 0.330, direction_bias: "neutral", net_ytd_reaction: 0.335, attenuation_trend: "thin sample", events_total: 1, events_isolated: 0, events_confounded: 1, events_bullish: 1, events_bearish: 0, last_event_date: "2026-04-08" },
  { id: "B3", name: "Power & Grid Infrastructure", category: "B", type: "additive", state: "ACTIVE", weight: 0.430, direction_bias: "neutral", net_ytd_reaction: 0.432, attenuation_trend: "thin sample", events_total: 1, events_isolated: 1, events_confounded: 0, events_bullish: 1, events_bearish: 0, last_event_date: "2026-04-24" },
  { id: "C1", name: "China Export Controls", category: "C", type: "additive", state: "ACTIVE", weight: 1.060, direction_bias: "bearish", net_ytd_reaction: -5.272, attenuation_trend: "stable", events_total: 8, events_isolated: 3, events_confounded: 5, events_bullish: 1, events_bearish: 7, last_event_date: "2026-04-08" },
  { id: "C2", name: "US Industrial Policy (Tariffs)", category: "C", type: "additive", state: "ATTENUATING", weight: 0.873, direction_bias: "bearish", net_ytd_reaction: -1.751, attenuation_trend: "absorbed", events_total: 3, events_isolated: 1, events_confounded: 2, events_bullish: 1, events_bearish: 2, last_event_date: "2026-01-20" },
  { id: "C3", name: "Federal Reserve Policy", category: "C", type: "additive", state: "ATTENUATING", weight: 0.336, direction_bias: "bearish", net_ytd_reaction: -1.077, attenuation_trend: "stable", events_total: 5, events_isolated: 2, events_confounded: 3, events_bullish: 1, events_bearish: 4, last_event_date: "2026-03-26" },
  { id: "C4", name: "AI & Antitrust Regulation", category: "C", type: "additive", state: "DORMANT", weight: 0, direction_bias: "neutral", net_ytd_reaction: 0, attenuation_trend: "no events", events_total: 0, events_isolated: 0, events_confounded: 0, events_bullish: 0, events_bearish: 0, last_event_date: null },
  { id: "D1", name: "AMD Competitive Pressure", category: "D", type: "additive", state: "ACTIVE", weight: 0.700, direction_bias: "bearish", net_ytd_reaction: -1.940, attenuation_trend: "stable", events_total: 4, events_isolated: 2, events_confounded: 2, events_bullish: 0, events_bearish: 4, last_event_date: "2026-04-24" },
  { id: "D2", name: "Custom Silicon Displacement", category: "D", type: "additive", state: "ACTIVE", weight: 0.802, direction_bias: "bearish", net_ytd_reaction: -1.741, attenuation_trend: "stable", events_total: 5, events_isolated: 3, events_confounded: 2, events_bullish: 1, events_bearish: 4, last_event_date: "2026-04-21" },
  { id: "D3", name: "China Domestic Chip Capability", category: "D", type: "additive", state: "DORMANT", weight: 0, direction_bias: "neutral", net_ytd_reaction: 0, attenuation_trend: "no events", events_total: 0, events_isolated: 0, events_confounded: 0, events_bullish: 0, events_bearish: 0, last_event_date: null },
  { id: "E1", name: "Positioning & Flows", category: "E", type: "oscillating", state: "ACTIVE", weight: 0.700, direction_bias: "neutral", net_ytd_reaction: 0.658, attenuation_trend: "oscillating", events_total: 33, events_isolated: 22, events_confounded: 11, events_bullish: 18, events_bearish: 13, last_event_date: "2026-04-24" },
  { id: "E2", name: "Cross-Asset Risk Regime", category: "E", type: "oscillating", state: "ACTIVE", weight: 0.722, direction_bias: "bearish", net_ytd_reaction: -1.345, attenuation_trend: "oscillating", events_total: 11, events_isolated: 4, events_confounded: 7, events_bullish: 3, events_bearish: 8, last_event_date: "2026-04-23" },
  { id: "F1", name: "Narrative Validation / 3rd Party", category: "F", type: "multiplier", state: "ACTIVE", weight: 1.500, direction_bias: "building", net_ytd_reaction: 0, attenuation_trend: "building", events_total: 4, events_isolated: 0, events_confounded: 0, events_bullish: 0, events_bearish: 0, last_event_date: "2026-04-24" },
];

const DEFAULT_EVENTS = [
  { date: "2026-01-08", close: 185.04, move: -2.15, sigma: -2.76, gap: "low", primary_force: "A1", category: "A", confounded: false, confidence: "medium", catalyst: "AI spending sustainability concerns; CES 2026 fade", source: "https://www.cnbc.com/2026/01/14/nvidia-shares-are-struggling-how-the-ai-juggernaut-can-can-break-its-funk.html" },
  { date: "2026-01-14", close: 183.14, move: -1.44, sigma: -1.33, gap: "low", primary_force: "C2", category: "C", confounded: false, confidence: "high", catalyst: "Trump Section 232 — 25% tariff on H200/MI325X", source: "https://www.whitehouse.gov/fact-sheets/2026/01/fact-sheet-president-donald-j-trump-takes-action-on-certain-advanced-computing-chips-to-protect-americas-economic-and-national-security/" },
  { date: "2026-01-15", close: 187.05, move: 2.13, sigma: 2.13, gap: "moderate", primary_force: "C1", category: "C", confounded: true, confidence: "high", catalyst: "BIS H200 case-by-case framework + TSMC earnings + $250B Taiwan investment", source: "https://markets.financialcontent.com/stocks/article/marketminute-2026-1-16-the-new-managed-access-era-trump-administration-authorizes-nvidia-h200-exports-to-china-under-strict-surcharges" },
  { date: "2026-01-20", close: 178.07, move: -4.38, sigma: -3.62, gap: "high", primary_force: "C1", category: "C", confounded: true, confidence: "high", catalyst: "China customs blocking H200 over 25% surcharge; MLK weekend gap", source: "https://markets.financialcontent.com/stocks/article/tokenring-2026-1-23-us-eases-nvidia-h200-exports-to-china-with-25-revenue-tariff" },
  { date: "2026-01-21", close: 183.32, move: 2.95, sigma: 1.94, gap: "low", primary_force: "E1", category: "E", confounded: false, confidence: "medium", catalyst: "Dip-buying rebound; MSFT/GOOGL capex reaffirmation", source: "https://www.apnews.org/tech-stocks-decline-january-2026/" },
  { date: "2026-01-29", close: 192.51, move: 0.52, sigma: 0.21, gap: "low", primary_force: "C3", category: "C", confounded: false, confidence: "medium", catalyst: "Day after FOMC hold; dovish Miran/Waller dissent", source: "https://www.cnbc.com/2026/01/28/fed-rate-decision-january-2026.html" },
  { date: "2026-02-02", close: 185.61, move: -2.89, sigma: -1.86, gap: "high", primary_force: "A1", category: "A", confounded: false, confidence: "high", catalyst: "WSJ: NVDA $100B OpenAI investment stalled (overnight)", source: "https://www.cnbc.com/2026/02/02/nvidia-stock-price-openai-funding.html" },
  { date: "2026-02-03", close: 180.34, move: -2.84, sigma: -1.60, gap: "low", primary_force: "D1", category: "D", confounded: true, confidence: "high", catalyst: "AMD Q1 forecast misses; semiconductor selloff", source: "https://www.cnbc.com/2026/02/03/stock-market-today-live-updates.html" },
  { date: "2026-02-04", close: 174.19, move: -3.41, sigma: -1.75, gap: "low", primary_force: "A2", category: "A", confounded: false, confidence: "high", catalyst: "Anthropic Claude data analysis tool launch", source: "https://www.fool.com/investing/2026/02/04/why-did-nvidia-stock-plunge-today/" },
  { date: "2026-02-06", close: 185.41, move: 7.87, sigma: 4.25, gap: "high", primary_force: "A1", category: "A", confounded: false, confidence: "high", catalyst: "$650B Big Tech 2026 capex figure crystallized (AMZN $200B + GOOGL $185B + META $135B + MSFT $105B)", source: "https://www.bloomberg.com/news/articles/2026-02-06/nvidia-nvda-shares-surge-on-big-tech-s-650-billion-ai-spending-plan" },
  { date: "2026-02-09", close: 190.04, move: 2.50, sigma: 0.92, gap: "low", primary_force: "A1", category: "A", confounded: false, confidence: "medium", catalyst: "Follow-through on $650B capex narrative", source: "https://finance.yahoo.com/news/big-tech-unveils-650-billion-121205995.html" },
  { date: "2026-02-25", close: 195.56, move: 1.41, sigma: 0.49, gap: "low", primary_force: "E1", category: "E", confounded: false, confidence: "medium", catalyst: "Pre-earnings run-up; high volume positioning", source: "https://www.cnbc.com/2026/02/25/nvidia-nvda-earnings-report-q4-2026.html", earnings_window: "pre" },
  { date: "2026-02-26", close: 184.89, move: -5.46, sigma: -2.28, gap: "low", primary_force: "A1", category: "A", confounded: true, confidence: "high", catalyst: "NVDA Q4 FY26 earnings: blowout beat ($68.1B rev, $78B Q1 guide) but ZERO China DC revenue + AI bubble narrative", source: "https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-fourth-quarter-and-fiscal-2026", earnings_window: "event" },
  { date: "2026-02-27", close: 177.19, move: -4.16, sigma: -1.45, gap: "moderate", primary_force: "A1", category: "A", confounded: true, confidence: "high", catalyst: "Earnings continuation; 50/100-day MA break", source: "https://ts2.tech/en/nvidia-stock-price-slides-again-as-nvda-selloff-deepens-after-earnings-beat/", earnings_window: "post" },
  { date: "2026-03-02", close: 182.48, move: 2.99, sigma: 1.16, gap: "failed_gap", primary_force: "E2", category: "E", confounded: true, confidence: "medium", catalyst: "Weekend US/Israeli strikes on Iran; intraday reversal on AI demand", source: "https://www.nasdaq.com/articles/stock-market-news-mar-2-2026" },
  { date: "2026-03-06", close: 177.82, move: -3.01, sigma: -1.19, gap: "moderate", primary_force: "E2", category: "E", confounded: true, confidence: "high", catalyst: "WTI crude +35% WoW; soft NFP; BlackRock private credit cap", source: "https://www.cnbc.com/2026/03/05/stock-market-today-live-updates.html" },
  { date: "2026-03-20", close: 172.70, move: -3.28, sigma: -1.39, gap: "low", primary_force: "C1", category: "C", confounded: true, confidence: "high", catalyst: "SMCI co-founder Wally Liaw indicted for sanctioned NVDA exports; triple-witching", source: "https://www.thestreet.com/latest-news/stock-market-today-march-20-2026" },
  { date: "2026-03-25", close: 178.68, move: 1.99, sigma: 1.06, gap: "moderate", primary_force: "E1", category: "E", confounded: false, confidence: "low", catalyst: "Bounce within March correction; GTC backlog narrative", source: "https://www.cnbc.com/2026/03/17/a-theory-on-whats-wrong-with-nvidia-stock-stuck-in-a-2026-funk.html" },
  { date: "2026-03-26", close: 171.24, move: -4.16, sigma: -1.61, gap: "moderate", primary_force: "E1", category: "E", confounded: true, confidence: "medium", catalyst: "ARK $84M tech/semis dump; YTD low capitulation", source: "https://blockonomi.com/ark-invest-dumps-84m-in-meta-meta-nvidia-nvda-and-chip-stocks-in-major-thursday-selloff/" },
  { date: "2026-03-31", close: 174.40, move: 5.59, sigma: 3.17, gap: "moderate", primary_force: "A1", category: "A", confounded: false, confidence: "high", catalyst: "NVDA $2B investment in Marvell + NVLink Fusion partnership", source: "https://www.bloomberg.com/news/articles/2026-03-31/nvidia-invests-2-billion-in-marvell-announces-partnership", f1_tier: 4 },
  { date: "2026-04-08", close: 182.08, move: 2.23, sigma: 1.10, gap: "high", primary_force: "E2", category: "E", confounded: true, confidence: "high", catalyst: "Trump Iran ceasefire announcement + AI chip licensing proposal withdrawn (overnight gap +3.59%)", source: "https://www.cnbc.com/2026/04/08/alphabet-nvidia-microsoft-tech-stocks-iran-ceasefire.html" },
  { date: "2026-04-10", close: 188.63, move: 2.57, sigma: 1.20, gap: "low", primary_force: "B1", category: "B", confounded: false, confidence: "high", catalyst: "TSMC March monthly revenue: NT$415B, +45.2% YoY, record", source: "https://pr.tsmc.com/english/news/3294", f1_tier: 4 },
  { date: "2026-04-14", close: 196.51, move: 3.80, sigma: 1.62, gap: "low", primary_force: "A1", category: "A", confounded: true, confidence: "high", catalyst: "NVDA Ising quantum AI launch + Vera Rubin demand + 10-day streak (vacation breakout)", source: "https://nvidianews.nvidia.com/news/nvidia-launches-ising-the-worlds-first-open-ai-models-to-accelerate-the-path-to-useful-quantum-computers" },
  { date: "2026-04-17", close: 201.68, move: 1.68, sigma: 0.52, gap: "low", primary_force: "B1", category: "B", confounded: false, confidence: "medium", catalyst: "TSMC Q1 +58% profit surge read-through", source: "https://www.cnbc.com/2026/04/16/tsmc-q1-profit-58-percent-ai-chip-demand-record.html", f1_tier: 4 },
  { date: "2026-04-21", close: 199.88, move: -1.08, sigma: -0.91, gap: "low", primary_force: "E1", category: "E", confounded: true, confidence: "medium", catalyst: "Profit-taking; Google TPU v7 Ironwood announcement", source: "https://www.cnbc.com/2026/04/20/stock-market-today-live-updates.html" },
  { date: "2026-04-23", close: 199.64, move: -1.41, sigma: -1.03, gap: "low", primary_force: "E1", category: "E", confounded: true, confidence: "medium", catalyst: "TSLA capex hike $25B + IBM/NOW misses drag tech", source: "https://finance.yahoo.com/markets/stocks/articles/stock-market-today-april-23-223648525.html" },
  { date: "2026-04-24", close: 208.27, move: 4.32, sigma: 1.75, gap: "low", primary_force: "A1", category: "A", confounded: false, confidence: "high", catalyst: "Intel Q1 FY26: DCAI +22% YoY $5.1B, hyperscaler Xeon 6 ramp 2027 capacity", source: "https://www.cnbc.com/2026/04/24/nvidia-stock-closes-at-record-pushing-market-cap-past-5-trillion.html", f1_tier: 4 },
];

const DEFAULT_PRICE_SERIES = [
  { date: "2026-01-02", close: 188.85 }, { date: "2026-01-08", close: 185.04 },
  { date: "2026-01-14", close: 183.14 }, { date: "2026-01-15", close: 187.05 },
  { date: "2026-01-20", close: 178.07 }, { date: "2026-01-21", close: 183.32 },
  { date: "2026-01-29", close: 192.51 }, { date: "2026-02-02", close: 185.61 },
  { date: "2026-02-03", close: 180.34 }, { date: "2026-02-04", close: 174.19 },
  { date: "2026-02-05", close: 171.88 }, { date: "2026-02-06", close: 185.41 },
  { date: "2026-02-09", close: 190.04 }, { date: "2026-02-13", close: 182.81 },
  { date: "2026-02-25", close: 195.56 }, { date: "2026-02-26", close: 184.89 },
  { date: "2026-02-27", close: 177.19 }, { date: "2026-03-02", close: 182.48 },
  { date: "2026-03-06", close: 177.82 }, { date: "2026-03-13", close: 180.25 },
  { date: "2026-03-20", close: 172.70 }, { date: "2026-03-25", close: 178.68 },
  { date: "2026-03-26", close: 171.24 }, { date: "2026-03-30", close: 165.17 },
  { date: "2026-03-31", close: 174.40 }, { date: "2026-04-08", close: 182.08 },
  { date: "2026-04-10", close: 188.63 }, { date: "2026-04-14", close: 196.51 },
  { date: "2026-04-17", close: 201.68 }, { date: "2026-04-21", close: 199.88 },
  { date: "2026-04-23", close: 199.64 }, { date: "2026-04-24", close: 208.27 },
];

const DEFAULT_PATTERNS = [
  { title: "Confounded days show strong synergy", severity: "info", body: "Every confounded day YTD (13 of 35 significant days) produces moves 2–4× larger than additive baselines predict. When forces align, they amplify non-linearly.", implication: "Weeks with 2+ aligned catalysts in the same direction warrant defensive strike selection — moves will be bigger than per-force baselines suggest." },
  { title: "Tariff arc — fast absorption (~7 days)", severity: "absorbed", body: "Trump Section 232 (Jan 14) → enforcement gap (Jan 20, -4.38%) → digestion (Jan 21–22) → priced in by Jan 26. C2 now ATTENUATING.", implication: "Tariff-style forces with quantifiable resolution (25% surcharge framework) absorb fast — within ~7 days." },
  { title: "Iran arc — slow absorption (~6 weeks)", severity: "absorbed", body: "Mar 2 weekend strikes → Mar 6 oil shock → Mar 20–26 chronic overhang → Apr 7/8 ceasefire resolution. E2 still ACTIVE but flipped bullish post-ceasefire.", implication: "Geopolitical forces without clean resolution mechanism take 4–6 weeks to absorb. Build buffer into strike selection." },
  { title: "F1 multiplier is building", severity: "bullish", body: "Three Tier 4 validations in last 25 days: Marvell (Mar 31), TSMC (Apr 10/17), Intel (Apr 24). Multiplier now 1.15×.", implication: "Today's +4.32% on Intel (a competitor) is explained by F1 dominating the competitive read on a single-day basis. Expect amplified A1 reactions while F1 trend persists." },
  { title: "A1 is the structural bullish anchor", severity: "bullish", body: "A1 contributes +12.73 of +18.32 net bullish YTD across 18 events. Every hyperscaler print and F1 validation reinforces it.", implication: "Dominance compresses only if hyperscaler capex guidance breaks. No sign of that — current A1 trajectory is stable." },
];

const DEFAULT_EARNINGS_CALENDAR = {
  ticker: "NVDA",
  next: {
    quarter: "Q1 FY27",
    date: "2026-05-27",
    timing: "after-hours",
    confirmed: true,
    confirmedAt: "2026-04-25",
    priorEstimate: "2026-05-20",
    shifted: true,
  },
  upcoming: [
    { quarter: "Q2 FY27", date: "2026-08-26", confirmed: false },
    { quarter: "Q3 FY27", date: "2026-11-18", confirmed: false },
    { quarter: "Q4 FY27", date: "2027-02-25", confirmed: false },
  ],
  history: [
    { quarter: "Q4 FY26", date: "2026-02-26", priceImpact3d: -8.21, note: "Beat overwhelmed by China DC revenue gap + MA-break technical failure" },
  ],
};

const DEFAULT_PAYLOAD = {
  schemaVersion: SCHEMA_VERSION,
  updatedAt: "2026-04-24T16:00:00-04:00",
  asOfDate: "2026-04-24",
  composite: DEFAULT_COMPOSITE,
  forces: DEFAULT_FORCES,
  events: DEFAULT_EVENTS,
  priceSeries: DEFAULT_PRICE_SERIES,
  patterns: DEFAULT_PATTERNS,
  earningsCalendar: DEFAULT_EARNINGS_CALENDAR,
};

/* ════════════════════════════════════════════════════════════════════
   COMPONENTS
   ════════════════════════════════════════════════════════════════════ */

function Btn({ children, onClick, color = C.primary, disabled, small, active, style: sx, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      padding: small ? "4px 10px" : "8px 14px",
      borderRadius: 5,
      fontSize: small ? 11 : 12,
      fontFamily: font.mono,
      fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer",
      border: `1px solid ${active ? color : color + "40"}`,
      background: active ? color + "25" : color + "10",
      color,
      opacity: disabled ? 0.35 : 1,
      transition: "all .15s",
      letterSpacing: "0.04em",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      ...sx,
    }}>{children}</button>
  );
}

function Badge({ children, color = C.primary, glow }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 7px",
      borderRadius: 3,
      fontSize: 10,
      fontFamily: font.mono,
      fontWeight: 700,
      letterSpacing: "0.07em",
      color,
      background: color + "15",
      border: `1px solid ${color}30`,
      boxShadow: glow ? `0 0 8px ${color}40` : "none",
    }}>{children}</span>
  );
}

function Card({ children, style: sx, glow, accent }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${accent ? accent + "30" : C.border}`,
      borderRadius: 8,
      padding: 18,
      boxShadow: glow ? `0 0 24px ${(accent || C.primary)}08` : "none",
      ...sx,
    }}>{children}</div>
  );
}

function SectionHead({ children, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <h3 style={{ margin: 0, fontSize: 11, fontFamily: font.mono, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textMuted }}>{children}</h3>
      {right}
    </div>
  );
}

function StatCard({ label, value, sub, color, big }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      padding: big ? "16px 20px" : "12px 14px",
      flex: 1,
      minWidth: 130,
    }}>
      <div style={{ fontSize: 9, fontFamily: font.mono, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textMuted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: big ? 32 : 22, fontFamily: font.mono, fontWeight: 700, color: color || C.text, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textDim, marginTop: 5, fontFamily: font.mono }}>{sub}</div>}
    </div>
  );
}

function DirectionalBar({ value, max = 15 }) {
  const pct = Math.min(50, (Math.abs(value) / max) * 50);
  const color = value > 0 ? C.green : value < 0 ? C.red : C.gray;
  return (
    <div style={{ position: "relative", height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: "50%", top: 0, height: "100%", width: 1, background: C.borderHi }} />
      {value !== 0 && (
        <div style={{
          position: "absolute",
          left: value > 0 ? "50%" : `${50 - pct}%`,
          top: 0,
          height: "100%",
          width: `${pct}%`,
          background: color,
          transition: "all .4s ease",
        }} />
      )}
    </div>
  );
}

function CompositeGauge({ score, multiplier }) {
  const clamp = Math.max(-10, Math.min(10, score));
  const angle = ((clamp + 10) / 20) * 180;
  const color = score > 1 ? C.green : score < -1 ? C.red : C.amber;
  const w = 280, h = 160, cx = w / 2, cy = h - 10, r = 110;

  const arcPath = (start, end) => {
    const s = (start * Math.PI) / 180, e = (end * Math.PI) / 180;
    const x1 = cx - r * Math.cos(s), y1 = cy - r * Math.sin(s);
    const x2 = cx - r * Math.cos(e), y2 = cy - r * Math.sin(e);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };

  const needleAngle = angle * (Math.PI / 180);
  const nx = cx - (r - 8) * Math.cos(needleAngle);
  const ny = cy - (r - 8) * Math.sin(needleAngle);

  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <svg width={w} height={h} style={{ overflow: "visible" }}>
        <path d={arcPath(0, 180)} fill="none" stroke={C.border} strokeWidth="14" strokeLinecap="round" />
        <path d={arcPath(0, 60)} fill="none" stroke={C.redDim} strokeWidth="14" strokeLinecap="round" opacity="0.6" />
        <path d={arcPath(60, 120)} fill="none" stroke={C.amberDim} strokeWidth="14" strokeLinecap="round" opacity="0.4" />
        <path d={arcPath(120, 180)} fill="none" stroke={C.greenDim} strokeWidth="14" strokeLinecap="round" opacity="0.6" />
        <path d={arcPath(0, angle)} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color}60)` }} />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6" fill={color} />
        <circle cx={cx} cy={cy} r="3" fill={C.bg} />
        <text x={20} y={h} fontSize="9" fill={C.textMuted} fontFamily={font.mono}>-10 BEAR</text>
        <text x={cx - 12} y={20} fontSize="9" fill={C.textMuted} fontFamily={font.mono}>0</text>
        <text x={w - 60} y={h} fontSize="9" fill={C.textMuted} fontFamily={font.mono}>+10 BULL</text>
      </svg>
      <div style={{ position: "absolute", top: 60, left: 0, right: 0, textAlign: "center" }}>
        <div style={{ fontSize: 36, fontFamily: font.mono, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.03em" }}>
          {score >= 0 ? "+" : ""}{score.toFixed(2)}
        </div>
        <div style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted, marginTop: 4, letterSpacing: "0.1em" }}>
          F1 × {multiplier.toFixed(2)}
        </div>
      </div>
    </div>
  );
}

function ForceCard({ force, onClick, selected }) {
  const cat = CAT_COLOR[force.category];
  const stateColor = STATE_COLOR[force.state];
  const dirColor = force.direction_bias === "bullish" ? C.green
    : force.direction_bias === "bearish" ? C.red
    : force.direction_bias === "building" ? C.pink
    : C.gray;
  const dirArrow = force.direction_bias === "bullish" ? "▲"
    : force.direction_bias === "bearish" ? "▼"
    : "●";
  const dim = force.state === "DORMANT";

  return (
    <button onClick={onClick} style={{
      background: selected ? C.cardHi : C.card,
      border: `1px solid ${selected ? cat : C.border}`,
      borderLeft: `3px solid ${cat}`,
      borderRadius: 6,
      padding: "12px 14px",
      cursor: "pointer",
      textAlign: "left",
      width: "100%",
      transition: "all .15s",
      opacity: dim ? 0.55 : 1,
      boxShadow: selected ? `0 0 16px ${cat}30` : "none",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: cat, letterSpacing: "0.04em" }}>{force.id}</span>
            <span style={{ fontFamily: font.mono, fontSize: 9, color: C.textMuted, letterSpacing: "0.1em" }}>{CAT_NAME[force.category].toUpperCase()}</span>
          </div>
          <div style={{ fontSize: 12, fontFamily: font.sans, color: C.text, lineHeight: 1.3 }}>{force.name}</div>
        </div>
        <Badge color={stateColor}>{force.state}</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontFamily: font.mono, color: dirColor, fontWeight: 700, letterSpacing: "0.05em" }}>
          {dirArrow} {force.direction_bias.toUpperCase()}
        </span>
        <span style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim }}>
          n={force.events_total}
        </span>
        <span style={{ fontSize: 11, fontFamily: font.mono, color: force.net_ytd_reaction > 0 ? C.green : force.net_ytd_reaction < 0 ? C.red : C.gray, fontWeight: 700 }}>
          {force.net_ytd_reaction >= 0 ? "+" : ""}{force.net_ytd_reaction.toFixed(2)}
        </span>
      </div>
      <DirectionalBar value={force.net_ytd_reaction} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 9, fontFamily: font.mono, color: C.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        <span>weight {force.weight.toFixed(2)}</span>
        <span>{force.attenuation_trend}</span>
      </div>
    </button>
  );
}

function EventDot({ cx, cy, payload }) {
  if (!payload.eventCategory) return null;
  const color = CAT_COLOR[payload.eventCategory];
  const size = Math.min(10, 4 + Math.abs(payload.eventSigma || 1) * 1.2);
  return (
    <g>
      <circle cx={cx} cy={cy} r={size + 2} fill={color} opacity="0.2" />
      <circle cx={cx} cy={cy} r={size} fill={color} stroke={C.bg} strokeWidth="1.5" />
    </g>
  );
}

function EventRow({ ev, onClick }) {
  const cat = CAT_COLOR[ev.category];
  const moveColor = ev.move > 0 ? C.green : ev.move < 0 ? C.red : C.gray;
  const sigClass = Math.abs(ev.sigma) >= 3.5 ? "regime"
    : Math.abs(ev.sigma) >= 2.5 ? "major"
    : Math.abs(ev.sigma) >= 1.5 ? "signif"
    : "notable";
  const sigColor = sigClass === "regime" ? C.pink
    : sigClass === "major" ? C.amber
    : sigClass === "signif" ? C.primary
    : C.textDim;

  return (
    <div onClick={onClick} style={{
      padding: "10px 12px",
      background: C.bg,
      borderRadius: 6,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${cat}`,
      cursor: "pointer",
      transition: "all .15s",
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = cat + "60"}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: C.textMuted, letterSpacing: "0.05em" }}>{ev.date}</span>
        <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: moveColor, letterSpacing: "-0.02em" }}>
          {ev.move >= 0 ? "+" : ""}{ev.move.toFixed(2)}%
        </span>
        <Badge color={sigColor}>{Math.abs(ev.sigma).toFixed(2)}σ</Badge>
        <Badge color={cat}>{ev.primary_force}</Badge>
        {ev.confounded && <Badge color={C.purple}>CONFOUNDED</Badge>}
        {ev.f1_tier && <Badge color={C.pink} glow>F1 T{ev.f1_tier}</Badge>}
        {ev.gap === "high" && <Badge color={C.amber}>GAP</Badge>}
        {ev.earnings_window && <Badge color={C.cyan}>EARN {ev.earnings_window.toUpperCase()}</Badge>}
        <span style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 10, color: C.textMuted }}>
          {ev.confidence}
        </span>
      </div>
      <div style={{ fontSize: 12, fontFamily: font.sans, color: C.text, lineHeight: 1.45 }}>
        {ev.catalyst}
      </div>
    </div>
  );
}

function EarningsCard({ position, history }) {
  if (!position) return null;
  const dayLabel = position.daysDelta > 0
    ? `T-${position.daysDelta}`
    : position.daysDelta < 0
    ? `T+${Math.abs(position.daysDelta)}`
    : "T-0";
  const windowColor = position.window === "earnings event" ? C.red
    : position.window === "pre-earnings drift" ? C.amber
    : position.window === "post-earnings drift" ? C.cyan
    : C.gray;
  const windowDesc = {
    "earnings event": "Print day ± 1 — binary catalyst",
    "pre-earnings drift": "T-21 to T-1 — bullish positioning + IV ramp",
    "post-earnings drift": "T+1 to T+10 — direction set, IV crush dominant",
    "outside": "Macro-force-driven — standard playbook execution",
  }[position.window] || "";
  const lastPrint = history && history.length ? history[history.length - 1] : null;
  return (
    <Card style={{ padding: "14px 18px" }} accent={position.shifted ? C.amber : null}>
      <SectionHead right={position.shifted ? <Badge color={C.amber} glow>MODE 4 TRIGGER</Badge> : null}>
        Earnings Calendar
      </SectionHead>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 28, fontFamily: font.mono, fontWeight: 700, color: windowColor, letterSpacing: "-0.02em" }}>{dayLabel}</span>
        <Badge color={windowColor} glow={position.window !== "outside"}>{position.window.toUpperCase()}</Badge>
      </div>
      <div style={{ fontSize: 12, fontFamily: font.sans, color: C.text, marginBottom: 4 }}>
        Next: <span style={{ fontFamily: font.mono, fontWeight: 600 }}>{position.quarter}</span> · {position.date} · {position.timing}
        {position.confirmed
          ? <span style={{ marginLeft: 8, color: C.green, fontFamily: font.mono, fontSize: 10 }}>● CONFIRMED</span>
          : <span style={{ marginLeft: 8, color: C.textMuted, fontFamily: font.mono, fontSize: 10 }}>○ ESTIMATED</span>}
      </div>
      <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim, marginBottom: 6 }}>
        {windowDesc}
      </div>
      {position.shifted && (
        <div style={{ fontSize: 11, fontFamily: font.sans, color: C.amber, marginTop: 8, padding: "8px 10px", background: C.amberDim + "30", borderLeft: `2px solid ${C.amber}`, borderRadius: 4 }}>
          Date shifted from <span style={{ fontFamily: font.mono }}>{position.priorEstimate}</span> (confirmed {position.confirmedAt}). Open NVDA CCs whose original DTE assumed the prior date as exit catalyst are <strong>Mode 4 Calendar Correction</strong> candidates — run /scan-rolls.
        </div>
      )}
      {lastPrint && (
        <div style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
          Last print {lastPrint.quarter} ({lastPrint.date}) · 3-day impact: <span style={{ color: lastPrint.priceImpact3d < 0 ? C.red : C.green }}>{lastPrint.priceImpact3d >= 0 ? "+" : ""}{lastPrint.priceImpact3d.toFixed(2)}%</span>
        </div>
      )}
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PAYLOAD VALIDATION + DIFF
   ════════════════════════════════════════════════════════════════════ */

function validatePayload(text) {
  let parsed;
  try {
    // Try parsing as JSON. If it fails, try to extract from a code fence.
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenceMatch ? fenceMatch[1].trim() : text.trim();
    parsed = JSON.parse(candidate);
  } catch (e) {
    return { valid: false, error: "Not valid JSON. " + e.message };
  }
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, error: "Payload must be a JSON object." };
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return { valid: false, error: `Expected schemaVersion "${SCHEMA_VERSION}", got "${parsed.schemaVersion || "(missing)"}".` };
  }
  const required = ["composite", "forces", "events", "priceSeries", "patterns"];
  for (const k of required) {
    if (!(k in parsed)) return { valid: false, error: `Missing required field: ${k}` };
  }
  if (!Array.isArray(parsed.forces) || parsed.forces.length === 0) {
    return { valid: false, error: "forces must be a non-empty array" };
  }
  if (!Array.isArray(parsed.events)) {
    return { valid: false, error: "events must be an array" };
  }
  if (!Array.isArray(parsed.priceSeries) || parsed.priceSeries.length === 0) {
    return { valid: false, error: "priceSeries must be a non-empty array" };
  }
  if (typeof parsed.composite.composite_score !== "number") {
    return { valid: false, error: "composite.composite_score must be a number" };
  }
  // earningsCalendar is optional for backward compatibility — fall back to the baseline if missing
  if (!parsed.earningsCalendar) {
    parsed.earningsCalendar = DEFAULT_EARNINGS_CALENDAR;
  }
  return { valid: true, payload: parsed };
}

function buildDiff(currentPayload, newPayload) {
  const cur = currentPayload, neu = newPayload;
  const curEvents = new Set(cur.events.map(e => e.date));
  const neuEvents = new Set(neu.events.map(e => e.date));
  const newEventDates = [...neuEvents].filter(d => !curEvents.has(d));
  const removedEventDates = [...curEvents].filter(d => !neuEvents.has(d));

  const stateTransitions = [];
  const curById = Object.fromEntries(cur.forces.map(f => [f.id, f]));
  for (const f of neu.forces) {
    const old = curById[f.id];
    if (old && old.state !== f.state) {
      stateTransitions.push({ id: f.id, name: f.name, from: old.state, to: f.state });
    }
  }

  return {
    composite_delta: +(neu.composite.composite_score - cur.composite.composite_score).toFixed(3),
    composite_from: cur.composite.composite_score,
    composite_to: neu.composite.composite_score,
    new_events: newEventDates,
    removed_events: removedEventDates,
    state_transitions: stateTransitions,
    asOfFrom: cur.asOfDate,
    asOfTo: neu.asOfDate,
    priceSeriesDelta: neu.priceSeries.length - cur.priceSeries.length,
  };
}

/* ════════════════════════════════════════════════════════════════════
   UPDATE MODAL
   ════════════════════════════════════════════════════════════════════ */

function UpdateModal({ open, onClose, currentPayload, onApply }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [validated, setValidated] = useState(null); // { payload, diff }
  const [pasteSucceeded, setPasteSucceeded] = useState(false);

  useEffect(() => {
    if (open) {
      setText(""); setError(""); setValidated(null); setPasteSucceeded(false);
    }
  }, [open]);

  const tryPasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t && t.trim().length > 0) {
        setText(t);
        setPasteSucceeded(true);
        // Auto-validate
        validateAndPreview(t);
      }
    } catch (e) {
      setError("Clipboard read failed (browser permission). Paste manually instead.");
    }
  };

  const validateAndPreview = (rawText) => {
    setError("");
    setValidated(null);
    const r = validatePayload(rawText);
    if (!r.valid) {
      setError(r.error);
      return;
    }
    const diff = buildDiff(currentPayload, r.payload);
    setValidated({ payload: r.payload, diff });
  };

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
        width: "min(900px, 100%)", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: `0 0 40px ${C.primary}30`,
      }}>
        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontFamily: font.mono, fontWeight: 700, color: C.primaryGlow, letterSpacing: "0.06em" }}>📥 UPDATE FROM CLIPBOARD</div>
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: font.mono, marginTop: 2 }}>Paste the JSON output from your refresh agent</div>
          </div>
          <Btn small color={C.gray} onClick={onClose}>✕ Close</Btn>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>

          <div style={{ display: "flex", gap: 8 }}>
            <Btn color={C.cyan} onClick={tryPasteFromClipboard}>📋 Paste from clipboard</Btn>
            <Btn color={C.primary} onClick={() => validateAndPreview(text)} disabled={!text.trim()}>Validate</Btn>
            {pasteSucceeded && <span style={{ alignSelf: "center", fontSize: 11, fontFamily: font.mono, color: C.green }}>✓ Pasted from clipboard</span>}
          </div>

          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setError(""); setValidated(null); }}
            placeholder='Paste the agent output here. Accepts raw JSON or a ```json fenced block.'
            style={{
              width: "100%", minHeight: 200, maxHeight: 350,
              background: C.bg, border: `1px solid ${error ? C.red : validated ? C.green : C.border}`,
              borderRadius: 6, padding: 12, color: C.text, fontFamily: font.mono, fontSize: 12,
              resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.5,
            }}
          />

          {error && (
            <div style={{ padding: 10, background: C.redDim + "30", border: `1px solid ${C.red}40`, borderRadius: 6, color: C.red, fontSize: 12, fontFamily: font.mono }}>
              ⚠ {error}
            </div>
          )}

          {validated && (
            <div style={{ background: C.bg, border: `1px solid ${C.green}40`, borderRadius: 6, padding: 14 }}>
              <div style={{ fontSize: 11, fontFamily: font.mono, color: C.green, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>✓ VALID — DIFF PREVIEW</div>

              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 12, fontFamily: font.mono, marginBottom: 10 }}>
                <span style={{ color: C.textMuted }}>As of:</span>
                <span style={{ color: C.text }}>{validated.diff.asOfFrom} → <strong style={{ color: C.primaryGlow }}>{validated.diff.asOfTo}</strong></span>

                <span style={{ color: C.textMuted }}>Composite:</span>
                <span style={{ color: C.text }}>
                  {validated.diff.composite_from >= 0 ? "+" : ""}{validated.diff.composite_from.toFixed(2)} →{" "}
                  <strong style={{ color: C.primaryGlow }}>{validated.diff.composite_to >= 0 ? "+" : ""}{validated.diff.composite_to.toFixed(2)}</strong>
                  {" "}<span style={{ color: validated.diff.composite_delta > 0 ? C.green : validated.diff.composite_delta < 0 ? C.red : C.gray }}>
                    ({validated.diff.composite_delta >= 0 ? "+" : ""}{validated.diff.composite_delta.toFixed(2)})
                  </span>
                </span>

                <span style={{ color: C.textMuted }}>New events:</span>
                <span style={{ color: validated.diff.new_events.length > 0 ? C.green : C.textDim }}>
                  {validated.diff.new_events.length === 0 ? "none" : validated.diff.new_events.join(", ")}
                </span>

                {validated.diff.removed_events.length > 0 && (
                  <>
                    <span style={{ color: C.textMuted }}>Removed events:</span>
                    <span style={{ color: C.amber }}>{validated.diff.removed_events.join(", ")}</span>
                  </>
                )}

                <span style={{ color: C.textMuted }}>Price series:</span>
                <span style={{ color: C.text }}>{validated.payload.priceSeries.length} points {validated.diff.priceSeriesDelta !== 0 && <span style={{ color: validated.diff.priceSeriesDelta > 0 ? C.green : C.amber }}>({validated.diff.priceSeriesDelta > 0 ? "+" : ""}{validated.diff.priceSeriesDelta})</span>}</span>

                <span style={{ color: C.textMuted }}>State transitions:</span>
                <span style={{ color: validated.diff.state_transitions.length > 0 ? C.amber : C.textDim }}>
                  {validated.diff.state_transitions.length === 0 ? "none" : `${validated.diff.state_transitions.length}`}
                </span>
              </div>

              {validated.diff.state_transitions.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted, marginBottom: 6, letterSpacing: "0.1em" }}>STATE CHANGES</div>
                  {validated.diff.state_transitions.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, fontFamily: font.mono, padding: "3px 0" }}>
                      <span style={{ color: CAT_COLOR[t.id[0]] || C.text, fontWeight: 700 }}>{t.id}</span>
                      <span style={{ color: C.textDim }}>{t.name}</span>
                      <span style={{ color: STATE_COLOR[t.from] || C.text, marginLeft: "auto" }}>{t.from}</span>
                      <span style={{ color: C.textMuted }}>→</span>
                      <span style={{ color: STATE_COLOR[t.to] || C.text, fontWeight: 700 }}>{t.to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn color={C.gray} onClick={onClose}>Cancel</Btn>
          <Btn color={C.green} onClick={() => onApply(validated.payload)} disabled={!validated}>✓ Apply Update</Btn>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   EXPORT TOAST
   ════════════════════════════════════════════════════════════════════ */

function ExportToast({ open, onClose, success, error }) {
  useEffect(() => {
    if (open && success) {
      const t = setTimeout(onClose, 4000);
      return () => clearTimeout(t);
    }
  }, [open, success, onClose]);
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 1000,
      background: success ? C.greenDim + "e0" : C.redDim + "e0",
      border: `1px solid ${success ? C.green : C.red}`,
      borderRadius: 8, padding: "14px 18px",
      maxWidth: 420, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    }}>
      <div style={{ fontSize: 12, fontFamily: font.mono, fontWeight: 700, color: success ? C.green : C.red, letterSpacing: "0.06em", marginBottom: 4 }}>
        {success ? "✓ COPIED TO CLIPBOARD" : "⚠ COPY FAILED"}
      </div>
      <div style={{ fontSize: 11, fontFamily: font.sans, color: C.text, lineHeight: 1.5 }}>
        {success
          ? "Current dashboard state is on your clipboard. Paste it into your refresh agent chat to continue from this state."
          : (error || "Browser blocked clipboard write. Try again or use Ctrl+C from the export view.")}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════════════════════ */

export default function MacroForceDashboard() {
  // Data state — loaded from window.storage on mount, falls back to defaults
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [mode, setMode] = useState("BASELINE"); // BASELINE | LIVE
  const [storageReady, setStorageReady] = useState(false);

  // UI state
  const [selectedForce, setSelectedForce] = useState(null);
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterState, setFilterState] = useState("ALL");
  const [eventLimit, setEventLimit] = useState(10);
  const [chartMode, setChartMode] = useState("price");

  // Modal state
  const [updateOpen, setUpdateOpen] = useState(false);
  const [exportToast, setExportToast] = useState({ open: false, success: false, error: "" });

  // Load from storage on mount
  useEffect(() => {
    (async () => {
      try {
        if (window.storage && typeof window.storage.get === "function") {
          const r = await window.storage.get(STORAGE_KEY);
          if (r?.value) {
            const stored = JSON.parse(r.value);
            const v = validatePayload(JSON.stringify(stored));
            if (v.valid) {
              setPayload(v.payload);
              setMode("LIVE");
            }
          }
        }
      } catch (e) {
        console.warn("Storage load failed; using baseline data.", e);
      }
      setStorageReady(true);
    })();
  }, []);

  const persist = useCallback(async (p) => {
    try {
      if (window.storage && typeof window.storage.set === "function") {
        await window.storage.set(STORAGE_KEY, JSON.stringify(p));
      }
    } catch (e) {
      console.warn("Storage save failed.", e);
    }
  }, []);

  const applyUpdate = useCallback((newPayload) => {
    setPayload(newPayload);
    setMode("LIVE");
    persist(newPayload);
    setUpdateOpen(false);
  }, [persist]);

  const exportToClipboard = useCallback(async () => {
    try {
      const text = JSON.stringify(payload, null, 2);
      await navigator.clipboard.writeText(text);
      setExportToast({ open: true, success: true, error: "" });
    } catch (e) {
      setExportToast({ open: true, success: false, error: e.message });
    }
  }, [payload]);

  const resetToBaseline = useCallback(async () => {
    if (!window.confirm("Reset dashboard to baseline data (2026-04-24)? This clears any clipboard updates you've applied.")) return;
    setPayload(DEFAULT_PAYLOAD);
    setMode("BASELINE");
    try {
      if (window.storage && typeof window.storage.delete === "function") {
        await window.storage.delete(STORAGE_KEY);
      } else if (window.storage && typeof window.storage.set === "function") {
        await window.storage.set(STORAGE_KEY, "");
      }
    } catch {}
  }, []);

  // Derived state
  const { composite, forces, events, priceSeries, patterns } = payload;

  const chartData = useMemo(() => {
    const eventByDate = Object.fromEntries(events.map(e => [e.date, e]));
    return priceSeries.map(p => {
      const ev = eventByDate[p.date];
      return {
        date: p.date,
        close: p.close,
        eventCategory: ev?.category,
        eventForce: ev?.primary_force,
        eventSigma: ev?.sigma,
        eventCatalyst: ev?.catalyst,
        eventMove: ev?.move,
      };
    });
  }, [events, priceSeries]);

  const forceContribData = useMemo(() =>
    forces
      .filter(f => f.state !== "DORMANT" && f.id !== "F1")
      .map(f => ({
        id: f.id, name: f.id,
        contribution: f.net_ytd_reaction,
        category: f.category,
      }))
      .sort((a, b) => b.contribution - a.contribution)
  , [forces]);

  const filteredForces = useMemo(() => {
    return forces.filter(f => {
      if (filterCategory !== "ALL" && f.category !== filterCategory) return false;
      if (filterState !== "ALL" && f.state !== filterState) return false;
      return true;
    });
  }, [forces, filterCategory, filterState]);

  const sortedEvents = useMemo(() =>
    [...events].sort((a, b) => b.date.localeCompare(a.date))
  , [events]);

  const compColor = composite.composite_score > 1 ? C.green
    : composite.composite_score < -1 ? C.red
    : C.amber;

  const updatedAt = payload.updatedAt
    ? new Date(payload.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : payload.asOfDate || composite.date;

  const earningsPosition = useMemo(() => {
    const cal = payload.earningsCalendar;
    if (!cal?.next?.date) return null;
    const today = new Date(payload.asOfDate || composite.date);
    const earningsDate = new Date(cal.next.date);
    const daysDelta = Math.round((earningsDate - today) / (1000 * 60 * 60 * 24));
    let window;
    if (daysDelta > 21) window = "outside";
    else if (daysDelta >= 1) window = "pre-earnings drift";
    else if (daysDelta >= -1) window = "earnings event";
    else if (daysDelta >= -10) window = "post-earnings drift";
    else window = "outside";
    return { daysDelta, window, ...cal.next };
  }, [payload.earningsCalendar, payload.asOfDate, composite.date]);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: font.sans, padding: "0 0 40px" }}>

      {/* ─── HEADER ─── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.surface, gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: font.mono, letterSpacing: "0.08em", color: C.primaryGlow }}>
            MACRO FORCE DASHBOARD
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, fontFamily: font.mono, marginTop: 2 }}>
            Flywheel Playbook — NVDA Force Attribution & Composite Score
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <Badge color={mode === "LIVE" ? C.green : C.amber} glow={mode === "LIVE"}>
              VIEWING: {mode}
            </Badge>
            <span style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted, letterSpacing: "0.06em" }}>
              {mode === "LIVE" ? "Updated " : "Baseline "}{updatedAt}
            </span>
          </div>

          <Badge color={compColor} glow>{composite.interpretation.replace("_", " ").toUpperCase()}</Badge>

          <div style={{ display: "flex", gap: 6 }}>
            <Btn color={C.primary} onClick={() => setUpdateOpen(true)} title="Paste JSON output from refresh agent">
              📥 Update
            </Btn>
            <Btn color={C.cyan} onClick={exportToClipboard} title="Copy current dashboard state to clipboard">
              📤 Export
            </Btn>
            <Btn small color={C.gray} onClick={resetToBaseline} title="Revert to baseline data">
              ↺ Reset
            </Btn>
          </div>
        </div>
      </div>

      {/* ─── HERO ─── */}
      <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "320px 1fr", gap: 20 }}>
        <Card glow accent={compColor} style={{ padding: 18 }}>
          <SectionHead>Composite Score</SectionHead>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <CompositeGauge score={composite.composite_score} multiplier={composite.f1_multiplier} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 9, fontFamily: font.mono, color: C.textMuted, letterSpacing: "0.1em" }}>BULLISH</div>
              <div style={{ fontSize: 16, fontFamily: font.mono, fontWeight: 700, color: C.green }}>+{composite.net_bullish.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: font.mono, color: C.textMuted, letterSpacing: "0.1em" }}>BEARISH</div>
              <div style={{ fontSize: 16, fontFamily: font.mono, fontWeight: 700, color: C.red }}>{composite.net_bearish.toFixed(2)}</div>
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <StatCard label="Active Forces" value={composite.active_force_count} sub="Currently moving the tape" color={C.green} big />
            <StatCard label="Attenuating" value={composite.attenuating_force_count} sub="Decaying — losing potency" color={C.amber} big />
            <StatCard label="Dormant" value={composite.dormant_force_count} sub="Sleeping until reactivated" color={C.gray} big />
            <StatCard label="F1 Multiplier" value={`${composite.f1_multiplier.toFixed(2)}×`} sub="Validation amplifier" color={C.pink} big />
          </div>
          <Card style={{ padding: "14px 18px" }}>
            <SectionHead>Top YTD Drivers</SectionHead>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...forces].filter(f => f.id !== "F1" && f.state !== "DORMANT").sort((a, b) => Math.abs(b.net_ytd_reaction) - Math.abs(a.net_ytd_reaction)).slice(0, 5).map(f => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: font.mono, fontWeight: 700, color: CAT_COLOR[f.category], fontSize: 12, minWidth: 28 }}>{f.id}</span>
                  <span style={{ fontFamily: font.sans, fontSize: 12, color: C.textDim, flex: 1 }}>{f.name}</span>
                  <div style={{ width: 200 }}>
                    <DirectionalBar value={f.net_ytd_reaction} max={15} />
                  </div>
                  <span style={{ fontFamily: font.mono, fontWeight: 700, fontSize: 12, color: f.net_ytd_reaction > 0 ? C.green : C.red, minWidth: 60, textAlign: "right" }}>
                    {f.net_ytd_reaction >= 0 ? "+" : ""}{f.net_ytd_reaction.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <EarningsCard position={earningsPosition} history={payload.earningsCalendar?.history} />
        </div>
      </div>

      {/* ─── CHART ─── */}
      <div style={{ padding: "0 24px 16px" }}>
        <Card>
          <SectionHead right={
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small color={C.primary} active={chartMode === "price"} onClick={() => setChartMode("price")}>NVDA + Events</Btn>
              <Btn small color={C.primary} active={chartMode === "force_contrib"} onClick={() => setChartMode("force_contrib")}>Force Contributions</Btn>
            </div>
          }>
            {chartMode === "price" ? "NVDA YTD with Force-Coded Event Markers" : "Per-Force Net YTD Contribution"}
          </SectionHead>

          {chartMode === "price" && (
            <>
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                    <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="date" stroke={C.textMuted} tick={{ fontFamily: font.mono, fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis stroke={C.textMuted} tick={{ fontFamily: font.mono, fontSize: 10 }} domain={["dataMin - 5", "dataMax + 5"]} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, fontFamily: font.mono, fontSize: 11, maxWidth: 320 }}>
                            <div style={{ color: C.text, fontWeight: 700, marginBottom: 4 }}>{d.date} · ${d.close.toFixed(2)}</div>
                            {d.eventCategory && (
                              <>
                                <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                                  <Badge color={CAT_COLOR[d.eventCategory]}>{d.eventForce}</Badge>
                                  <span style={{ color: d.eventMove > 0 ? C.green : C.red, fontWeight: 700 }}>{d.eventMove >= 0 ? "+" : ""}{d.eventMove.toFixed(2)}%</span>
                                  <span style={{ color: C.textMuted }}>{d.eventSigma.toFixed(2)}σ</span>
                                </div>
                                <div style={{ color: C.textDim, fontSize: 10, lineHeight: 1.4 }}>{d.eventCatalyst}</div>
                              </>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Line type="monotone" dataKey="close" stroke={C.primary} strokeWidth={1.5} dot={<EventDot />} activeDot={false} />
                    {(payload.earningsCalendar?.history || []).map(h => (
                      <ReferenceLine
                        key={`earn-${h.date}`}
                        x={h.date}
                        stroke={C.cyan}
                        strokeDasharray="3 3"
                        strokeOpacity={0.7}
                        label={{ value: `${h.quarter} EARN`, position: "top", fill: C.cyan, fontSize: 9, fontFamily: font.mono }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap", justifyContent: "center", padding: "8px 0", borderTop: `1px solid ${C.border}` }}>
                {Object.entries(CAT_COLOR).map(([cat, col]) => (
                  <div key={cat} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: col }} />
                    <span style={{ fontSize: 10, fontFamily: font.mono, color: C.textDim, letterSpacing: "0.06em" }}>
                      {cat} · {CAT_NAME[cat]}
                    </span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 14, height: 1, borderTop: `1px dashed ${C.cyan}` }} />
                  <span style={{ fontSize: 10, fontFamily: font.mono, color: C.textDim, letterSpacing: "0.06em" }}>
                    NVDA earnings
                  </span>
                </div>
                <span style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted, marginLeft: 16, fontStyle: "italic" }}>
                  Marker size = |z-score|
                </span>
              </div>
            </>
          )}

          {chartMode === "force_contrib" && (
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forceContribData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="id" stroke={C.textMuted} tick={{ fontFamily: font.mono, fontSize: 11, fontWeight: 700 }} />
                  <YAxis stroke={C.textMuted} tick={{ fontFamily: font.mono, fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: font.mono, fontSize: 11 }}
                    labelStyle={{ color: C.text, fontWeight: 700 }}
                    formatter={(v) => [`${v >= 0 ? "+" : ""}${v.toFixed(2)}`, "YTD contribution"]}
                  />
                  <Bar dataKey="contribution">
                    {forceContribData.map((d, i) => (
                      <Cell key={i} fill={d.contribution > 0 ? C.green : C.red} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* ─── FORCE GRID ─── */}
      <div style={{ padding: "0 24px 16px" }}>
        <Card>
          <SectionHead right={
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted, alignSelf: "center", letterSpacing: "0.1em" }}>CATEGORY:</span>
              {["ALL", "A", "B", "C", "D", "E", "F"].map(c => (
                <Btn key={c} small color={c === "ALL" ? C.primary : (CAT_COLOR[c] || C.primary)} active={filterCategory === c} onClick={() => setFilterCategory(c)}>
                  {c}
                </Btn>
              ))}
              <span style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted, alignSelf: "center", letterSpacing: "0.1em", marginLeft: 12 }}>STATE:</span>
              {["ALL", "ACTIVE", "ATTENUATING", "DORMANT"].map(s => (
                <Btn key={s} small color={s === "ALL" ? C.primary : (STATE_COLOR[s] || C.primary)} active={filterState === s} onClick={() => setFilterState(s)}>
                  {s}
                </Btn>
              ))}
            </div>
          }>
            Force Registry — {forces.length} Forces
          </SectionHead>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {filteredForces.map(f => (
              <ForceCard key={f.id} force={f} onClick={() => setSelectedForce(f.id === selectedForce ? null : f.id)} selected={selectedForce === f.id} />
            ))}
          </div>
          {filteredForces.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: C.textMuted, fontFamily: font.mono, fontSize: 12 }}>
              No forces match filter.
            </div>
          )}
        </Card>
      </div>

      {/* ─── EVENT FEED + PATTERNS ─── */}
      <div style={{ padding: "0 24px 16px", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <Card>
          <SectionHead right={
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small color={C.primary} active={eventLimit === 10} onClick={() => setEventLimit(10)}>Last 10</Btn>
              <Btn small color={C.primary} active={eventLimit === events.length} onClick={() => setEventLimit(events.length)}>All ({events.length})</Btn>
            </div>
          }>
            Event Feed
          </SectionHead>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 600, overflowY: "auto" }}>
            {sortedEvents.slice(0, eventLimit).map(ev => (
              <a key={ev.date} href={ev.source} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <EventRow ev={ev} />
              </a>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHead>Pattern Library</SectionHead>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {patterns.map((p, i) => {
              const sevColor = p.severity === "bullish" ? C.green
                : p.severity === "bearish" ? C.red
                : p.severity === "absorbed" ? C.amber
                : C.primary;
              return (
                <div key={i} style={{
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${sevColor}`,
                  borderRadius: 6,
                  padding: "10px 12px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: C.text, flex: 1 }}>
                      {p.title}
                    </span>
                    <Badge color={sevColor}>{p.severity.toUpperCase()}</Badge>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: font.sans, color: C.textDim, lineHeight: 1.5, marginBottom: 6 }}>
                    {p.body}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: font.sans, color: C.text, lineHeight: 1.5, padding: "6px 8px", background: C.surface, borderRadius: 4, borderLeft: `2px solid ${sevColor}` }}>
                    <span style={{ fontFamily: font.mono, fontSize: 9, color: sevColor, letterSpacing: "0.1em" }}>IMPLICATION → </span>
                    {p.implication}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ─── FOOTER ─── */}
      <div style={{ padding: "0 24px" }}>
        <Card style={{ padding: "12px 16px", background: C.surface }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, fontSize: 11, fontFamily: font.mono, color: C.textMuted }}>
            <span>
              <strong style={{ color: C.textDim }}>{events.length}</strong> events ·{" "}
              <strong style={{ color: C.textDim }}>{priceSeries.length}</strong> price points ·{" "}
              <strong style={{ color: C.textDim }}>{forces.length}</strong> forces
              {!storageReady && <span style={{ color: C.amber, marginLeft: 12 }}>(loading...)</span>}
            </span>
            <span>
              Schema <code style={{ color: C.primary }}>v{SCHEMA_VERSION}</code> · Refresh: 📤 Export → refresh-agent → 📥 Update
            </span>
          </div>
        </Card>
      </div>

      {/* ─── MODALS / TOASTS ─── */}
      <UpdateModal open={updateOpen} onClose={() => setUpdateOpen(false)} currentPayload={payload} onApply={applyUpdate} />
      <ExportToast open={exportToast.open} onClose={() => setExportToast({ ...exportToast, open: false })} success={exportToast.success} error={exportToast.error} />
    </div>
  );
}
