import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";

/* ══════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════ */
const UNIFIED_KEY = "flywheel-playbook-v1";
const OLD_DASH_KEY = "flywheel-dash-v4";
const OLD_MACRO_KEY = "flywheel-macro-v2";
const OLD_RESULTS_KEY = "flywheel-results-v2";
const MACRO_SCHEMA = "1.0";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const _fmtUSD  = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const _fmtUSD2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD  = n => _fmtUSD.format(n);
const fmtUSD2 = n => _fmtUSD2.format(n);
const fmtTime = ts => { const d = new Date(ts); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };
const timeAgo = ts => { const m = Math.floor((Date.now()-ts)/60000); if(m<60) return `${m}m ago`; const h=Math.floor(m/60); if(h<24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; };
const fmtEarningsLabel = d => d >= 0 ? `T-${d}` : `T+${Math.abs(d)}`;

/* ─── UNIFIED PALETTE ─── */
const C = {
  bg: "#080c14", surface: "#0f1520", card: "#141c2b", cardHi: "#172238",
  border: "#1c2740", borderHi: "#2a3a58",
  text: "#e2e8f0", textDim: "#8494ad", textMuted: "#4a5a74",
  accent: "#22c55e", accentDim: "#166534",
  amber: "#f59e0b", amberDim: "#78350f",
  red: "#ef4444", redDim: "#7f1d1d",
  blue: "#3b82f6", blueDim: "#1e3a5f", blueGlow: "#60a5fa",
  cyan: "#06b6d4", cyanDim: "#155e75",
  purple: "#a855f7", purpleDim: "#581c87",
  pink: "#ec4899", pinkDim: "#831843",
  gray: "#475569", grayDim: "#1e293b",
};

const font = {
  mono: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  sans: "'SF Pro Display', 'Segoe UI', system-ui, -apple-system, sans-serif",
};

/* ─── PARSER ─── */
function parseOptionsTicker(raw) {
  const trimmed = raw.trim().toUpperCase();
  const isShort = trimmed.startsWith("-");
  const clean = isShort ? trimmed.slice(1) : trimmed;
  const m = clean.match(/^([A-Z]{1,6})(\d{6})([CP])(\d+\.?\d*)$/);
  if (!m) return null;
  const [, underlying, ds, cp, st] = m;
  const yr = 2000 + +ds.slice(0,2), mo = +ds.slice(2,4), dy = +ds.slice(4,6);
  const exp = new Date(yr, mo-1, dy);
  const dte = Math.max(0, Math.ceil((exp - new Date()) / 864e5));
  return { direction: isShort ? "SHORT" : "LONG", underlying, expDate: exp, expStr: `${String(mo).padStart(2,"0")}/${String(dy).padStart(2,"0")}/${yr}`, type: cp === "C" ? "CALL" : "PUT", strike: parseFloat(st), dte, raw: trimmed };
}

function deriveEarningsPosition(cal) {
  if (!cal?.next?.date) return null;
  const today = new Date();
  const earningsDate = new Date(cal.next.date);
  const daysDelta = Math.round((earningsDate - today) / 864e5);
  let window;
  if (daysDelta > 21) window = "outside";
  else if (daysDelta >= 1) window = "pre-earnings drift";
  else if (daysDelta >= -1) window = "earnings event";
  else if (daysDelta >= -10) window = "post-earnings drift";
  else window = "outside";
  return { daysDelta, window, ...cal.next };
}

/* ─── STANDING OBJECTIVES ─── */
const STANDING_ROTH = [
  "CC entry: 45-DTE standard. Double Barrier strike — above ascending channel resistance projected to expiry + round number, AND confirmed at 0.20 delta (≈80% OTM). Both barriers required independently. Prefer IV rank above 30th percentile at entry.",
  "Mode 1 — Income: close at 50% profit or roll at 21 DTE, whichever comes first. 50% net credit standard on rolls.",
  "Mode 2 — Planned Exit: high-conviction bearish catalyst (tariffs, significant sector rotation, ETF rebalancing window, descending channel dominance). ATM or ITM strike. Assignment is the intended outcome — a pre-planned exit with premium attached.",
  "Mode 3 — Offensive Roll: bull-trap rally threatens existing CC. Execute during Amateur Hour (9:30–10:00 AM), especially Tuesdays. Buy back at inflated IV, sell new call at higher strike + later expiry for 50% net credit. New strike must satisfy ascending channel resistance + round number confluence (same Double Barrier standard). Two-stage roll for 5%+ rallies: near-dated defensive first, then return to 45-DTE.",
  "Mode 4 — Calendar Correction: exogenous catalyst shift only — earnings date confirmed to have moved OUTSIDE the current DTE. All five criteria required: original catalyst inside DTE as planned exit, catalyst now outside DTE, new DTE restores catalyst inside contract life, strike absorbs dislocation price action, debit bounded and pre-defined. Single-roll limit, pre-commit stopping rule.",
  "Turnaround Tuesday CSP: all 5 conditions required (Monday close ≥1% below Friday, IBS <0.20, no Tuesday binary catalyst, IV elevated, capital available). Entry Monday 3–4 PM ET. 2-DTE. Strike: 0.20–0.30 delta at or below ascending channel floor. Exit: 40–50% Tuesday AM. Defensive exit: close immediately if NVDA falls 3%+ below the short put strike.",
  "Swing trade: entry at ascending channel support floor, confirmed by close tick on OHLC bar (wick tags alone do not qualify). Target: upper range / descending channel resistance / round number. Size so a failed trade does not impair CC collateral base. Exit if ascending channel support fails on a closing basis — it is a breakdown, not a dip.",
  "Capital deployment priority: (1) swing trade if velocity exceeds CSP accumulation rate, (2) qualifying Turnaround Tuesday CSP, (3) SPAXX at ~4% floor yield.",
  "Earnings Shield: Mon/Wed short-dated NVDA vehicle only — do not open a position spanning the earnings week. No such restriction on 45-DTE CCs or Turnaround Tuesday CSPs.",
  "Wash Sale Firewall: Roth IRA in absolute isolation from any taxable account trading the same tickers.",
  "Assignment is a feature: capital-efficient share acquisition at a self-selected price. Concentration is the engine, not a flaw.",
  "SPAXX double-dip: idle collateral earns ~4% sweep yield while collateralizing positions.",
];
const STANDING_HSA = [
  "JEPI is NEVER sold — permanent income stabilizer. Accumulates indefinitely even after DRIP stops at pivot. Milestones: 250 shares = meaningful dividend base; 500 = pivot trigger; 1,000 = mature stabilizer; 1,500 = full-scale compounding target.",
  "DRIP all JEPI distributions until 500-share pivot trigger, then DRIP stops and distributions redirect to IBIT capital deployment. JEPI position stays and compounds indefinitely.",
  "Pivot Gate (500 JEPI + ALL three macro conditions): conflict de-escalated, Fed cutting or paused, crypto regulatory clarity. Share count and macro gate must both be satisfied simultaneously.",
  "At pivot: growth vehicle exits, IBIT enters as the covered call vehicle. JEPI is unaffected.",
  "Post-pivot IBIT CC entry: all three CC modes apply (Mode 1 Income, Mode 2 Planned Exit, Mode 3 Offensive Roll). Same Double Barrier standard — ascending channel resistance + round number + 0.20 delta. 50% net credit standard on rolls is a harder discipline in the HSA — CC premium is the sole active income layer.",
  "Post-pivot swing trades within the established IBIT channel range are available as direct share purchases. No CSPs available (Level 1 only). No T+1 settlement bypass — limited margin not available in HSA.",
  "HSA is Level 1 only — covered calls only. No CSPs.",
  "Maintain regime-aligned growth vehicle during accumulation phase (separate from JEPI; this position exits at pivot, not JEPI).",
  "Pay medical expenses from taxable sources — preserve HSA tax-advantaged compounding. Save every receipt permanently (no expiration on reimbursement eligibility).",
];

/* ─── AI SYSTEM PROMPTS (module-scope — no dynamic content, no need to recreate per render) ─── */
const SYSTEM_ROTH = `You are an AI analyst for the Roth IRA account in the Flywheel Playbook — a covered call income system. This account holds NVDA (primary vehicle) and JEPQ (income stabilizer). Analyze ONLY what is in the snapshot provided. Do not reference the HSA account.

Key concepts: Double Barrier strike selection (ascending channel projection + 0.20 delta), 45-DTE covered calls, Turnaround Tuesday 2-DTE CSPs, 50% net credit roll standard, contract count expansion as compounding engine. Scaling roadmap: Phase 1 = 5 NVDA contracts, Phase 2 = 1500 JEPQ shares, Phase 3 = 10 NVDA contracts.

COVERED CALL ROLL MODES:
- Mode 1 (Income Generation): 45-DTE entry, double-barrier strike, manage at 50% profit OR roll at 21 DTE
- Mode 2 (Planned Directional Exit): bearish-conviction trigger, ATM/ITM strike, assignment is the planned outcome
- Mode 3 (Offensive Roll): bull-trap rally response, Amateur Hour execution, requires 50% net credit
- Mode 4 (Calendar Correction): exogenous calendar shift displaces original exit catalyst. Mode 4 EXPLICITLY ACCEPTS net debit. Single-roll limit, pre-committed stopping rule, bounded debit.

EARNINGS: The Earnings Shield applies only to Monday/Wednesday short-dated NVDA options (new 2026 vehicle) — not to 45-DTE CCs. Do NOT flag existing CCs for earnings proximity. The ONLY earnings-driven management action is Mode 4, triggered when the earnings date has SHIFTED from the estimate assumed at entry. If earningsCalendar.next.shifted is true, surface a Mode 4 trigger. If not shifted, treat earnings as informational only.

STANDING OBJECTIVES are always active — do not restate them as recommended actions.
USER GOALS have timeframes: immediate (this week), near (this 45-DTE cycle), long (multi-cycle), opportunity (conditional).

Provide: 1) Roth IRA status with any Mode 4 implications. 2) Goal priority analysis. 3) Specific next actions ranked by impact. Be concise and direct.`;

const SYSTEM_HSA = `You are an AI analyst for the HSA account in the Flywheel Playbook. Analyze ONLY the snapshot provided. Do not reference the Roth IRA, NVDA, or Mode 4.

HSA STRUCTURE — read this carefully before analyzing:
- JEPI is the permanent income stabilizer. JEPI shares are NEVER sold. DRIP runs until 500 shares, then stops — but the position stays and compounds indefinitely.
- During the accumulation phase a separate regime-appropriate growth vehicle is held alongside JEPI. At pivot, that growth vehicle exits — JEPI does not.
- At pivot (500 JEPI + macro gate): DRIP stops, growth vehicle exits, IBIT enters as the covered call vehicle.
- IBIT covered calls are the post-pivot income engine.

INFER PHASE FROM THE SNAPSHOT — do not ask questions the portfolio already answers:
- If IBIT options are present, the pivot has been executed. Do not question it, do not reassess the pivot gate, do not recommend disabling DRIP.
- If IBIT shares are 0 but IBIT options exist, IBIT is being accumulated through options activity — this is normal.
- If no IBIT positions exist and JEPI < 500, accumulation phase is active.

HSA Pivot Gate (only relevant if pivot has NOT yet occurred): 500 JEPI shares AND favorable macro regime (conflict de-escalated, Fed cutting/paused, crypto regulatory clarity).

NEVER recommend selling JEPI. NEVER suggest JEPI as a funding source for anything.
STANDING OBJECTIVES are always active — do not restate them as recommended actions.
USER GOALS have timeframes: immediate (this week), near (this cycle), long (multi-cycle), opportunity (conditional).

Use web search to check current JEPI and IBIT prices and distribution yield. Based on what the snapshot actually shows, provide only actionable analysis. If the portfolio is on track with no decisions pending, say so clearly rather than padding with irrelevant observations.`;

const TIMEFRAMES = {
  immediate: { label: "Immediate", color: C.red, desc: "This week's session — execute or evaluate now" },
  near:      { label: "Near-Term", color: C.amber, desc: "This cycle (current 45-DTE window)" },
  long:      { label: "Long-Term", color: C.blue, desc: "Multi-cycle strategic milestone" },
  opportunity: { label: "Opportunity", color: C.purple, desc: "Conditional — activates when market conditions align" },
};

/* ─── MACRO REGISTRY ─── */
const CAT_COLOR = { A: C.accent, B: C.cyan, C: C.amber, D: C.red, E: C.purple, F: C.pink };
const CAT_NAME = { A: "Demand", B: "Supply", C: "Policy", D: "Competitive", E: "Market Structure", F: "Validation" };
const STATE_COLOR = { ACTIVE: C.accent, ATTENUATING: C.amber, DORMANT: C.gray, REACTIVATED: C.cyan };

/* ══════════════════════════════════════════════════════════
   DEFAULT MACRO BASELINE (2026-04-24)
══════════════════════════════════════════════════════════ */
const DEFAULT_COMPOSITE = { date:"2026-04-24", net_bullish:18.322, net_bearish:-13.221, net_directional:5.102, f1_multiplier:1.15, composite_score:5.867, active_force_count:11, attenuating_force_count:2, dormant_force_count:3, interpretation:"bullish_dominant" };

const DEFAULT_FORCES = [
  { id:"A1", name:"Hyperscaler Capex Cycle", category:"A", type:"additive", state:"ACTIVE", weight:1.509, direction_bias:"bullish", net_ytd_reaction:12.733, attenuation_trend:"stable", events_total:18, events_isolated:12, events_confounded:6, events_bullish:12, events_bearish:6, last_event_date:"2026-04-24" },
  { id:"A2", name:"Enterprise AI Adoption", category:"A", type:"additive", state:"ACTIVE", weight:0.889, direction_bias:"bearish", net_ytd_reaction:-0.766, attenuation_trend:"thin sample", events_total:3, events_isolated:1, events_confounded:2, events_bullish:1, events_bearish:2, last_event_date:"2026-04-23" },
  { id:"A3", name:"Sovereign AI", category:"A", type:"additive", state:"DORMANT", weight:0, direction_bias:"neutral", net_ytd_reaction:0, attenuation_trend:"no events", events_total:0, events_isolated:0, events_confounded:0, events_bullish:0, events_bearish:0, last_event_date:null },
  { id:"B1", name:"Foundry & Packaging (CoWoS, HBM)", category:"B", type:"additive", state:"ACTIVE", weight:0.845, direction_bias:"bullish", net_ytd_reaction:4.493, attenuation_trend:"stable", events_total:6, events_isolated:4, events_confounded:2, events_bullish:6, events_bearish:0, last_event_date:"2026-04-17" },
  { id:"B2", name:"Taiwan Geopolitical Risk", category:"B", type:"additive", state:"ACTIVE", weight:0.330, direction_bias:"neutral", net_ytd_reaction:0.335, attenuation_trend:"thin sample", events_total:1, events_isolated:0, events_confounded:1, events_bullish:1, events_bearish:0, last_event_date:"2026-04-08" },
  { id:"B3", name:"Power & Grid Infrastructure", category:"B", type:"additive", state:"ACTIVE", weight:0.430, direction_bias:"neutral", net_ytd_reaction:0.432, attenuation_trend:"thin sample", events_total:1, events_isolated:1, events_confounded:0, events_bullish:1, events_bearish:0, last_event_date:"2026-04-24" },
  { id:"C1", name:"China Export Controls", category:"C", type:"additive", state:"ACTIVE", weight:1.060, direction_bias:"bearish", net_ytd_reaction:-5.272, attenuation_trend:"stable", events_total:8, events_isolated:3, events_confounded:5, events_bullish:1, events_bearish:7, last_event_date:"2026-04-08" },
  { id:"C2", name:"US Industrial Policy (Tariffs)", category:"C", type:"additive", state:"ATTENUATING", weight:0.873, direction_bias:"bearish", net_ytd_reaction:-1.751, attenuation_trend:"absorbed", events_total:3, events_isolated:1, events_confounded:2, events_bullish:1, events_bearish:2, last_event_date:"2026-01-20" },
  { id:"C3", name:"Federal Reserve Policy", category:"C", type:"additive", state:"ATTENUATING", weight:0.336, direction_bias:"bearish", net_ytd_reaction:-1.077, attenuation_trend:"stable", events_total:5, events_isolated:2, events_confounded:3, events_bullish:1, events_bearish:4, last_event_date:"2026-03-26" },
  { id:"C4", name:"AI & Antitrust Regulation", category:"C", type:"additive", state:"DORMANT", weight:0, direction_bias:"neutral", net_ytd_reaction:0, attenuation_trend:"no events", events_total:0, events_isolated:0, events_confounded:0, events_bullish:0, events_bearish:0, last_event_date:null },
  { id:"D1", name:"AMD Competitive Pressure", category:"D", type:"additive", state:"ACTIVE", weight:0.700, direction_bias:"bearish", net_ytd_reaction:-1.940, attenuation_trend:"stable", events_total:4, events_isolated:2, events_confounded:2, events_bullish:0, events_bearish:4, last_event_date:"2026-04-24" },
  { id:"D2", name:"Custom Silicon Displacement", category:"D", type:"additive", state:"ACTIVE", weight:0.802, direction_bias:"bearish", net_ytd_reaction:-1.741, attenuation_trend:"stable", events_total:5, events_isolated:3, events_confounded:2, events_bullish:1, events_bearish:4, last_event_date:"2026-04-21" },
  { id:"D3", name:"China Domestic Chip Capability", category:"D", type:"additive", state:"DORMANT", weight:0, direction_bias:"neutral", net_ytd_reaction:0, attenuation_trend:"no events", events_total:0, events_isolated:0, events_confounded:0, events_bullish:0, events_bearish:0, last_event_date:null },
  { id:"E1", name:"Positioning & Flows", category:"E", type:"oscillating", state:"ACTIVE", weight:0.700, direction_bias:"neutral", net_ytd_reaction:0.658, attenuation_trend:"oscillating", events_total:33, events_isolated:22, events_confounded:11, events_bullish:18, events_bearish:13, last_event_date:"2026-04-24" },
  { id:"E2", name:"Cross-Asset Risk Regime", category:"E", type:"oscillating", state:"ACTIVE", weight:0.722, direction_bias:"bearish", net_ytd_reaction:-1.345, attenuation_trend:"oscillating", events_total:11, events_isolated:4, events_confounded:7, events_bullish:3, events_bearish:8, last_event_date:"2026-04-23" },
  { id:"F1", name:"Narrative Validation / 3rd Party", category:"F", type:"multiplier", state:"ACTIVE", weight:1.500, direction_bias:"building", net_ytd_reaction:0, attenuation_trend:"building", events_total:4, events_isolated:0, events_confounded:0, events_bullish:0, events_bearish:0, last_event_date:"2026-04-24" },
];

const DEFAULT_EVENTS = [
  { date:"2026-01-08", close:185.04, move:-2.15, sigma:-2.76, gap:"low", primary_force:"A1", category:"A", confounded:false, confidence:"medium", catalyst:"AI spending sustainability concerns; CES 2026 fade", source:"https://www.cnbc.com/2026/01/14/nvidia-shares-are-struggling-how-the-ai-juggernaut-can-can-break-its-funk.html" },
  { date:"2026-01-14", close:183.14, move:-1.44, sigma:-1.33, gap:"low", primary_force:"C2", category:"C", confounded:false, confidence:"high", catalyst:"Trump Section 232 — 25% tariff on H200/MI325X", source:"https://www.whitehouse.gov/fact-sheets/2026/01/fact-sheet-president-donald-j-trump-takes-action-on-certain-advanced-computing-chips-to-protect-americas-economic-and-national-security/" },
  { date:"2026-01-15", close:187.05, move:2.13, sigma:2.13, gap:"moderate", primary_force:"C1", category:"C", confounded:true, confidence:"high", catalyst:"BIS H200 case-by-case framework + TSMC earnings + $250B Taiwan investment", source:"https://markets.financialcontent.com/stocks/article/marketminute-2026-1-16-the-new-managed-access-era-trump-administration-authorizes-nvidia-h200-exports-to-china-under-strict-surcharges" },
  { date:"2026-01-20", close:178.07, move:-4.38, sigma:-3.62, gap:"high", primary_force:"C1", category:"C", confounded:true, confidence:"high", catalyst:"China customs blocking H200 over 25% surcharge; MLK weekend gap", source:"https://markets.financialcontent.com/stocks/article/tokenring-2026-1-23-us-eases-nvidia-h200-exports-to-china-with-25-revenue-tariff" },
  { date:"2026-01-21", close:183.32, move:2.95, sigma:1.94, gap:"low", primary_force:"E1", category:"E", confounded:false, confidence:"medium", catalyst:"Dip-buying rebound; MSFT/GOOGL capex reaffirmation", source:"https://www.apnews.org/tech-stocks-decline-january-2026/" },
  { date:"2026-01-29", close:192.51, move:0.52, sigma:0.21, gap:"low", primary_force:"C3", category:"C", confounded:false, confidence:"medium", catalyst:"Day after FOMC hold; dovish Miran/Waller dissent", source:"https://www.cnbc.com/2026/01/28/fed-rate-decision-january-2026.html" },
  { date:"2026-02-02", close:185.61, move:-2.89, sigma:-1.86, gap:"high", primary_force:"A1", category:"A", confounded:false, confidence:"high", catalyst:"WSJ: NVDA $100B OpenAI investment stalled (overnight)", source:"https://www.cnbc.com/2026/02/02/nvidia-stock-price-openai-funding.html" },
  { date:"2026-02-03", close:180.34, move:-2.84, sigma:-1.60, gap:"low", primary_force:"D1", category:"D", confounded:true, confidence:"high", catalyst:"AMD Q1 forecast misses; semiconductor selloff", source:"https://www.cnbc.com/2026/02/03/stock-market-today-live-updates.html" },
  { date:"2026-02-04", close:174.19, move:-3.41, sigma:-1.75, gap:"low", primary_force:"A2", category:"A", confounded:false, confidence:"high", catalyst:"Anthropic Claude data analysis tool launch", source:"https://www.fool.com/investing/2026/02/04/why-did-nvidia-stock-plunge-today/" },
  { date:"2026-02-06", close:185.41, move:7.87, sigma:4.25, gap:"high", primary_force:"A1", category:"A", confounded:false, confidence:"high", catalyst:"$650B Big Tech 2026 capex figure crystallized (AMZN $200B + GOOGL $185B + META $135B + MSFT $105B)", source:"https://www.bloomberg.com/news/articles/2026-02-06/nvidia-nvda-shares-surge-on-big-tech-s-650-billion-ai-spending-plan" },
  { date:"2026-02-09", close:190.04, move:2.50, sigma:0.92, gap:"low", primary_force:"A1", category:"A", confounded:false, confidence:"medium", catalyst:"Follow-through on $650B capex narrative", source:"https://finance.yahoo.com/news/big-tech-unveils-650-billion-121205995.html" },
  { date:"2026-02-25", close:195.56, move:1.41, sigma:0.49, gap:"low", primary_force:"E1", category:"E", confounded:false, confidence:"medium", catalyst:"Pre-earnings run-up; high volume positioning", source:"https://www.cnbc.com/2026/02/25/nvidia-nvda-earnings-report-q4-2026.html", earnings_window:"pre" },
  { date:"2026-02-26", close:184.89, move:-5.46, sigma:-2.28, gap:"low", primary_force:"A1", category:"A", confounded:true, confidence:"high", catalyst:"NVDA Q4 FY26 earnings: blowout beat ($68.1B rev, $78B Q1 guide) but ZERO China DC revenue + AI bubble narrative", source:"https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-fourth-quarter-and-fiscal-2026", earnings_window:"event" },
  { date:"2026-02-27", close:177.19, move:-4.16, sigma:-1.45, gap:"moderate", primary_force:"A1", category:"A", confounded:true, confidence:"high", catalyst:"Earnings continuation; 50/100-day MA break", source:"https://ts2.tech/en/nvidia-stock-price-slides-again-as-nvda-selloff-deepens-after-earnings-beat/", earnings_window:"post" },
  { date:"2026-03-02", close:182.48, move:2.99, sigma:1.16, gap:"failed_gap", primary_force:"E2", category:"E", confounded:true, confidence:"medium", catalyst:"Weekend US/Israeli strikes on Iran; intraday reversal on AI demand", source:"https://www.nasdaq.com/articles/stock-market-news-mar-2-2026" },
  { date:"2026-03-06", close:177.82, move:-3.01, sigma:-1.19, gap:"moderate", primary_force:"E2", category:"E", confounded:true, confidence:"high", catalyst:"WTI crude +35% WoW; soft NFP; BlackRock private credit cap", source:"https://www.cnbc.com/2026/03/05/stock-market-today-live-updates.html" },
  { date:"2026-03-20", close:172.70, move:-3.28, sigma:-1.39, gap:"low", primary_force:"C1", category:"C", confounded:true, confidence:"high", catalyst:"SMCI co-founder Wally Liaw indicted for sanctioned NVDA exports; triple-witching", source:"https://www.thestreet.com/latest-news/stock-market-today-march-20-2026" },
  { date:"2026-03-25", close:178.68, move:1.99, sigma:1.06, gap:"moderate", primary_force:"E1", category:"E", confounded:false, confidence:"low", catalyst:"Bounce within March correction; GTC backlog narrative", source:"https://www.cnbc.com/2026/03/17/a-theory-on-whats-wrong-with-nvidia-stock-stuck-in-a-2026-funk.html" },
  { date:"2026-03-26", close:171.24, move:-4.16, sigma:-1.61, gap:"moderate", primary_force:"E1", category:"E", confounded:true, confidence:"medium", catalyst:"ARK $84M tech/semis dump; YTD low capitulation", source:"https://blockonomi.com/ark-invest-dumps-84m-in-meta-meta-nvidia-nvda-and-chip-stocks-in-major-thursday-selloff/" },
  { date:"2026-03-31", close:174.40, move:5.59, sigma:3.17, gap:"moderate", primary_force:"A1", category:"A", confounded:false, confidence:"high", catalyst:"NVDA $2B investment in Marvell + NVLink Fusion partnership", source:"https://www.bloomberg.com/news/articles/2026-03-31/nvidia-invests-2-billion-in-marvell-announces-partnership", f1_tier:4 },
  { date:"2026-04-08", close:182.08, move:2.23, sigma:1.10, gap:"high", primary_force:"E2", category:"E", confounded:true, confidence:"high", catalyst:"Trump Iran ceasefire announcement + AI chip licensing proposal withdrawn (overnight gap +3.59%)", source:"https://www.cnbc.com/2026/04/08/alphabet-nvidia-microsoft-tech-stocks-iran-ceasefire.html" },
  { date:"2026-04-10", close:188.63, move:2.57, sigma:1.20, gap:"low", primary_force:"B1", category:"B", confounded:false, confidence:"high", catalyst:"TSMC March monthly revenue: NT$415B, +45.2% YoY, record", source:"https://pr.tsmc.com/english/news/3294", f1_tier:4 },
  { date:"2026-04-14", close:196.51, move:3.80, sigma:1.62, gap:"low", primary_force:"A1", category:"A", confounded:true, confidence:"high", catalyst:"NVDA Ising quantum AI launch + Vera Rubin demand + 10-day streak (vacation breakout)", source:"https://nvidianews.nvidia.com/news/nvidia-launches-ising-the-worlds-first-open-ai-models-to-accelerate-the-path-to-useful-quantum-computers" },
  { date:"2026-04-17", close:201.68, move:1.68, sigma:0.52, gap:"low", primary_force:"B1", category:"B", confounded:false, confidence:"medium", catalyst:"TSMC Q1 +58% profit surge read-through", source:"https://www.cnbc.com/2026/04/16/tsmc-q1-profit-58-percent-ai-chip-demand-record.html", f1_tier:4 },
  { date:"2026-04-21", close:199.88, move:-1.08, sigma:-0.91, gap:"low", primary_force:"E1", category:"E", confounded:true, confidence:"medium", catalyst:"Profit-taking; Google TPU v7 Ironwood announcement", source:"https://www.cnbc.com/2026/04/20/stock-market-today-live-updates.html" },
  { date:"2026-04-23", close:199.64, move:-1.41, sigma:-1.03, gap:"low", primary_force:"E1", category:"E", confounded:true, confidence:"medium", catalyst:"TSLA capex hike $25B + IBM/NOW misses drag tech", source:"https://finance.yahoo.com/markets/stocks/articles/stock-market-today-april-23-223648525.html" },
  { date:"2026-04-24", close:208.27, move:4.32, sigma:1.75, gap:"low", primary_force:"A1", category:"A", confounded:false, confidence:"high", catalyst:"Intel Q1 FY26: DCAI +22% YoY $5.1B, hyperscaler Xeon 6 ramp 2027 capacity", source:"https://www.cnbc.com/2026/04/24/nvidia-stock-closes-at-record-pushing-market-cap-past-5-trillion.html", f1_tier:4 },
];

const DEFAULT_PRICE_SERIES = [
  {date:"2026-01-02",close:188.85},{date:"2026-01-08",close:185.04},{date:"2026-01-14",close:183.14},{date:"2026-01-15",close:187.05},
  {date:"2026-01-20",close:178.07},{date:"2026-01-21",close:183.32},{date:"2026-01-29",close:192.51},{date:"2026-02-02",close:185.61},
  {date:"2026-02-03",close:180.34},{date:"2026-02-04",close:174.19},{date:"2026-02-05",close:171.88},{date:"2026-02-06",close:185.41},
  {date:"2026-02-09",close:190.04},{date:"2026-02-13",close:182.81},{date:"2026-02-25",close:195.56},{date:"2026-02-26",close:184.89},
  {date:"2026-02-27",close:177.19},{date:"2026-03-02",close:182.48},{date:"2026-03-06",close:177.82},{date:"2026-03-13",close:180.25},
  {date:"2026-03-20",close:172.70},{date:"2026-03-25",close:178.68},{date:"2026-03-26",close:171.24},{date:"2026-03-30",close:165.17},
  {date:"2026-03-31",close:174.40},{date:"2026-04-08",close:182.08},{date:"2026-04-10",close:188.63},{date:"2026-04-14",close:196.51},
  {date:"2026-04-17",close:201.68},{date:"2026-04-21",close:199.88},{date:"2026-04-23",close:199.64},{date:"2026-04-24",close:208.27},
];

const DEFAULT_PATTERNS = [
  { title:"Confounded days show strong synergy", severity:"info", body:"Every confounded day YTD (13 of 35 significant days) produces moves 2–4× larger than additive baselines predict. When forces align, they amplify non-linearly.", implication:"Weeks with 2+ aligned catalysts in the same direction warrant defensive strike selection — moves will be bigger than per-force baselines suggest." },
  { title:"Tariff arc — fast absorption (~7 days)", severity:"absorbed", body:"Trump Section 232 (Jan 14) → enforcement gap (Jan 20, -4.38%) → digestion (Jan 21–22) → priced in by Jan 26. C2 now ATTENUATING.", implication:"Tariff-style forces with quantifiable resolution absorb fast — within ~7 days." },
  { title:"Iran arc — slow absorption (~6 weeks)", severity:"absorbed", body:"Mar 2 weekend strikes → Mar 6 oil shock → Mar 20–26 chronic overhang → Apr 7/8 ceasefire resolution. E2 still ACTIVE but flipped bullish post-ceasefire.", implication:"Geopolitical forces without clean resolution take 4–6 weeks to absorb. Build buffer into strike selection." },
  { title:"F1 multiplier is building", severity:"bullish", body:"Three Tier 4 validations in last 25 days: Marvell (Mar 31), TSMC (Apr 10/17), Intel (Apr 24). Multiplier now 1.15×.", implication:"Today's +4.32% on Intel (a competitor) is explained by F1 dominating the competitive read on a single-day basis. Expect amplified A1 reactions while F1 trend persists." },
  { title:"A1 is the structural bullish anchor", severity:"bullish", body:"A1 contributes +12.73 of +18.32 net bullish YTD across 18 events. Every hyperscaler print and F1 validation reinforces it.", implication:"Dominance compresses only if hyperscaler capex guidance breaks. No sign of that — current A1 trajectory is stable." },
];

const DEFAULT_EARNINGS_CALENDAR = {
  ticker: "NVDA",
  next: { quarter:"Q1 FY27", date:"2026-05-27", timing:"after-hours", confirmed:true, confirmedAt:"2026-04-25", priorEstimate:"2026-05-20", shifted:true },
  upcoming: [
    { quarter:"Q2 FY27", date:"2026-08-26", confirmed:false },
    { quarter:"Q3 FY27", date:"2026-11-18", confirmed:false },
    { quarter:"Q4 FY27", date:"2027-02-25", confirmed:false },
  ],
  history: [
    { quarter:"Q4 FY26", date:"2026-02-26", priceImpact3d:-8.21, note:"Beat overwhelmed by China DC revenue gap + MA-break technical failure" },
  ],
};

const DEFAULT_MACRO_PAYLOAD = {
  schemaVersion: MACRO_SCHEMA,
  updatedAt: "2026-04-24T16:00:00-04:00",
  asOfDate: "2026-04-24",
  composite: DEFAULT_COMPOSITE,
  forces: DEFAULT_FORCES,
  events: DEFAULT_EVENTS,
  priceSeries: DEFAULT_PRICE_SERIES,
  patterns: DEFAULT_PATTERNS,
  earningsCalendar: DEFAULT_EARNINGS_CALENDAR,
};

/* ══════════════════════════════════════════════════════════
   INITIAL STATE
══════════════════════════════════════════════════════════ */
const EMPTY_ACCOUNT = { shares: [], options: [], pool: { spaxx:0, premiums:0, dividends:0, other:0 }, goals: [] };

const INITIAL_STATE = {
  tab: "portfolio",
  portfolioTab: "roth",
  roth: JSON.parse(JSON.stringify(EMPTY_ACCOUNT)),
  hsa:  JSON.parse(JSON.stringify(EMPTY_ACCOUNT)),
  scanResults: { rollScans: [], gammaWalls: null },
  macroPayload: DEFAULT_MACRO_PAYLOAD,
  macroMode: "BASELINE",
};

/* ══════════════════════════════════════════════════════════
   ANTHROPIC API UTILITY — simple fetch + 429 retry + timeout

   Matches the pattern that worked in the original separate JSX files.
   Streaming was tried and introduced more bugs than it fixed.
   A 120s AbortController timeout catches genuine hung connections.
   429 retry with countdown handles rate limiting.
══════════════════════════════════════════════════════════ */
const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes — generous for web_search calls
const MAX_RETRIES = 3;

async function callClaude(payload, onStatus) {
  const url = "https://api.anthropic.com/v1/messages";
  const headers = { "Content-Type": "application/json" };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let resp;
    try {
      resp = await fetch(url, {
        method: "POST", headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        if (attempt === MAX_RETRIES - 1) throw new Error("Request timed out after 2 minutes — try again");
        if (onStatus) onStatus(`Attempt ${attempt + 1} timed out — retrying...`);
        continue;
      }
      throw err;
    }
    clearTimeout(timer);

    if (resp.status === 429) {
      let wait = 60;
      try {
        const errData = await resp.json();
        const h = resp.headers.get("retry-after") || resp.headers.get("x-ratelimit-reset-requests");
        if (h) wait = Math.max(parseInt(h, 10), 5);
        else if (errData?.error?.message?.match(/(\d+)\s*second/))
          wait = parseInt(errData.error.message.match(/(\d+)\s*second/)[1], 10);
      } catch {}
      if (attempt === MAX_RETRIES - 1) throw new Error("Rate limit exceeded after retries — wait a minute and try again");
      for (let s = wait; s > 0; s--) {
        if (onStatus) onStatus(`Rate limited — retrying in ${s}s...`);
        await new Promise(r => setTimeout(r, 1000));
      }
      if (onStatus) onStatus("Retrying...");
      continue;
    }

    const data = await resp.json();
    return data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "";
  }
}

/* ══════════════════════════════════════════════════════════
   SHARED UI COMPONENTS
══════════════════════════════════════════════════════════ */
function Badge({ children, color = C.accent, glow }) {
  return <span style={{ display:"inline-block", padding:"2px 7px", borderRadius:3, fontSize:10, fontFamily:font.mono, fontWeight:700, letterSpacing:"0.06em", color, background:color+"15", border:`1px solid ${color}30`, boxShadow:glow?`0 0 8px ${color}40`:"none" }}>{children}</span>;
}

function Btn({ children, onClick, color = C.accent, disabled, small, active, variant, style: sx, title }) {
  const c = variant === "danger" ? C.red : variant === "amber" ? C.amber : variant === "ghost" ? C.gray : color;
  return <button onClick={onClick} disabled={disabled} title={title} style={{ padding:small?"4px 10px":"8px 16px", borderRadius:6, fontSize:small?11:13, fontFamily:font.mono, fontWeight:700, cursor:disabled?"not-allowed":"pointer", border:`1px solid ${active?c:c+"40"}`, background:active?c+"25":c+"12", color:c, opacity:disabled?0.4:1, transition:"all .15s", letterSpacing:"0.04em", display:"inline-flex", alignItems:"center", gap:6, ...sx }}>{children}</button>;
}

function Input({ value, onChange, placeholder, type = "text", style: sx, mono }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:6, padding:"8px 10px", color:C.text, fontSize:13, fontFamily:mono?font.mono:font.sans, outline:"none", width:"100%", boxSizing:"border-box", ...sx }}
    onFocus={e => e.target.style.borderColor = C.accent+"80"}
    onBlur={e => e.target.style.borderColor = C.border} />;
}

function InlineEdit({ value, onChange, width = 70, align = "right" }) {
  return <input type="number" value={value} onChange={e => onChange(e.target.value)} step="any"
    style={{ background:C.bg+"80", border:"1px solid transparent", borderRadius:4, color:C.text, textAlign:align, width, fontFamily:font.mono, fontSize:13, outline:"none", padding:"2px 6px" }}
    onFocus={e => { e.target.style.borderColor=C.accent+"60"; e.target.style.background=C.bg; }}
    onBlur={e => { e.target.style.borderColor="transparent"; e.target.style.background=C.bg+"80"; }} />;
}

function LabeledField({ label, children, hint }) {
  return <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
    <label style={{ fontSize:11, fontFamily:font.mono, fontWeight:600, color:C.textDim, letterSpacing:"0.06em", textTransform:"uppercase" }}>{label}</label>
    {children}
    {hint && <span style={{ fontSize:10, color:C.textMuted, fontFamily:font.mono }}>{hint}</span>}
  </div>;
}

function SectionHead({ children, right }) {
  return <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
    <h3 style={{ margin:0, fontSize:11, fontFamily:font.mono, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:C.textMuted }}>{children}</h3>
    {right}
  </div>;
}

function Card({ children, style: sx, glow, accent }) {
  return <div style={{ background:C.card, border:`1px solid ${accent?accent+"30":C.border}`, borderRadius:10, padding:18, boxShadow:glow?`0 0 24px ${accent||C.blue}08`:"none", ...sx }}>{children}</div>;
}

function StatCard({ label, value, sub, color, big }) {
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:big?"16px 20px":"12px 14px", flex:1, minWidth:120 }}>
    <div style={{ fontSize:9, fontFamily:font.mono, letterSpacing:"0.12em", textTransform:"uppercase", color:C.textMuted, marginBottom:6 }}>{label}</div>
    <div style={{ fontSize:big?32:22, fontFamily:font.mono, fontWeight:700, color:color||C.text, lineHeight:1, letterSpacing:"-0.02em" }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:C.textDim, marginTop:4, fontFamily:font.mono }}>{sub}</div>}
  </div>;
}

function ProgressBar({ current, target, color = C.accent }) {
  const pct = target > 0 ? Math.min(100, (current/target)*100) : 0;
  return <div style={{ position:"relative", height:6, background:C.bg, borderRadius:3, overflow:"hidden" }}>
    <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${pct}%`, background:color, borderRadius:3, transition:"width .4s ease" }} />
  </div>;
}

function Divider() { return <div style={{ height:1, background:C.border, margin:"14px 0" }} />; }

/* ─── MARKDOWN RENDERER ─── */
function mdInline(text, k = 0) {
  const parts = []; let rem = text; let key = k;
  while (rem.length > 0) {
    const bold = rem.match(/^([\s\S]*?)\*\*(.+?)\*\*([\s\S]*)/);
    if (bold) { if (bold[1]) parts.push(bold[1]); parts.push(<strong key={key++} style={{ color:C.text, fontWeight:700 }}>{bold[2]}</strong>); rem = bold[3]; continue; }
    const code = rem.match(/^([\s\S]*?)`([^`]+?)`([\s\S]*)/);
    if (code) { if (code[1]) parts.push(code[1]); parts.push(<code key={key++} style={{ fontFamily:font.mono, fontSize:11, color:C.accent, background:C.bg, padding:"1px 4px", borderRadius:3 }}>{code[2]}</code>); rem = code[3]; continue; }
    parts.push(rem); break;
  }
  return parts.length ? parts : [text];
}

function MarkdownText({ text }) {
  if (!text) return null;
  return <div>{text.split('\n').map((line, i) => {
    if (line.startsWith('### ')) return <div key={i} style={{ fontSize:12, fontFamily:font.mono, fontWeight:700, color:C.accent, marginTop:14, marginBottom:3 }}>{mdInline(line.slice(4))}</div>;
    if (line.startsWith('## '))  return <div key={i} style={{ fontSize:13, fontFamily:font.mono, fontWeight:700, color:C.text, marginTop:16, marginBottom:5, borderBottom:`1px solid ${C.border}`, paddingBottom:3 }}>{mdInline(line.slice(3))}</div>;
    if (line.startsWith('# '))   return <div key={i} style={{ fontSize:15, fontFamily:font.mono, fontWeight:700, color:C.text, marginTop:18, marginBottom:8 }}>{mdInline(line.slice(2))}</div>;
    if (line.trim() === '---')    return <div key={i} style={{ height:1, background:C.border, margin:"10px 0" }} />;
    if (line.startsWith('- ') || line.startsWith('• ')) return <div key={i} style={{ display:"flex", gap:8, margin:"2px 0", paddingLeft:8 }}><span style={{ color:C.accent, flexShrink:0 }}>·</span><span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{mdInline(line.slice(2))}</span></div>;
    if (/^\d+\. /.test(line)) { const m = line.match(/^(\d+)\. (.*)/); return m ? <div key={i} style={{ display:"flex", gap:8, margin:"2px 0", paddingLeft:8 }}><span style={{ color:C.accent, flexShrink:0, fontFamily:font.mono, minWidth:18, textAlign:"right" }}>{m[1]}.</span><span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{mdInline(m[2])}</span></div> : null; }
    if (line.startsWith('|')) { const cells = line.split('|').filter((_,j,a) => j>0 && j<a.length-1); if (cells.every(c => /^[-: ]+$/.test(c))) return null; return <div key={i} style={{ display:"flex", fontFamily:font.mono, fontSize:11, borderBottom:`1px solid ${C.border}20` }}>{cells.map((c,j) => <div key={j} style={{ flex:1, padding:"3px 6px", color:C.textDim }}>{mdInline(c.trim())}</div>)}</div>; }
    if (line.trim() === '') return <div key={i} style={{ height:6 }} />;
    return <div key={i} style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{mdInline(line)}</div>;
  })}</div>;
}

/* ══════════════════════════════════════════════════════════
   MACRO-SPECIFIC COMPONENTS
══════════════════════════════════════════════════════════ */
function DirectionalBar({ value, max = 15 }) {
  const pct = Math.min(50, (Math.abs(value)/max)*50);
  const color = value > 0 ? C.accent : value < 0 ? C.red : C.gray;
  return <div style={{ position:"relative", height:6, background:C.bg, borderRadius:3, overflow:"hidden" }}>
    <div style={{ position:"absolute", left:"50%", top:0, height:"100%", width:1, background:C.borderHi }} />
    {value !== 0 && <div style={{ position:"absolute", left:value>0?"50%":`${50-pct}%`, top:0, height:"100%", width:`${pct}%`, background:color, transition:"all .4s ease" }} />}
  </div>;
}

function CompositeGauge({ score, multiplier }) {
  const clamp = Math.max(-10, Math.min(10, score));
  const angle = ((clamp + 10) / 20) * 180;
  const color = score > 1 ? C.accent : score < -1 ? C.red : C.amber;
  const w = 280, h = 160, cx = w/2, cy = h-10, r = 110;
  const arcPath = (start, end) => {
    const s=(start*Math.PI)/180, e=(end*Math.PI)/180;
    return `M ${cx-r*Math.cos(s)} ${cy-r*Math.sin(s)} A ${r} ${r} 0 0 1 ${cx-r*Math.cos(e)} ${cy-r*Math.sin(e)}`;
  };
  const na = angle*(Math.PI/180);
  return <div style={{ position:"relative", width:w, height:h }}>
    <svg width={w} height={h} style={{ overflow:"visible" }}>
      <path d={arcPath(0,180)} fill="none" stroke={C.border} strokeWidth="14" strokeLinecap="round" />
      <path d={arcPath(0,60)} fill="none" stroke={C.redDim} strokeWidth="14" strokeLinecap="round" opacity="0.6" />
      <path d={arcPath(60,120)} fill="none" stroke={C.amberDim} strokeWidth="14" strokeLinecap="round" opacity="0.4" />
      <path d={arcPath(120,180)} fill="none" stroke={C.accentDim} strokeWidth="14" strokeLinecap="round" opacity="0.6" />
      <path d={arcPath(0,angle)} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" style={{ filter:`drop-shadow(0 0 6px ${color}60)` }} />
      <line x1={cx} y1={cy} x2={cx-(r-8)*Math.cos(na)} y2={cy-(r-8)*Math.sin(na)} stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill={color} /><circle cx={cx} cy={cy} r="3" fill={C.bg} />
      <text x={20} y={h} fontSize="9" fill={C.textMuted} fontFamily={font.mono}>-10 BEAR</text>
      <text x={cx-12} y={20} fontSize="9" fill={C.textMuted} fontFamily={font.mono}>0</text>
      <text x={w-60} y={h} fontSize="9" fill={C.textMuted} fontFamily={font.mono}>+10 BULL</text>
    </svg>
    <div style={{ position:"absolute", top:60, left:0, right:0, textAlign:"center" }}>
      <div style={{ fontSize:36, fontFamily:font.mono, fontWeight:700, color, lineHeight:1, letterSpacing:"-0.03em" }}>{score>=0?"+":""}{score.toFixed(2)}</div>
      <div style={{ fontSize:10, fontFamily:font.mono, color:C.textMuted, marginTop:4, letterSpacing:"0.1em" }}>F1 × {multiplier.toFixed(2)}</div>
    </div>
  </div>;
}

function ForceCard({ force, onClick, selected }) {
  const cat = CAT_COLOR[force.category];
  const stateColor = STATE_COLOR[force.state];
  const dirColor = force.direction_bias === "bullish" ? C.accent : force.direction_bias === "bearish" ? C.red : force.direction_bias === "building" ? C.pink : C.gray;
  const dirArrow = force.direction_bias === "bullish" ? "▲" : force.direction_bias === "bearish" ? "▼" : "●";
  return <button onClick={onClick} style={{ background:selected?C.cardHi:C.card, border:`1px solid ${selected?cat:C.border}`, borderLeft:`3px solid ${cat}`, borderRadius:6, padding:"12px 14px", cursor:"pointer", textAlign:"left", width:"100%", transition:"all .15s", opacity:force.state==="DORMANT"?0.55:1, boxShadow:selected?`0 0 16px ${cat}30`:"none" }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
          <span style={{ fontFamily:font.mono, fontSize:14, fontWeight:700, color:cat, letterSpacing:"0.04em" }}>{force.id}</span>
          <span style={{ fontFamily:font.mono, fontSize:9, color:C.textMuted, letterSpacing:"0.1em" }}>{CAT_NAME[force.category].toUpperCase()}</span>
        </div>
        <div style={{ fontSize:12, fontFamily:font.sans, color:C.text, lineHeight:1.3 }}>{force.name}</div>
      </div>
      <Badge color={stateColor}>{force.state}</Badge>
    </div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:6 }}>
      <span style={{ fontSize:11, fontFamily:font.mono, color:dirColor, fontWeight:700 }}>{dirArrow} {force.direction_bias.toUpperCase()}</span>
      <span style={{ fontSize:11, fontFamily:font.mono, color:C.textDim }}>n={force.events_total}</span>
      <span style={{ fontSize:11, fontFamily:font.mono, color:force.net_ytd_reaction>0?C.accent:force.net_ytd_reaction<0?C.red:C.gray, fontWeight:700 }}>{force.net_ytd_reaction>=0?"+":""}{force.net_ytd_reaction.toFixed(2)}</span>
    </div>
    <DirectionalBar value={force.net_ytd_reaction} />
    <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:9, fontFamily:font.mono, color:C.textMuted, letterSpacing:"0.06em", textTransform:"uppercase" }}>
      <span>weight {force.weight.toFixed(2)}</span><span>{force.attenuation_trend}</span>
    </div>
  </button>;
}

function EventDot({ cx, cy, payload }) {
  if (!payload.eventCategory) return null;
  const color = CAT_COLOR[payload.eventCategory];
  const size = Math.min(10, 4 + Math.abs(payload.eventSigma||1)*1.2);
  return <g><circle cx={cx} cy={cy} r={size+2} fill={color} opacity="0.2" /><circle cx={cx} cy={cy} r={size} fill={color} stroke={C.bg} strokeWidth="1.5" /></g>;
}

function EventRow({ ev }) {
  const cat = CAT_COLOR[ev.category];
  const moveColor = ev.move > 0 ? C.accent : ev.move < 0 ? C.red : C.gray;
  const sigColor = Math.abs(ev.sigma)>=3.5?C.pink:Math.abs(ev.sigma)>=2.5?C.amber:Math.abs(ev.sigma)>=1.5?C.blue:C.textDim;
  return <div style={{ padding:"10px 12px", background:C.bg, borderRadius:6, border:`1px solid ${C.border}`, borderLeft:`3px solid ${cat}` }}>
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, flexWrap:"wrap" }}>
      <span style={{ fontFamily:font.mono, fontSize:11, color:C.textMuted }}>{ev.date}</span>
      <span style={{ fontFamily:font.mono, fontSize:14, fontWeight:700, color:moveColor }}>{ev.move>=0?"+":""}{ev.move.toFixed(2)}%</span>
      <Badge color={sigColor}>{Math.abs(ev.sigma).toFixed(2)}σ</Badge>
      <Badge color={cat}>{ev.primary_force}</Badge>
      {ev.confounded && <Badge color={C.purple}>CONFOUNDED</Badge>}
      {ev.f1_tier && <Badge color={C.pink} glow>F1 T{ev.f1_tier}</Badge>}
      {ev.gap === "high" && <Badge color={C.amber}>GAP</Badge>}
      {ev.earnings_window && <Badge color={C.cyan}>EARN {ev.earnings_window.toUpperCase()}</Badge>}
      <span style={{ marginLeft:"auto", fontFamily:font.mono, fontSize:10, color:C.textMuted }}>{ev.confidence}</span>
    </div>
    <div style={{ fontSize:12, fontFamily:font.sans, color:C.text, lineHeight:1.45 }}>{ev.catalyst}</div>
  </div>;
}

function EarningsCard({ position, history }) {
  if (!position) return null;
  const dayLabel = fmtEarningsLabel(position.daysDelta);
  const windowColor = position.window==="earnings event"?C.red:position.window==="pre-earnings drift"?C.amber:position.window==="post-earnings drift"?C.cyan:C.gray;
  const windowDesc = {"earnings event":"Print day ± 1 — binary catalyst","pre-earnings drift":"T-21 to T-1 — bullish positioning + IV ramp","post-earnings drift":"T+1 to T+10 — direction set, IV crush dominant","outside":"Macro-force-driven — standard playbook execution"}[position.window]||"";
  const lastPrint = history?.length ? history[history.length-1] : null;
  return <Card style={{ padding:"14px 18px" }} accent={position.shifted?C.amber:null}>
    <SectionHead right={position.shifted?<Badge color={C.amber} glow>MODE 4 TRIGGER</Badge>:null}>Earnings Calendar</SectionHead>
    <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:8, flexWrap:"wrap" }}>
      <span style={{ fontSize:28, fontFamily:font.mono, fontWeight:700, color:windowColor }}>{dayLabel}</span>
      <Badge color={windowColor} glow={position.window!=="outside"}>{position.window.toUpperCase()}</Badge>
    </div>
    <div style={{ fontSize:12, fontFamily:font.sans, color:C.text, marginBottom:4 }}>
      Next: <span style={{ fontFamily:font.mono, fontWeight:600 }}>{position.quarter}</span> · {position.date} · {position.timing}
      {position.confirmed?<span style={{ marginLeft:8, color:C.accent, fontFamily:font.mono, fontSize:10 }}>● CONFIRMED</span>:<span style={{ marginLeft:8, color:C.textMuted, fontFamily:font.mono, fontSize:10 }}>○ ESTIMATED</span>}
    </div>
    <div style={{ fontSize:11, fontFamily:font.mono, color:C.textDim, marginBottom:6 }}>{windowDesc}</div>
    {position.shifted && <div style={{ fontSize:11, fontFamily:font.sans, color:C.amber, marginTop:8, padding:"8px 10px", background:C.amberDim+"30", borderLeft:`2px solid ${C.amber}`, borderRadius:4 }}>Date shifted from <span style={{ fontFamily:font.mono }}>{position.priorEstimate}</span> (confirmed {position.confirmedAt}). Open NVDA CCs whose original DTE assumed the prior date as exit catalyst are <strong>Mode 4 Calendar Correction</strong> candidates.</div>}
    {lastPrint && <div style={{ fontSize:10, fontFamily:font.mono, color:C.textMuted, marginTop:8, paddingTop:8, borderTop:`1px solid ${C.border}` }}>Last print {lastPrint.quarter} ({lastPrint.date}) · 3-day impact: <span style={{ color:lastPrint.priceImpact3d<0?C.red:C.accent }}>{lastPrint.priceImpact3d>=0?"+":""}{lastPrint.priceImpact3d.toFixed(2)}%</span></div>}
  </Card>;
}

/* ─── MACRO VALIDATION ─── */
function validatePayload(text) {
  let parsed;
  try { const fm = text.match(/```(?:json)?\s*([\s\S]*?)```/); parsed = JSON.parse(fm ? fm[1].trim() : text.trim()); }
  catch (e) { return { valid:false, error:"Not valid JSON. "+e.message }; }
  if (!parsed || typeof parsed !== "object") return { valid:false, error:"Payload must be a JSON object." };
  if (parsed.schemaVersion !== MACRO_SCHEMA) return { valid:false, error:`Expected schemaVersion "${MACRO_SCHEMA}", got "${parsed.schemaVersion||"(missing)"}".` };
  for (const k of ["composite","forces","events","priceSeries","patterns"]) { if (!(k in parsed)) return { valid:false, error:`Missing required field: ${k}` }; }
  if (!Array.isArray(parsed.forces)||parsed.forces.length===0) return { valid:false, error:"forces must be a non-empty array" };
  if (!Array.isArray(parsed.events)) return { valid:false, error:"events must be an array" };
  if (!Array.isArray(parsed.priceSeries)||parsed.priceSeries.length===0) return { valid:false, error:"priceSeries must be a non-empty array" };
  if (typeof parsed.composite.composite_score !== "number") return { valid:false, error:"composite.composite_score must be a number" };
  if (!parsed.earningsCalendar) parsed.earningsCalendar = DEFAULT_EARNINGS_CALENDAR;
  return { valid:true, payload:parsed };
}

function buildDiff(cur, neu) {
  const curEvents = new Set(cur.events.map(e => e.date));
  const neuEvents = new Set(neu.events.map(e => e.date));
  const stateTransitions = [];
  const curById = Object.fromEntries(cur.forces.map(f => [f.id,f]));
  for (const f of neu.forces) { const old = curById[f.id]; if (old && old.state !== f.state) stateTransitions.push({ id:f.id, name:f.name, from:old.state, to:f.state }); }
  return {
    composite_delta: +(neu.composite.composite_score - cur.composite.composite_score).toFixed(3),
    composite_from: cur.composite.composite_score, composite_to: neu.composite.composite_score,
    new_events: [...neuEvents].filter(d => !curEvents.has(d)),
    removed_events: [...curEvents].filter(d => !neuEvents.has(d)),
    state_transitions: stateTransitions,
    asOfFrom: cur.asOfDate, asOfTo: neu.asOfDate,
    priceSeriesDelta: neu.priceSeries.length - cur.priceSeries.length,
  };
}

function UpdateModal({ open, onClose, currentPayload, onApply }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [validated, setValidated] = useState(null);
  const [pasted, setPasted] = useState(false);

  useEffect(() => { if (open) { setText(""); setError(""); setValidated(null); setPasted(false); } }, [open]);

  const tryPaste = async () => {
    try { const t = await navigator.clipboard.readText(); if (t?.trim()) { setText(t); setPasted(true); doValidate(t); } }
    catch { setError("Clipboard read failed. Paste manually."); }
  };

  const doValidate = (raw) => {
    setError(""); setValidated(null);
    const r = validatePayload(raw);
    if (!r.valid) { setError(r.error); return; }
    setValidated({ payload: r.payload, diff: buildDiff(currentPayload, r.payload) });
  };

  if (!open) return null;
  return <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, width:"min(900px,100%)", maxHeight:"90vh", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:`0 0 40px ${C.blue}30` }}>
      <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:14, fontFamily:font.mono, fontWeight:700, color:C.blueGlow, letterSpacing:"0.06em" }}>📥 UPDATE FROM CLIPBOARD</div>
          <div style={{ fontSize:11, color:C.textMuted, fontFamily:font.mono, marginTop:2 }}>Paste the JSON output from your refresh agent</div>
        </div>
        <Btn small color={C.gray} onClick={onClose}>✕ Close</Btn>
      </div>
      <div style={{ padding:20, overflowY:"auto", flex:1, display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ display:"flex", gap:8 }}>
          <Btn color={C.cyan} onClick={tryPaste}>📋 Paste from clipboard</Btn>
          <Btn color={C.blue} onClick={() => doValidate(text)} disabled={!text.trim()}>Validate</Btn>
          {pasted && <span style={{ alignSelf:"center", fontSize:11, fontFamily:font.mono, color:C.accent }}>✓ Pasted</span>}
        </div>
        <textarea value={text} onChange={e => { setText(e.target.value); setError(""); setValidated(null); }} placeholder='Paste the agent output here. Accepts raw JSON or a ```json fenced block.'
          style={{ width:"100%", minHeight:200, maxHeight:350, background:C.bg, border:`1px solid ${error?C.red:validated?C.accent:C.border}`, borderRadius:6, padding:12, color:C.text, fontFamily:font.mono, fontSize:12, resize:"vertical", outline:"none", boxSizing:"border-box", lineHeight:1.5 }} />
        {error && <div style={{ padding:10, background:C.redDim+"30", border:`1px solid ${C.red}40`, borderRadius:6, color:C.red, fontSize:12, fontFamily:font.mono }}>⚠ {error}</div>}
        {validated && <div style={{ background:C.bg, border:`1px solid ${C.accent}40`, borderRadius:6, padding:14 }}>
          <div style={{ fontSize:11, fontFamily:font.mono, color:C.accent, fontWeight:700, letterSpacing:"0.1em", marginBottom:10 }}>✓ VALID — DIFF PREVIEW</div>
          <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:"8px 16px", fontSize:12, fontFamily:font.mono }}>
            <span style={{ color:C.textMuted }}>As of:</span><span style={{ color:C.text }}>{validated.diff.asOfFrom} → <strong style={{ color:C.blueGlow }}>{validated.diff.asOfTo}</strong></span>
            <span style={{ color:C.textMuted }}>Composite:</span><span style={{ color:C.text }}>{validated.diff.composite_from>=0?"+":""}{validated.diff.composite_from.toFixed(2)} → <strong style={{ color:C.blueGlow }}>{validated.diff.composite_to>=0?"+":""}{validated.diff.composite_to.toFixed(2)}</strong> <span style={{ color:validated.diff.composite_delta>0?C.accent:validated.diff.composite_delta<0?C.red:C.gray }}>({validated.diff.composite_delta>=0?"+":""}{validated.diff.composite_delta.toFixed(2)})</span></span>
            <span style={{ color:C.textMuted }}>New events:</span><span style={{ color:validated.diff.new_events.length>0?C.accent:C.textDim }}>{validated.diff.new_events.length===0?"none":validated.diff.new_events.join(", ")}</span>
            <span style={{ color:C.textMuted }}>Price points:</span><span style={{ color:C.text }}>{validated.payload.priceSeries.length} {validated.diff.priceSeriesDelta!==0&&<span style={{ color:validated.diff.priceSeriesDelta>0?C.accent:C.amber }}>({validated.diff.priceSeriesDelta>0?"+":""}{validated.diff.priceSeriesDelta})</span>}</span>
          </div>
          {validated.diff.state_transitions.length>0 && <div style={{ marginTop:8, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
            <div style={{ fontSize:10, fontFamily:font.mono, color:C.textMuted, marginBottom:6, letterSpacing:"0.1em" }}>STATE CHANGES</div>
            {validated.diff.state_transitions.map((t,i) => <div key={i} style={{ display:"flex", gap:8, alignItems:"center", fontSize:11, fontFamily:font.mono, padding:"3px 0" }}>
              <span style={{ color:CAT_COLOR[t.id[0]]||C.text, fontWeight:700 }}>{t.id}</span>
              <span style={{ color:C.textDim }}>{t.name}</span>
              <span style={{ color:STATE_COLOR[t.from]||C.text, marginLeft:"auto" }}>{t.from}</span>
              <span style={{ color:C.textMuted }}>→</span>
              <span style={{ color:STATE_COLOR[t.to]||C.text, fontWeight:700 }}>{t.to}</span>
            </div>)}
          </div>}
        </div>}
      </div>
      <div style={{ padding:"14px 20px", borderTop:`1px solid ${C.border}`, display:"flex", justifyContent:"flex-end", gap:8 }}>
        <Btn color={C.gray} onClick={onClose}>Cancel</Btn>
        <Btn color={C.accent} onClick={() => onApply(validated.payload)} disabled={!validated}>✓ Apply Update</Btn>
      </div>
    </div>
  </div>;
}

function ExportToast({ open, onClose, success, error }) {
  useEffect(() => { if (open && success) { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); } }, [open, success, onClose]);
  if (!open) return null;
  return <div style={{ position:"fixed", bottom:24, right:24, zIndex:1000, background:success?C.accentDim+"e0":C.redDim+"e0", border:`1px solid ${success?C.accent:C.red}`, borderRadius:8, padding:"14px 18px", maxWidth:420, boxShadow:"0 8px 24px rgba(0,0,0,0.5)" }}>
    <div style={{ fontSize:12, fontFamily:font.mono, fontWeight:700, color:success?C.accent:C.red, letterSpacing:"0.06em", marginBottom:4 }}>{success?"✓ COPIED TO CLIPBOARD":"⚠ COPY FAILED"}</div>
    <div style={{ fontSize:11, fontFamily:font.sans, color:C.text, lineHeight:1.5 }}>{success?"Current dashboard state is on your clipboard. Paste it into your refresh agent chat to continue from this state.":(error||"Browser blocked clipboard write.")}</div>
  </div>;
}

/* ══════════════════════════════════════════════════════════
   STATUS BAR
══════════════════════════════════════════════════════════ */
function StatusBar({ state, setTab }) {
  const ep = deriveEarningsPosition(state.macroPayload.earningsCalendar);
  const score = state.macroPayload.composite.composite_score;
  const compColor = score > 1 ? C.accent : score < -1 ? C.red : C.amber;
  const allShort = [
    ...state.roth.options.filter(o => o.direction === "SHORT"),
    ...state.hsa.options.filter(o => o.direction === "SHORT"),
  ];
  const critDTE = allShort.filter(o => o.dte <= 7);
  const rollDTE = allShort.filter(o => o.dte > 7 && o.dte <= 21);

  return <div style={{ position:"sticky", top:0, zIndex:100, background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"10px 20px", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
    <div style={{ lineHeight:1.1 }}>
      <div style={{ fontSize:13, fontWeight:700, fontFamily:font.mono, letterSpacing:"0.08em", color:C.blueGlow }}>FLYWHEEL</div>
      <div style={{ fontSize:8, fontFamily:font.mono, color:C.textMuted, letterSpacing:"0.14em" }}>PLAYBOOK</div>
    </div>

    <div style={{ display:"flex", gap:2, background:C.bg, borderRadius:8, padding:3, border:`1px solid ${C.border}` }}>
      {[["portfolio","PORTFOLIO"],["scanner","SCANNER"],["macro","MACRO"]].map(([tab, label]) => (
        <button key={tab} onClick={() => setTab(tab)} style={{ padding:"6px 16px", borderRadius:6, fontSize:11, fontFamily:font.mono, fontWeight:700, letterSpacing:"0.08em", border:"none", cursor:"pointer", background:state.tab===tab?C.blue+"25":"transparent", color:state.tab===tab?C.blueGlow:C.textMuted }}>
          {label}
        </button>
      ))}
    </div>

    <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto", flexWrap:"wrap" }}>
      <Badge color={compColor} glow>{score>=0?"+":""}{score.toFixed(2)} COMPOSITE</Badge>
      {ep && ep.window !== "outside" && (
        <Badge color={ep.window==="earnings event"?C.red:ep.window==="pre-earnings drift"?C.amber:C.cyan}>
          {fmtEarningsLabel(ep.daysDelta)} EARN
        </Badge>
      )}
      {state.macroPayload.earningsCalendar?.next?.shifted && <Badge color={C.amber} glow>MODE 4</Badge>}
      {critDTE.length > 0 && <Badge color={C.red}>{critDTE.length} CRITICAL DTE</Badge>}
      {critDTE.length === 0 && rollDTE.length > 0 && <Badge color={C.amber}>{rollDTE.length} ROLL WINDOW</Badge>}
      <Badge color={state.macroMode === "LIVE" ? C.accent : C.textMuted}>{state.macroMode}</Badge>
    </div>
  </div>;
}

/* ══════════════════════════════════════════════════════════
   PORTFOLIO TAB
══════════════════════════════════════════════════════════ */
function PortfolioTab({ state, update }) {
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [showAddShare, setShowAddShare] = useState(false);
  const [showAddOption, setShowAddOption] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);

  const [nsTicker, setNsTicker] = useState(""); const [nsShares, setNsShares] = useState(""); const [nsCost, setNsCost] = useState(""); const [nsMktPrice, setNsMktPrice] = useState("");
  const [optionInput, setOptionInput] = useState(""); const [optionError, setOptionError] = useState(""); const [optionPreview, setOptionPreview] = useState(null);
  const [noPremium, setNoPremium] = useState(""); const [noQty, setNoQty] = useState("1");
  const [ngTitle, setNgTitle] = useState(""); const [ngTarget, setNgTarget] = useState(""); const [ngCurrent, setNgCurrent] = useState(""); const [ngNotes, setNgNotes] = useState(""); const [ngTimeframe, setNgTimeframe] = useState("near");

  const acctKey = state.portfolioTab;
  const acct = state[acctKey];
  const isRoth = acctKey === "roth";
  const earningsPosition = deriveEarningsPosition(state.macroPayload.earningsCalendar);

  const setAcct = tab => update(s => ({ ...s, portfolioTab: tab }));
  const updateAcct = fn => update(s => ({ ...s, [s.portfolioTab]: fn(s[s.portfolioTab]) }));

  useEffect(() => {
    if (optionInput.trim().length > 6) { const p = parseOptionsTicker(optionInput); setOptionPreview(p); if (p) setOptionError(""); }
    else setOptionPreview(null);
  }, [optionInput]);

  const addShare = () => {
    if (!nsTicker || !nsShares) return;
    updateAcct(a => ({ ...a, shares: [...a.shares, { id:uid(), ticker:nsTicker.toUpperCase(), shares:+nsShares, avgCost:+nsCost||0, mktPrice:+nsMktPrice||0 }] }));
    setNsTicker(""); setNsShares(""); setNsCost(""); setNsMktPrice(""); setShowAddShare(false);
  };
  const removeShare = id => updateAcct(a => ({ ...a, shares: a.shares.filter(s => s.id !== id) }));
  const updateShareField = (id, field, val) => updateAcct(a => ({ ...a, shares: a.shares.map(s => s.id===id ? {...s,[field]:+val||0} : s) }));

  const addOption = () => {
    const parsed = parseOptionsTicker(optionInput);
    if (!parsed) { setOptionError("Could not parse. Check the format guide below."); return; }
    setOptionError("");
    updateAcct(a => ({ ...a, options: [...a.options, { id:uid(), ...parsed, premium:+noPremium||0, qty:+noQty||1 }] }));
    setOptionInput(""); setNoPremium(""); setNoQty("1"); setOptionPreview(null); setShowAddOption(false);
  };
  const removeOption = id => updateAcct(a => ({ ...a, options: a.options.filter(o => o.id !== id) }));

  const addGoal = () => {
    if (!ngTitle) return;
    updateAcct(a => ({ ...a, goals: [...a.goals, { id:uid(), title:ngTitle, target:+ngTarget||0, current:+ngCurrent||0, notes:ngNotes, timeframe:ngTimeframe, priority:a.goals.length+1 }] }));
    setNgTitle(""); setNgTarget(""); setNgCurrent(""); setNgNotes(""); setNgTimeframe("near"); setShowAddGoal(false);
  };
  const removeGoal = id => updateAcct(a => ({ ...a, goals: a.goals.filter(g => g.id !== id) }));
  const moveGoal = (id, dir) => updateAcct(a => {
    const goals = [...a.goals]; const idx = goals.findIndex(g => g.id===id); const swap = idx+dir;
    if (swap<0||swap>=goals.length) return a;
    [goals[idx],goals[swap]] = [goals[swap],goals[idx]];
    return { ...a, goals: goals.map((g,i) => ({...g, priority:i+1})) };
  });
  const updateGoalField = (id, field, val) => updateAcct(a => ({ ...a, goals: a.goals.map(g => g.id===id ? {...g,[field]:field==="notes"||field==="title"||field==="timeframe"?val:(+val||0)} : g) }));

  const totalSharesValue = acct.shares.reduce((s,h) => s+h.shares*(h.mktPrice||h.avgCost), 0);
  const totalCostBasis = acct.shares.reduce((s,h) => s+h.shares*h.avgCost, 0);
  const totalPool = Object.values(acct.pool).reduce((a,b) => a+b, 0);
  const nvdaShares = acct.shares.filter(s => s.ticker==="NVDA").reduce((a,s) => a+s.shares, 0);
  const nvdaContracts = Math.floor(nvdaShares/100);
  const jepqShares = acct.shares.filter(s => s.ticker==="JEPQ").reduce((a,s) => a+s.shares, 0);
  const jepiShares = acct.shares.filter(s => s.ticker==="JEPI").reduce((a,s) => a+s.shares, 0);
  const ibitShares = acct.shares.filter(s => s.ticker==="IBIT").reduce((a,s) => a+s.shares, 0);
  const shortCalls = acct.options.filter(o => o.direction==="SHORT"&&o.type==="CALL");
  const shortPuts = acct.options.filter(o => o.direction==="SHORT"&&o.type==="PUT");
  const activePremium = acct.options.reduce((s,o) => s+o.premium*o.qty*100, 0);

  const runAnalysis = async () => {
    setAiLoading(true); setAiResult(null); setAiStatus("Analyzing...");
    const snapObj = {
      account: acctKey.toUpperCase(),
      shares: acct.shares.map(s => ({ ticker:s.ticker, qty:s.shares, avgCost:s.avgCost, mktPrice:s.mktPrice })),
      options: acct.options.map(o => ({ position:o.raw, type:o.type, strike:o.strike, exp:o.expStr, dte:o.dte, direction:o.direction, premium:o.premium, qty:o.qty })),
      capitalPool: acct.pool,
      goals: acct.goals.map(g => ({ priority:g.priority, title:g.title, target:g.target, current:g.current, notes:g.notes, timeframe:g.timeframe||"near" })),
      standingObjectives: isRoth ? STANDING_ROTH : STANDING_HSA,
      keyMetrics: isRoth ? { nvdaContracts, jepqShares, totalPool, activePremium } : { jepiShares, ibitShares, totalPool },
    };
    if (isRoth) {
      snapObj.earningsCalendar = state.macroPayload.earningsCalendar || null;
      snapObj.earningsPosition = earningsPosition || null;
    }
    const snap = JSON.stringify(snapObj, null, 2);
    const userMsg = isRoth
      ? `Current Roth IRA state:\n${snap}\n\nAnalyze this Roth IRA against my goals. Search for current NVDA and JEPQ prices and IV levels. Verify the NVDA earnings date and flag any Mode 4 implications. What are my highest-impact next actions?`
      : `Current HSA state:\n${snap}\n\nAnalyze this HSA against my goals. Search for current JEPI and IBIT prices and distribution yields. Assess where I stand against HSA milestones. What are my highest-impact next actions?`;
    try {
      const text = await callClaude({
        model:"claude-sonnet-4-6", max_tokens:2048,
        tools:[{type:"web_search_20250305",name:"web_search"}],
        system: (isRoth ? SYSTEM_ROTH : SYSTEM_HSA) + "\n\nStop as soon as the analysis is complete. Do not pad or add commentary after your final recommendation.",
        messages:[{role:"user", content:userMsg}],
      }, setAiStatus);
      setAiResult(text || "No analysis returned.");
    } catch (err) { setAiResult("Analysis failed: "+err.message); }
    setAiLoading(false); setAiStatus("");
  };

  return (
    <div style={{ padding:"0 0 40px" }}>
      {/* Account sub-tabs */}
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", background:C.surface }}>
        <div>
          <div style={{ fontSize:12, fontFamily:font.mono, fontWeight:700, color:C.textMuted, letterSpacing:"0.1em" }}>PORTFOLIO COMMAND CENTER</div>
        </div>
        <div style={{ display:"flex", gap:2, background:C.bg, borderRadius:8, padding:3, border:`1px solid ${C.border}` }}>
          {["roth","hsa"].map(tab => (
            <button key={tab} onClick={() => setAcct(tab)} style={{ padding:"7px 20px", borderRadius:6, fontSize:12, fontFamily:font.mono, fontWeight:700, letterSpacing:"0.08em", border:"none", cursor:"pointer", background:acctKey===tab?C.accent+"20":"transparent", color:acctKey===tab?C.accent:C.textMuted }}>
              {tab==="roth"?"ROTH IRA":"HSA"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding:"16px 24px", display:"flex", gap:12, flexWrap:"wrap" }}>
        <StatCard label="Portfolio Value" value={fmtUSD(totalSharesValue)} sub={`Cost basis: ${fmtUSD(totalCostBasis)}`} />
        {isRoth ? (<>
          <StatCard label="NVDA Contracts" value={nvdaContracts} sub={`${nvdaShares} shares`} color={C.accent} />
          <StatCard label="JEPQ Shares" value={jepqShares.toLocaleString()} sub={jepqShares>=1500?"TARGET MET":"→ 1,500"} color={jepqShares>=1500?C.accent:C.amber} />
        </>) : (<>
          <StatCard label="JEPI Shares" value={jepiShares.toLocaleString()} sub={jepiShares>=500?"PIVOT READY":"→ 500"} color={jepiShares>=500?C.accent:C.amber} />
          <StatCard label="IBIT Shares" value={ibitShares.toLocaleString()} sub={ibitShares>0?"Active":"Pre-pivot"} color={ibitShares>0?C.accent:C.textMuted} />
        </>)}
        <StatCard label="Capital Pool" value={fmtUSD(totalPool)} sub="Deployable" color={C.blue} />
        <StatCard label="Active Premium" value={fmtUSD(activePremium)} sub={`${shortCalls.length} CCs · ${shortPuts.length} CSPs`} color={C.accent} />
        {isRoth && earningsPosition && (
          <StatCard label="NVDA Earnings" value={fmtEarningsLabel(earningsPosition.daysDelta)} sub={`${earningsPosition.window} · ${earningsPosition.date}`} color={earningsPosition.window==="earnings event"?C.red:earningsPosition.window==="pre-earnings drift"?C.amber:earningsPosition.window==="post-earnings drift"?C.blue:C.textDim} />
        )}
      </div>

      {/* Mode 4 banner */}
      {isRoth && earningsPosition?.shifted && (
        <div style={{ padding:"0 24px 16px" }}>
          <div style={{ padding:"12px 18px", background:C.amberDim+"30", border:`1px solid ${C.amber}50`, borderRadius:8, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <Badge color={C.amber}>MODE 4 TRIGGER</Badge>
            <span style={{ fontSize:12, fontFamily:font.mono, color:C.text }}>NVDA earnings shifted from <strong style={{ color:C.amber }}>{earningsPosition.priorEstimate}</strong> to <strong style={{ color:C.amber }}>{earningsPosition.date}</strong></span>
            <span style={{ fontSize:11, fontFamily:font.mono, color:C.textDim }}>· Open NVDA CCs whose original DTE assumed the prior date are Calendar Correction candidates — use Scanner tab.</span>
          </div>
        </div>
      )}

      {/* Roadmap */}
      <div style={{ padding:"0 24px 16px" }}>
        <Card style={{ padding:"14px 20px" }}>
          <SectionHead>{isRoth?"Scaling Roadmap":"HSA Milestones"}</SectionHead>
          <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
            {(isRoth
              ? [{label:"Phase 1: 5 Contracts",current:nvdaContracts,target:5},{label:"Phase 2: 1,500 JEPQ",current:jepqShares,target:1500},{label:"Phase 3: 10 Contracts",current:nvdaContracts,target:10}]
              : [{label:"250 JEPI",current:jepiShares,target:250},{label:"500 JEPI (Pivot)",current:jepiShares,target:500},{label:"1,000 JEPI",current:jepiShares,target:1000},{label:"1,500 JEPI",current:jepiShares,target:1500}]
            ).map((p,i) => (
              <div key={i} style={{ flex:1, minWidth:150 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:11, fontFamily:font.mono, color:C.textDim }}>{p.label}</span>
                  <span style={{ fontSize:11, fontFamily:font.mono, color:p.current>=p.target?C.accent:C.amber }}>{p.current}/{p.target}</span>
                </div>
                <ProgressBar current={p.current} target={p.target} color={p.current>=p.target?C.accent:C.amber} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Main grid */}
      <div style={{ padding:"0 24px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, alignItems:"start" }}>
        {/* Left column */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Equities */}
          <Card>
            <SectionHead right={<Btn small onClick={() => setShowAddShare(!showAddShare)}>{showAddShare?"Cancel":"+ Add Equity"}</Btn>}>Equity Holdings</SectionHead>
            {showAddShare && (
              <div style={{ marginBottom:16, padding:16, background:C.bg, borderRadius:8, border:`1px solid ${C.accent}30` }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:12, fontFamily:font.mono }}>NEW EQUITY POSITION</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <LabeledField label="Ticker"><Input value={nsTicker} onChange={setNsTicker} placeholder="NVDA" mono /></LabeledField>
                  <LabeledField label="Shares"><Input value={nsShares} onChange={setNsShares} placeholder="100" type="number" mono /></LabeledField>
                  <LabeledField label="Avg Cost / Share"><Input value={nsCost} onChange={setNsCost} placeholder="135.00" type="number" mono /></LabeledField>
                  <LabeledField label="Market Price"><Input value={nsMktPrice} onChange={setNsMktPrice} placeholder="180.00" type="number" mono /></LabeledField>
                </div>
                <div style={{ display:"flex", gap:8, marginTop:14 }}>
                  <Btn onClick={addShare} disabled={!nsTicker||!nsShares}>Save</Btn>
                  <Btn variant="ghost" onClick={() => setShowAddShare(false)}>Cancel</Btn>
                </div>
              </div>
            )}
            {acct.shares.length === 0 ? (
              <div style={{ padding:"24px 0", textAlign:"center", color:C.textMuted, fontFamily:font.mono, fontSize:12 }}>No equity positions. Click + Add Equity to start.</div>
            ) : (
              <div>
                <div style={{ display:"grid", gridTemplateColumns:"70px 60px 80px 80px 90px 80px 28px", gap:4, padding:"4px 8px", borderBottom:`1px solid ${C.border}` }}>
                  {["Ticker","Shares","Avg Cost","Mkt Price","Value","P/L",""].map((h,i) => <span key={i} style={{ fontSize:10, fontFamily:font.mono, fontWeight:600, color:C.textMuted, letterSpacing:"0.08em", textAlign:i===0?"left":"right" }}>{h}</span>)}
                </div>
                {acct.shares.map(s => {
                  const val = s.shares*(s.mktPrice||s.avgCost);
                  const pl = s.mktPrice&&s.avgCost ? (s.mktPrice-s.avgCost)*s.shares : 0;
                  return <div key={s.id} style={{ display:"grid", gridTemplateColumns:"70px 60px 80px 80px 90px 80px 28px", gap:4, padding:"8px", borderBottom:`1px solid ${C.border}15`, alignItems:"center" }}>
                    <span style={{ fontFamily:font.mono, fontWeight:700, color:C.accent, fontSize:13 }}>{s.ticker}</span>
                    <span style={{ fontFamily:font.mono, fontSize:13, textAlign:"right" }}>{s.shares}</span>
                    <div style={{ textAlign:"right" }}><InlineEdit value={s.avgCost} onChange={v => updateShareField(s.id,"avgCost",v)} /></div>
                    <div style={{ textAlign:"right" }}><InlineEdit value={s.mktPrice} onChange={v => updateShareField(s.id,"mktPrice",v)} /></div>
                    <span style={{ fontFamily:font.mono, fontSize:13, textAlign:"right" }}>{fmtUSD(val)}</span>
                    <span style={{ fontFamily:font.mono, fontSize:13, textAlign:"right", color:pl>=0?C.accent:C.red }}>{pl!==0?(pl>0?"+":"")+fmtUSD(pl):"—"}</span>
                    <button onClick={() => removeShare(s.id)} style={{ background:"none", border:"none", color:C.textMuted, cursor:"pointer", fontSize:13, padding:0, textAlign:"right" }}>✕</button>
                  </div>;
                })}
                <div style={{ fontSize:10, color:C.textMuted, fontFamily:font.mono, padding:"6px 8px 0", fontStyle:"italic" }}>Click Avg Cost or Mkt Price to edit inline.</div>
              </div>
            )}
          </Card>

          {/* Options */}
          <Card>
            <SectionHead right={<Btn small onClick={() => setShowAddOption(!showAddOption)}>{showAddOption?"Cancel":"+ Add Option"}</Btn>}>Options Positions</SectionHead>
            {showAddOption && (
              <div style={{ marginBottom:16, padding:16, background:C.bg, borderRadius:8, border:`1px solid ${C.accent}30` }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:12, fontFamily:font.mono }}>NEW OPTIONS POSITION</div>
                <LabeledField label="Options Ticker String">
                  <Input value={optionInput} onChange={setOptionInput} placeholder="-NVDA260417C200" mono style={{ fontSize:16, padding:"10px 12px" }} />
                </LabeledField>
                <div style={{ margin:"12px 0", padding:14, background:C.surface, borderRadius:8, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:11, fontFamily:font.mono, color:C.textDim, marginBottom:10, fontWeight:700 }}>FORMAT GUIDE</div>
                  <div style={{ fontFamily:font.mono, fontSize:18, marginBottom:10, letterSpacing:"0.06em" }}>
                    <span style={{ color:C.red, fontWeight:700 }}>–</span><span style={{ color:C.accent, fontWeight:700 }}>NVDA</span><span style={{ color:C.amber }}>260417</span><span style={{ color:C.blue, fontWeight:700 }}>C</span><span style={{ color:C.text }}>200</span>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"80px 1fr", gap:"4px 14px", fontSize:12, fontFamily:font.mono }}>
                    <span style={{ color:C.red }}>– (dash)</span><span style={{ color:C.textDim }}>Short position. Omit for long.</span>
                    <span style={{ color:C.accent }}>NVDA</span><span style={{ color:C.textDim }}>Underlying ticker</span>
                    <span style={{ color:C.amber }}>260417</span><span style={{ color:C.textDim }}>Expiration: YYMMDD</span>
                    <span style={{ color:C.blue }}>C or P</span><span style={{ color:C.textDim }}>Call or Put</span>
                    <span style={{ color:C.text }}>200</span><span style={{ color:C.textDim }}>Strike price</span>
                  </div>
                </div>
                {optionPreview && (
                  <div style={{ margin:"0 0 12px", padding:12, background:C.accentDim+"30", borderRadius:8, border:`1px solid ${C.accent}40` }}>
                    <div style={{ fontSize:10, fontFamily:font.mono, color:C.accent, marginBottom:6, fontWeight:700 }}>✓ PARSED</div>
                    <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                      <Badge color={optionPreview.direction==="SHORT"?C.red:C.accent}>{optionPreview.direction}</Badge>
                      <span style={{ fontFamily:font.mono, fontWeight:700, fontSize:15 }}>{optionPreview.underlying}</span>
                      <span style={{ fontFamily:font.mono, fontSize:14 }}>${optionPreview.strike} {optionPreview.type}</span>
                      <Badge color={C.blue}>{optionPreview.expStr}</Badge>
                      <Badge color={optionPreview.dte<=7?C.amber:C.textDim}>{optionPreview.dte} DTE</Badge>
                    </div>
                  </div>
                )}
                {optionError && <div style={{ color:C.red, fontSize:12, fontFamily:font.mono, margin:"0 0 12px", padding:10, background:C.redDim+"30", borderRadius:6 }}>⚠ {optionError}</div>}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <LabeledField label="Premium / Share" hint="e.g. 3.50 = $350/contract"><Input value={noPremium} onChange={setNoPremium} placeholder="3.50" type="number" mono /></LabeledField>
                  <LabeledField label="Contracts" hint="1 contract = 100 shares"><Input value={noQty} onChange={setNoQty} placeholder="1" type="number" mono /></LabeledField>
                </div>
                <div style={{ display:"flex", gap:8, marginTop:14 }}>
                  <Btn onClick={addOption} disabled={!optionPreview}>Save Option</Btn>
                  <Btn variant="ghost" onClick={() => { setShowAddOption(false); setOptionError(""); setOptionPreview(null); }}>Cancel</Btn>
                </div>
              </div>
            )}
            {acct.options.length === 0 ? (
              <div style={{ padding:"24px 0", textAlign:"center", color:C.textMuted, fontFamily:font.mono, fontSize:12 }}>No options positions. Click + Add Option to start.</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {acct.options.map(o => (
                  <div key={o.id} style={{ padding:"10px 12px", background:C.bg, borderRadius:8, border:`1px solid ${C.border}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <Badge color={o.direction==="SHORT"?C.red:C.accent}>{o.direction}</Badge>
                        <span style={{ fontFamily:font.mono, fontWeight:700, fontSize:14 }}>{o.underlying}</span>
                        <span style={{ fontFamily:font.mono, fontSize:13, color:C.textDim }}>${o.strike} {o.type}</span>
                        <Badge color={C.blue}>{o.expStr}</Badge>
                        <Badge color={o.dte<=7?C.red:o.dte<=21?C.amber:C.textDim}>{o.dte} DTE</Badge>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontFamily:font.mono, fontSize:12, color:C.textDim }}>x{o.qty} @ {fmtUSD2(o.premium)}/sh</span>
                        <span style={{ fontFamily:font.mono, fontSize:14, fontWeight:700, color:C.accent }}>{fmtUSD(o.premium*o.qty*100)}</span>
                        <button onClick={() => removeOption(o.id)} style={{ background:"none", border:"none", color:C.textMuted, cursor:"pointer", fontSize:14 }}>✕</button>
                      </div>
                    </div>
                    <div style={{ fontSize:11, fontFamily:font.mono, color:C.textMuted, marginTop:4 }}>{o.raw}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Goals */}
          <Card>
            <SectionHead right={<Btn small color={C.amber} onClick={() => setShowAddGoal(!showAddGoal)}>{showAddGoal?"Cancel":"+ Add Goal"}</Btn>}>Goals & Priorities</SectionHead>
            {showAddGoal && (
              <div style={{ marginBottom:16, padding:16, background:C.bg, borderRadius:8, border:`1px solid ${C.amber}30` }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.amber, marginBottom:12, fontFamily:font.mono }}>NEW GOAL</div>
                <LabeledField label="Timeframe">
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {Object.entries(TIMEFRAMES).map(([key,tf]) => (
                      <button key={key} onClick={() => setNgTimeframe(key)} style={{ padding:"6px 14px", borderRadius:6, fontSize:12, fontFamily:font.mono, fontWeight:600, border:`1px solid ${ngTimeframe===key?tf.color:C.border}`, background:ngTimeframe===key?tf.color+"20":"transparent", color:ngTimeframe===key?tf.color:C.textMuted, cursor:"pointer" }}>{tf.label}</button>
                    ))}
                  </div>
                </LabeledField>
                <div style={{ fontSize:11, fontFamily:font.mono, color:C.textMuted, marginTop:2, marginBottom:12 }}>{TIMEFRAMES[ngTimeframe].desc}</div>
                <LabeledField label="Goal Description"><Input value={ngTitle} onChange={setNgTitle} placeholder="Scale to 5 NVDA covered call contracts" /></LabeledField>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12 }}>
                  <LabeledField label="Target"><Input value={ngTarget} onChange={setNgTarget} placeholder="5" type="number" mono /></LabeledField>
                  <LabeledField label="Current"><Input value={ngCurrent} onChange={setNgCurrent} placeholder="2" type="number" mono /></LabeledField>
                </div>
                <div style={{ marginTop:12 }}><LabeledField label="Notes (optional)"><Input value={ngNotes} onChange={setNgNotes} placeholder="Context, trigger conditions, or dependencies" /></LabeledField></div>
                <div style={{ display:"flex", gap:8, marginTop:14 }}>
                  <Btn color={C.amber} onClick={addGoal} disabled={!ngTitle}>Save Goal</Btn>
                  <Btn variant="ghost" onClick={() => setShowAddGoal(false)}>Cancel</Btn>
                </div>
              </div>
            )}
            {acct.goals.length === 0 ? (
              <div style={{ padding:"24px 0", textAlign:"center", color:C.textMuted, fontFamily:font.mono, fontSize:12 }}>No goals set yet. Standing objectives are always active — add strategic milestones here.</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {acct.goals.map((g,i) => {
                  const pct = g.target>0?Math.min(100,(g.current/g.target)*100):0;
                  const done = pct>=100;
                  const tf = TIMEFRAMES[g.timeframe]||TIMEFRAMES.near;
                  return <div key={g.id} style={{ padding:12, background:C.bg, borderRadius:8, border:`1px solid ${done?C.accent+"40":C.border}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <span style={{ fontFamily:font.mono, fontSize:12, fontWeight:700, color:C.amber, background:C.amberDim+"40", padding:"2px 6px", borderRadius:4 }}>#{g.priority}</span>
                        <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:4, fontSize:10, fontFamily:font.mono, fontWeight:700, color:tf.color, background:tf.color+"18", border:`1px solid ${tf.color}30`, cursor:"pointer" }}
                          onClick={() => { const keys=Object.keys(TIMEFRAMES); updateGoalField(g.id,"timeframe",keys[(keys.indexOf(g.timeframe||"near")+1)%keys.length]); }}
                          title="Click to cycle">{tf.label}</span>
                        <span style={{ fontSize:13, fontWeight:600, color:done?C.accent:C.text }}>{g.title}</span>
                      </div>
                      <div style={{ display:"flex", gap:2 }}>
                        <button onClick={() => moveGoal(g.id,-1)} disabled={i===0} style={{ background:"none", border:"none", color:i===0?C.textMuted+"40":C.textMuted, cursor:"pointer", fontSize:13, padding:"2px 5px" }}>▲</button>
                        <button onClick={() => moveGoal(g.id,1)} disabled={i===acct.goals.length-1} style={{ background:"none", border:"none", color:i===acct.goals.length-1?C.textMuted+"40":C.textMuted, cursor:"pointer", fontSize:13, padding:"2px 5px" }}>▼</button>
                        <button onClick={() => removeGoal(g.id)} style={{ background:"none", border:"none", color:C.textMuted, cursor:"pointer", fontSize:13, padding:"2px 5px" }}>✕</button>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
                      <div style={{ flex:1 }}><ProgressBar current={g.current} target={g.target} color={done?C.accent:tf.color} /></div>
                      <div style={{ display:"flex", alignItems:"baseline", gap:2, minWidth:70, justifyContent:"flex-end" }}>
                        <InlineEdit value={g.current} onChange={v => updateGoalField(g.id,"current",v)} width={36} />
                        <span style={{ fontFamily:font.mono, fontSize:11, color:C.textMuted }}>/ {g.target}</span>
                      </div>
                      <span style={{ fontFamily:font.mono, fontSize:12, fontWeight:700, color:done?C.accent:tf.color, minWidth:36, textAlign:"right" }}>{pct.toFixed(0)}%</span>
                    </div>
                    {g.notes && <div style={{ fontSize:11, color:C.textMuted, fontFamily:font.mono }}>{g.notes}</div>}
                  </div>;
                })}
              </div>
            )}
          </Card>

          {/* Standing Objectives */}
          <Card style={{ padding:"14px 20px" }}>
            <SectionHead>Standing Objectives (Always Active)</SectionHead>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {(isRoth?STANDING_ROTH:STANDING_HSA).map((obj,i) => (
                <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"4px 0" }}>
                  <span style={{ color:C.accent, fontSize:11, fontFamily:font.mono, marginTop:1, flexShrink:0 }}>✓</span>
                  <span style={{ fontSize:12, fontFamily:font.mono, color:C.textDim, lineHeight:1.4 }}>{obj}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* SPAXX */}
          <Card style={{ padding:"14px 20px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:10, fontFamily:font.mono, fontWeight:700, color:C.textMuted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>SPAXX Sweep Balance</div>
                <div style={{ fontSize:10, fontFamily:font.mono, color:C.textMuted }}>Cash earning ~4% while collateralizing positions</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ fontSize:11, fontFamily:font.mono, color:C.textMuted }}>$</span>
                <InlineEdit value={acct.pool.spaxx} onChange={v => updateAcct(a => ({...a, pool:{...a.pool, spaxx:+v||0}}))} width={90} />
              </div>
            </div>
          </Card>
        </div>

        {/* Right column: AI Analysis */}
        <div style={{ position:"sticky", top:60, alignSelf:"start", maxHeight:"calc(100vh - 76px)", display:"flex", flexDirection:"column" }}>
          <Card>
            <SectionHead right={
              <div style={{ display:"flex", gap:8 }}>
                <Btn small variant="danger" onClick={() => { if (confirm(`Reset ${acctKey.toUpperCase()} data?`)) { update(s => ({...s,[s.portfolioTab]:JSON.parse(JSON.stringify(EMPTY_ACCOUNT))})); setAiResult(null); } }}>Reset {acctKey.toUpperCase()}</Btn>
                <Btn color={C.blue} onClick={runAnalysis} disabled={aiLoading}>{aiLoading?"⏳ Analyzing...":"⚡ Run AI Analysis"}</Btn>
              </div>
            }>AI Market Analysis & Goal Priority</SectionHead>
            {aiLoading && <div style={{ padding:"30px", textAlign:"center" }}>
              <div style={{ color:aiStatus.includes("Rate")?C.amber:C.blue, fontFamily:font.mono, fontSize:13, marginBottom:8 }}>{aiStatus||(isRoth?"Searching NVDA/JEPQ prices and analyzing Roth IRA...":"Searching JEPI/IBIT prices and analyzing HSA milestones...")}</div>
              <div style={{ color:C.textMuted, fontFamily:font.mono, fontSize:11 }}>{aiStatus.includes("Rate")?"Auto-retry active — do not close the tab":(isRoth?"Checking IV environment and NVDA earnings calendar":"Assessing accumulation progress and pivot gate")}</div>
            </div>}
            {aiResult && !aiLoading && <div style={{ padding:"16px", background:C.bg, borderRadius:8, border:`1px solid ${C.blueDim}`, overflowY:"auto", maxHeight:"calc(100vh - 200px)" }}>
              <MarkdownText text={aiResult} />
            </div>}
            {!aiResult && !aiLoading && <div style={{ padding:"30px", textAlign:"center" }}>
              <div style={{ color:C.textMuted, fontSize:13, fontFamily:font.mono, marginBottom:8 }}>Enter your positions and goals, then run analysis.</div>
              <div style={{ color:C.textMuted, fontSize:11, fontFamily:font.mono, lineHeight:1.6 }}>The AI will search current market data (prices, IV, macro calendar)<br />and evaluate whether your goal priorities should shift.</div>
            </div>}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SCANNER TAB
══════════════════════════════════════════════════════════ */
function ScannerTab({ state, update }) {
  const [scanResult, setScanResult] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [scanTarget, setScanTarget] = useState(null);
  const [gammaResult, setGammaResult] = useState(() => state.scanResults.gammaWalls?.text || null);
  const [gammaLoading, setGammaLoading] = useState(false);
  const [gammaStatus, setGammaStatus] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState(() => {
    const all = [...state.roth.shares, ...state.hsa.shares];
    return all.length > 0 ? all[0].ticker : "";
  });

  const earningsCalendar = state.macroPayload.earningsCalendar;
  const earningsPosition = deriveEarningsPosition(earningsCalendar);

  const positions = useMemo(() => [
    ...state.roth.options.filter(o => o.direction==="SHORT").map(o => ({...o, account:"ROTH"})),
    ...state.hsa.options.filter(o => o.direction==="SHORT").map(o => ({...o, account:"HSA"})),
  ], [state.roth.options, state.hsa.options]);

  const critical      = useMemo(() => positions.filter(p => p.dte<=7), [positions]);
  const rollWindow    = useMemo(() => positions.filter(p => p.dte>7&&p.dte<=21), [positions]);
  const monitoring    = useMemo(() => positions.filter(p => p.dte>21), [positions]);
  const equityTickers = useMemo(() => [...new Set([...state.roth.shares, ...state.hsa.shares].map(s => s.ticker))], [state.roth.shares, state.hsa.shares]);

  const saveRollScan = (label, text) => {
    update(s => {
      const entry = { id:uid(), label, text, timestamp:Date.now() };
      return { ...s, scanResults: { ...s.scanResults, rollScans:[entry,...s.scanResults.rollScans].slice(0,10) } };
    });
  };

  const saveGammaWalls = (text) => {
    update(s => ({ ...s, scanResults: { ...s.scanResults, gammaWalls:{ text, timestamp:Date.now() } } }));
  };

  const clearHistory = () => update(s => ({ ...s, scanResults: { rollScans:[], gammaWalls:null } }));

  const earningsCtx = () => earningsCalendar
    ? `\n\nEARNINGS CALENDAR CONTEXT:\nNext ${earningsCalendar.ticker||"NVDA"} earnings: ${earningsCalendar.next?.date||"unknown"} (${earningsCalendar.next?.confirmed?"confirmed":"estimated"})${earningsCalendar.next?.shifted?`\nSHIFT DETECTED: prior estimate was ${earningsCalendar.next.priorEstimate}, confirmed ${earningsCalendar.next.confirmedAt} — Mode 4 Calendar Correction trigger for any open NVDA short call whose original DTE assumed the prior date as planned exit catalyst.`:""}\nCurrent position: T${earningsPosition?.daysDelta>=0?"-":"+"}${Math.abs(earningsPosition?.daysDelta||0)} (${earningsPosition?.window||"unknown window"})`
    : "";

  const scanRollOpportunities = async (pos) => {
    setScanLoading(true); setScanResult(null); setScanTarget(pos); setScanStatus("Scanning...");
    const posDesc = `${pos.underlying} $${pos.strike} ${pos.type} expiring ${pos.expStr} (${pos.dte} DTE), opened at $${pos.premium}/share, ${pos.qty} contract(s)`;
    try {
      const text = await callClaude({
          model:"claude-sonnet-4-6", max_tokens:1500,
          tools:[{type:"web_search_20250305",name:"web_search"}],
          system:`You are a roll dashboard for an experienced options operator who knows the Flywheel Playbook. Output only the verdict and key numbers — no explanations, no step-by-step reasoning, no restating the process. Stop as soon as the dashboard is complete.

MODE RULES (operator already knows these — apply silently):
- Mode 1: triggered at 21 DTE or 50% profit (BTC ≤ 50% of premium collected). Net credit required.
- Mode 3: triggered by bull-trap rally during Amateur Hour. Net credit required.
- Mode 4: triggered ONLY when earnings date confirmed to have SHIFTED from the date assumed at entry AND the new date is now OUTSIDE the current expiration. Net debit accepted. If earnings shift occurred but the earnings date remains INSIDE the current expiration, Mode 4 does NOT apply.
- Earnings Shield: applies only to Mon/Wed short-dated NVDA options. No restriction on 45-DTE CCs spanning earnings.

OUTPUT FORMAT — use this exact structure, nothing more:

## [TICKER] $[STRIKE] [TYPE] — [EXP] ([DTE] DTE)

**Verdict: [HOLD / MODE 1 / MODE 3 / MODE 4 / CLOSE]**
Spot: $X · BTC est: $X/sh · Profit captured: X% (target: X%)
Mode 1: [triggered / triggers at 21 DTE ~DATE]
Mode 3: [triggered / not triggered — reason in one clause]
Mode 4: [triggered / not triggered — reason in one clause]

**If action required — Roll Candidates:**
| Strike | Exp | Delta est | Net Credit/Debit |
|---|---|---|---|
| $X | MonDD | ~0.XX | +$X.XX/sh |

**Flag any anomalies** (data conflicts, unusual IV, gap risk) in one line each.`,
          messages:[{role:"user", content:`Position: ${posDesc}${earningsCtx()}\n\nSearch current ${pos.underlying} price and options chain. Produce the dashboard. For Mode 1/3 candidates: delta ≤ 0.22, expiration ≤ 45 DTE from today, strike at/above current price. Net credit must be ≥ 50% of original premium ($${pos.premium}/sh = target BTC ≤ $${(pos.premium*0.5).toFixed(2)}/sh). For Mode 4: earnings must have shifted outside current expiry.`}],
      }, setScanStatus);
      const final = text || "No results.";
      setScanResult(final);
      saveRollScan(`${pos.underlying} $${pos.strike} ${pos.type} ${pos.expStr}`, final);
    } catch (err) { setScanResult("Scan failed: "+err.message); }
    setScanLoading(false); setScanStatus("");
  };

  const scanAll = async () => {
    if (positions.length===0) return;
    setScanLoading(true); setScanResult(null); setScanTarget(null); setScanStatus("Scanning all positions...");
    const posDescs = positions.map(p => `• ${p.raw} [${p.account}]: ${p.underlying} $${p.strike} ${p.type} exp ${p.expStr} (${p.dte} DTE), premium $${p.premium}/sh, x${p.qty}`).join("\n");
    try {
      const text = await callClaude({
          model:"claude-sonnet-4-6", max_tokens:1500,
          tools:[{type:"web_search_20250305",name:"web_search"}],
          system:`You are a roll dashboard for an experienced options operator who knows the Flywheel Playbook. Output only verdicts and key numbers — no explanations, no process narration. Stop as soon as the dashboard is complete.

MODE RULES (apply silently):
- Mode 1: 21 DTE trigger OR BTC ≤ 50% of collected premium. Net credit required.
- Mode 3: bull-trap rally, Amateur Hour. Net credit required.
- Mode 4: ONLY when earnings date confirmed shifted from entry assumption AND new date is now OUTSIDE current expiration. Net debit accepted.
- Earnings Shield: Mon/Wed short-dated NVDA only. 45-DTE CCs have no earnings restriction.

Sort by urgency: ≤7 DTE first, then 8-21 DTE, then 22+ DTE.

OUTPUT FORMAT:

## Portfolio Roll Summary
| Position | DTE | Spot | BTC est | Profit% | Verdict | Next Trigger |
|---|---|---|---|---|---|---|
| TICKER $STRIKE TYPE EXP | XX | $X | $X/sh | XX% | HOLD/MODE X | [date or condition] |

**Flags** (one line each — data conflicts, Mode 4 triggers, gap risk, anything requiring immediate attention):
- [flag]

No roll candidates needed for HOLD positions. For any position with MODE 1/3/4 verdict, append a brief candidates block:
**[TICKER] $[STRIKE] — Roll Candidates**
| Strike | Exp | Delta est | Net Credit |
|---|---|---|---|`,
          messages:[{role:"user", content:`Positions:\n${posDescs}${earningsCtx()}\n\nSearch current prices and options data. Apply mode gates to each position. 50% profit threshold = BTC at or below 50% of collected premium.`}],
      }, setScanStatus);
      const final = text || "No results.";
      setScanResult(final);
      saveRollScan("All Positions Sweep", final);
    } catch (err) { setScanResult("Scan failed: "+err.message); }
    setScanLoading(false); setScanStatus("");
  };

  const runRangeAnalysis = async () => {
    if (!selectedTicker) return;
    setGammaLoading(true); setGammaResult(null);
    let sourceData = "";

    const fetch3 = async (status, system, user, label) => {
      setGammaStatus(status);
      try {
        const text = await callClaude({
          model:"claude-sonnet-4-6", max_tokens:800,
          tools:[{type:"web_search_20250305",name:"web_search"}],
          system: system + " Stop as soon as the data is reported.", messages:[{role:"user", content:user}],
        }, setGammaStatus);
        return `**${label}**\n\n${text || "No data returned."}\n\n`;
      } catch (err) { return `**${label}**\n\nFetch failed: ${err.message}\n\n`; }
    };

    sourceData += await fetch3(
      "Fetching OI walls...",
      `You are identifying the options-derived price range for a swing trade setup. Search the current options chain for the ticker provided. Find the top call-side strikes by open interest (ceiling — where dealer short gamma resists upward movement) and the top put-side strikes by open interest (floor — where dealer long gamma supports price). Report: current price, top 3 call-wall strikes with OI counts, top 3 put-wall strikes with OI counts, and the zero-gamma level if available. Label ceiling and floor clearly. Use plain prose — no emoji.`,
      `Search the current options chain for: ${selectedTicker}\n\nReport the call-side OI concentration (range ceiling) and put-side OI concentration (range floor) for the nearest 1–3 expirations. Include current price and any gamma-flip level.`,
      "OI GAMMA WALLS"
    );

    sourceData += await fetch3(
      "Fetching insider sales...",
      `You are identifying price resistance levels from SEC Form 4 insider sales for a swing trade setup. Insider sales mark levels where executives considered the stock fairly valued or overvalued — these anchor the upper boundary of a realistic swing target. Search Form 4 filings for the last 6 months. Report each sale: name, title, date, shares sold, and price. Summarize the price range across all sales as the insider-derived resistance zone. Use plain prose — no emoji.`,
      `Search SEC Form 4 insider sales for: ${selectedTicker} (last 6 months). For NVDA, include Jensen Huang. Report each sale with name, title, date, share count, and price. What price range do the insider sales define as resistance?`,
      "INSIDER SALES (Form 4)"
    );

    sourceData += await fetch3(
      "Fetching 13F institutional data...",
      `You are identifying price support levels from institutional accumulation for a swing trade setup. 13F filings mark price zones where large funds actively added positions — these define the demand floor and lower boundary of the swing range. Search recent 13F filings and institutional buying. Report institutions, share counts added, and price ranges during accumulation. Summarize as a support zone price range. Use plain prose — no emoji.`,
      `Search recent 13F filings and institutional buying for: ${selectedTicker}. Which major institutions have been accumulating and at what price levels? What price range defines the institutional demand floor?`,
      "INSTITUTIONAL ACCUMULATION (13F)"
    );

    setGammaStatus("Synthesizing swing range...");
    try {
      const synthText = await callClaude({
        model:"claude-sonnet-4-6", max_tokens:600,
        system:`You are building a swing trade plan from three pre-collected data sources: OI gamma walls, SEC Form 4 insider sales, and 13F institutional accumulation. Output plain text only — no emoji, no bullet decoration beyond dashes.

Structure your response exactly as:

## SWING TRADE RANGE — [TICKER]

**Summary**
Floor: $X | Ceiling: $Y | Current: $Z (N% of range)
Entry Zone: $A–$B | Target: $C | Stop: $D | R/R: N:1

**Detail**
Range Floor: [price and one-sentence rationale from OI + 13F convergence]
Range Ceiling: [price and one-sentence rationale from OI + insider convergence]
Current Price Position: [where price sits in the range as a percentage]
Swing Entry Zone: [price band with rationale]
Swing Target: [price with rationale]
Stop Level: [price — below here the range thesis is invalid]
Risk/Reward: [entry midpoint, target, stop, and ratio]

Be direct. State specific prices. Do not restate the raw source data. Stop as soon as the plan is complete.`,
        messages:[{role:"user", content:`Ticker: ${selectedTicker}\n\nSource data:\n${sourceData}\n\nSynthesize into the swing trade plan. Output summary first, then detail.`}],
      }, setGammaStatus);
      const final = (synthText || "Synthesis failed.") + "\n\n---\n\n## Source Data\n\n" + sourceData;
      setGammaResult(final);
      saveGammaWalls(final);
    } catch (err) {
      const final = `Synthesis failed: ${err.message}\n\n---\n\n## Source Data\n\n` + sourceData;
      setGammaResult(final);
      saveGammaWalls(final);
    }

    setGammaLoading(false); setGammaStatus("");
  };

  return (
    <div style={{ padding:"0 0 40px" }}>
      {/* Header */}
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", background:C.surface }}>
        <div>
          <div style={{ fontSize:12, fontFamily:font.mono, fontWeight:700, color:C.textMuted, letterSpacing:"0.1em" }}>ROLL OPPORTUNITY SCANNER</div>
          <div style={{ fontSize:11, color:C.textMuted, fontFamily:font.mono }}>Reads portfolio short positions — manage positions in the Portfolio tab</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {equityTickers.length > 0 && <>
            <select value={selectedTicker} onChange={e => setSelectedTicker(e.target.value)}
              style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, padding:"7px 10px", color:C.text, fontFamily:font.mono, fontSize:12, fontWeight:700, outline:"none", cursor:"pointer" }}>
              {equityTickers.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <Btn color={C.purple} onClick={runRangeAnalysis} disabled={gammaLoading || !selectedTicker}>
              {gammaLoading ? "Analyzing..." : "Analyze Range"}
            </Btn>
          </>}
          {positions.length > 0 &&
            <Btn color={C.cyan} onClick={scanAll} disabled={scanLoading}>{scanLoading&&!scanTarget?"Scanning...":"Scan All Rolls"}</Btn>
          }
        </div>
      </div>

      {/* Urgency strip */}
      {positions.length>0 && <div style={{ padding:"12px 24px", display:"flex", gap:12 }}>
        {[{label:"CRITICAL (≤7 DTE)",count:critical.length,color:C.red},{label:"ROLL WINDOW (8-21 DTE)",count:rollWindow.length,color:C.amber},{label:"MONITORING (22+ DTE)",count:monitoring.length,color:C.textMuted},{label:"TOTAL",count:positions.length,color:C.cyan}].map((s,i) => (
          <div key={i} style={{ background:C.surface, border:`1px solid ${s.count>0?s.color+"30":C.border}`, borderRadius:6, padding:"10px 16px", flex:1 }}>
            <div style={{ fontSize:9, fontFamily:font.mono, letterSpacing:"0.1em", color:C.textMuted, marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:24, fontFamily:font.mono, fontWeight:700, color:s.count>0?s.color:C.textMuted }}>{s.count}</div>
          </div>
        ))}
      </div>}

      {/* Earnings strip */}
      {earningsPosition && <div style={{ padding:"0 24px 12px" }}>
        <div style={{ background:earningsPosition.shifted?C.amberDim+"30":C.surface, border:`1px solid ${earningsPosition.shifted?C.amber+"50":C.border}`, borderRadius:6, padding:"10px 16px", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
          <span style={{ fontSize:9, fontFamily:font.mono, fontWeight:700, color:C.textMuted, letterSpacing:"0.12em" }}>{earningsCalendar?.ticker||"NVDA"} EARNINGS</span>
          <span style={{ fontSize:18, fontFamily:font.mono, fontWeight:700, color:earningsPosition.window==="earnings event"?C.red:earningsPosition.window==="pre-earnings drift"?C.amber:earningsPosition.window==="post-earnings drift"?C.cyan:C.textDim }}>
            {fmtEarningsLabel(earningsPosition.daysDelta)}
          </span>
          <Badge color={earningsPosition.window==="earnings event"?C.red:earningsPosition.window==="pre-earnings drift"?C.amber:earningsPosition.window==="post-earnings drift"?C.cyan:C.textMuted}>{earningsPosition.window.toUpperCase()}</Badge>
          <span style={{ fontSize:11, fontFamily:font.mono, color:C.textDim }}>{earningsPosition.quarter} · {earningsPosition.date} · {earningsPosition.confirmed?"confirmed":"estimated"}</span>
          {earningsPosition.shifted && <><Badge color={C.amber}>MODE 4 TRIGGER</Badge><span style={{ fontSize:11, fontFamily:font.mono, color:C.amber }}>shifted from {earningsPosition.priorEstimate}</span></>}
        </div>
      </div>}

      <div style={{ padding:"0 24px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {/* Positions list */}
        <Card>
          <SectionHead>Short Option Positions</SectionHead>
          {positions.length === 0 ? (
            <div style={{ padding:"30px 0", textAlign:"center", color:C.textMuted, fontFamily:font.mono }}>
              <div style={{ fontSize:13, marginBottom:6 }}>No short positions in portfolio.</div>
              <div style={{ fontSize:11 }}>Add short covered calls and CSPs in the Portfolio tab.</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {critical.length>0 && <><div style={{ fontSize:10, fontFamily:font.mono, fontWeight:700, color:C.red, letterSpacing:"0.12em", padding:"4px 0" }}>▸ CRITICAL — EXPIRING SOON</div>
              {critical.map(p => <PosRow key={p.id} pos={p} onScan={scanRollOpportunities} scanning={scanLoading} />)}</>}
              {rollWindow.length>0 && <><div style={{ fontSize:10, fontFamily:font.mono, fontWeight:700, color:C.amber, letterSpacing:"0.12em", padding:"4px 0", marginTop:critical.length>0?8:0 }}>▸ ROLL WINDOW — 21 DTE TRIGGER</div>
              {rollWindow.map(p => <PosRow key={p.id} pos={p} onScan={scanRollOpportunities} scanning={scanLoading} />)}</>}
              {monitoring.length>0 && <><div style={{ fontSize:10, fontFamily:font.mono, fontWeight:700, color:C.textMuted, letterSpacing:"0.12em", padding:"4px 0", marginTop:(critical.length>0||rollWindow.length>0)?8:0 }}>▸ MONITORING</div>
              {monitoring.map(p => <PosRow key={p.id} pos={p} onScan={scanRollOpportunities} scanning={scanLoading} />)}</>}
            </div>
          )}
        </Card>

        {/* Scan parameters */}
        <Card style={{ padding:"14px 18px", alignSelf:"start" }}>
          <SectionHead>Scan Parameters</SectionHead>
          <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:"10px 20px", fontSize:12, fontFamily:font.mono }}>
            <span style={{ color:C.textMuted }}>Roll Direction</span><span>Up and Out (higher strike, later expiration)</span>
            <span style={{ color:C.textMuted }}>Max DTE</span><span>45 days from today</span>
            <span style={{ color:C.textMuted }}>Max Delta</span><span style={{ color:C.accent }}>≤ 0.22 (≈78% OTM probability)</span>
            <span style={{ color:C.textMuted }}>Credit Standard</span><span style={{ color:C.amber }}>Net credit required; 50% of original = QUALIFYING</span>
            <span style={{ color:C.textMuted }}>Execution Window</span><span>Tuesday Amateur Hour (9:30-10:00 AM) preferred</span>
          </div>
          <Divider />
          <SectionHead>How It Works</SectionHead>
          <div style={{ display:"flex", flexDirection:"column", gap:8, fontSize:12, fontFamily:font.mono, color:C.textDim, lineHeight:1.5 }}>
            {[["1.",C.cyan,"Add equity holdings in the Portfolio tab — they populate the ticker dropdown above"],["2.",C.purple,"Select a ticker and click Analyze Range — runs OI walls, insider sales, and 13F in sequence, then synthesizes"],["3.",C.purple,"Output leads with the summary (floor, ceiling, entry zone, target, stop, R/R) followed by source data"],["4.",C.cyan,"Click Scan on any short option position for individual roll analysis, or Scan All Rolls for a full sweep"],["5.",C.amber,"Mode 4 Calendar Correction triggers are automatically detected from the Macro earnings calendar"]].map(([n,c,t]) => <div key={n} style={{ display:"flex", gap:8 }}><span style={{ color:c, flexShrink:0 }}>{n}</span><span>{t}</span></div>)}
          </div>
        </Card>
      </div>

      {/* Results */}
      <div style={{ padding:"16px 24px 0", display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Card accent={scanResult?C.cyan:null} glow={!!scanResult}>
          <SectionHead right={state.scanResults.rollScans.length>0&&!scanLoading&&<span style={{ fontSize:10, fontFamily:font.mono, color:C.textMuted }}>{state.scanResults.rollScans.length} scan{state.scanResults.rollScans.length!==1?"s":""} saved</span>}>
            {scanTarget?`Roll Analysis — ${scanTarget.underlying} $${scanTarget.strike} ${scanTarget.type}`:"Roll Opportunity Results"}
          </SectionHead>
          {scanLoading && <div style={{ padding:"30px", textAlign:"center" }}>
            <div style={{ color:scanStatus.includes("Rate")?C.amber:C.cyan, fontFamily:font.mono, fontSize:13, marginBottom:8 }}>{scanStatus||(scanTarget?`Scanning ${scanTarget.underlying} options chain...`:"Scanning all positions...")}</div>
            <div style={{ color:C.textMuted, fontFamily:font.mono, fontSize:11 }}>{scanStatus.includes("Rate")?"Auto-retry active — do not close the tab":"Searching buy-to-close prices → finding delta ≤ 0.22 candidates → calculating net credits"}</div>
          </div>}
          {scanResult && !scanLoading && <div style={{ padding:14, background:C.bg, borderRadius:6, border:`1px solid ${C.cyanDim}`, overflowY:"auto", maxHeight:600 }}>
            <MarkdownText text={scanResult} />
          </div>}
          {!scanResult && !scanLoading && <div style={{ padding:"30px", textAlign:"center", color:C.textMuted, fontFamily:font.mono }}>
            <div style={{ fontSize:13, marginBottom:6 }}>No scan results yet.</div>
            <div style={{ fontSize:11, lineHeight:1.5 }}>Click ⚡ Scan on any position for individual analysis,<br />or ⚡ Scan All for a full portfolio sweep.</div>
          </div>}
        </Card>

        <Card accent={gammaResult?C.purple:null} glow={!!gammaResult}>
          <SectionHead right={state.scanResults.gammaWalls&&<span style={{ fontSize:10, fontFamily:font.mono, color:C.textMuted }}>Last: {timeAgo(state.scanResults.gammaWalls.timestamp)}</span>}>
            {gammaResult && !gammaLoading ? `Swing Trade Range — ${selectedTicker}` : "Swing Trade Range"}
          </SectionHead>
          {gammaLoading && <div style={{ padding:"30px", textAlign:"center" }}>
            <div style={{ color:gammaStatus.includes("Rate")?C.amber:C.purple, fontFamily:font.mono, fontSize:13, marginBottom:8 }}>{gammaStatus||"Analyzing..."}</div>
            <div style={{ color:C.textMuted, fontFamily:font.mono, fontSize:11 }}>{gammaStatus.includes("Rate")?"Auto-retry active — do not close the tab":"Fetching OI walls, insider sales, and 13F data, then synthesizing"}</div>
          </div>}
          {gammaResult && !gammaLoading && <div style={{ padding:14, background:C.bg, borderRadius:6, border:`1px solid ${C.purpleDim}`, overflowY:"auto", maxHeight:600 }}>
            <MarkdownText text={gammaResult} />
          </div>}
          {!gammaResult && !gammaLoading && <div style={{ padding:"30px", textAlign:"center", color:C.textMuted, fontFamily:font.mono }}>
            <div style={{ fontSize:13, marginBottom:6 }}>No range data yet.</div>
            <div style={{ fontSize:11, lineHeight:1.5 }}>{equityTickers.length > 0 ? `Select ${equityTickers.join(" or ")} above and click Analyze Range.` : "Add equity holdings in the Portfolio tab, then analyze a ticker."}<br />Output: summary first, source data below.</div>
          </div>}
        </Card>
      </div>

      {/* Scan history */}
      {state.scanResults.rollScans.length>0 && <div style={{ padding:"16px 24px 0" }}>
        <Card>
          <SectionHead right={<div style={{ display:"flex", gap:6 }}>
            <Btn small color={C.textMuted} onClick={() => setShowHistory(!showHistory)}>{showHistory?"Collapse":`History (${state.scanResults.rollScans.length})`}</Btn>
            <Btn small variant="danger" onClick={clearHistory}>Clear</Btn>
          </div>}>Previous Roll Scans</SectionHead>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {state.scanResults.rollScans.map(h => (
              <button key={h.id} onClick={() => { setScanResult(h.text); setScanTarget(null); setShowHistory(false); }} style={{ padding:"6px 12px", borderRadius:6, fontSize:11, fontFamily:font.mono, fontWeight:600, border:`1px solid ${C.border}`, background:C.surface, color:C.textDim, cursor:"pointer", textAlign:"left" }}
                onMouseEnter={e => { e.target.style.borderColor=C.cyan+"60"; e.target.style.color=C.cyan; }}
                onMouseLeave={e => { e.target.style.borderColor=C.border; e.target.style.color=C.textDim; }}>
                <span style={{ color:C.text }}>{h.label}</span><br />
                <span style={{ fontSize:9, color:C.textMuted }}>{timeAgo(h.timestamp)}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>}
    </div>
  );
}

function PosRow({ pos, onScan, scanning }) {
  return <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:C.surface, borderRadius:6, border:`1px solid ${C.border}`, gap:8 }}>
    <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
      <Badge color={C.red}>SHORT</Badge>
      {pos.account && <Badge color={pos.account==="ROTH"?C.blue:C.purple}>{pos.account}</Badge>}
      <span style={{ fontFamily:font.mono, fontWeight:700, fontSize:15, color:C.accent }}>{pos.underlying}</span>
      <span style={{ fontFamily:font.mono, fontSize:13, color:C.textDim }}>${pos.strike} {pos.type}</span>
      <Badge color={C.blue}>{pos.expStr}</Badge>
      <Badge color={pos.dte<=7?C.red:pos.dte<=21?C.amber:C.textMuted}>{pos.dte} DTE</Badge>
      {pos.premium>0 && <span style={{ fontFamily:font.mono, fontSize:12, color:C.textDim }}>opened @ ${pos.premium.toFixed(2)}/sh</span>}
    </div>
    <Btn small color={C.cyan} onClick={() => onScan(pos)} disabled={scanning}>{scanning?"⏳":"⚡ Scan"}</Btn>
  </div>;
}

/* ══════════════════════════════════════════════════════════
   MACRO TAB
══════════════════════════════════════════════════════════ */
function MacroTab({ state, update }) {
  const [selectedForce, setSelectedForce] = useState(null);
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterState, setFilterState] = useState("ALL");
  const [eventLimit, setEventLimit] = useState(10);
  const [chartMode, setChartMode] = useState("price");
  const [updateOpen, setUpdateOpen] = useState(false);
  const [exportToast, setExportToast] = useState({ open:false, success:false, error:"" });

  const payload = state.macroPayload;
  const { composite, forces, events, priceSeries, patterns } = payload;

  const applyUpdate = (newPayload) => {
    update(s => ({ ...s, macroPayload: newPayload, macroMode: "LIVE" }));
    setUpdateOpen(false);
  };

  const exportToClipboard = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); setExportToast({ open:true, success:true, error:"" }); }
    catch (e) { setExportToast({ open:true, success:false, error:e.message }); }
  };

  const resetToBaseline = () => {
    if (!window.confirm("Reset dashboard to baseline data (2026-04-24)?")) return;
    update(s => ({ ...s, macroPayload: DEFAULT_MACRO_PAYLOAD, macroMode: "BASELINE" }));
  };

  const chartData = useMemo(() => {
    const byDate = Object.fromEntries(events.map(e => [e.date,e]));
    return priceSeries.map(p => { const ev = byDate[p.date]; return { ...p, eventCategory:ev?.category, eventForce:ev?.primary_force, eventSigma:ev?.sigma, eventCatalyst:ev?.catalyst, eventMove:ev?.move }; });
  }, [events, priceSeries]);

  const forceContribData = useMemo(() =>
    forces.filter(f => f.state!=="DORMANT"&&f.id!=="F1").map(f => ({ id:f.id, name:f.id, contribution:f.net_ytd_reaction, category:f.category })).sort((a,b) => b.contribution-a.contribution)
  , [forces]);

  const filteredForces = useMemo(() => forces.filter(f => {
    if (filterCategory!=="ALL"&&f.category!==filterCategory) return false;
    if (filterState!=="ALL"&&f.state!==filterState) return false;
    return true;
  }), [forces, filterCategory, filterState]);

  const sortedEvents = useMemo(() => [...events].sort((a,b) => b.date.localeCompare(a.date)), [events]);

  const compColor = composite.composite_score>1?C.accent:composite.composite_score<-1?C.red:C.amber;
  const earningsPosition = useMemo(() => deriveEarningsPosition(payload.earningsCalendar), [payload.earningsCalendar]);
  const updatedAt = payload.updatedAt ? new Date(payload.updatedAt).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}) : payload.asOfDate||composite.date;

  return (
    <div style={{ padding:"0 0 40px" }}>
      {/* Header */}
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", background:C.surface, gap:14, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:12, fontFamily:font.mono, fontWeight:700, color:C.textMuted, letterSpacing:"0.1em" }}>MACRO FORCE DASHBOARD</div>
          <div style={{ fontSize:11, color:C.textMuted, fontFamily:font.mono }}>NVDA Force Attribution & Composite Score</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
            <Badge color={state.macroMode==="LIVE"?C.accent:C.amber} glow={state.macroMode==="LIVE"}>VIEWING: {state.macroMode}</Badge>
            <span style={{ fontSize:10, fontFamily:font.mono, color:C.textMuted }}>{state.macroMode==="LIVE"?"Updated ":"Baseline "}{updatedAt}</span>
          </div>
          <Badge color={compColor} glow>{composite.interpretation.replace("_"," ").toUpperCase()}</Badge>
          <div style={{ display:"flex", gap:6 }}>
            <Btn color={C.blue} onClick={() => setUpdateOpen(true)}>📥 Update</Btn>
            <Btn color={C.cyan} onClick={exportToClipboard}>📤 Export</Btn>
            <Btn small color={C.gray} onClick={resetToBaseline}>↺ Reset</Btn>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding:"20px 24px", display:"grid", gridTemplateColumns:"320px 1fr", gap:20 }}>
        <Card glow accent={compColor} style={{ padding:18 }}>
          <SectionHead>Composite Score</SectionHead>
          <div style={{ display:"flex", justifyContent:"center" }}><CompositeGauge score={composite.composite_score} multiplier={composite.f1_multiplier} /></div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:16 }}>
            <div><div style={{ fontSize:9, fontFamily:font.mono, color:C.textMuted, letterSpacing:"0.1em" }}>BULLISH</div><div style={{ fontSize:16, fontFamily:font.mono, fontWeight:700, color:C.accent }}>+{composite.net_bullish.toFixed(2)}</div></div>
            <div><div style={{ fontSize:9, fontFamily:font.mono, color:C.textMuted, letterSpacing:"0.1em" }}>BEARISH</div><div style={{ fontSize:16, fontFamily:font.mono, fontWeight:700, color:C.red }}>{composite.net_bearish.toFixed(2)}</div></div>
          </div>
        </Card>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ display:"flex", gap:10 }}>
            <StatCard label="Active Forces" value={composite.active_force_count} sub="Currently moving the tape" color={C.accent} big />
            <StatCard label="Attenuating" value={composite.attenuating_force_count} sub="Losing potency" color={C.amber} big />
            <StatCard label="Dormant" value={composite.dormant_force_count} sub="Sleeping" color={C.gray} big />
            <StatCard label="F1 Multiplier" value={`${composite.f1_multiplier.toFixed(2)}×`} sub="Validation amplifier" color={C.pink} big />
          </div>
          <Card style={{ padding:"14px 18px" }}>
            <SectionHead>Top YTD Drivers</SectionHead>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {[...forces].filter(f => f.id!=="F1"&&f.state!=="DORMANT").sort((a,b) => Math.abs(b.net_ytd_reaction)-Math.abs(a.net_ytd_reaction)).slice(0,5).map(f => (
                <div key={f.id} style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontFamily:font.mono, fontWeight:700, color:CAT_COLOR[f.category], fontSize:12, minWidth:28 }}>{f.id}</span>
                  <span style={{ fontFamily:font.sans, fontSize:12, color:C.textDim, flex:1 }}>{f.name}</span>
                  <div style={{ width:200 }}><DirectionalBar value={f.net_ytd_reaction} max={15} /></div>
                  <span style={{ fontFamily:font.mono, fontWeight:700, fontSize:12, color:f.net_ytd_reaction>0?C.accent:C.red, minWidth:60, textAlign:"right" }}>{f.net_ytd_reaction>=0?"+":""}{f.net_ytd_reaction.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </Card>
          <EarningsCard position={earningsPosition} history={payload.earningsCalendar?.history} />
        </div>
      </div>

      {/* Chart */}
      <div style={{ padding:"0 24px 16px" }}>
        <Card>
          <SectionHead right={<div style={{ display:"flex", gap:6 }}>
            <Btn small color={C.blue} active={chartMode==="price"} onClick={() => setChartMode("price")}>NVDA + Events</Btn>
            <Btn small color={C.blue} active={chartMode==="force_contrib"} onClick={() => setChartMode("force_contrib")}>Force Contributions</Btn>
          </div>}>
            {chartMode==="price"?"NVDA YTD with Force-Coded Event Markers":"Per-Force Net YTD Contribution"}
          </SectionHead>
          {chartMode==="price" && <>
            <div style={{ height:320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top:10, right:10, bottom:10, left:0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="date" stroke={C.textMuted} tick={{ fontFamily:font.mono, fontSize:10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis stroke={C.textMuted} tick={{ fontFamily:font.mono, fontSize:10 }} domain={["dataMin - 5","dataMax + 5"]} tickFormatter={v => `$${v}`} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active||!payload?.[0]) return null;
                    const d = payload[0].payload;
                    return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, padding:10, fontFamily:font.mono, fontSize:11, maxWidth:320 }}>
                      <div style={{ color:C.text, fontWeight:700, marginBottom:4 }}>{d.date} · ${d.close.toFixed(2)}</div>
                      {d.eventCategory && <><div style={{ display:"flex", gap:6, marginBottom:4 }}><Badge color={CAT_COLOR[d.eventCategory]}>{d.eventForce}</Badge><span style={{ color:d.eventMove>0?C.accent:C.red, fontWeight:700 }}>{d.eventMove>=0?"+":""}{d.eventMove.toFixed(2)}%</span><span style={{ color:C.textMuted }}>{d.eventSigma.toFixed(2)}σ</span></div><div style={{ color:C.textDim, fontSize:10, lineHeight:1.4 }}>{d.eventCatalyst}</div></>}
                    </div>;
                  }} />
                  <Line type="monotone" dataKey="close" stroke={C.blue} strokeWidth={1.5} dot={<EventDot />} activeDot={false} />
                  {(payload.earningsCalendar?.history||[]).map(h => <ReferenceLine key={`earn-${h.date}`} x={h.date} stroke={C.cyan} strokeDasharray="3 3" strokeOpacity={0.7} label={{ value:`${h.quarter} EARN`, position:"top", fill:C.cyan, fontSize:9, fontFamily:font.mono }} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display:"flex", gap:12, marginTop:10, flexWrap:"wrap", justifyContent:"center", padding:"8px 0", borderTop:`1px solid ${C.border}` }}>
              {Object.entries(CAT_COLOR).map(([cat,col]) => <div key={cat} style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:8, height:8, borderRadius:"50%", background:col }} /><span style={{ fontSize:10, fontFamily:font.mono, color:C.textDim }}>{cat} · {CAT_NAME[cat]}</span></div>)}
              <span style={{ fontSize:10, fontFamily:font.mono, color:C.textMuted, marginLeft:16, fontStyle:"italic" }}>Marker size = |z-score|</span>
            </div>
          </>}
          {chartMode==="force_contrib" && <div style={{ height:320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forceContribData} margin={{ top:10, right:10, bottom:10, left:0 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="id" stroke={C.textMuted} tick={{ fontFamily:font.mono, fontSize:11, fontWeight:700 }} />
                <YAxis stroke={C.textMuted} tick={{ fontFamily:font.mono, fontSize:10 }} />
                <Tooltip contentStyle={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, fontFamily:font.mono, fontSize:11 }} labelStyle={{ color:C.text, fontWeight:700 }} formatter={v => [`${v>=0?"+":""}${v.toFixed(2)}`,"YTD contribution"]} />
                <Bar dataKey="contribution">{forceContribData.map((d,i) => <Cell key={i} fill={d.contribution>0?C.accent:C.red} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>}
        </Card>
      </div>

      {/* Force grid */}
      <div style={{ padding:"0 24px 16px" }}>
        <Card>
          <SectionHead right={<div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, fontFamily:font.mono, color:C.textMuted, alignSelf:"center", letterSpacing:"0.1em" }}>CATEGORY:</span>
            {["ALL","A","B","C","D","E","F"].map(c => <Btn key={c} small color={c==="ALL"?C.blue:(CAT_COLOR[c]||C.blue)} active={filterCategory===c} onClick={() => setFilterCategory(c)}>{c}</Btn>)}
            <span style={{ fontSize:10, fontFamily:font.mono, color:C.textMuted, alignSelf:"center", letterSpacing:"0.1em", marginLeft:10 }}>STATE:</span>
            {["ALL","ACTIVE","ATTENUATING","DORMANT"].map(s => <Btn key={s} small color={s==="ALL"?C.blue:(STATE_COLOR[s]||C.blue)} active={filterState===s} onClick={() => setFilterState(s)}>{s}</Btn>)}
          </div>}>Force Registry — {forces.length} Forces</SectionHead>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:10 }}>
            {filteredForces.map(f => <ForceCard key={f.id} force={f} onClick={() => setSelectedForce(f.id===selectedForce?null:f.id)} selected={selectedForce===f.id} />)}
          </div>
          {filteredForces.length===0 && <div style={{ padding:30, textAlign:"center", color:C.textMuted, fontFamily:font.mono, fontSize:12 }}>No forces match filter.</div>}
        </Card>
      </div>

      {/* Force detail panel */}
      {selectedForce && (() => {
        const force = forces.find(f => f.id===selectedForce);
        if (!force) return null;
        const forceEvents = [...events].filter(e => e.primary_force===selectedForce).sort((a,b) => b.date.localeCompare(a.date));
        const cat = CAT_COLOR[force.category];
        return <div style={{ padding:"0 24px 16px" }}>
          <Card accent={cat} glow>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14, flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                  <span style={{ fontFamily:font.mono, fontSize:16, fontWeight:700, color:cat }}>{force.id}</span>
                  <span style={{ fontFamily:font.sans, fontSize:14, fontWeight:600, color:C.text }}>{force.name}</span>
                  <Badge color={STATE_COLOR[force.state]}>{force.state}</Badge>
                  <Badge color={force.direction_bias==="bullish"?C.accent:force.direction_bias==="bearish"?C.red:C.gray}>{force.direction_bias==="bullish"?"▲":force.direction_bias==="bearish"?"▼":"●"} {force.direction_bias.toUpperCase()}</Badge>
                </div>
                <div style={{ display:"flex", gap:16, fontSize:11, fontFamily:font.mono, color:C.textDim, flexWrap:"wrap" }}>
                  <span>weight <strong style={{ color:C.text }}>{force.weight.toFixed(3)}</strong></span>
                  <span>net YTD <strong style={{ color:force.net_ytd_reaction>0?C.accent:force.net_ytd_reaction<0?C.red:C.gray }}>{force.net_ytd_reaction>=0?"+":""}{force.net_ytd_reaction.toFixed(2)}</strong></span>
                  <span>n={force.events_total} ({force.events_bullish}▲ {force.events_bearish}▼)</span>
                  <span>trend: {force.attenuation_trend}</span>
                  {force.last_event_date && <span>last: {force.last_event_date}</span>}
                </div>
              </div>
              <Btn small color={C.gray} onClick={() => setSelectedForce(null)}>✕ Close</Btn>
            </div>
            {forceEvents.length>0 ? (
              <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:340, overflowY:"auto" }}>
                <div style={{ fontSize:10, fontFamily:font.mono, color:C.textMuted, letterSpacing:"0.1em", marginBottom:2 }}>{forceEvents.length} ATTRIBUTED EVENT{forceEvents.length!==1?"S":""}</div>
                {forceEvents.map(ev => <a key={ev.date} href={ev.source} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}><EventRow ev={ev} /></a>)}
              </div>
            ) : <div style={{ padding:"16px 0", color:C.textMuted, fontFamily:font.mono, fontSize:12 }}>No events attributed to this force.</div>}
          </Card>
        </div>;
      })()}

      {/* Event feed + patterns */}
      <div style={{ padding:"0 24px 16px", display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:16 }}>
        <Card>
          <SectionHead right={<div style={{ display:"flex", gap:6 }}>
            <Btn small color={C.blue} active={eventLimit===10} onClick={() => setEventLimit(10)}>Last 10</Btn>
            <Btn small color={C.blue} active={eventLimit===events.length} onClick={() => setEventLimit(events.length)}>All ({events.length})</Btn>
          </div>}>Event Feed</SectionHead>
          <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:600, overflowY:"auto" }}>
            {sortedEvents.slice(0,eventLimit).map(ev => <a key={ev.date} href={ev.source} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}><EventRow ev={ev} /></a>)}
          </div>
        </Card>
        <Card>
          <SectionHead>Pattern Library</SectionHead>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {patterns.map((p,i) => {
              const sc = p.severity==="bullish"?C.accent:p.severity==="bearish"?C.red:p.severity==="absorbed"?C.amber:C.blue;
              return <div key={i} style={{ background:C.bg, border:`1px solid ${C.border}`, borderLeft:`3px solid ${sc}`, borderRadius:6, padding:"10px 12px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                  <span style={{ fontFamily:font.mono, fontSize:12, fontWeight:700, color:C.text, flex:1 }}>{p.title}</span>
                  <Badge color={sc}>{p.severity.toUpperCase()}</Badge>
                </div>
                <div style={{ fontSize:11, fontFamily:font.sans, color:C.textDim, lineHeight:1.5, marginBottom:6 }}>{p.body}</div>
                <div style={{ fontSize:11, fontFamily:font.sans, color:C.text, lineHeight:1.5, padding:"6px 8px", background:C.surface, borderRadius:4, borderLeft:`2px solid ${sc}` }}>
                  <span style={{ fontFamily:font.mono, fontSize:9, color:sc, letterSpacing:"0.1em" }}>IMPLICATION → </span>{p.implication}
                </div>
              </div>;
            })}
          </div>
        </Card>
      </div>

      {/* Footer */}
      <div style={{ padding:"0 24px" }}>
        <Card style={{ padding:"12px 16px", background:C.surface }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12, fontSize:11, fontFamily:font.mono, color:C.textMuted }}>
            <span><strong style={{ color:C.textDim }}>{events.length}</strong> events · <strong style={{ color:C.textDim }}>{priceSeries.length}</strong> price points · <strong style={{ color:C.textDim }}>{forces.length}</strong> forces</span>
            <span>Schema <code style={{ color:C.blue }}>v{MACRO_SCHEMA}</code> · Refresh: 📤 Export → macro-analyst → 📥 Update</span>
          </div>
        </Card>
      </div>

      <UpdateModal open={updateOpen} onClose={() => setUpdateOpen(false)} currentPayload={payload} onApply={applyUpdate} />
      <ExportToast open={exportToast.open} onClose={() => setExportToast({...exportToast, open:false})} success={exportToast.success} error={exportToast.error} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════════ */
export default function FlywheelPlaybook() {
  const [state, setState] = useState(INITIAL_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(UNIFIED_KEY);
        if (r?.value) {
          const stored = JSON.parse(r.value);
          setState(prev => ({ ...prev, ...stored }));
          setReady(true);
          return;
        }
      } catch {}

      // Migration from old separate keys
      let migrated = { ...INITIAL_STATE };
      try {
        const d = await window.storage.get(OLD_DASH_KEY);
        if (d?.value) {
          const data = JSON.parse(d.value);
          if (data.roth) migrated.roth = data.roth;
          if (data.hsa) migrated.hsa = data.hsa;
          if (data.activeTab) migrated.portfolioTab = data.activeTab;
        }
      } catch {}
      try {
        const m = await window.storage.get(OLD_MACRO_KEY);
        if (m?.value) {
          const data = JSON.parse(m.value);
          const v = validatePayload(JSON.stringify(data));
          if (v.valid) { migrated.macroPayload = v.payload; migrated.macroMode = "LIVE"; }
        }
      } catch {}
      try {
        const rr = await window.storage.get(OLD_RESULTS_KEY);
        if (rr?.value) {
          const data = JSON.parse(rr.value);
          if (data.rollScans) migrated.scanResults.rollScans = data.rollScans;
          if (data.gammaWalls) migrated.scanResults.gammaWalls = data.gammaWalls;
        }
      } catch {}
      setState(migrated);
      setReady(true);
    })();
  }, []);

  const persist = useCallback(async (s) => {
    try { await window.storage.set(UNIFIED_KEY, JSON.stringify(s)); } catch {}
  }, []);

  const update = useCallback((fn) => {
    setState(prev => { const next = fn(prev); persist(next); return next; });
  }, [persist]);

  const setTab = useCallback((tab) => update(s => ({ ...s, tab })), [update]);

  if (!ready) return <div style={{ background:C.bg, minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:C.textDim, fontFamily:font.mono, fontSize:13 }}>Loading Flywheel Playbook...</div>;

  return (
    <div style={{ background:C.bg, minHeight:"100vh", color:C.text, fontFamily:font.sans }}>
      <StatusBar state={state} setTab={setTab} />
      {state.tab === "portfolio" && <PortfolioTab state={state} update={update} />}
      {state.tab === "scanner"   && <ScannerTab  state={state} update={update} />}
      {state.tab === "macro"     && <MacroTab    state={state} update={update} />}
    </div>
  );
}
