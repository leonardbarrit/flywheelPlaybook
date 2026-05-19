import { useState, useEffect, useCallback } from "react";

/* ─── OPTIONS TICKER PARSER ─── */
function parseOptionsTicker(raw) {
  const trimmed = raw.trim().toUpperCase();
  const isShort = trimmed.startsWith("-");
  const clean = isShort ? trimmed.slice(1) : trimmed;
  const m = clean.match(/^([A-Z]{1,6})(\d{6})([CP])(\d+\.?\d*)$/);
  if (!m) return null;
  const [, underlying, ds, cp, st] = m;
  const yr = 2000 + +ds.slice(0, 2), mo = +ds.slice(2, 4), dy = +ds.slice(4, 6);
  const exp = new Date(yr, mo - 1, dy);
  const now = new Date();
  const dte = Math.max(0, Math.ceil((exp - now) / 864e5));
  return {
    direction: isShort ? "SHORT" : "LONG",
    underlying,
    expDate: exp,
    expStr: `${String(mo).padStart(2,"0")}/${String(dy).padStart(2,"0")}/${yr}`,
    type: cp === "C" ? "CALL" : "PUT",
    strike: parseFloat(st),
    dte,
    raw: trimmed,
  };
}

function fmtUSD(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function fmtUSD2(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const STORAGE_KEY = "flywheel-dash-v3";
const MACRO_STORAGE_KEY = "flywheel-macro-v1";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function deriveEarningsPosition(cal, asOfDate) {
  if (!cal?.next?.date) return null;
  const today = asOfDate ? new Date(asOfDate) : new Date();
  const earnings = new Date(cal.next.date);
  const daysDelta = Math.round((earnings - today) / 864e5);
  let window;
  if (daysDelta > 21) window = "outside";
  else if (daysDelta >= 1) window = "pre-earnings drift";
  else if (daysDelta >= -1) window = "earnings event";
  else if (daysDelta >= -10) window = "post-earnings drift";
  else window = "outside";
  return { daysDelta, window, ...cal.next };
}

const EMPTY_ACCOUNT = {
  shares: [],
  options: [],
  pool: { spaxx: 0, premiums: 0, dividends: 0, other: 0 },
  goals: [],
};

const INITIAL = {
  activeTab: "roth",
  roth: JSON.parse(JSON.stringify(EMPTY_ACCOUNT)),
  hsa: JSON.parse(JSON.stringify(EMPTY_ACCOUNT)),
};

/* ─── TIMEFRAMES ─── */
const TIMEFRAMES = {
  immediate: { label: "Immediate", color: "#ef4444", desc: "This week's session — execute or evaluate now" },
  near: { label: "Near-Term", color: "#f59e0b", desc: "This cycle (current 45-DTE window)" },
  long: { label: "Long-Term", color: "#3b82f6", desc: "Multi-cycle strategic milestone" },
  opportunity: { label: "Opportunity", color: "#a855f7", desc: "Conditional — activates when market conditions align" },
};

/* ─── STANDING OBJECTIVES (always understood, never entered as goals) ─── */
const STANDING_ROTH = [
  "Roll CCs at 21 DTE or 50% profit — whichever comes first",
  "Deploy CSPs on qualifying Turnaround Tuesdays (all 5 conditions met)",
  "Execute offensive rolls (Mode 3) during Amateur Hour when bull trap confirmed",
  "Maintain 50% net credit standard on Mode 1/3 rolls",
  "Calendar Correction (Mode 4) — when an earnings date confirmation displaces the original exit catalyst, single-roll limit per displacement, pre-commit a stopping rule before executing, net debit allowed and bounded",
  "Earnings Shield — no CC life spans earnings week unless earnings IS the planned exit catalyst (then Mode 4 governs reschedules)",
  "Defer new CSP entry during pre-earnings drift window (T-21 to T-1) — IV elevated but compensating for binary risk",
  "3% defensive exit on CSPs if underlying breaks strike",
  "SPAXX double-dip: idle collateral always earns sweep yield",
];

const STANDING_HSA = [
  "DRIP all JEPI distributions until 500-share pivot",
  "Pay medical expenses from taxable sources — save receipts",
  "Roll IBIT CCs at 21 DTE or 50% profit (post-pivot)",
  "War regime delay filter — no IBIT pivot before macro assessment",
  "Maintain regime-aligned growth vehicle during accumulation phase",
];

/* ─── PALETTE ─── */
const C = {
  bg: "#080c14",
  surface: "#0f1520",
  card: "#141c2b",
  border: "#1c2740",
  borderHi: "#2a3a58",
  text: "#e2e8f0",
  textDim: "#8494ad",
  textMuted: "#4a5a74",
  accent: "#22c55e",
  accentDim: "#166534",
  amber: "#f59e0b",
  amberDim: "#78350f",
  red: "#ef4444",
  redDim: "#7f1d1d",
  blue: "#3b82f6",
  blueDim: "#1e3a5f",
};

const font = {
  mono: "'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  sans: "'Segoe UI', 'SF Pro Display', system-ui, -apple-system, sans-serif",
};

/* ─── SMALL COMPONENTS ─── */
function Badge({ children, color = C.accent, bg }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontFamily: font.mono, fontWeight: 600, letterSpacing: "0.05em", color, background: bg || color + "18", border: `1px solid ${color}30` }}>
      {children}
    </span>
  );
}

function Btn({ children, onClick, variant = "default", disabled, small, style: sx }) {
  const base = { padding: small ? "4px 10px" : "8px 16px", borderRadius: 6, fontSize: small ? 12 : 13, fontFamily: font.sans, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "1px solid", transition: "all .15s", opacity: disabled ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: 6 };
  const vars = {
    default: { background: C.accent + "15", color: C.accent, borderColor: C.accent + "40" },
    danger: { background: C.red + "15", color: C.red, borderColor: C.red + "40" },
    ghost: { background: "transparent", color: C.textDim, borderColor: C.border },
    amber: { background: C.amber + "15", color: C.amber, borderColor: C.amber + "40" },
    blue: { background: C.blue + "15", color: C.blue, borderColor: C.blue + "40" },
  };
  return <button style={{ ...base, ...vars[variant], ...sx }} onClick={onClick} disabled={disabled}>{children}</button>;
}

function LabeledField({ label, children, hint }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontFamily: font.mono, fontWeight: 600, color: C.textDim, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </label>
      {children}
      {hint && <span style={{ fontSize: 10, color: C.textMuted, fontFamily: font.mono }}>{hint}</span>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", style: sx, mono }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: mono ? font.mono : font.sans, outline: "none", width: "100%", boxSizing: "border-box", ...sx }}
      onFocus={e => e.target.style.borderColor = C.accent + "80"}
      onBlur={e => e.target.style.borderColor = C.border}
    />
  );
}

function InlineEdit({ value, onChange, width = 70, align = "right" }) {
  return (
    <input type="number" value={value} onChange={e => onChange(e.target.value)} step="any"
      style={{ background: C.bg + "80", border: `1px solid transparent`, borderRadius: 4, color: C.text, textAlign: align, width, fontFamily: font.mono, fontSize: 13, outline: "none", padding: "2px 6px" }}
      onFocus={e => { e.target.style.borderColor = C.accent + "60"; e.target.style.background = C.bg; }}
      onBlur={e => { e.target.style.borderColor = "transparent"; e.target.style.background = C.bg + "80"; }}
    />
  );
}

function SectionHead({ children, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontSize: 11, fontFamily: font.mono, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textMuted }}>{children}</h3>
      {right}
    </div>
  );
}

function Card({ children, style: sx }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, ...sx }}>{children}</div>;
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, fontFamily: font.mono, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textMuted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: font.mono, fontWeight: 700, color: color || C.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, fontFamily: font.mono }}>{sub}</div>}
    </div>
  );
}

function ProgressBar({ current, target, color = C.accent }) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return (
    <div style={{ position: "relative", height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width .4s ease" }} />
    </div>
  );
}

/* ─── MAIN ─── */
export default function FlywheelDashboard() {
  const [state, setState] = useState(INITIAL);
  const [ready, setReady] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [showAddShare, setShowAddShare] = useState(false);
  const [showAddOption, setShowAddOption] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editingPool, setEditingPool] = useState(false);

  const [nsTicker, setNsTicker] = useState("");
  const [nsShares, setNsShares] = useState("");
  const [nsCost, setNsCost] = useState("");
  const [nsMktPrice, setNsMktPrice] = useState("");

  const [optionInput, setOptionInput] = useState("");
  const [optionError, setOptionError] = useState("");
  const [optionPreview, setOptionPreview] = useState(null);
  const [noPremium, setNoPremium] = useState("");
  const [noQty, setNoQty] = useState("1");

  const [ngTitle, setNgTitle] = useState("");
  const [ngTarget, setNgTarget] = useState("");
  const [ngCurrent, setNgCurrent] = useState("");
  const [ngNotes, setNgNotes] = useState("");
  const [ngTimeframe, setNgTimeframe] = useState("near");

  const [poolEdits, setPoolEdits] = useState({});
  const [earningsCalendar, setEarningsCalendar] = useState(null);

  const acct = state[state.activeTab];
  const earningsPosition = earningsCalendar ? deriveEarningsPosition(earningsCalendar) : null;

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r?.value) setState(prev => ({ ...prev, ...JSON.parse(r.value) }));
      } catch {}
      try {
        const m = await window.storage.get(MACRO_STORAGE_KEY);
        if (m?.value) {
          const macroState = JSON.parse(m.value);
          if (macroState.earningsCalendar) setEarningsCalendar(macroState.earningsCalendar);
        }
      } catch {}
      setReady(true);
    })();
  }, []);

  const persist = useCallback(async (s) => {
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }, []);

  const update = useCallback((fn) => {
    setState(prev => { const next = fn(prev); persist(next); return next; });
  }, [persist]);

  const setAcct = (tab) => update(s => ({ ...s, activeTab: tab }));
  const updateAcct = useCallback((fn) => { update(s => ({ ...s, [s.activeTab]: fn(s[s.activeTab]) })); }, [update]);

  useEffect(() => {
    if (optionInput.trim().length > 6) {
      const p = parseOptionsTicker(optionInput);
      setOptionPreview(p);
      if (p) setOptionError("");
    } else { setOptionPreview(null); }
  }, [optionInput]);

  const addShare = () => {
    if (!nsTicker || !nsShares) return;
    updateAcct(a => ({ ...a, shares: [...a.shares, { id: uid(), ticker: nsTicker.toUpperCase(), shares: +nsShares, avgCost: +nsCost || 0, mktPrice: +nsMktPrice || 0 }] }));
    setNsTicker(""); setNsShares(""); setNsCost(""); setNsMktPrice(""); setShowAddShare(false);
  };
  const removeShare = (id) => updateAcct(a => ({ ...a, shares: a.shares.filter(s => s.id !== id) }));
  const updateShareField = (id, field, val) => updateAcct(a => ({ ...a, shares: a.shares.map(s => s.id === id ? { ...s, [field]: +val || 0 } : s) }));

  const addOption = () => {
    const parsed = parseOptionsTicker(optionInput);
    if (!parsed) { setOptionError("Could not parse. Check the format guide below."); return; }
    setOptionError("");
    updateAcct(a => ({ ...a, options: [...a.options, { id: uid(), ...parsed, premium: +noPremium || 0, qty: +noQty || 1 }] }));
    setOptionInput(""); setNoPremium(""); setNoQty("1"); setOptionPreview(null); setShowAddOption(false);
  };
  const removeOption = (id) => updateAcct(a => ({ ...a, options: a.options.filter(o => o.id !== id) }));

  const savePool = () => {
    updateAcct(a => ({ ...a, pool: { ...a.pool, ...Object.fromEntries(Object.entries(poolEdits).map(([k, v]) => [k, +v || 0])) } }));
    setEditingPool(false); setPoolEdits({});
  };

  const addGoal = () => {
    if (!ngTitle) return;
    updateAcct(a => ({ ...a, goals: [...a.goals, { id: uid(), title: ngTitle, target: +ngTarget || 0, current: +ngCurrent || 0, notes: ngNotes, timeframe: ngTimeframe, priority: a.goals.length + 1 }] }));
    setNgTitle(""); setNgTarget(""); setNgCurrent(""); setNgNotes(""); setNgTimeframe("near"); setShowAddGoal(false);
  };
  const removeGoal = (id) => updateAcct(a => ({ ...a, goals: a.goals.filter(g => g.id !== id) }));
  const moveGoal = (id, dir) => {
    updateAcct(a => {
      const goals = [...a.goals]; const idx = goals.findIndex(g => g.id === id); const swap = idx + dir;
      if (swap < 0 || swap >= goals.length) return a;
      [goals[idx], goals[swap]] = [goals[swap], goals[idx]];
      return { ...a, goals: goals.map((g, i) => ({ ...g, priority: i + 1 })) };
    });
  };
  const updateGoalField = (id, field, val) => {
    updateAcct(a => ({ ...a, goals: a.goals.map(g => g.id === id ? { ...g, [field]: field === "notes" || field === "title" || field === "timeframe" ? val : (+val || 0) } : g) }));
  };

  const totalSharesValue = acct.shares.reduce((s, h) => s + h.shares * (h.mktPrice || h.avgCost), 0);
  const totalCostBasis = acct.shares.reduce((s, h) => s + h.shares * h.avgCost, 0);
  const totalPool = Object.values(acct.pool).reduce((a, b) => a + b, 0);
  const nvdaShares = acct.shares.filter(s => s.ticker === "NVDA").reduce((a, s) => a + s.shares, 0);
  const nvdaContracts = Math.floor(nvdaShares / 100);
  const jepqShares = acct.shares.filter(s => s.ticker === "JEPQ").reduce((a, s) => a + s.shares, 0);
  const jepiShares = acct.shares.filter(s => s.ticker === "JEPI").reduce((a, s) => a + s.shares, 0);
  const ibitShares = acct.shares.filter(s => s.ticker === "IBIT").reduce((a, s) => a + s.shares, 0);
  const shortCalls = acct.options.filter(o => o.direction === "SHORT" && o.type === "CALL");
  const shortPuts = acct.options.filter(o => o.direction === "SHORT" && o.type === "PUT");
  const activePremium = acct.options.reduce((s, o) => s + o.premium * o.qty * 100, 0);
  const isRoth = state.activeTab === "roth";

  const runAnalysis = async () => {
    setAiLoading(true); setAiResult(null);
    const snap = JSON.stringify({
      account: state.activeTab.toUpperCase(),
      shares: acct.shares.map(s => ({ ticker: s.ticker, qty: s.shares, avgCost: s.avgCost, mktPrice: s.mktPrice })),
      options: acct.options.map(o => ({ position: o.raw, type: o.type, strike: o.strike, exp: o.expStr, dte: o.dte, direction: o.direction, premium: o.premium, qty: o.qty })),
      capitalPool: acct.pool,
      goals: acct.goals.map(g => ({ priority: g.priority, title: g.title, target: g.target, current: g.current, notes: g.notes, timeframe: g.timeframe || "near" })),
      standingObjectives: isRoth ? STANDING_ROTH : STANDING_HSA,
      keyMetrics: isRoth ? { nvdaContracts, jepqShares, totalPool, activePremium } : { jepiShares, ibitShares, totalPool },
      earningsCalendar: earningsCalendar || null,
      earningsPosition: earningsPosition || null,
    }, null, 2);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1800,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          system: `You are an AI analyst embedded in the Flywheel Playbook dashboard — a covered call income system operating in tax-advantaged accounts (Roth IRA and HSA). The methodology uses NVDA as the primary vehicle in the Roth with JEPQ as income stabilizer, and JEPI/IBIT in the HSA. Key concepts: Double Barrier strike selection (ascending channel projection + 0.20 delta), 45-DTE covered calls, Turnaround Tuesday 2-DTE CSPs, the 50% net credit roll standard, and contract count expansion as the compounding engine. Scaling roadmap: Phase 1 = 5 NVDA contracts, Phase 2 = 1500 JEPQ shares, Phase 3 = 10 NVDA contracts. HSA milestones: 250/500/1000/1500 JEPI shares, 500 triggers IBIT pivot.

COVERED CALL ROLL MODES:
- Mode 1 (Income Generation): 45-DTE entry, double-barrier strike, manage at 50% profit OR roll at 21 DTE
- Mode 2 (Planned Directional Exit): bearish-conviction trigger, ATM/ITM strike, assignment is the planned outcome
- Mode 3 (Offensive Roll): bull-trap rally response, Amateur Hour execution, requires 50% net credit
- Mode 4 (Calendar Correction): exogenous calendar shift (typically earnings date confirmation) displaces the original exit catalyst out of contract life. Authorization requires: (a) original strike+DTE was selected with a specific volatility catalyst as planned exit mechanism, (b) catalyst date confirmed to move outside current DTE, (c) new DTE places catalyst back inside contract life, (d) net debit is bounded. Mode 4 EXPLICITLY ACCEPTS net debit — the 50% net credit standard does NOT apply. Discipline rules: single-roll limit per displaced catalyst (no recursive Mode 4), pre-committed stopping rule before execution, bounded debit relative to realistic premium recovery.

EARNINGS CALENDAR AWARENESS:
NVDA earnings is a planned-volatility window that drives strike+DTE selection. Three operational windows:
- Pre-earnings drift (T-21 to T-1): bullish bias from positioning + IV ramp; CCs already written may go ITM; CSP entry quality DEGRADES (defer new CSP capital deployment)
- Earnings event (T ± 1): binary catalyst — no new short premium entry, existing positions exposed to gap risk
- Post-earnings drift (T+1 to T+10): direction set by print, IV crush dominant on short-vol side; re-entry window for both CCs and CSPs; Turnaround Tuesday setups can form
- Outside window (T+11 onward): standard playbook execution

If the input includes \`earningsCalendar.next.shifted: true\`, NVDA IR has confirmed a date that differs from the prior estimate. This is a Mode 4 trigger for any open NVDA short call whose original DTE assumed the prior catalyst date as exit mechanism. Surface this prominently in your analysis.

STANDING OBJECTIVES are always active and never need to be stated as goals — they are the operating rules of the system (CC rolls, CSP deployment conditions, defensive exits, etc.). Do not recommend them as actions; they are already understood.

USER GOALS have timeframes:
- "immediate": This week's trading session — evaluate or execute now
- "near": This 45-DTE cycle — active within the current position window
- "long": Multi-cycle strategic milestones — months to years
- "opportunity": Conditional goals that activate only when specific market conditions align (e.g., swing trade entries, regime pivots)

Analyze the portfolio against goals. Use web search to check current prices, IV environment, and verify the next NVDA earnings date if not already confirmed. Provide: 1) Portfolio status assessment, including current earnings calendar position and any Mode 4 implications for open NVDA CCs. 2) Goal priority analysis — should the current ordering change given market conditions and the earnings window? Flag any "opportunity" goals whose conditions may now be met. 3) Specific next actions ranked by impact, organized by timeframe. Be concise and direct. Use the practitioner vocabulary from the methodology.`,
          messages: [{ role: "user", content: `Current portfolio state:\n${snap}\n\nAnalyze this portfolio against my goals. Search for current NVDA, JEPQ, JEPI prices and IV levels. Verify the next NVDA earnings date and flag any Mode 4 Calendar Correction implications for open NVDA short calls. Should I reprioritize my goals given current market conditions and the earnings calendar window? What are my highest-impact next actions?` }],
        }),
      });
      const data = await resp.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "No analysis returned.";
      setAiResult(text);
    } catch (err) { setAiResult("Analysis failed: " + err.message); }
    setAiLoading(false);
  };

  const resetAccount = () => {
    if (!confirm(`Reset all ${state.activeTab.toUpperCase()} data?`)) return;
    update(s => ({ ...s, [s.activeTab]: JSON.parse(JSON.stringify(EMPTY_ACCOUNT)) }));
    setAiResult(null);
  };

  if (!ready) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontFamily: font.mono }}>Loading...</div>;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: font.sans, padding: "0 0 40px" }}>

      {/* HEADER */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.surface }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: font.mono, letterSpacing: "0.06em", color: C.accent }}>FLYWHEEL PLAYBOOK</div>
          <div style={{ fontSize: 11, color: C.textMuted, fontFamily: font.mono, marginTop: 2 }}>Portfolio Command Center</div>
        </div>
        <div style={{ display: "flex", gap: 2, background: C.bg, borderRadius: 8, padding: 3, border: `1px solid ${C.border}` }}>
          {["roth", "hsa"].map(tab => (
            <button key={tab} onClick={() => setAcct(tab)} style={{ padding: "8px 20px", borderRadius: 6, fontSize: 12, fontFamily: font.mono, fontWeight: 700, letterSpacing: "0.08em", border: "none", cursor: "pointer", background: state.activeTab === tab ? C.accent + "20" : "transparent", color: state.activeTab === tab ? C.accent : C.textMuted }}>
              {tab === "roth" ? "ROTH IRA" : "HSA"}
            </button>
          ))}
        </div>
      </div>

      {/* STATS */}
      <div style={{ padding: "16px 24px", display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard label="Portfolio Value" value={fmtUSD(totalSharesValue)} sub={`Cost basis: ${fmtUSD(totalCostBasis)}`} />
        {isRoth ? (<>
          <StatCard label="NVDA Contracts" value={nvdaContracts} sub={`${nvdaShares} shares`} color={C.accent} />
          <StatCard label="JEPQ Shares" value={jepqShares.toLocaleString()} sub={jepqShares >= 1500 ? "TARGET MET" : `→ 1,500`} color={jepqShares >= 1500 ? C.accent : C.amber} />
        </>) : (<>
          <StatCard label="JEPI Shares" value={jepiShares.toLocaleString()} sub={jepiShares >= 500 ? "PIVOT READY" : `→ 500`} color={jepiShares >= 500 ? C.accent : C.amber} />
          <StatCard label="IBIT Shares" value={ibitShares.toLocaleString()} sub={ibitShares > 0 ? "Active" : "Pre-pivot"} color={ibitShares > 0 ? C.accent : C.textMuted} />
        </>)}
        <StatCard label="Capital Pool" value={fmtUSD(totalPool)} sub="Deployable" color={C.blue} />
        <StatCard label="Active Premium" value={fmtUSD(activePremium)} sub={`${shortCalls.length} CCs · ${shortPuts.length} CSPs`} color={C.accent} />
        {isRoth && earningsPosition && (
          <StatCard
            label="NVDA Earnings"
            value={earningsPosition.daysDelta > 0 ? `T-${earningsPosition.daysDelta}` : earningsPosition.daysDelta < 0 ? `T+${Math.abs(earningsPosition.daysDelta)}` : "T-0"}
            sub={`${earningsPosition.window} · ${earningsPosition.date}`}
            color={
              earningsPosition.window === "earnings event" ? C.red
              : earningsPosition.window === "pre-earnings drift" ? C.amber
              : earningsPosition.window === "post-earnings drift" ? C.blue
              : C.textDim
            }
          />
        )}
      </div>

      {/* MODE 4 TRIGGER BANNER */}
      {isRoth && earningsPosition?.shifted && (
        <div style={{ padding: "0 24px 16px" }}>
          <div style={{
            padding: "12px 18px", background: C.amberDim + "30", border: `1px solid ${C.amber}50`, borderRadius: 8,
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <Badge color={C.amber}>MODE 4 TRIGGER</Badge>
            <span style={{ fontSize: 12, fontFamily: font.mono, color: C.text }}>
              NVDA earnings shifted from <strong style={{ color: C.amber }}>{earningsPosition.priorEstimate}</strong> to <strong style={{ color: C.amber }}>{earningsPosition.date}</strong> (confirmed {earningsPosition.confirmedAt})
            </span>
            <span style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim }}>
              · Open NVDA CCs whose original DTE assumed the prior date are Calendar Correction candidates — run roll scanner.
            </span>
          </div>
        </div>
      )}

      {/* ROADMAP */}
      <div style={{ padding: "0 24px 16px" }}>
        <Card style={{ padding: "14px 20px" }}>
          <SectionHead>{isRoth ? "Scaling Roadmap" : "HSA Milestones"}</SectionHead>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {(isRoth
              ? [{ label: "Phase 1: 5 Contracts", current: nvdaContracts, target: 5 }, { label: "Phase 2: 1,500 JEPQ", current: jepqShares, target: 1500 }, { label: "Phase 3: 10 Contracts", current: nvdaContracts, target: 10 }]
              : [{ label: "250 JEPI", current: jepiShares, target: 250 }, { label: "500 JEPI (Pivot)", current: jepiShares, target: 500 }, { label: "1,000 JEPI", current: jepiShares, target: 1000 }, { label: "1,500 JEPI", current: jepiShares, target: 1500 }]
            ).map((p, i) => (
              <div key={i} style={{ flex: 1, minWidth: 160 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim }}>{p.label}</span>
                  <span style={{ fontSize: 11, fontFamily: font.mono, color: p.current >= p.target ? C.accent : C.amber }}>{p.current}/{p.target}</span>
                </div>
                <ProgressBar current={p.current} target={p.target} color={p.current >= p.target ? C.accent : C.amber} />
              </div>
            ))}
          </div>
        </Card>
      </div>


      {/* MAIN GRID — Left: all data entry. Right: AI analysis */}
      <div style={{ padding: "0 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

        {/* ═══ LEFT COLUMN ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* EQUITIES */}
          <Card>
            <SectionHead right={<Btn small onClick={() => setShowAddShare(!showAddShare)}>{showAddShare ? "Cancel" : "+ Add Equity Position"}</Btn>}>
              Equity Holdings
            </SectionHead>

            {showAddShare && (
              <div style={{ marginBottom: 16, padding: 16, background: C.bg, borderRadius: 8, border: `1px solid ${C.accent}30` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 12, fontFamily: font.mono }}>NEW EQUITY POSITION</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <LabeledField label="Ticker Symbol" hint="e.g. NVDA, JEPQ, JEPI, IBIT">
                    <Input value={nsTicker} onChange={setNsTicker} placeholder="NVDA" mono />
                  </LabeledField>
                  <LabeledField label="Number of Shares" hint="Whole shares held in this account">
                    <Input value={nsShares} onChange={setNsShares} placeholder="100" type="number" mono />
                  </LabeledField>
                  <LabeledField label="Average Cost Basis" hint="Your per-share cost basis">
                    <Input value={nsCost} onChange={setNsCost} placeholder="135.00" type="number" mono />
                  </LabeledField>
                  <LabeledField label="Current Market Price" hint="Today's per-share price (editable later)">
                    <Input value={nsMktPrice} onChange={setNsMktPrice} placeholder="180.00" type="number" mono />
                  </LabeledField>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <Btn onClick={addShare} disabled={!nsTicker || !nsShares}>Save Position</Btn>
                  <Btn variant="ghost" onClick={() => setShowAddShare(false)}>Cancel</Btn>
                </div>
              </div>
            )}

            {acct.shares.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: C.textMuted, fontFamily: font.mono }}>
                <div style={{ fontSize: 13, marginBottom: 4 }}>No equity positions entered yet.</div>
                <div style={{ fontSize: 11 }}>Click "+ Add Equity Position" above to start.</div>
              </div>
            ) : (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "70px 60px 80px 80px 90px 80px 30px", gap: 4, padding: "4px 8px", borderBottom: `1px solid ${C.border}` }}>
                  {["Ticker", "Shares", "Avg Cost", "Mkt Price", "Value", "P/L", ""].map((h, i) => (
                    <span key={i} style={{ fontSize: 10, fontFamily: font.mono, fontWeight: 600, color: C.textMuted, letterSpacing: "0.1em", textAlign: i === 0 ? "left" : "right" }}>{h}</span>
                  ))}
                </div>
                {acct.shares.map(s => {
                  const val = s.shares * (s.mktPrice || s.avgCost);
                  const pl = s.mktPrice && s.avgCost ? (s.mktPrice - s.avgCost) * s.shares : 0;
                  return (
                    <div key={s.id} style={{ display: "grid", gridTemplateColumns: "70px 60px 80px 80px 90px 80px 30px", gap: 4, padding: "8px", borderBottom: `1px solid ${C.border}15`, alignItems: "center" }}>
                      <span style={{ fontFamily: font.mono, fontWeight: 700, color: C.accent, fontSize: 13 }}>{s.ticker}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 13, textAlign: "right" }}>{s.shares}</span>
                      <div style={{ textAlign: "right" }}><InlineEdit value={s.avgCost} onChange={v => updateShareField(s.id, "avgCost", v)} /></div>
                      <div style={{ textAlign: "right" }}><InlineEdit value={s.mktPrice} onChange={v => updateShareField(s.id, "mktPrice", v)} /></div>
                      <span style={{ fontFamily: font.mono, fontSize: 13, textAlign: "right" }}>{fmtUSD(val)}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 13, textAlign: "right", color: pl >= 0 ? C.accent : C.red }}>{pl !== 0 ? (pl > 0 ? "+" : "") + fmtUSD(pl) : "—"}</span>
                      <button onClick={() => removeShare(s.id)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 13, textAlign: "right", padding: 0 }}>✕</button>
                    </div>
                  );
                })}
                <div style={{ fontSize: 10, color: C.textMuted, fontFamily: font.mono, padding: "8px 8px 0", fontStyle: "italic" }}>
                  Click any Avg Cost or Mkt Price value to edit it inline.
                </div>
              </div>
            )}
          </Card>

          {/* OPTIONS */}
          <Card>
            <SectionHead right={<Btn small onClick={() => setShowAddOption(!showAddOption)}>{showAddOption ? "Cancel" : "+ Add Option"}</Btn>}>
              Options Positions
            </SectionHead>

            {showAddOption && (
              <div style={{ marginBottom: 16, padding: 16, background: C.bg, borderRadius: 8, border: `1px solid ${C.accent}30` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 12, fontFamily: font.mono }}>NEW OPTIONS POSITION</div>
                <LabeledField label="Options Ticker String">
                  <Input value={optionInput} onChange={setOptionInput} placeholder="-NVDA260417C200" mono style={{ fontSize: 16, padding: "10px 12px", letterSpacing: "0.05em" }} />
                </LabeledField>
                <div style={{ margin: "12px 0", padding: 14, background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim, marginBottom: 10, fontWeight: 700, letterSpacing: "0.08em" }}>FORMAT GUIDE</div>
                  <div style={{ fontFamily: font.mono, fontSize: 18, marginBottom: 10, letterSpacing: "0.06em" }}>
                    <span style={{ color: C.red, fontWeight: 700 }}>–</span><span style={{ color: C.accent, fontWeight: 700 }}>NVDA</span><span style={{ color: C.amber }}>260417</span><span style={{ color: C.blue, fontWeight: 700 }}>C</span><span style={{ color: C.text }}>200</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "6px 16px", fontSize: 12, fontFamily: font.mono }}>
                    <span style={{ color: C.red, fontWeight: 600 }}>– (dash)</span><span style={{ color: C.textDim }}>Short position. Omit for long.</span>
                    <span style={{ color: C.accent, fontWeight: 600 }}>NVDA</span><span style={{ color: C.textDim }}>Underlying ticker (1–6 letters)</span>
                    <span style={{ color: C.amber, fontWeight: 600 }}>260417</span><span style={{ color: C.textDim }}>Expiration: YYMMDD → Apr 17, 2026</span>
                    <span style={{ color: C.blue, fontWeight: 600 }}>C or P</span><span style={{ color: C.textDim }}>Call or Put</span>
                    <span style={{ color: C.text, fontWeight: 600 }}>200</span><span style={{ color: C.textDim }}>Strike price ($200)</span>
                  </div>
                </div>
                {optionPreview && (
                  <div style={{ margin: "0 0 12px", padding: 12, background: C.accentDim + "30", borderRadius: 8, border: `1px solid ${C.accent}40` }}>
                    <div style={{ fontSize: 10, fontFamily: font.mono, color: C.accent, marginBottom: 6, fontWeight: 700, letterSpacing: "0.1em" }}>✓ PARSED SUCCESSFULLY</div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <Badge color={optionPreview.direction === "SHORT" ? C.red : C.accent} bg={optionPreview.direction === "SHORT" ? C.redDim : C.accentDim}>{optionPreview.direction}</Badge>
                      <span style={{ fontFamily: font.mono, fontWeight: 700, fontSize: 15 }}>{optionPreview.underlying}</span>
                      <span style={{ fontFamily: font.mono, color: C.text, fontSize: 14 }}>${optionPreview.strike} {optionPreview.type}</span>
                      <Badge color={C.blue}>{optionPreview.expStr}</Badge>
                      <Badge color={optionPreview.dte <= 7 ? C.amber : C.textDim}>{optionPreview.dte} DTE</Badge>
                    </div>
                  </div>
                )}
                {optionError && (
                  <div style={{ color: C.red, fontSize: 12, fontFamily: font.mono, margin: "0 0 12px", padding: 10, background: C.redDim + "30", borderRadius: 6 }}>⚠ {optionError}</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <LabeledField label="Premium Received (per share)" hint="e.g. 3.50 = $350 per contract">
                    <Input value={noPremium} onChange={setNoPremium} placeholder="3.50" type="number" mono />
                  </LabeledField>
                  <LabeledField label="Number of Contracts" hint="1 contract = 100 shares">
                    <Input value={noQty} onChange={setNoQty} placeholder="1" type="number" mono />
                  </LabeledField>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <Btn onClick={addOption} disabled={!optionPreview}>Save Option</Btn>
                  <Btn variant="ghost" onClick={() => { setShowAddOption(false); setOptionError(""); setOptionPreview(null); }}>Cancel</Btn>
                </div>
              </div>
            )}

            {acct.options.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: C.textMuted, fontFamily: font.mono }}>
                <div style={{ fontSize: 13, marginBottom: 4 }}>No options positions entered yet.</div>
                <div style={{ fontSize: 11 }}>Click "+ Add Option" and enter the ticker string.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {acct.options.map(o => (
                  <div key={o.id} style={{ padding: "10px 12px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Badge color={o.direction === "SHORT" ? C.red : C.accent} bg={o.direction === "SHORT" ? C.redDim : C.accentDim}>{o.direction}</Badge>
                        <span style={{ fontFamily: font.mono, fontWeight: 700, fontSize: 14 }}>{o.underlying}</span>
                        <span style={{ fontFamily: font.mono, fontSize: 13, color: C.textDim }}>${o.strike} {o.type}</span>
                        <Badge color={C.blue}>{o.expStr}</Badge>
                        <Badge color={o.dte <= 7 ? C.amber : o.dte <= 21 ? C.blue : C.textDim}>{o.dte} DTE</Badge>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: font.mono, fontSize: 12, color: C.textDim }}>x{o.qty} @ {fmtUSD2(o.premium)}/sh</span>
                        <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: C.accent }}>{fmtUSD(o.premium * o.qty * 100)}</span>
                        <button onClick={() => removeOption(o.id)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 14 }}>✕</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textMuted, marginTop: 4 }}>{o.raw}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* GOALS */}
          <Card>
            <SectionHead right={<Btn small variant="amber" onClick={() => setShowAddGoal(!showAddGoal)}>{showAddGoal ? "Cancel" : "+ Add Goal"}</Btn>}>
              Goals & Priorities
            </SectionHead>

            {showAddGoal && (
              <div style={{ marginBottom: 16, padding: 16, background: C.bg, borderRadius: 8, border: `1px solid ${C.amber}30` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 12, fontFamily: font.mono }}>NEW GOAL</div>
                <LabeledField label="Timeframe">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Object.entries(TIMEFRAMES).map(([key, tf]) => (
                      <button key={key} onClick={() => setNgTimeframe(key)} style={{
                        padding: "6px 14px", borderRadius: 6, fontSize: 12, fontFamily: font.mono, fontWeight: 600,
                        border: `1px solid ${ngTimeframe === key ? tf.color : C.border}`,
                        background: ngTimeframe === key ? tf.color + "20" : "transparent",
                        color: ngTimeframe === key ? tf.color : C.textMuted, cursor: "pointer",
                      }}>{tf.label}</button>
                    ))}
                  </div>
                </LabeledField>
                <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textMuted, marginTop: 2, marginBottom: 12 }}>{TIMEFRAMES[ngTimeframe].desc}</div>
                <LabeledField label="Goal Description" hint="What milestone are you working toward?">
                  <Input value={ngTitle} onChange={setNgTitle} placeholder={
                    ngTimeframe === "immediate" ? "Evaluate roll on NVDA $200 CC — 18 DTE" :
                    ngTimeframe === "near" ? "Accumulate 100 JEPQ shares from premium income" :
                    ngTimeframe === "long" ? "Scale to 5 NVDA covered call contracts" :
                    "Enter swing trade if NVDA touches $173 ascending channel floor"
                  } />
                </LabeledField>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                  <LabeledField label="Target Value" hint="The number you're aiming for">
                    <Input value={ngTarget} onChange={setNgTarget} placeholder="5" type="number" mono />
                  </LabeledField>
                  <LabeledField label="Current Value" hint="Where you are right now">
                    <Input value={ngCurrent} onChange={setNgCurrent} placeholder="2" type="number" mono />
                  </LabeledField>
                </div>
                <div style={{ marginTop: 12 }}>
                  <LabeledField label="Notes (optional)" hint="Context, trigger conditions, or dependencies">
                    <Input value={ngNotes} onChange={setNgNotes} placeholder={ngTimeframe === "opportunity" ? "Trigger: ascending channel support + macro neutral-to-bullish" : "Additional context"} />
                  </LabeledField>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <Btn variant="amber" onClick={addGoal} disabled={!ngTitle}>Save Goal</Btn>
                  <Btn variant="ghost" onClick={() => setShowAddGoal(false)}>Cancel</Btn>
                </div>
              </div>
            )}

            {acct.goals.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: C.textMuted, fontFamily: font.mono }}>
                <div style={{ fontSize: 13, marginBottom: 4 }}>No goals set yet.</div>
                <div style={{ fontSize: 11 }}>Standing objectives are always understood. Add strategic milestones here.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {acct.goals.map((g, i) => {
                  const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
                  const done = pct >= 100;
                  const tf = TIMEFRAMES[g.timeframe] || TIMEFRAMES.near;
                  return (
                    <div key={g.id} style={{ padding: "12px", background: C.bg, borderRadius: 8, border: `1px solid ${done ? C.accent + "40" : C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: C.amber, background: C.amberDim + "40", padding: "2px 6px", borderRadius: 4, minWidth: 24, textAlign: "center" }}>#{g.priority}</span>
                          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontFamily: font.mono, fontWeight: 700, letterSpacing: "0.06em", color: tf.color, background: tf.color + "18", border: `1px solid ${tf.color}30`, textTransform: "uppercase", cursor: "pointer" }}
                            onClick={() => { const keys = Object.keys(TIMEFRAMES); const next = keys[(keys.indexOf(g.timeframe || "near") + 1) % keys.length]; updateGoalField(g.id, "timeframe", next); }}
                            title="Click to cycle timeframe">{tf.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: done ? C.accent : C.text }}>{g.title}</span>
                        </div>
                        <div style={{ display: "flex", gap: 2 }}>
                          <button onClick={() => moveGoal(g.id, -1)} disabled={i === 0} style={{ background: "none", border: "none", color: i === 0 ? C.textMuted + "40" : C.textMuted, cursor: "pointer", fontSize: 13, padding: "2px 5px" }}>▲</button>
                          <button onClick={() => moveGoal(g.id, 1)} disabled={i === acct.goals.length - 1} style={{ background: "none", border: "none", color: i === acct.goals.length - 1 ? C.textMuted + "40" : C.textMuted, cursor: "pointer", fontSize: 13, padding: "2px 5px" }}>▼</button>
                          <button onClick={() => removeGoal(g.id)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 13, padding: "2px 5px" }}>✕</button>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <div style={{ flex: 1 }}><ProgressBar current={g.current} target={g.target} color={done ? C.accent : tf.color} /></div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 2, minWidth: 80, justifyContent: "flex-end" }}>
                          <InlineEdit value={g.current} onChange={v => updateGoalField(g.id, "current", v)} width={36} />
                          <span style={{ fontFamily: font.mono, fontSize: 11, color: C.textMuted }}>/ {g.target}</span>
                        </div>
                        <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: done ? C.accent : tf.color, minWidth: 36, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                      </div>
                      {g.notes && <div style={{ fontSize: 11, color: C.textMuted, fontFamily: font.mono, marginTop: 2 }}>{g.notes}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* STANDING OBJECTIVES */}
          <Card style={{ padding: "14px 20px" }}>
            <SectionHead>Standing Objectives (Always Active)</SectionHead>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(isRoth ? STANDING_ROTH : STANDING_HSA).map((obj, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0" }}>
                  <span style={{ color: C.accent, fontSize: 11, fontFamily: font.mono, marginTop: 1, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 12, fontFamily: font.mono, color: C.textDim, lineHeight: 1.4 }}>{obj}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* SPAXX BALANCE */}
          <Card style={{ padding: "14px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: font.mono, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>SPAXX Sweep Balance</div>
                <div style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted }}>Cash earning ~4% while collateralizing positions</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, fontFamily: font.mono, color: C.textMuted }}>$</span>
                <InlineEdit value={acct.pool.spaxx} onChange={v => updateAcct(a => ({ ...a, pool: { ...a.pool, spaxx: +v || 0 } }))} width={90} />
              </div>
            </div>
          </Card>
        </div>

        {/* ═══ RIGHT COLUMN: AI Analysis ═══ */}
        <div style={{ position: "sticky", top: 16, alignSelf: "start" }}>
          <Card>
            <SectionHead right={
              <div style={{ display: "flex", gap: 8 }}>
                <Btn small variant="danger" onClick={resetAccount}>Reset {state.activeTab.toUpperCase()}</Btn>
                <Btn variant="blue" onClick={runAnalysis} disabled={aiLoading}>{aiLoading ? "⏳ Analyzing..." : "⚡ Run AI Analysis"}</Btn>
              </div>
            }>AI Market Analysis & Goal Priority</SectionHead>
            {aiLoading && (
              <div style={{ padding: "30px", textAlign: "center" }}>
                <div style={{ color: C.blue, fontFamily: font.mono, fontSize: 13, marginBottom: 8 }}>Searching current market data and analyzing portfolio...</div>
                <div style={{ color: C.textMuted, fontFamily: font.mono, fontSize: 11 }}>Checking prices, IV environment, and macro calendar</div>
              </div>
            )}
            {aiResult && !aiLoading && (
              <div style={{ padding: "16px", background: C.bg, borderRadius: 8, border: `1px solid ${C.blueDim}`, whiteSpace: "pre-wrap", fontSize: 13, fontFamily: font.sans, lineHeight: 1.7, color: C.text, overflowY: "auto" }}>{aiResult}</div>
            )}
            {!aiResult && !aiLoading && (
              <div style={{ padding: "30px", textAlign: "center" }}>
                <div style={{ color: C.textMuted, fontSize: 13, fontFamily: font.mono, marginBottom: 8 }}>Enter your positions and goals, then run analysis.</div>
                <div style={{ color: C.textMuted, fontSize: 11, fontFamily: font.mono, lineHeight: 1.6 }}>
                  The AI will search current market data (prices, IV, macro calendar)<br />
                  and evaluate whether your goal priorities should shift.
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
