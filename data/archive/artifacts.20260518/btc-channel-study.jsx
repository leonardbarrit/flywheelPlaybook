import { useState, useEffect, useCallback, useMemo } from "react";

/* ─── CONSTANTS ─── */
const STORAGE_KEY = "btc-channel-study-v1";
const BTC_GENESIS_MS = new Date("2009-01-03").getTime();
const LAST_HALVING = new Date("2024-04-19");
const NEXT_HALVING = new Date("2028-04-19");

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
  cyan: "#18ffff",
  yellow: "#ffea00",
};

const font = {
  mono: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Consolas', monospace",
  sans: "'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
};

/* ─── CSV PARSER ─── */
// Tokenize a single CSV row, respecting double-quoted fields that may contain commas.
function tokenizeCSVRow(line, delim) {
  const tokens = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === delim && !inQuotes) {
      tokens.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  tokens.push(cur);
  return tokens.map(t => t.trim());
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { error: "Need at least 2 rows", data: null };
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const rows = lines.map(l => tokenizeCSVRow(l, delim));

  // Detect header by checking if any field in row 0 looks like a column name.
  const firstRow = rows[0].map(c => c.toLowerCase());
  const hasHeader = firstRow.some(c => /^(date|time|timestamp|open|high|low|close|volume|vol)$/i.test(c) || c.includes("date") || c.includes("time"));

  // Map column indices by header name. Extra columns (% Change, etc.) are ignored.
  let idx = {};
  let dataRows;
  if (hasHeader) {
    firstRow.forEach((col, i) => {
      const c = col.replace(/[^a-z]/g, ""); // normalize: strip spaces, %, etc.
      if (idx.date === undefined && (c === "date" || c === "time" || c === "timestamp" || c === "datetime")) idx.date = i;
      else if (idx.open === undefined && c === "open") idx.open = i;
      else if (idx.high === undefined && c === "high") idx.high = i;
      else if (idx.low === undefined && c === "low") idx.low = i;
      else if (idx.close === undefined && (c === "close" || c === "adjclose")) idx.close = i;
      else if (idx.volume === undefined && (c === "volume" || c === "vol")) idx.volume = i;
    });
    dataRows = rows.slice(1);
  } else {
    // No header — fall back to positional [date, open, high, low, close, volume?]
    idx = { date: 0, open: 1, high: 2, low: 3, close: 4, volume: 5 };
    dataRows = rows;
  }

  if (idx.date === undefined || idx.open === undefined || idx.high === undefined || idx.low === undefined || idx.close === undefined) {
    return { error: "Missing required columns. Need date, open, high, low, close.", data: null };
  }

  // Strip thousands-separator commas before parseFloat.
  const num = (s) => {
    if (s == null) return NaN;
    return parseFloat(String(s).replace(/,/g, "").replace(/[^\d.\-eE+]/g, ""));
  };

  const data = [];
  for (const row of dataRows) {
    if (row.length < 5) continue;
    let dateStr = row[idx.date];
    let timestamp;
    if (/^\d{10,13}$/.test(dateStr)) {
      timestamp = parseInt(dateStr);
      if (timestamp < 1e12) timestamp *= 1000;
    } else {
      timestamp = new Date(dateStr).getTime();
    }
    if (isNaN(timestamp)) continue;
    const o = num(row[idx.open]);
    const h = num(row[idx.high]);
    const l = num(row[idx.low]);
    const c = num(row[idx.close]);
    const v = idx.volume !== undefined ? (num(row[idx.volume]) || 0) : 0;
    if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) continue;
    data.push({ time: timestamp, open: o, high: h, low: l, close: c, volume: v });
  }
  data.sort((a, b) => a.time - b.time);
  return data.length > 0 ? { data, error: null } : { error: "No valid rows parsed", data: null };
}

/* ─── DERIVED ANALYTICS ─── */
function getHalvingPhase(now) {
  const last = LAST_HALVING.getTime();
  const next = NEXT_HALVING.getTime();
  const cycle = next - last;
  const into = now - last;
  const pct = (into / cycle) * 100;
  let phase;
  if (pct < 25) phase = "Post-halving accumulation";
  else if (pct < 50) phase = "Markup phase";
  else if (pct < 75) phase = "Distribution / late-cycle";
  else phase = "Pre-halving / markdown";
  return {
    phase,
    phasePct: pct,
    daysSinceHalving: Math.floor((now - last) / 86400000),
    daysToNextHalving: Math.floor((next - now) / 86400000),
  };
}

function fitPowerLaw(data) {
  if (data.length < 10) return null;
  const points = data.map(d => ({
    x: Math.log((d.time - BTC_GENESIS_MS) / 86400000),
    y: Math.log(d.close),
  }));
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const a = (sumY - b * sumX) / n;
  return {
    a, b,
    estimate: (timestampMs) => {
      const days = (timestampMs - BTC_GENESIS_MS) / 86400000;
      return Math.exp(a + b * Math.log(days));
    },
  };
}

function findWedgeIntersection(channels) {
  const asc = channels.find(c => c.type === "ascending" && c.visible && c.anchors.length === 3);
  const desc = channels.find(c => c.type === "descending" && c.visible && c.anchors.length === 3);
  if (!asc || !desc) return null;
  // Use the projected resistance (upper line) of ascending and support (lower line) of descending
  // Ascending channel resistance: parallel to line1 through a3
  // Descending channel support: parallel to line1 through a3
  const ascSlope = (asc.anchors[1].close - asc.anchors[0].close) / (asc.anchors[1].time - asc.anchors[0].time);
  const ascOffset = asc.anchors[2].close - (asc.anchors[0].close + ascSlope * (asc.anchors[2].time - asc.anchors[0].time));
  const ascResY = (t) => asc.anchors[0].close + ascSlope * (t - asc.anchors[0].time) + (ascOffset > 0 ? ascOffset : 0);
  const ascSupY = (t) => asc.anchors[0].close + ascSlope * (t - asc.anchors[0].time) + (ascOffset < 0 ? ascOffset : 0);
  const descSlope = (desc.anchors[1].close - desc.anchors[0].close) / (desc.anchors[1].time - desc.anchors[0].time);
  const descOffset = desc.anchors[2].close - (desc.anchors[0].close + descSlope * (desc.anchors[2].time - desc.anchors[0].time));
  const descResY = (t) => desc.anchors[0].close + descSlope * (t - desc.anchors[0].time) + (descOffset > 0 ? descOffset : 0);
  const descSupY = (t) => desc.anchors[0].close + descSlope * (t - desc.anchors[0].time) + (descOffset < 0 ? descOffset : 0);
  // Wedge: ascending resistance vs descending support converging
  // y_asc_res(t) = y_desc_sup(t) → solve for t
  const m1 = ascSlope;
  const b1 = ascResY(0);
  const m2 = descSlope;
  const b2 = descSupY(0);
  if (Math.abs(m1 - m2) < 1e-12) return null;
  const tIntersect = (b2 - b1) / (m1 - m2);
  const priceIntersect = ascResY(tIntersect);
  return { time: tIntersect, price: priceIntersect };
}

/* ─── UI COMPONENTS ─── */
function Btn({ children, onClick, color = C.green, disabled, active, small, style: sx }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? "5px 10px" : "8px 14px",
      borderRadius: 5,
      fontSize: small ? 11 : 12,
      fontFamily: font.mono,
      fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer",
      border: `1px solid ${color}${active ? "" : "50"}`,
      background: active ? color + "30" : color + "12",
      color,
      opacity: disabled ? 0.35 : 1,
      transition: "all .15s",
      letterSpacing: "0.04em",
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      ...sx,
    }}>{children}</button>
  );
}

function Card({ children, style: sx }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, ...sx }}>
      {children}
    </div>
  );
}

function SectionHead({ children, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <h3 style={{ margin: 0, fontSize: 10, fontFamily: font.mono, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textMuted }}>
        {children}
      </h3>
      {right}
    </div>
  );
}

/* ─── CHART ─── */
function Chart({ data, channels, drawMode, drawingState, onChartClick, onHoverBar, hoverBar, showPowerLaw, powerLawFit, showRightTicks, wedge }) {
  const chartW = 1100, chartH = 480;
  const padL = 64, padR = 60, padT = 16, padB = 36;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  if (data.length === 0) return null;

  const xMin = data[0].time;
  const xMax = data[data.length - 1].time;
  let yMin = Infinity, yMax = -Infinity;
  data.forEach(d => {
    if (d.low < yMin) yMin = d.low;
    if (d.high > yMax) yMax = d.high;
  });
  // Include channel projections in Y range so they're visible even if extending outside data
  channels.forEach(ch => {
    if (!ch.visible || ch.anchors.length < 3) return;
    const slope = (ch.anchors[1].close - ch.anchors[0].close) / (ch.anchors[1].time - ch.anchors[0].time);
    const offset = ch.anchors[2].close - (ch.anchors[0].close + slope * (ch.anchors[2].time - ch.anchors[0].time));
    [xMin, xMax].forEach(t => {
      const y1 = ch.anchors[0].close + slope * (t - ch.anchors[0].time);
      const y2 = y1 + offset;
      yMin = Math.min(yMin, y1, y2);
      yMax = Math.max(yMax, y1, y2);
    });
  });
  const range = yMax - yMin;
  yMin -= range * 0.04;
  yMax += range * 0.04;

  const pxX = (t) => padL + ((t - xMin) / (xMax - xMin)) * innerW;
  const pxY = (p) => padT + innerH - ((p - yMin) / (yMax - yMin)) * innerH;
  const timeFromPx = (px) => xMin + ((px - padL) / innerW) * (xMax - xMin);
  const priceFromPx = (py) => yMin + ((padT + innerH - py) / innerH) * (yMax - yMin);

  const snapToBar = (clickX) => {
    const targetTime = timeFromPx(clickX);
    let nearest = data[0], minDist = Infinity;
    for (const d of data) {
      const dist = Math.abs(d.time - targetTime);
      if (dist < minDist) { minDist = dist; nearest = d; }
    }
    return nearest;
  };

  const handleClick = (e) => {
    if (!drawMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < padL || x > padL + innerW) return;
    const bar = snapToBar(x);
    onChartClick({ bar });
  };

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < padL || x > padL + innerW) { onHoverBar(null); return; }
    onHoverBar(snapToBar(x));
  };

  const barWidth = Math.max(1, (innerW / data.length) * 0.7);

  // Y-axis ticks
  const yTicks = [];
  for (let i = 0; i <= 6; i++) {
    const v = yMin + (yMax - yMin) * (i / 6);
    yTicks.push({ v, y: pxY(v) });
  }
  // X-axis ticks
  const xTickCount = 8;
  const xTicks = [];
  for (let i = 0; i <= xTickCount; i++) {
    const t = xMin + (xMax - xMin) * (i / xTickCount);
    xTicks.push({ t, x: pxX(t) });
  }

  const renderChannel = (ch) => {
    if (!ch.visible || ch.anchors.length < 3) return null;
    const [a1, a2, a3] = ch.anchors;
    const slope = (a2.close - a1.close) / (a2.time - a1.time);
    const offset = a3.close - (a1.close + slope * (a3.time - a1.time));
    const t1 = xMin, t2 = xMax;
    const line1y1 = a1.close + slope * (t1 - a1.time);
    const line1y2 = a1.close + slope * (t2 - a1.time);
    const line2y1 = line1y1 + offset;
    const line2y2 = line1y2 + offset;
    const px1x = pxX(t1), px2x = pxX(t2);
    const color = ch.type === "ascending" ? C.green : C.red;
    return (
      <g key={ch.id}>
        <polygon
          points={`${px1x},${pxY(line1y1)} ${px2x},${pxY(line1y2)} ${px2x},${pxY(line2y2)} ${px1x},${pxY(line2y1)}`}
          fill={color} fillOpacity="0.06"
        />
        <line x1={px1x} y1={pxY(line1y1)} x2={px2x} y2={pxY(line1y2)} stroke={color} strokeWidth="1.5" strokeOpacity="0.85" />
        <line x1={px1x} y1={pxY(line2y1)} x2={px2x} y2={pxY(line2y2)} stroke={color} strokeWidth="1.5" strokeOpacity="0.85" />
        {ch.anchors.map((a, i) => (
          <circle key={i} cx={pxX(a.time)} cy={pxY(a.close)} r="4.5" fill={color} stroke={C.bg} strokeWidth="1.5" />
        ))}
        <text x={px2x - 6} y={pxY(line1y2) - 5} fill={color} fontSize="9" fontFamily={font.mono} textAnchor="end" fontWeight="700">
          {ch.label}
        </text>
      </g>
    );
  };

  const drawingPreview = (() => {
    if (drawingState.anchors.length === 0) return null;
    return (
      <g>
        {drawingState.anchors.map((a, i) => (
          <circle key={i} cx={pxX(a.time)} cy={pxY(a.close)} r="5.5" fill={C.amber} stroke={C.bg} strokeWidth="1.5" />
        ))}
        {drawingState.anchors.length === 2 && (() => {
          const [a1, a2] = drawingState.anchors;
          const slope = (a2.close - a1.close) / (a2.time - a1.time);
          const t1 = xMin, t2 = xMax;
          const y1 = a1.close + slope * (t1 - a1.time);
          const y2 = a1.close + slope * (t2 - a1.time);
          return <line x1={pxX(t1)} y1={pxY(y1)} x2={pxX(t2)} y2={pxY(y2)} stroke={C.amber} strokeWidth="1.5" strokeDasharray="4 3" />;
        })()}
      </g>
    );
  })();

  const powerLawCurve = (() => {
    if (!showPowerLaw || !powerLawFit) return null;
    const points = [];
    for (let i = 0; i <= 200; i++) {
      const t = xMin + (xMax - xMin) * (i / 200);
      const p = powerLawFit.estimate(t);
      points.push(`${pxX(t)},${pxY(p)}`);
    }
    return <polyline points={points.join(" ")} fill="none" stroke={C.purple} strokeWidth="1.5" strokeDasharray="5 4" strokeOpacity="0.75" />;
  })();

  const wedgeMarker = (() => {
    if (!wedge) return null;
    if (wedge.time < xMin || wedge.time > xMax) return null;
    const x = pxX(wedge.time);
    return (
      <g>
        <line x1={x} y1={padT} x2={x} y2={padT + innerH} stroke={C.cyan} strokeWidth="1" strokeDasharray="2 4" strokeOpacity="0.7" />
        <circle cx={x} cy={pxY(wedge.price)} r="4" fill={C.cyan} stroke={C.bg} strokeWidth="1" />
        <text x={x + 6} y={padT + 12} fill={C.cyan} fontSize="9" fontFamily={font.mono} fontWeight="700">WEDGE</text>
      </g>
    );
  })();

  const hoverLine = (() => {
    if (!hoverBar) return null;
    const x = pxX(hoverBar.time);
    return <line x1={x} y1={padT} x2={x} y2={padT + innerH} stroke={C.textMuted} strokeWidth="0.5" strokeDasharray="2 3" />;
  })();

  return (
    <svg width={chartW} height={chartH} style={{ background: C.bg, cursor: drawMode ? "crosshair" : "default", display: "block", maxWidth: "100%" }}
      onClick={handleClick}
      onMouseMove={handleMove}
      onMouseLeave={() => onHoverBar(null)}
    >
      {/* Grid + axes */}
      {yTicks.map((tk, i) => (
        <g key={`y${i}`}>
          <line x1={padL} y1={tk.y} x2={padL + innerW} y2={tk.y} stroke={C.border} strokeDasharray="2 4" strokeOpacity="0.6" />
          <text x={padL - 8} y={tk.y + 3} fill={C.textMuted} fontSize="9" fontFamily={font.mono} textAnchor="end">
            ${tk.v >= 1000 ? (tk.v / 1000).toFixed(1) + "k" : tk.v.toFixed(0)}
          </text>
        </g>
      ))}
      {xTicks.map((tk, i) => (
        <text key={`x${i}`} x={tk.x} y={padT + innerH + 16} fill={C.textMuted} fontSize="9" fontFamily={font.mono} textAnchor="middle">
          {new Date(tk.t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </text>
      ))}

      {/* Bars */}
      {data.map((d, i) => {
        const x = pxX(d.time);
        const isUp = d.close >= d.open;
        const color = isUp ? C.green : C.red;
        return (
          <g key={i}>
            <line x1={x} y1={pxY(d.high)} x2={x} y2={pxY(d.low)} stroke={color} strokeWidth="0.8" strokeOpacity="0.7" />
            <rect
              x={x - barWidth / 2}
              y={pxY(Math.max(d.open, d.close))}
              width={barWidth}
              height={Math.max(0.5, Math.abs(pxY(d.open) - pxY(d.close)))}
              fill={color}
              fillOpacity={isUp ? 0.5 : 0.85}
              stroke={color} strokeWidth="0.5"
            />
          </g>
        );
      })}

      {/* Right ticks (closes) */}
      {showRightTicks && data.map((d, i) => (
        <circle key={`rt${i}`} cx={pxX(d.time)} cy={pxY(d.close)} r="1.4" fill={C.yellow} fillOpacity="0.7" />
      ))}

      {powerLawCurve}
      {channels.map(renderChannel)}
      {drawingPreview}
      {wedgeMarker}
      {hoverLine}
    </svg>
  );
}

/* ─── MAIN ─── */
export default function BTCChannelStudy() {
  const [data, setData] = useState([]);
  const [channels, setChannels] = useState([]);
  const [csvText, setCsvText] = useState("");
  const [parseError, setParseError] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [drawMode, setDrawMode] = useState(null);
  const [drawingState, setDrawingState] = useState({ anchors: [] });
  const [showPowerLaw, setShowPowerLaw] = useState(false);
  const [showRightTicks, setShowRightTicks] = useState(false);
  const [hoverBar, setHoverBar] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r?.value) {
          const stored = JSON.parse(r.value);
          if (stored.data) setData(stored.data);
          if (stored.channels) setChannels(stored.channels);
        }
      } catch {}
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try { await window.storage.set(STORAGE_KEY, JSON.stringify({ data, channels })); } catch {}
    })();
  }, [data, channels, ready]);

  const powerLawFit = useMemo(() => fitPowerLaw(data), [data]);
  const halvingPhase = useMemo(() => data.length > 0 ? getHalvingPhase(data[data.length - 1].time) : null, [data]);
  const wedge = useMemo(() => findWedgeIntersection(channels), [channels]);

  const handleImport = () => {
    const result = parseCSV(csvText);
    if (result.error) { setParseError(result.error); return; }
    setData(result.data);
    setParseError("");
    setShowInput(false);
    setCsvText("");
  };

  const handleChartClick = ({ bar }) => {
    if (!drawMode) return;
    const newAnchors = [...drawingState.anchors, bar];
    if (newAnchors.length === 3) {
      setChannels(prev => [...prev, {
        id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: drawMode,
        label: `${drawMode === "ascending" ? "ASC" : "DESC"}-${prev.filter(c => c.type === drawMode).length + 1}`,
        anchors: newAnchors,
        visible: true,
      }]);
      setDrawingState({ anchors: [] });
      setDrawMode(null);
    } else {
      setDrawingState({ anchors: newAnchors });
    }
  };

  const cancelDrawing = () => { setDrawingState({ anchors: [] }); setDrawMode(null); };
  const removeChannel = (id) => setChannels(prev => prev.filter(c => c.id !== id));
  const toggleVisibility = (id) => setChannels(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  const clearAll = () => {
    if (!window.confirm("Clear all data and channels?")) return;
    setData([]); setChannels([]);
  };
  const clearChannels = () => {
    if (!window.confirm("Clear all drawn channels (keep data)?")) return;
    setChannels([]);
  };

  if (!ready) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontFamily: font.mono }}>
      Initializing study workbench...
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: font.sans, padding: "0 0 40px" }}>

      {/* HEADER */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.surface }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: font.mono, letterSpacing: "0.08em", color: C.amber }}>
            BTC CHANNEL STUDY
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, fontFamily: font.mono, marginTop: 2 }}>
            Flywheel Playbook — IBIT mechanics research workbench · OHLCV at any timeframe
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small color={C.amber} onClick={() => setShowInput(!showInput)}>
            {showInput ? "Cancel" : data.length > 0 ? "📥 Re-import" : "📥 Import OHLCV"}
          </Btn>
          {channels.length > 0 && <Btn small color={C.textDim} onClick={clearChannels}>Clear Channels</Btn>}
          {data.length > 0 && <Btn small color={C.red} onClick={clearAll}>Reset All</Btn>}
        </div>
      </div>

      {/* DATA INPUT */}
      {showInput && (
        <div style={{ padding: "16px 24px" }}>
          <Card>
            <SectionHead>Paste OHLCV CSV (any timeframe)</SectionHead>
            <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim, marginBottom: 10, lineHeight: 1.5 }}>
              Required columns: <code style={{ color: C.amber }}>Date · Open · High · Low · Close</code> (Volume optional). Header preferred — columns are picked by name, so extra columns like <code style={{ color: C.textDim }}>% Change</code>, <code style={{ color: C.textDim }}>% Change vs Average</code>, <code style={{ color: C.textDim }}>Adj Close</code> are ignored automatically. Quoted fields with comma thousands separators (<code style={{ color: C.textDim }}>"87,384"</code>) are handled. Date accepts ISO 8601, <code style={{ color: C.textDim }}>YYYY-MM-DD HH:MM:SS</code>, or unix ms.
            </div>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={`date,open,high,low,close,volume\n2025-10-11 00:00:00,62000,62500,61800,62300,1500\n2025-10-11 04:00:00,62300,62800,62100,62700,1200\n...`}
              style={{ width: "100%", minHeight: 220, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, fontFamily: font.mono, fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
            />
            {parseError && <div style={{ color: C.red, fontSize: 12, fontFamily: font.mono, marginTop: 8 }}>⚠ {parseError}</div>}
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <Btn color={C.green} onClick={handleImport} disabled={!csvText.trim()}>Parse & Load</Btn>
              <Btn color={C.textDim} small onClick={() => { setCsvText(""); setParseError(""); }}>Clear textarea</Btn>
            </div>
          </Card>
        </div>
      )}

      {/* MAIN AREA */}
      {data.length > 0 ? (
        <div style={{ padding: "16px 24px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>

          {/* CHART */}
          <Card style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 10, fontFamily: font.mono, fontWeight: 700, letterSpacing: "0.1em", color: C.textMuted }}>
                {data.length} BARS · {new Date(data[0].time).toLocaleDateString()} → {new Date(data[data.length - 1].time).toLocaleDateString()} · LAST CLOSE ${data[data.length - 1].close.toFixed(2)}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn small color={C.purple} active={showPowerLaw} onClick={() => setShowPowerLaw(!showPowerLaw)}>
                  Power Law
                </Btn>
                <Btn small color={C.yellow} active={showRightTicks} onClick={() => setShowRightTicks(!showRightTicks)}>
                  Right Ticks
                </Btn>
              </div>
            </div>

            <Chart
              data={data}
              channels={channels}
              drawMode={drawMode}
              drawingState={drawingState}
              onChartClick={handleChartClick}
              onHoverBar={setHoverBar}
              hoverBar={hoverBar}
              showPowerLaw={showPowerLaw}
              powerLawFit={powerLawFit}
              showRightTicks={showRightTicks}
              wedge={wedge}
            />

            {/* Drawing instructions */}
            {drawMode && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: C.amberDim + "30", border: `1px solid ${C.amber}50`, borderRadius: 6, fontSize: 11, fontFamily: font.mono, color: C.amber, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  <strong>{drawMode.toUpperCase()}</strong> · click {drawingState.anchors.length}/3 ·{" "}
                  {drawingState.anchors.length === 0 && "first close anchor"}
                  {drawingState.anchors.length === 1 && "second close anchor (defines slope)"}
                  {drawingState.anchors.length === 2 && "third close anchor (defines parallel offset)"}
                </span>
                <button onClick={cancelDrawing} style={{ background: "none", border: "none", color: C.amber, cursor: "pointer", fontFamily: font.mono, fontSize: 11, textDecoration: "underline" }}>cancel</button>
              </div>
            )}

            {/* Hover info */}
            {hoverBar && !drawMode && (
              <div style={{ marginTop: 8, padding: "6px 12px", background: C.bg, borderRadius: 6, fontSize: 11, fontFamily: font.mono, display: "flex", gap: 14, flexWrap: "wrap", color: C.textDim }}>
                <span>{new Date(hoverBar.time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span>O ${hoverBar.open.toFixed(2)}</span>
                <span>H ${hoverBar.high.toFixed(2)}</span>
                <span>L ${hoverBar.low.toFixed(2)}</span>
                <span style={{ color: hoverBar.close >= hoverBar.open ? C.green : C.red, fontWeight: 700 }}>C ${hoverBar.close.toFixed(2)}</span>
                {hoverBar.volume > 0 && <span>V {(hoverBar.volume / 1e3).toFixed(1)}k</span>}
              </div>
            )}
          </Card>

          {/* SIDE PANEL */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Drawing tools */}
            <Card>
              <SectionHead>Drawing Tools</SectionHead>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Btn color={C.green} active={drawMode === "ascending"} onClick={() => { setDrawMode(drawMode === "ascending" ? null : "ascending"); setDrawingState({ anchors: [] }); }}>
                  ↗ Ascending Channel
                </Btn>
                <Btn color={C.red} active={drawMode === "descending"} onClick={() => { setDrawMode(drawMode === "descending" ? null : "descending"); setDrawingState({ anchors: [] }); }}>
                  ↘ Descending Channel
                </Btn>
              </div>
              <div style={{ marginTop: 10, fontSize: 10, fontFamily: font.mono, color: C.textMuted, lineHeight: 1.5 }}>
                3-click flow · two anchors define slope · third anchor defines parallel width · clicks snap to bar close (right-tick rule)
              </div>
            </Card>

            {/* Halving phase */}
            {halvingPhase && (
              <Card>
                <SectionHead>Halving Cycle</SectionHead>
                <div style={{ fontSize: 13, fontFamily: font.mono, color: C.amber, fontWeight: 700, marginBottom: 4 }}>
                  {halvingPhase.phase}
                </div>
                <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim, lineHeight: 1.5 }}>
                  {halvingPhase.daysSinceHalving}d since 2024-04-19<br />
                  {halvingPhase.daysToNextHalving}d until 2028-04-19<br />
                  Cycle: {halvingPhase.phasePct.toFixed(1)}%
                </div>
                <div style={{ marginTop: 8, height: 4, background: C.bg, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${halvingPhase.phasePct}%`, background: C.amber, transition: "width .3s" }} />
                </div>
              </Card>
            )}

            {/* Power law */}
            {powerLawFit && (
              <Card>
                <SectionHead>Power Law Fit</SectionHead>
                <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim, lineHeight: 1.5 }}>
                  log(price) ≈ {powerLawFit.a.toFixed(3)} + {powerLawFit.b.toFixed(3)} × log(days)
                </div>
                <div style={{ marginTop: 6, fontSize: 11, fontFamily: font.mono }}>
                  <span style={{ color: C.textDim }}>Current vs fit: </span>
                  <span style={{ color: data[data.length - 1].close > powerLawFit.estimate(data[data.length - 1].time) ? C.green : C.red, fontWeight: 700 }}>
                    {(((data[data.length - 1].close / powerLawFit.estimate(data[data.length - 1].time)) - 1) * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ marginTop: 4, fontSize: 9, fontFamily: font.mono, color: C.textMuted }}>
                  Fit is local to loaded window; full-history power law uses years of data.
                </div>
              </Card>
            )}

            {/* Wedge */}
            {wedge && (
              <Card>
                <SectionHead>Compression Wedge</SectionHead>
                {wedge.time > data[data.length - 1].time ? (
                  <>
                    <div style={{ fontSize: 13, fontFamily: font.mono, color: C.cyan, fontWeight: 700, marginBottom: 4 }}>
                      Converges {new Date(wedge.time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim }}>
                      ~{Math.floor((wedge.time - data[data.length - 1].time) / 86400000)} days from last bar<br />
                      At ~${wedge.price.toFixed(2)}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textMuted }}>
                    Channels diverging or already crossed — no future wedge convergence.
                  </div>
                )}
              </Card>
            )}

            {/* Channel list */}
            <Card>
              <SectionHead right={channels.length > 0 && <span style={{ fontSize: 9, fontFamily: font.mono, color: C.textMuted }}>{channels.filter(c => c.visible).length}/{channels.length} visible</span>}>
                Channels
              </SectionHead>
              {channels.length === 0 ? (
                <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textMuted, fontStyle: "italic", lineHeight: 1.5 }}>
                  No channels drawn yet. Use the drawing tools above.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {channels.map(ch => {
                    const color = ch.type === "ascending" ? C.green : C.red;
                    const dailySlope = ((ch.anchors[1].close - ch.anchors[0].close) / ((ch.anchors[1].time - ch.anchors[0].time) / 86400000));
                    const widthPct = (ch.anchors[2].close - (ch.anchors[0].close + ((ch.anchors[1].close - ch.anchors[0].close) / (ch.anchors[1].time - ch.anchors[0].time)) * (ch.anchors[2].time - ch.anchors[0].time))) / ch.anchors[0].close * 100;
                    return (
                      <div key={ch.id} style={{ padding: "8px 10px", background: C.bg, borderRadius: 6, border: `1px solid ${ch.visible ? color + "40" : C.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, background: color, borderRadius: "50%", display: "inline-block", opacity: ch.visible ? 1 : 0.3 }} />
                            <span style={{ fontSize: 12, fontFamily: font.mono, color: ch.visible ? C.text : C.textMuted, fontWeight: 700 }}>
                              {ch.label}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 2 }}>
                            <button onClick={() => toggleVisibility(ch.id)} title={ch.visible ? "Hide" : "Show"} style={{ background: "none", border: "none", color: ch.visible ? C.text : C.textMuted, cursor: "pointer", fontSize: 12, padding: "0 4px" }}>
                              {ch.visible ? "●" : "○"}
                            </button>
                            <button onClick={() => removeChannel(ch.id)} title="Delete" style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 12, padding: "0 4px" }}>
                              ✕
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: 9, fontFamily: font.mono, color: C.textDim, lineHeight: 1.4 }}>
                          slope: {dailySlope >= 0 ? "+" : ""}${dailySlope.toFixed(1)}/day<br />
                          width: {Math.abs(widthPct).toFixed(2)}% of first anchor
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Methodology note */}
            <Card style={{ background: C.surface, borderColor: C.borderHi }}>
              <SectionHead>Right-Tick Rule</SectionHead>
              <div style={{ fontSize: 10, fontFamily: font.mono, color: C.textDim, lineHeight: 1.5 }}>
                Channels anchor to <span style={{ color: C.yellow, fontWeight: 700 }}>closing prices only</span>. Wicks are visible (high/low ranges shown on bars) but never serve as channel anchors. Click anywhere on a bar — the click snaps to that bar's close.
              </div>
            </Card>

          </div>
        </div>
      ) : !showInput ? (
        <div style={{ padding: "60px 24px", textAlign: "center", color: C.textMuted, fontFamily: font.mono }}>
          <div style={{ fontSize: 14, marginBottom: 10, color: C.textDim }}>No data loaded.</div>
          <div style={{ fontSize: 11, lineHeight: 1.7, marginBottom: 18 }}>
            Click <strong style={{ color: C.amber }}>📥 Import OHLCV</strong> above and paste BTC data at any timeframe.<br />
            Sources: Binance API · CoinGecko · Yahoo Finance · TradingView export · CoinMarketCap historical · WSJ / Investing.com daily exports
          </div>
          <Btn color={C.amber} onClick={() => setShowInput(true)}>📥 Import OHLCV Now</Btn>
        </div>
      ) : null}
    </div>
  );
}
