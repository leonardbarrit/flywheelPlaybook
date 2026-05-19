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
  return { direction: isShort ? "SHORT" : "LONG", underlying, expStr: `${String(mo).padStart(2,"0")}/${String(dy).padStart(2,"0")}/${yr}`, type: cp === "C" ? "CALL" : "PUT", strike: parseFloat(st), dte, raw: trimmed };
}

const DASHBOARD_KEY = "flywheel-dash-v4";
const SCANNER_KEY = "flywheel-scanner-v2";
const RESULTS_KEY = "flywheel-results-v2";
const MACRO_STORAGE_KEY = "flywheel-macro-v2";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtTime = (ts) => { const d = new Date(ts); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };
const timeAgo = (ts) => { const mins = Math.floor((Date.now() - ts) / 60000); if (mins < 60) return `${mins}m ago`; const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`; return `${Math.floor(hrs / 24)}d ago`; };

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

/* ─── PALETTE — terminal green-on-dark with amber warnings ─── */
const C = {
  bg: "#06090f",
  surface: "#0c1018",
  card: "#111822",
  border: "#1a2435",
  borderHi: "#243048",
  text: "#d4dce8",
  textDim: "#7a8da6",
  textMuted: "#3e5068",
  green: "#00e676",
  greenDim: "#004d25",
  amber: "#ffab00",
  amberDim: "#5c3d00",
  red: "#ff5252",
  redDim: "#5c1a1a",
  blue: "#448aff",
  blueDim: "#1a3366",
  purple: "#b388ff",
  purpleDim: "#3a2266",
  cyan: "#18ffff",
  cyanDim: "#004d4d",
};

const font = {
  mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', monospace",
  sans: "'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
};

/* ─── COMPONENTS ─── */
function Btn({ children, onClick, color = C.green, disabled, small, style: sx }) {
  return <button onClick={onClick} disabled={disabled} style={{
    padding: small ? "4px 10px" : "9px 18px", borderRadius: 5, fontSize: small ? 11 : 13,
    fontFamily: font.mono, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
    border: `1px solid ${color}50`, background: color + "12", color,
    opacity: disabled ? 0.35 : 1, transition: "all .15s", letterSpacing: "0.03em",
    display: "inline-flex", alignItems: "center", gap: 6, ...sx,
  }}>{children}</button>;
}

function Input({ value, onChange, placeholder, type = "text", style: sx }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 10px", color: C.text, fontSize: 14, fontFamily: font.mono, outline: "none", width: "100%", boxSizing: "border-box", letterSpacing: "0.04em", ...sx }}
    onFocus={e => e.target.style.borderColor = C.green + "70"}
    onBlur={e => e.target.style.borderColor = C.border} />;
}

function Label({ children, hint }) {
  return <div style={{ marginBottom: 4 }}>
    <span style={{ fontSize: 10, fontFamily: font.mono, fontWeight: 700, color: C.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" }}>{children}</span>
    {hint && <span style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted, marginLeft: 8 }}>— {hint}</span>}
  </div>;
}

function Card({ children, style: sx, glow }) {
  return <div style={{
    background: C.card, border: `1px solid ${glow ? glow + "40" : C.border}`, borderRadius: 8, padding: 18,
    boxShadow: glow ? `0 0 20px ${glow}08` : "none", ...sx,
  }}>{children}</div>;
}

function Badge({ children, color = C.green }) {
  return <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 3, fontSize: 10, fontFamily: font.mono, fontWeight: 700, color, background: color + "15", border: `1px solid ${color}30`, letterSpacing: "0.06em" }}>{children}</span>;
}

function SectionHead({ children, right }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
    <h3 style={{ margin: 0, fontSize: 11, fontFamily: font.mono, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textMuted }}>{children}</h3>
    {right}
  </div>;
}

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: "16px 0" }} />;
}

/* ─── POSITION ROW ─── */
function PositionRow({ pos, onRemove, onScan, scanning }) {
  const tf = TIMEFRAMES[pos.dte];
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: C.surface, borderRadius: 6, border: `1px solid ${C.border}`, gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Badge color={C.red}>SHORT</Badge>
        <span style={{ fontFamily: font.mono, fontWeight: 700, fontSize: 15, color: C.green }}>{pos.underlying}</span>
        <span style={{ fontFamily: font.mono, fontSize: 13, color: C.textDim }}>${pos.strike} {pos.type}</span>
        <Badge color={C.blue}>{pos.expStr}</Badge>
        <Badge color={pos.dte <= 7 ? C.red : pos.dte <= 21 ? C.amber : C.textDim}>{pos.dte} DTE</Badge>
        {pos.premium > 0 && <span style={{ fontFamily: font.mono, fontSize: 12, color: C.textDim }}>opened @ ${pos.premium.toFixed(2)}/sh</span>}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <Btn small color={C.cyan} onClick={() => onScan(pos)} disabled={scanning}>
          {scanning ? "⏳" : "⚡ Scan"}
        </Btn>
        <button onClick={() => onRemove(pos.id)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>✕</button>
      </div>
    </div>
  );
}

function TIMEFRAMES(dte) {
  if (dte <= 7) return { label: "EXPIRING", color: C.red };
  if (dte <= 21) return { label: "ROLL WINDOW", color: C.amber };
  return { label: "ACTIVE", color: C.textMuted };
}

/* ─── MARKDOWN RENDERER ─── */
function mdInline(text, k = 0) {
  const parts = []; let rem = text; let key = k;
  while (rem.length > 0) {
    const bold = rem.match(/^([\s\S]*?)\*\*(.+?)\*\*([\s\S]*)/);
    if (bold) { if (bold[1]) parts.push(bold[1]); parts.push(<strong key={key++} style={{ color: C.text, fontWeight: 700 }}>{bold[2]}</strong>); rem = bold[3]; continue; }
    const code = rem.match(/^([\s\S]*?)`([^`]+?)`([\s\S]*)/);
    if (code) { if (code[1]) parts.push(code[1]); parts.push(<code key={key++} style={{ fontFamily: font.mono, fontSize: 11, color: C.green, background: C.bg, padding: "1px 4px", borderRadius: 3 }}>{code[2]}</code>); rem = code[3]; continue; }
    parts.push(rem); break;
  }
  return parts.length ? parts : [text];
}

function MarkdownText({ text }) {
  if (!text) return null;
  return (
    <div>
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <div key={i} style={{ fontSize: 12, fontFamily: font.mono, fontWeight: 700, color: C.cyan, marginTop: 14, marginBottom: 3 }}>{mdInline(line.slice(4))}</div>;
        if (line.startsWith('## '))  return <div key={i} style={{ fontSize: 13, fontFamily: font.mono, fontWeight: 700, color: C.text, marginTop: 16, marginBottom: 5, borderBottom: `1px solid ${C.border}`, paddingBottom: 3 }}>{mdInline(line.slice(3))}</div>;
        if (line.startsWith('# '))   return <div key={i} style={{ fontSize: 15, fontFamily: font.mono, fontWeight: 700, color: C.text, marginTop: 18, marginBottom: 8 }}>{mdInline(line.slice(2))}</div>;
        if (line.trim() === '---')    return <div key={i} style={{ height: 1, background: C.border, margin: "10px 0" }} />;
        if (line.startsWith('- ') || line.startsWith('• ')) return (
          <div key={i} style={{ display: "flex", gap: 8, margin: "2px 0", paddingLeft: 8 }}>
            <span style={{ color: C.green, flexShrink: 0 }}>·</span>
            <span style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{mdInline(line.slice(2))}</span>
          </div>
        );
        if (/^\d+\. /.test(line)) {
          const m = line.match(/^(\d+)\. (.*)/);
          return m ? (
            <div key={i} style={{ display: "flex", gap: 8, margin: "2px 0", paddingLeft: 8 }}>
              <span style={{ color: C.green, flexShrink: 0, fontFamily: font.mono, minWidth: 18, textAlign: "right" }}>{m[1]}.</span>
              <span style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{mdInline(m[2])}</span>
            </div>
          ) : null;
        }
        if (line.startsWith('|')) {
          const cells = line.split('|').filter((_, j, a) => j > 0 && j < a.length - 1);
          if (cells.every(c => /^[-: ]+$/.test(c))) return null;
          return (
            <div key={i} style={{ display: "flex", fontFamily: font.mono, fontSize: 11, borderBottom: `1px solid ${C.border}20` }}>
              {cells.map((c, j) => <div key={j} style={{ flex: 1, padding: "3px 6px", color: C.textDim }}>{mdInline(c.trim())}</div>)}
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
        return <div key={i} style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>{mdInline(line)}</div>;
      })}
    </div>
  );
}

/* ─── MAIN ─── */
export default function RollScanner() {
  const [positions, setPositions] = useState([]);
  const [ready, setReady] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanTarget, setScanTarget] = useState(null);
  const [gammaResult, setGammaResult] = useState(null);
  const [gammaLoading, setGammaLoading] = useState(false);

  // Persistent results history
  const [history, setHistory] = useState({ rollScans: [], gammaWalls: null });
  const [showHistory, setShowHistory] = useState(false);

  // Add position
  const [showAdd, setShowAdd] = useState(false);
  const [tickerInput, setTickerInput] = useState("");
  const [premiumInput, setPremiumInput] = useState("");
  const [qtyInput, setQtyInput] = useState("1");
  const [parsePreview, setParsePreview] = useState(null);
  const [parseError, setParseError] = useState("");

  // Import state
  const [dashPositions, setDashPositions] = useState(null);

  // Earnings calendar (read from macro dashboard storage)
  const [earningsCalendar, setEarningsCalendar] = useState(null);
  const earningsPosition = earningsCalendar ? deriveEarningsPosition(earningsCalendar) : null;

  /* ─── STORAGE ─── */
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(SCANNER_KEY);
        if (r?.value) setPositions(JSON.parse(r.value));
      } catch {}
      // Load persistent results
      try {
        const rr = await window.storage.get(RESULTS_KEY);
        if (rr?.value) {
          const stored = JSON.parse(rr.value);
          setHistory(stored);
          // Restore gamma walls from last session
          if (stored.gammaWalls) setGammaResult(stored.gammaWalls.text);
        }
      } catch {}
      // Also check dashboard for importable options
      try {
        const d = await window.storage.get(DASHBOARD_KEY);
        if (d?.value) {
          const data = JSON.parse(d.value);
          const all = [];
          ["roth", "hsa"].forEach(acct => {
            if (data[acct]?.options) {
              data[acct].options.filter(o => o.direction === "SHORT").forEach(o => {
                all.push({ ...o, account: acct.toUpperCase() });
              });
            }
          });
          if (all.length > 0) setDashPositions(all);
        }
      } catch {}
      // Pull earnings calendar from macro dashboard
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

  const persist = useCallback(async (p) => {
    try { await window.storage.set(SCANNER_KEY, JSON.stringify(p)); } catch {}
  }, []);

  const persistResults = useCallback(async (h) => {
    try { await window.storage.set(RESULTS_KEY, JSON.stringify(h)); } catch {}
  }, []);

  const saveRollScan = (label, text) => {
    setHistory(prev => {
      const entry = { id: uid(), label, text, timestamp: Date.now() };
      const next = { ...prev, rollScans: [entry, ...prev.rollScans].slice(0, 10) };
      persistResults(next);
      return next;
    });
  };

  const saveGammaWalls = (text) => {
    setHistory(prev => {
      const next = { ...prev, gammaWalls: { text, timestamp: Date.now() } };
      persistResults(next);
      return next;
    });
  };

  const clearHistory = () => {
    setHistory({ rollScans: [], gammaWalls: null });
    persistResults({ rollScans: [], gammaWalls: null });
  };

  const updatePositions = (fn) => {
    setPositions(prev => { const next = fn(prev); persist(next); return next; });
  };

  /* ─── TICKER PREVIEW ─── */
  useEffect(() => {
    if (tickerInput.trim().length > 6) {
      const p = parseOptionsTicker(tickerInput);
      setParsePreview(p);
      if (p) setParseError("");
    } else { setParsePreview(null); }
  }, [tickerInput]);

  /* ─── ADD ─── */
  const addPosition = () => {
    const parsed = parseOptionsTicker(tickerInput);
    if (!parsed) { setParseError("Invalid format"); return; }
    if (parsed.direction !== "SHORT") { setParseError("Scanner monitors SHORT positions for roll opportunities. Use - prefix."); return; }
    updatePositions(p => [...p, { ...parsed, id: uid(), premium: +premiumInput || 0, qty: +qtyInput || 1 }]);
    setTickerInput(""); setPremiumInput(""); setQtyInput("1"); setParsePreview(null); setShowAdd(false);
  };

  const removePosition = (id) => updatePositions(p => p.filter(x => x.id !== id));

  const importFromDash = () => {
    if (!dashPositions) return;
    const existing = new Set(positions.map(p => p.raw));
    const toAdd = dashPositions.filter(p => !existing.has(p.raw)).map(p => ({ ...p, id: uid() }));
    if (toAdd.length > 0) updatePositions(prev => [...prev, ...toAdd]);
    setDashPositions(null);
  };

  /* ─── ROLL OPPORTUNITY SCAN ─── */
  const scanRollOpportunities = async (pos) => {
    setScanLoading(true); setScanResult(null); setScanTarget(pos);
    const posDesc = `${pos.underlying} $${pos.strike} ${pos.type} expiring ${pos.expStr} (${pos.dte} DTE), opened at $${pos.premium}/share, ${pos.qty} contract(s)`;
    const earningsContext = earningsCalendar
      ? `\n\nEARNINGS CALENDAR CONTEXT:\nNext ${earningsCalendar.ticker || "NVDA"} earnings: ${earningsCalendar.next?.date || "unknown"} (${earningsCalendar.next?.confirmed ? "confirmed" : "estimated"})${earningsCalendar.next?.shifted ? `\nDATE SHIFT NOTE: prior estimate was ${earningsCalendar.next.priorEstimate}, confirmed ${earningsCalendar.next.confirmedAt}. Evaluate whether a Mode 4A bridge (write short-DTE CCs to expire before the confirmed date, return to 45-DTE cadence post-event) is appropriate for open positions, or whether any position is still in a Mode 4B unconfirmed window.` : !earningsCalendar.next?.confirmed ? `\nUNCONFIRMED DATE: earnings date is an estimate. If existing CCs span the estimated window, evaluate Mode 4B (weekly/biweekly bridges until date is confirmed).` : ""}\nCurrent calendar position: T${earningsPosition?.daysDelta >= 0 ? "-" : "+"}${Math.abs(earningsPosition?.daysDelta || 0)} (${earningsPosition?.window || "unknown window"})`
      : "";
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 4096,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          system: `You are a roll opportunity scanner for the Flywheel Playbook — a covered call income methodology. Your job is to provide actionable roll analysis for a specific short option position, classifying the appropriate Mode (1, 2, 3, 4, or none) before recommending action.

ROLL MODE TAXONOMY:
- Mode 1 (Standard Income Management): scheduled roll at the 21-DTE trigger or 50%+ profit close. Requires 50% net credit standard. Double Barrier on new strike (ascending channel + 0.20 delta).
- Mode 2 (Conviction-Driven Premium Expansion): 3-stage earnings/catalyst cycle. Stage 1: roll to 0.30–0.40 delta, short DTE expiring just after the event (pre-execution check: confirm a post-event 45-DTE expiration exists). Stage 2: conditional swing into post-event drawdown if ascending channel intact. Stage 3: rebound to 0.20 delta / 45-DTE. Assignment acceptable; expiring worthless is the target.
- Mode 3 (Offensive Roll): rally with bull-trap characteristics, executed during Amateur Hour (9:30–10:00 AM ET). Requires 50% net credit standard. Two-stage roll for 5%+ rallies.
- Mode 4 (Calendar Meta-Mode — changes WHEN, not WHAT): adapts the timing of Modes 1–3 around a catalyst calendar event. Two sub-modes:
  • 4A = known catalyst awkwardly placed inside current DTE → write short-DTE CCs to expire BEFORE the event; return to standard 45-DTE cadence post-event. Double Barrier applies at compressed duration.
  • 4B = catalyst date unconfirmed → use weekly/biweekly DTE bridges until the official date is confirmed. Double Barrier applies at compressed duration.
  Mode 4 does NOT accept net debit by design — it still produces credit, just at compressed DTE. The 50% net credit standard still applies to Mode 4 bridges.

TASK 1 — EARNINGS CALENDAR CHECK:
Review the earnings context. Is the catalyst date (a) confirmed and awkwardly placed inside current DTE (→ Mode 4A), (b) unconfirmed and spanning the estimated window (→ Mode 4B), or (c) outside current DTE or outside any concern window (→ Mode 1/2/3 path)?

TASK 2 — BUY TO CLOSE (current position):
Search for the current bid/ask on this exact option or the closest available data. Report the estimated buy-to-close cost per share, total cost, and the intrinsic vs. extrinsic split. (Deep ITM positions have minimal extrinsic — roll mechanics shift to pure calendar/strike adjustment.)

TASK 3 — ROLL CANDIDATES (sell to open):
Search the options chain for the same underlying. Find CALL options that meet:
- Expiration LATER than the current position's expiration
- For Mode 1/3: delta ≤ 0.22, DTE ≤ 45 days, strike at or above current strike (up and out)
- For Mode 2: delta 0.30–0.40, short DTE just past the catalyst event
- For Mode 4A/4B: compressed DTE that expires BEFORE the catalyst event; Double Barrier still applies
List each candidate with: expiration, strike, delta, bid price, and net credit vs. the buy-to-close cost.

TASK 4 — MODE-APPROPRIATE RECOMMENDATION:
- Mode 1/3/4 path: Apply the 50% net credit standard. Does any candidate produce ≥ 50% of original premium ($${pos.premium}/share) as net credit? If yes, QUALIFYING. If best available is below 50%, SUBTHRESHOLD — recommend hold/expire/close instead.
- Mode 2 path: Evaluate Stage 1 fit — does the catalyst timing and channel structure support a conviction roll to elevated delta? Flag if pre-execution 45-DTE post-event expiration check passes.

OUTPUT REQUIREMENTS:
1. Mode classification (1/2/3/4A/4B/CLOSE/HOLD/ASSIGN) at the top of the response
2. Earnings calendar assessment (AWKWARD PLACEMENT / UNCONFIRMED / CLEAR / N/A)
3. BTC cost estimate with intrinsic/extrinsic split
4. Ranked candidates with net credit metric
5. Final recommendation with explicit reasoning

Be precise with numbers. If exact chain data isn't available, use the best estimates from current IV levels and state your confidence level.`,
          messages: [{ role: "user", content: `Scan roll opportunities for my position:\n${posDesc}${earningsContext}\n\nSearch for current ${pos.underlying} options chain data. Determine which Mode applies (1/2/3/4A/4B or no roll). For Mode 1/3/4, find buy-to-close pricing and sell-to-open candidates applying the 50% net credit standard against my original premium of $${pos.premium}/share. For Mode 2, evaluate the Stage 1 conviction roll to 0.30–0.40 delta. For Mode 4A, find bridge candidates expiring before the confirmed catalyst date; for Mode 4B, find weekly/biweekly bridge candidates until the date is confirmed.` }],
        }),
      });
      const data = await resp.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "No results.";
      setScanResult(text);
      saveRollScan(`${pos.underlying} $${pos.strike} ${pos.type} ${pos.expStr}`, text);
    } catch (err) { setScanResult("Scan failed: " + err.message); }
    setScanLoading(false);
  };

  /* ─── GAMMA WALL SCAN ─── */
  const scanGammaWalls = async () => {
    const tickers = [...new Set(positions.map(p => p.underlying))];
    if (tickers.length === 0) return;
    setGammaLoading(true); setGammaResult(null);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 4096,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          system: `You are a gamma wall and institutional flow analyst for the Flywheel Playbook methodology.

GAMMA WALLS are round-number strikes where options open interest concentrates, creating mechanical price stabilization through dealer delta-hedging. Market makers who are short options at these strikes continuously hedge — buying the underlying as price approaches from below (support), selling as price approaches from above (resistance). The gamma wall effect is real and measurable in the options chain.

Your analysis has three layers:

LAYER 1 — OPEN INTEREST CONCENTRATION:
Search for the current options chain and identify the strikes with highest open interest for calls and puts at near-term expirations. These are the gamma walls. Report the top 3-5 strikes for each side (call OI and put OI).

LAYER 2 — INSIDER SELLING LEVELS:
Search SEC Form 4 filings for recent insider transactions (last 6 months). Identify the price levels where C-suite executives and directors have sold shares. These levels function as institutional "good enough to sell" anchors. Report names, titles, dates, share counts, and prices.

LAYER 3 — DRIP / INSTITUTIONAL ACCUMULATION ZONES:
Search for recent institutional buying activity, 13F filings, and notable accumulation. Identify price levels where large buyers have been adding — these function as demand floors that reinforce the ascending channel.

SYNTHESIS:
Combine all three layers to identify the key price levels that function as structural support and resistance. Map these against the current price to show where the position sits relative to gamma walls, insider selling anchors, and institutional accumulation zones.

Be specific with numbers and dates. State when data is estimated vs. confirmed.`,
          messages: [{ role: "user", content: `Analyze gamma walls, insider selling levels, and institutional accumulation zones for: ${tickers.join(", ")}\n\nSearch for:\n1. Current options open interest concentration at round-number strikes\n2. Recent SEC Form 4 insider sales — especially C-suite (Jensen Huang for NVDA)\n3. Recent institutional buying / 13F accumulation\n\nI need specific price levels and the forces behind them.` }],
        }),
      });
      const data = await resp.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "No results.";
      setGammaResult(text);
      saveGammaWalls(text);
    } catch (err) { setGammaResult("Scan failed: " + err.message); }
    setGammaLoading(false);
  };

  /* ─── SCAN ALL POSITIONS ─── */
  const scanAll = async () => {
    if (positions.length === 0) return;
    setScanLoading(true); setScanResult(null); setScanTarget(null);
    const posDescs = positions.map(p =>
      `• ${p.raw}: ${p.underlying} $${p.strike} ${p.type} exp ${p.expStr} (${p.dte} DTE), premium $${p.premium}/sh, x${p.qty}`
    ).join("\n");
    const earningsContext = earningsCalendar
      ? `\n\nEARNINGS CALENDAR CONTEXT:\nNext ${earningsCalendar.ticker || "NVDA"} earnings: ${earningsCalendar.next?.date || "unknown"} (${earningsCalendar.next?.confirmed ? "confirmed" : "estimated"})${earningsCalendar.next?.shifted ? `\nDATE SHIFT NOTE: prior estimate was ${earningsCalendar.next.priorEstimate}, confirmed ${earningsCalendar.next.confirmedAt}. For each open NVDA short call, evaluate whether Mode 4A (bridge to expire before the confirmed date) is appropriate, or whether the position is already past the concern window.` : !earningsCalendar.next?.confirmed ? `\nUNCONFIRMED DATE: earnings date is an estimate. Evaluate any positions spanning the estimated window for Mode 4B (weekly/biweekly bridges until date is confirmed).` : ""}\nCurrent calendar position: T${earningsPosition?.daysDelta >= 0 ? "-" : "+"}${Math.abs(earningsPosition?.daysDelta || 0)} (${earningsPosition?.window || "unknown window"})`
      : "";
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 4096,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          system: `You are a roll opportunity scanner for the Flywheel Playbook — a covered call income methodology. Analyze ALL provided short option positions and classify each into the appropriate Mode (1/2/3/4A/4B/CLOSE/HOLD/ASSIGN) before recommending action.

ROLL MODE TAXONOMY:
- Mode 1 (Standard Income Management): roll at 21-DTE trigger or 50%+ profit close. Requires 50% net credit standard. Double Barrier on new strike.
- Mode 2 (Conviction-Driven Premium Expansion): 3-stage earnings/catalyst cycle. Stage 1: roll to 0.30–0.40 delta, short DTE expiring just after event (pre-execution check: confirm post-event 45-DTE expiration exists). Stage 2: conditional swing into post-event drawdown. Stage 3: rebound to 0.20 delta / 45-DTE. Assignment acceptable; expiring worthless is the target.
- Mode 3 (Offensive Roll): bull-trap rally, execute during Amateur Hour (9:30–10:00 AM ET). Requires 50% net credit standard. Two-stage roll for 5%+ rallies.
- Mode 4 (Calendar Meta-Mode — changes WHEN, not WHAT): adapts timing of Modes 1–3 around a catalyst calendar. Two sub-modes:
  • 4A = known catalyst awkwardly placed inside current DTE → write short-DTE CCs to expire BEFORE the event; return to 45-DTE cadence post-event. Double Barrier applies.
  • 4B = catalyst date unconfirmed → weekly/biweekly DTE bridges until official date confirmed. Double Barrier applies.
  The 50% net credit standard still applies to Mode 4 bridge entries.

For EACH position:
1. **Earnings calendar check** — is the catalyst (a) confirmed and awkwardly placed inside current DTE (→ Mode 4A), (b) unconfirmed and spanning the estimated window (→ Mode 4B), or (c) outside the concern window (→ Mode 1/2/3 path)?
2. **Estimate the buy-to-close cost** with intrinsic/extrinsic split.
3. **Search for roll candidates**: same underlying, CALL options, expiration LATER than current.
   - Mode 1/3/4: delta ≤ 0.22 for standard; Mode 4A expires before catalyst date; 50% net credit standard applies.
   - Mode 2: delta 0.30–0.40, DTE just past catalyst event.
4. **Apply the 50% net credit standard** for all Modes. Flag QUALIFYING (≥ 50% of original premium as credit) or SUBTHRESHOLD.
5. **Mode 2 pre-execution check**: confirm a post-event 45-DTE expiration exists before routing to Stage 1.

PRIORITIZE positions by urgency:
- ≤ 7 DTE: CRITICAL — must roll or let expire this week
- 8-21 DTE: ROLL WINDOW — standard 21-DTE management trigger active
- 22+ DTE: MONITORING — flag only if earnings calendar creates a Mode 4A/4B or Mode 2 opportunity

OUTPUT FORMAT:
Sort by urgency (lowest DTE first). For each position present a compact summary: Ticker · Strike/Exp · DTE · Urgency · Mode · BTC · Recommendation · Net Credit.

Be precise with numbers. State confidence level on pricing estimates.`,
          messages: [{ role: "user", content: `Scan roll opportunities for all my positions:\n${posDescs}${earningsContext}\n\nFor each position, classify the appropriate Mode (1/2/3/4A/4B or no roll), search current options data, and provide the mode-appropriate recommendation. All modes require the 50% net credit standard. For Mode 4A, find bridge candidates expiring before the confirmed catalyst date. For Mode 4B, find weekly/biweekly bridges. For Mode 2, evaluate Stage 1 conviction roll fit. Surface any earnings calendar timing implications prominently.` }],
        }),
      });
      const data = await resp.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "No results.";
      setScanResult(text);
      saveRollScan("All Positions Sweep", text);
    } catch (err) { setScanResult("Scan failed: " + err.message); }
    setScanLoading(false);
  };

  if (!ready) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontFamily: font.mono }}>Initializing scanner...</div>;

  /* ─── DTE SUMMARY ─── */
  const critical = positions.filter(p => p.dte <= 7);
  const rollWindow = positions.filter(p => p.dte > 7 && p.dte <= 21);
  const monitoring = positions.filter(p => p.dte > 21);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: font.sans, padding: "0 0 40px" }}>

      {/* ─── HEADER ─── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.surface }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: font.mono, letterSpacing: "0.08em", color: C.cyan }}>
            ROLL OPPORTUNITY SCANNER
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, fontFamily: font.mono, marginTop: 2 }}>
            Flywheel Playbook — Position Monitor & Roll Engine
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {positions.length > 0 && (
            <>
              <Btn color={C.purple} onClick={scanGammaWalls} disabled={gammaLoading}>
                {gammaLoading ? "⏳ Scanning..." : "🔬 Gamma Walls"}
              </Btn>
              <Btn color={C.cyan} onClick={scanAll} disabled={scanLoading}>
                {scanLoading && !scanTarget ? "⏳ Scanning All..." : "⚡ Scan All Positions"}
              </Btn>
            </>
          )}
        </div>
      </div>

      {/* ─── URGENCY INDICATORS ─── */}
      {positions.length > 0 && (
        <div style={{ padding: "12px 24px", display: "flex", gap: 12 }}>
          {[
            { label: "CRITICAL (≤7 DTE)", count: critical.length, color: C.red },
            { label: "ROLL WINDOW (8-21 DTE)", count: rollWindow.length, color: C.amber },
            { label: "MONITORING (22+ DTE)", count: monitoring.length, color: C.textMuted },
            { label: "TOTAL POSITIONS", count: positions.length, color: C.cyan },
          ].map((s, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${s.count > 0 ? s.color + "30" : C.border}`, borderRadius: 6, padding: "10px 16px", flex: 1 }}>
              <div style={{ fontSize: 9, fontFamily: font.mono, letterSpacing: "0.12em", color: C.textMuted, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontFamily: font.mono, fontWeight: 700, color: s.count > 0 ? s.color : C.textMuted }}>{s.count}</div>
            </div>
          ))}
        </div>
      )}

      {/* ─── EARNINGS CALENDAR STRIP ─── */}
      {earningsPosition && (
        <div style={{ padding: "0 24px 12px" }}>
          <div style={{
            background: earningsPosition.shifted ? C.amberDim + "30" : C.surface,
            border: `1px solid ${earningsPosition.shifted ? C.amber + "50" : C.border}`,
            borderRadius: 6, padding: "10px 16px",
            display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 9, fontFamily: font.mono, fontWeight: 700, letterSpacing: "0.12em", color: C.textMuted }}>
              {earningsCalendar.ticker || "NVDA"} EARNINGS
            </span>
            <span style={{
              fontSize: 18, fontFamily: font.mono, fontWeight: 700, letterSpacing: "-0.02em",
              color: earningsPosition.window === "earnings event" ? C.red
                : earningsPosition.window === "pre-earnings drift" ? C.amber
                : earningsPosition.window === "post-earnings drift" ? C.cyan
                : C.textDim,
            }}>
              {earningsPosition.daysDelta > 0 ? `T-${earningsPosition.daysDelta}` : earningsPosition.daysDelta < 0 ? `T+${Math.abs(earningsPosition.daysDelta)}` : "T-0"}
            </span>
            <Badge color={
              earningsPosition.window === "earnings event" ? C.red
              : earningsPosition.window === "pre-earnings drift" ? C.amber
              : earningsPosition.window === "post-earnings drift" ? C.cyan
              : C.textMuted
            }>
              {earningsPosition.window.toUpperCase()}
            </Badge>
            <span style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim }}>
              {earningsPosition.quarter} · {earningsPosition.date} · {earningsPosition.confirmed ? "confirmed" : "estimated"}
            </span>
            {earningsPosition.shifted && (
              <>
                <Badge color={C.amber}>MODE 4 TRIGGER</Badge>
                <span style={{ fontSize: 11, fontFamily: font.mono, color: C.amber }}>
                  shifted from {earningsPosition.priorEstimate} — open NVDA CCs whose original DTE assumed prior date are Calendar Correction candidates
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: "0 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* ═══ TOP LEFT: POSITIONS ═══ */}
        <Card>
          <SectionHead right={
            <div style={{ display: "flex", gap: 6 }}>
              {dashPositions && dashPositions.length > 0 && (
                <Btn small color={C.amber} onClick={importFromDash}>
                  Import from Dashboard ({dashPositions.length})
                </Btn>
              )}
              <Btn small color={C.green} onClick={() => setShowAdd(!showAdd)}>
                {showAdd ? "Cancel" : "+ Add Position"}
              </Btn>
            </div>
          }>
            Short Option Positions
          </SectionHead>

          {showAdd && (
            <div style={{ marginBottom: 16, padding: 16, background: C.bg, borderRadius: 6, border: `1px solid ${C.green}30` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 10, fontFamily: font.mono, letterSpacing: "0.1em" }}>ADD SHORT OPTION TO MONITOR</div>

              <Label hint="Use - prefix for short positions">Options Ticker</Label>
              <Input value={tickerInput} onChange={setTickerInput} placeholder="-NVDA260501C205" style={{ fontSize: 16, marginBottom: 8 }} />

              {parsePreview && (
                <div style={{ margin: "0 0 10px", padding: 10, background: C.greenDim + "30", borderRadius: 6, border: `1px solid ${C.green}30` }}>
                  <div style={{ fontSize: 9, fontFamily: font.mono, color: C.green, marginBottom: 4, fontWeight: 700, letterSpacing: "0.12em" }}>✓ PARSED</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge color={parsePreview.direction === "SHORT" ? C.red : C.green}>{parsePreview.direction}</Badge>
                    <span style={{ fontFamily: font.mono, fontWeight: 700, fontSize: 14, color: C.green }}>{parsePreview.underlying}</span>
                    <span style={{ fontFamily: font.mono, color: C.textDim }}>${parsePreview.strike} {parsePreview.type}</span>
                    <Badge color={C.blue}>{parsePreview.expStr}</Badge>
                    <Badge color={parsePreview.dte <= 7 ? C.red : parsePreview.dte <= 21 ? C.amber : C.textDim}>{parsePreview.dte} DTE</Badge>
                  </div>
                </div>
              )}
              {parseError && <div style={{ color: C.red, fontSize: 11, fontFamily: font.mono, margin: "0 0 10px", padding: 8, background: C.redDim + "30", borderRadius: 4 }}>⚠ {parseError}</div>}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <Label hint="Price received when opened">Original Premium / Share</Label>
                  <Input value={premiumInput} onChange={setPremiumInput} placeholder="3.50" type="number" />
                </div>
                <div>
                  <Label hint="Number of contracts">Quantity</Label>
                  <Input value={qtyInput} onChange={setQtyInput} placeholder="1" type="number" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                <Btn color={C.green} onClick={addPosition} disabled={!parsePreview}>Save</Btn>
                <Btn color={C.textMuted} onClick={() => { setShowAdd(false); setParseError(""); setParsePreview(null); }}>Cancel</Btn>
              </div>
            </div>
          )}

          {positions.length === 0 ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: C.textMuted, fontFamily: font.mono }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>No positions being monitored.</div>
              <div style={{ fontSize: 11 }}>Add your short covered calls and CSPs to scan for roll opportunities.</div>
              {dashPositions && dashPositions.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Btn small color={C.amber} onClick={importFromDash}>
                    Import {dashPositions.length} position(s) from Command Center
                  </Btn>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {critical.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontFamily: font.mono, fontWeight: 700, color: C.red, letterSpacing: "0.12em", padding: "4px 0" }}>▸ CRITICAL — EXPIRING SOON</div>
                  {critical.map(p => <PositionRow key={p.id} pos={p} onRemove={removePosition} onScan={scanRollOpportunities} scanning={scanLoading} />)}
                </>
              )}
              {rollWindow.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontFamily: font.mono, fontWeight: 700, color: C.amber, letterSpacing: "0.12em", padding: "4px 0", marginTop: critical.length > 0 ? 8 : 0 }}>▸ ROLL WINDOW — 21 DTE TRIGGER</div>
                  {rollWindow.map(p => <PositionRow key={p.id} pos={p} onRemove={removePosition} onScan={scanRollOpportunities} scanning={scanLoading} />)}
                </>
              )}
              {monitoring.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontFamily: font.mono, fontWeight: 700, color: C.textMuted, letterSpacing: "0.12em", padding: "4px 0", marginTop: (critical.length > 0 || rollWindow.length > 0) ? 8 : 0 }}>▸ MONITORING</div>
                  {monitoring.map(p => <PositionRow key={p.id} pos={p} onRemove={removePosition} onScan={scanRollOpportunities} scanning={scanLoading} />)}
                </>
              )}
            </div>
          )}
        </Card>

        {/* ═══ TOP RIGHT: SCAN PARAMETERS ═══ */}
        <Card style={{ padding: "14px 18px", alignSelf: "start" }}>
          <SectionHead>Scan Parameters</SectionHead>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 20px", fontSize: 12, fontFamily: font.mono }}>
            <span style={{ color: C.textMuted }}>Roll Direction</span><span style={{ color: C.text }}>Up and Out (higher strike, later expiration)</span>
            <span style={{ color: C.textMuted }}>Max DTE</span><span style={{ color: C.text }}>45 days from today</span>
            <span style={{ color: C.textMuted }}>Max Delta</span><span style={{ color: C.green }}>≤ 0.22 (≈78% OTM probability)</span>
            <span style={{ color: C.textMuted }}>Credit Standard</span><span style={{ color: C.amber }}>Net credit required; 50% of original premium = QUALIFYING</span>
            <span style={{ color: C.textMuted }}>Execution Window</span><span style={{ color: C.text }}>Tuesday Amateur Hour (9:30-10:00 AM) preferred</span>
          </div>

          <Divider />

          <SectionHead>How It Works</SectionHead>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, fontFamily: font.mono, color: C.textDim, lineHeight: 1.5 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: C.cyan, flexShrink: 0 }}>1.</span>
              <span>Enter your short CCs/CSPs or import from the Command Center</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: C.cyan, flexShrink: 0 }}>2.</span>
              <span>Click <span style={{ color: C.cyan }}>⚡ Scan</span> on a position or <span style={{ color: C.cyan }}>Scan All</span> for a portfolio sweep</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: C.cyan, flexShrink: 0 }}>3.</span>
              <span>Scanner searches current options chain for buy-to-close costs and qualifying roll candidates</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: C.purple, flexShrink: 0 }}>4.</span>
              <span>Click <span style={{ color: C.purple }}>🔬 Gamma Walls</span> to map OI concentration, insider selling, and accumulation zones</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ═══ BOTTOM ROW: RESULTS (full width, side by side, expand freely) ═══ */}
      <div style={{ padding: "16px 24px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* ─── ROLL RESULTS ─── */}
        <Card glow={scanResult ? C.cyan : null}>
          <SectionHead right={history.rollScans.length > 0 && !scanLoading && (
            <span style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted }}>
              {history.rollScans.length} scan{history.rollScans.length !== 1 ? "s" : ""} saved
            </span>
          )}>
            {scanTarget ? `Roll Analysis — ${scanTarget.underlying} $${scanTarget.strike} ${scanTarget.type}` : "Roll Opportunity Results"}
          </SectionHead>
          {scanLoading && (
            <div style={{ padding: "30px", textAlign: "center" }}>
              <div style={{ color: C.cyan, fontFamily: font.mono, fontSize: 13, marginBottom: 8 }}>
                {scanTarget ? `Scanning ${scanTarget.underlying} options chain...` : "Scanning all positions..."}
              </div>
              <div style={{ color: C.textMuted, fontFamily: font.mono, fontSize: 11 }}>
                Searching buy-to-close prices → finding delta ≤ 0.22 candidates → calculating net credits
              </div>
            </div>
          )}
          {scanResult && !scanLoading && (
            <div style={{ padding: "14px", background: C.bg, borderRadius: 6, border: `1px solid ${C.cyanDim}`, overflowY: "auto", maxHeight: 600 }}>
              <MarkdownText text={scanResult} />
            </div>
          )}
          {!scanResult && !scanLoading && (
            <div style={{ padding: "30px", textAlign: "center", color: C.textMuted, fontFamily: font.mono }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>No scan results yet.</div>
              <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                Click ⚡ Scan on any position for individual analysis,<br />
                or ⚡ Scan All Positions for a full portfolio sweep.
              </div>
            </div>
          )}
        </Card>

        {/* ─── GAMMA WALL RESULTS ─── */}
        <Card glow={gammaResult ? C.purple : null}>
          <SectionHead right={history.gammaWalls && (
            <span style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted }}>
              Last scanned: {timeAgo(history.gammaWalls.timestamp)} · {fmtTime(history.gammaWalls.timestamp)}
            </span>
          )}>
            Gamma Walls · Insider Selling · Accumulation Zones
          </SectionHead>
          {gammaLoading && (
            <div style={{ padding: "30px", textAlign: "center" }}>
              <div style={{ color: C.purple, fontFamily: font.mono, fontSize: 13, marginBottom: 8 }}>Scanning structural price levels...</div>
              <div style={{ color: C.textMuted, fontFamily: font.mono, fontSize: 11 }}>
                Checking OI concentration → SEC Form 4 filings → institutional accumulation
              </div>
            </div>
          )}
          {gammaResult && !gammaLoading && (
            <div style={{ padding: "14px", background: C.bg, borderRadius: 6, border: `1px solid ${C.purpleDim}`, overflowY: "auto", maxHeight: 600 }}>
              <MarkdownText text={gammaResult} />
            </div>
          )}
          {!gammaResult && !gammaLoading && (
            <div style={{ padding: "30px", textAlign: "center", color: C.textMuted, fontFamily: font.mono }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>No gamma wall data yet.</div>
              <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                Click 🔬 Gamma Walls to scan for:<br />
                Open interest concentration · Insider selling prices · DRIP accumulation zones
              </div>
              <div style={{ fontSize: 10, marginTop: 8, color: C.textMuted }}>
                These levels are structural — results persist across sessions until you re-scan.
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ═══ SCAN HISTORY (persistent) ═══ */}
      {history.rollScans.length > 0 && (
        <div style={{ padding: "16px 24px 0" }}>
          <Card>
            <SectionHead right={
              <div style={{ display: "flex", gap: 6 }}>
                <Btn small color={C.textMuted} onClick={() => setShowHistory(!showHistory)}>
                  {showHistory ? "Collapse" : `Show History (${history.rollScans.length})`}
                </Btn>
                <Btn small color={C.red} onClick={clearHistory}>Clear All</Btn>
              </div>
            }>
              Previous Roll Scans
            </SectionHead>

            {/* Summary row — always visible */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {history.rollScans.map(h => (
                <button key={h.id} onClick={() => { setScanResult(h.text); setScanTarget(null); setShowHistory(false); }}
                  style={{
                    padding: "6px 12px", borderRadius: 6, fontSize: 11, fontFamily: font.mono, fontWeight: 600,
                    border: `1px solid ${C.border}`, background: C.surface, color: C.textDim,
                    cursor: "pointer", transition: "all .15s", textAlign: "left",
                  }}
                  onMouseEnter={e => { e.target.style.borderColor = C.cyan + "60"; e.target.style.color = C.cyan; }}
                  onMouseLeave={e => { e.target.style.borderColor = C.border; e.target.style.color = C.textDim; }}
                >
                  <span style={{ color: C.text }}>{h.label}</span>
                  <br />
                  <span style={{ fontSize: 9, color: C.textMuted }}>{timeAgo(h.timestamp)}</span>
                </button>
              ))}
            </div>

            {/* Expanded history */}
            {showHistory && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                {history.rollScans.map(h => (
                  <div key={h.id} style={{ background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge color={C.cyan}>{h.label}</Badge>
                        <span style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted }}>{fmtTime(h.timestamp)}</span>
                      </div>
                      <Btn small color={C.cyan} onClick={() => { setScanResult(h.text); setScanTarget(null); }}>
                        Load
                      </Btn>
                    </div>
                    <div style={{ padding: "10px 12px", whiteSpace: "pre-wrap", fontSize: 12, fontFamily: font.sans, lineHeight: 1.6, color: C.textDim, maxHeight: 150, overflowY: "auto" }}>
                      {h.text.slice(0, 500)}{h.text.length > 500 ? "..." : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
