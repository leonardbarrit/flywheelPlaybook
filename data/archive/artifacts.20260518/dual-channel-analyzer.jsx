import { useState, useEffect, useMemo, useCallback } from "react";

/* ─── CONSTANTS ─── */
const STORAGE_KEY = "dual-channel-analyzer-v1";
const MAX_IMAGE_DIM = 1568;

const EXTRACTION_PROMPT = `You are extracting dual-channel geometry from a stock or crypto chart screenshot for the Flywheel Playbook covered-call methodology.

The chart will have OHLC bars and one or more channels drawn on it (filled parallelograms or pairs of parallel lines).

Return ONLY a JSON object, no markdown fences, no surrounding prose. Strict schema:

{
  "ticker": "<ticker symbol shown on chart>",
  "timeframe": "<e.g. '4 Hours', 'Daily'>",
  "current_date": "<YYYY-MM-DD of the rightmost / most recent bar>",
  "current_price": <number, the most recent close>,
  "ascending_channel": {
    "found": <true|false>,
    "a1_date": "<YYYY-MM-DD>",
    "a1_close": <number>,
    "a2_date": "<YYYY-MM-DD>",
    "a2_close": <number>,
    "a3_date": "<YYYY-MM-DD>",
    "a3_close": <number>,
    "confidence": "<high|medium|low>",
    "notes": "<short caveat or empty>"
  },
  "descending_channel": {
    "found": <true|false>,
    "a1_date": "<YYYY-MM-DD>",
    "a1_close": <number>,
    "a2_date": "<YYYY-MM-DD>",
    "a2_close": <number>,
    "a3_date": "<YYYY-MM-DD>",
    "a3_close": <number>,
    "confidence": "<high|medium|low>",
    "notes": "<short caveat or empty>"
  },
  "global_notes": "<anything worth flagging about extraction quality>"
}

Anchor rules (CRITICAL — get these right):
- Ascending channel = positive slope. a1 and a2 are TWO points on the LOWER line (support, swing-low closes). a3 is ONE point on the UPPER line (resistance, swing-high close).
- Descending channel = negative slope. a1 and a2 are TWO points on the UPPER line (resistance, swing-high closes). a3 is ONE point on the LOWER line (support, swing-low close).
- For a1 and a2: pick the LEFTMOST and RIGHTMOST endpoints of the line where the channel is drawn. Maximum horizontal separation = most accurate slope.
- Closing prices govern (the right tick of each OHLC bar). If you can identify the close of the bar at each anchor, prefer that over mid-bar price.
- Read prices off the y-axis labels. Read dates off the x-axis labels.
- If a channel type is NOT visible on the chart, set "found": false and leave the anchor fields null. Do NOT invent a channel that isn't drawn.
- A "compression wedge" or "pennant" near current price may be a separate descending channel — evaluate it by slope. If slope is negative, classify as descending.
- Set "confidence" honestly: 'high' if axis labels and channel boundaries are unambiguous, 'medium' if some interpolation was needed, 'low' if the chart is ambiguous or labels obscured.

Output JSON only.`;

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
  red: "#ff5252",
  redDim: "#5c1a1a",
  amber: "#ffab00",
  amberDim: "#5c3d00",
  blue: "#448aff",
  blueDim: "#1a3366",
  cyan: "#18ffff",
  cyanDim: "#004d4d",
  purple: "#b388ff",
};

const font = {
  mono: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Consolas', monospace",
  sans: "'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
};

/* ─── DATE HELPERS ─── */
const dateToMs = (d) => (d ? new Date(d + "T00:00:00").getTime() : NaN);
const msToDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const todayStr = () => msToDate(Date.now());
const daysFloor = (ms) => Math.floor(ms / 86400000);
const fmtDate = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtUSD = (n) => isFinite(n) ? `$${n.toFixed(2)}` : "—";
const fmtUSDk = (n) => {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
};

/* ─── CHANNEL MATH ─── */
function buildChannel(a1, a2, a3, type) {
  if (!a1 || !a2 || !a3) return null;
  if (a2.time === a1.time) return null;
  if (![a1.close, a2.close, a3.close].every(isFinite)) return null;

  const slope = (a2.close - a1.close) / (a2.time - a1.time); // $/ms
  const slopePerDay = slope * 86400000;
  const offset = a3.close - (a1.close + slope * (a3.time - a1.time));
  const line1At = (t) => a1.close + slope * (t - a1.time);
  const line2At = (t) => line1At(t) + offset;
  const isAsc = type === "ascending";
  return {
    type, a1, a2, a3,
    slope, slopePerDay, offset,
    line1At, line2At,
    supportAt: isAsc ? line1At : line2At,
    resistanceAt: isAsc ? line2At : line1At,
    widthAt: (t) => Math.abs(line2At(t) - line1At(t)),
  };
}

function findWedge(asc, desc) {
  if (!asc || !desc) return null;
  // Wedge = ascending resistance (asc.line2) ∩ descending support (desc.line2)
  const m1 = asc.slope;
  const m2 = desc.slope;
  const b1 = asc.a1.close - asc.slope * asc.a1.time + asc.offset;
  const b2 = desc.a1.close - desc.slope * desc.a1.time + desc.offset;
  if (Math.abs(m1 - m2) < 1e-20) return null;
  const t = (b2 - b1) / (m1 - m2);
  const price = m1 * t + b1;
  return { time: t, price };
}

function roundNumberCeiling(price, increment) {
  return Math.ceil(price / increment) * increment;
}

/* ─── IMAGE HELPERS ─── */
async function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`FileReader error: ${reader.error?.message || "unknown"}`));
    reader.onabort = () => reject(new Error("FileReader aborted."));
    try {
      reader.readAsDataURL(file);
    } catch (e) {
      reject(new Error("FileReader.readAsDataURL threw: " + (e.message || e.toString())));
    }
  });
}

async function decodeImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed (browser could not parse the image data)."));
    img.src = dataUrl;
  });
}

// Robust pipeline: FileReader → optional canvas resize → fallback to original bytes if resize fails.
async function processImageFile(file, maxDim = MAX_IMAGE_DIM, log = () => {}) {
  log(`processImageFile start · ${file.name} · ${file.type} · ${(file.size / 1024).toFixed(0)}KB`);

  // Step 1: FileReader produces a data URL directly. Works without blob URLs, no canvas required.
  const originalDataUrl = await readFileAsDataURL(file);
  if (!originalDataUrl || typeof originalDataUrl !== "string") {
    throw new Error("FileReader returned empty or non-string result.");
  }
  log(`FileReader OK · data URL length ${originalDataUrl.length}`);

  const originalBase64 = originalDataUrl.split(",")[1] || "";
  if (originalBase64.length < 100) throw new Error(`Original base64 too short (${originalBase64.length} chars) — file may be corrupt.`);

  const mediaType = file.type && file.type.startsWith("image/") ? file.type : "image/png";

  // Step 2: try to decode image to get dimensions.
  let img = null;
  try {
    img = await decodeImage(originalDataUrl);
    log(`Image decoded · ${img.width}×${img.height}`);
  } catch (e) {
    log(`Image decode failed: ${e.message} — sending original bytes anyway.`);
    return {
      base64: originalBase64,
      previewUrl: originalDataUrl,
      mediaType,
      width: null, height: null,
      originalWidth: null, originalHeight: null,
      resized: false,
      warning: `Could not decode image dimensions; sending original ${(file.size / 1024).toFixed(0)}KB file.`,
    };
  }

  if (!img.width || !img.height) {
    log("Image decoded with zero dimensions — sending original.");
    return {
      base64: originalBase64,
      previewUrl: originalDataUrl,
      mediaType,
      width: null, height: null,
      originalWidth: null, originalHeight: null,
      resized: false,
      warning: "Image had zero dimensions; sending original.",
    };
  }

  const longestEdge = Math.max(img.width, img.height);

  // Step 3: if image is already small enough, send original bytes (skip canvas).
  if (longestEdge <= maxDim) {
    log(`Image within size limit (${longestEdge} ≤ ${maxDim}); sending original.`);
    return {
      base64: originalBase64,
      previewUrl: originalDataUrl,
      mediaType,
      width: img.width, height: img.height,
      originalWidth: img.width, originalHeight: img.height,
      resized: false,
    };
  }

  // Step 4: try canvas resize, with progressive fallback.
  const dimensionAttempts = [maxDim, 1280, 1024, 768];
  for (const dim of dimensionAttempts) {
    const scale = dim / longestEdge;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("getContext('2d') returned null.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const resizedDataUrl = canvas.toDataURL("image/jpeg", 0.9);
      if (!resizedDataUrl || !resizedDataUrl.startsWith("data:image/")) {
        throw new Error(`canvas.toDataURL returned invalid result (length ${resizedDataUrl?.length || 0}).`);
      }
      const resizedBase64 = resizedDataUrl.split(",")[1];
      if (!resizedBase64 || resizedBase64.length < 100) throw new Error("Resized base64 too short.");
      log(`Canvas resize OK at ${w}×${h} · base64 length ${resizedBase64.length}`);
      return {
        base64: resizedBase64,
        previewUrl: resizedDataUrl,
        mediaType: "image/jpeg",
        width: w, height: h,
        originalWidth: img.width, originalHeight: img.height,
        resized: true,
        attemptsUsed: dimensionAttempts.indexOf(dim) + 1,
      };
    } catch (e) {
      log(`Canvas resize failed at ${dim}px: ${e.message}`);
    }
  }

  // Step 5: all canvas attempts failed — fall back to original bytes.
  log("All canvas attempts failed — falling back to original bytes.");
  return {
    base64: originalBase64,
    previewUrl: originalDataUrl,
    mediaType,
    width: img.width, height: img.height,
    originalWidth: img.width, originalHeight: img.height,
    resized: false,
    warning: `Browser canvas resize failed; sending original ${img.width}×${img.height} ${mediaType} (${(file.size / 1024).toFixed(0)}KB) directly to vision API.`,
  };
}

function parseExtractionResponse(text) {
  let cleaned = text.trim();
  // Strip optional markdown fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  // Find first { and last } in case there's stray prose
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);
  return JSON.parse(cleaned);
}

function classifyMode(currentPrice, asc, desc, currentMs) {
  if (!asc || !desc || !isFinite(currentPrice)) return null;
  const ascSup = asc.supportAt(currentMs);
  const ascRes = asc.resistanceAt(currentMs);
  const descSup = desc.supportAt(currentMs);
  const descRes = desc.resistanceAt(currentMs);

  const aboveAscRes = currentPrice > ascRes;
  const belowDescSup = currentPrice < descSup;
  const inWedge = currentPrice >= Math.max(ascSup, descSup) && currentPrice <= Math.min(ascRes, descRes);
  const upperHalf = currentPrice > (ascRes + descSup) / 2;

  if (aboveAscRes) {
    return {
      mode: "Mode 3 candidate",
      tone: "amber",
      detail: `Price ${fmtUSD(currentPrice)} is above projected ascending resistance ${fmtUSD(ascRes)} — potential breakout. Mode 3 (Offensive Roll) only if rally shows bull-trap characteristics; otherwise reassess channel.`,
    };
  }
  if (belowDescSup) {
    return {
      mode: "Mode 2 candidate",
      tone: "red",
      detail: `Price ${fmtUSD(currentPrice)} is below projected descending support ${fmtUSD(descSup)} — descending dominance. Consider Mode 2 (planned directional exit) at descending resistance.`,
    };
  }
  if (inWedge) {
    if (upperHalf) {
      return {
        mode: "Mode 1 — defensive",
        tone: "blue",
        detail: `Price in upper half of wedge (closer to ascending resistance). Strike selection should bias higher with extra room — descending channel pressure not currently dominant but channels are converging.`,
      };
    }
    return {
      mode: "Mode 1 — standard",
      tone: "green",
      detail: `Price in lower half of wedge — standard ascending-channel CC entry territory. Strike at ascending resistance + round number + 0.20 delta confirmation.`,
    };
  }
  return {
    mode: "Edge of wedge",
    tone: "amber",
    detail: `Price near or outside one channel boundary but not the other — re-check anchor accuracy on Fidelity chart.`,
  };
}

function sanityChecks(asc, desc, ascA1, ascA2, descA1, descA2, currentMs) {
  const checks = [];
  const wedge = findWedge(asc, desc);

  if (asc) {
    if (asc.slope <= 0) checks.push({ severity: "error", msg: `Ascending channel slope is ${asc.slopePerDay >= 0 ? "+" : ""}${asc.slopePerDay.toFixed(2)}/day — should be positive. Anchor 1 close should be lower than anchor 2 close.` });
    if (ascA1 && ascA2) {
      const span = (ascA2.time - ascA1.time) / 86400000;
      if (span < 14) checks.push({ severity: "warn", msg: `Ascending anchors are only ${span.toFixed(0)} days apart — channels need ~14+ days for meaningful slope.` });
    }
    if (asc.offset <= 0) checks.push({ severity: "warn", msg: "Ascending channel: anchor 3 should be a swing high above the support line. The parallel offset is ≤ 0 — likely transposed anchors." });
    if (ascA1 && ascA2 && ascA1.time >= ascA2.time) checks.push({ severity: "error", msg: "Ascending anchors out of chronological order — anchor 1 date should precede anchor 2." });
  }

  if (desc) {
    if (desc.slope >= 0) checks.push({ severity: "error", msg: `Descending channel slope is ${desc.slopePerDay >= 0 ? "+" : ""}${desc.slopePerDay.toFixed(2)}/day — should be negative. Anchor 1 close should be higher than anchor 2 close.` });
    if (descA1 && descA2) {
      const span = (descA2.time - descA1.time) / 86400000;
      if (span < 14) checks.push({ severity: "warn", msg: `Descending anchors are only ${span.toFixed(0)} days apart — channels need ~14+ days for meaningful slope.` });
    }
    if (desc.offset >= 0) checks.push({ severity: "warn", msg: "Descending channel: anchor 3 should be a swing low below the resistance line. The parallel offset is ≥ 0 — likely transposed anchors." });
    if (descA1 && descA2 && descA1.time >= descA2.time) checks.push({ severity: "error", msg: "Descending anchors out of chronological order — anchor 1 date should precede anchor 2." });
  }

  if (asc && desc) {
    if (!wedge) {
      checks.push({ severity: "error", msg: "Channels are effectively parallel — wedge does not converge. The compression-wedge methodology requires convergent channels." });
    } else {
      if (wedge.time < currentMs) {
        const daysAgo = Math.round((currentMs - wedge.time) / 86400000);
        checks.push({ severity: "error", msg: `Wedge convergence date is ${daysAgo} days in the past — channels have already crossed. Anchors may be stale, or the breakout has already happened. Re-anchor on more recent swings.` });
      } else if (wedge.time - currentMs < 7 * 86400000) {
        const daysAhead = Math.ceil((wedge.time - currentMs) / 86400000);
        checks.push({ severity: "warn", msg: `Wedge convergence is only ${daysAhead} days away — breakout imminent. Strike selection beyond convergence is unreliable; the methodology breaks down past the wedge.` });
      }
    }
  }

  if (checks.length === 0 && asc && desc) {
    checks.push({ severity: "ok", msg: "Channels pass structural sanity checks." });
  }
  return checks;
}

/* ─── UI COMPONENTS ─── */
function Btn({ children, onClick, color = C.green, disabled, active, small, style: sx }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? "5px 10px" : "8px 14px",
      borderRadius: 5, fontSize: small ? 11 : 12, fontFamily: font.mono, fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer",
      border: `1px solid ${color}${active ? "" : "50"}`,
      background: active ? color + "30" : color + "12",
      color, opacity: disabled ? 0.35 : 1, transition: "all .15s",
      letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 5, ...sx,
    }}>{children}</button>
  );
}

function Card({ children, style: sx }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, ...sx }}>{children}</div>;
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

function Field({ label, type = "text", value, onChange, placeholder, hint, mono = true, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label style={{ fontSize: 9, fontFamily: font.mono, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: color || C.textMuted }}>
        {label}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} step={type === "number" ? "any" : undefined}
        style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "6px 8px", color: C.text, fontSize: 12, fontFamily: mono ? font.mono : font.sans, outline: "none", boxSizing: "border-box", width: "100%" }}
        onFocus={e => e.target.style.borderColor = (color || C.green) + "70"}
        onBlur={e => e.target.style.borderColor = C.border}
      />
      {hint && <span style={{ fontSize: 9, fontFamily: font.mono, color: C.textMuted }}>{hint}</span>}
    </div>
  );
}

function AnchorRow({ idx, label, channelColor, dateValue, closeValue, onDate, onClose }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 1fr", gap: 8, alignItems: "end" }}>
      <div style={{ fontSize: 12, fontFamily: font.mono, fontWeight: 700, color: channelColor, paddingBottom: 6 }}>a{idx}</div>
      <Field label={`${label} date`} type="date" value={dateValue} onChange={onDate} color={channelColor} />
      <Field label={`${label} close`} type="number" value={closeValue} onChange={onClose} placeholder="0.00" color={channelColor} />
    </div>
  );
}

function ResultRow({ label, value, color, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "4px 0" }}>
      <span style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim, letterSpacing: "0.04em" }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 13, fontFamily: font.mono, fontWeight: 700, color: color || C.text }}>{value}</div>
        {sub && <div style={{ fontSize: 9, fontFamily: font.mono, color: C.textMuted }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ─── EMPTY STATE ─── */
const EMPTY = {
  ticker: "NVDA",
  currentDate: todayStr(),
  currentPrice: "",
  targetExpiration: "",
  strikeIncrement: "5",
  asc: { a1d: "", a1c: "", a2d: "", a2c: "", a3d: "", a3c: "" },
  desc: { a1d: "", a1c: "", a2d: "", a2c: "", a3d: "", a3c: "" },
};

const SAMPLE = {
  ticker: "NVDA",
  currentDate: "2026-04-27",
  currentPrice: "210.00",
  targetExpiration: "2026-06-05",
  strikeIncrement: "5",
  asc: { a1d: "2025-11-15", a1c: "138.50", a2d: "2026-03-20", a2c: "175.20", a3d: "2026-02-26", a3c: "184.89" },
  desc: { a1d: "2026-01-22", a1c: "200.50", a2d: "2026-04-15", a2c: "205.80", a3d: "2026-03-26", a3c: "166.40" },
};

/* ─── MAIN ─── */
export default function DualChannelAnalyzer() {
  const [state, setState] = useState(EMPTY);
  const [ready, setReady] = useState(false);

  // Vision extraction state
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMeta, setImageMeta] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extractResult, setExtractResult] = useState(null);
  const [debugLog, setDebugLog] = useState([]);

  const appendLog = useCallback((msg) => {
    setDebugLog(prev => [...prev.slice(-19), `${new Date().toISOString().slice(11, 19)} · ${msg}`]);
    try { console.log("[DCA]", msg); } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r?.value) setState(JSON.parse(r.value));
      } catch {}
      setReady(true);
    })();
  }, []);

  const handleImageFile = useCallback(async (file) => {
    appendLog(`handleImageFile · ${file?.name || "(no name)"} · ${file?.type || "(no type)"} · ${file?.size || 0}B`);
    if (!file) {
      setExtractError("No file provided.");
      appendLog("ERROR: no file");
      return;
    }
    // Be tolerant: some clipboard images come without a type — attempt to load anyway.
    if (file.type && !file.type.startsWith("image/")) {
      setExtractError(`Not an image file (got type "${file.type}").`);
      appendLog(`ERROR: non-image type "${file.type}"`);
      return;
    }
    setExtractError("");
    setExtractResult(null);
    setImageLoading(true);
    try {
      const result = await processImageFile(file, MAX_IMAGE_DIM, appendLog);
      setImagePreview(result.previewUrl);
      setImageBase64(result.base64);
      setImageMeta({
        width: result.width, height: result.height,
        originalWidth: result.originalWidth, originalHeight: result.originalHeight,
        mediaType: result.mediaType,
        fileName: file.name, fileSize: file.size,
        resized: result.resized,
        warning: result.warning,
      });
      appendLog(`SUCCESS · base64 length ${result.base64.length} · mediaType ${result.mediaType}`);
      if (result.warning) appendLog(`WARN · ${result.warning}`);
    } catch (err) {
      const msg = err?.message || err?.toString() || "unknown error";
      setExtractError("Failed to load image: " + msg);
      appendLog(`ERROR · ${msg}`);
    } finally {
      setImageLoading(false);
    }
  }, [appendLog]);

  // Global paste listener — paste any image to upload
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleImageFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleImageFile]);

  const onFilePicker = (e) => {
    appendLog(`file picker change · ${e.target.files?.length || 0} files`);
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
    else appendLog("ERROR: file picker returned no file");
    e.target.value = "";
  };

  const onDrop = (e) => {
    e.preventDefault();
    appendLog(`drop event · ${e.dataTransfer?.files?.length || 0} files`);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageFile(file);
    else appendLog("ERROR: drop event had no file");
  };

  const pasteFromClipboard = useCallback(async () => {
    setExtractError("");
    appendLog("pasteFromClipboard clicked");
    if (!navigator.clipboard) {
      setExtractError("navigator.clipboard is undefined in this context.");
      appendLog("ERROR: navigator.clipboard undefined");
      return;
    }
    if (typeof navigator.clipboard.read !== "function") {
      setExtractError("navigator.clipboard.read() unavailable. Try drag-drop or file picker.");
      appendLog("ERROR: clipboard.read not a function");
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      appendLog(`clipboard.read() returned ${items.length} items`);
      for (const item of items) {
        appendLog(`clipboard item types: [${item.types.join(", ")}]`);
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            appendLog(`got blob · type ${type} · size ${blob.size}B`);
            const ext = type.split("/")[1] || "png";
            const file = new File([blob], `clipboard-${Date.now()}.${ext}`, { type });
            await handleImageFile(file);
            return;
          }
        }
      }
      setExtractError("No image found on clipboard. Copy a screenshot first, then click again.");
      appendLog("ERROR: no image type in clipboard items");
    } catch (err) {
      const msg = err?.message || err?.name || "unknown";
      if (err?.name === "NotAllowedError") {
        setExtractError("Browser blocked clipboard access. Approve the prompt, or use drag-drop / file picker.");
      } else {
        setExtractError("Clipboard read failed: " + msg);
      }
      appendLog(`ERROR · clipboard.read · ${msg}`);
    }
  }, [handleImageFile, appendLog]);

  const clearImage = () => {
    setImagePreview(null);
    setImageBase64(null);
    setImageMeta(null);
    setExtractError("");
    setExtractResult(null);
  };

  const extractFromImage = async () => {
    if (!imageBase64) return;
    setExtracting(true);
    setExtractError("");
    setExtractResult(null);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: imageMeta?.mediaType || "image/jpeg", data: imageBase64 } },
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          }],
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message || "API error");
      const text = data.content?.find(b => b.type === "text")?.text || "";
      if (!text) throw new Error("No text returned from extraction.");
      const parsed = parseExtractionResponse(text);
      setExtractResult(parsed);

      // Auto-fill form fields from extraction
      const next = { ...state };
      if (parsed.ticker) next.ticker = String(parsed.ticker).toUpperCase();
      if (parsed.current_date) next.currentDate = parsed.current_date;
      if (parsed.current_price != null && isFinite(parsed.current_price)) next.currentPrice = String(parsed.current_price);
      if (parsed.ascending_channel?.found) {
        const a = parsed.ascending_channel;
        next.asc = {
          a1d: a.a1_date || "", a1c: a.a1_close != null ? String(a.a1_close) : "",
          a2d: a.a2_date || "", a2c: a.a2_close != null ? String(a.a2_close) : "",
          a3d: a.a3_date || "", a3c: a.a3_close != null ? String(a.a3_close) : "",
        };
      }
      if (parsed.descending_channel?.found) {
        const d = parsed.descending_channel;
        next.desc = {
          a1d: d.a1_date || "", a1c: d.a1_close != null ? String(d.a1_close) : "",
          a2d: d.a2_date || "", a2c: d.a2_close != null ? String(d.a2_close) : "",
          a3d: d.a3_date || "", a3c: d.a3_close != null ? String(d.a3_close) : "",
        };
      }
      setState(next);
      try { await window.storage.set(STORAGE_KEY, JSON.stringify(next)); } catch {}
    } catch (err) {
      setExtractError(err.message || "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  };

  const persist = useCallback(async (s) => {
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }, []);

  const update = (patch) => setState(prev => { const next = { ...prev, ...patch }; persist(next); return next; });
  const updateAsc = (patch) => setState(prev => { const next = { ...prev, asc: { ...prev.asc, ...patch } }; persist(next); return next; });
  const updateDesc = (patch) => setState(prev => { const next = { ...prev, desc: { ...prev.desc, ...patch } }; persist(next); return next; });

  /* ─── DERIVED ANALYTICS ─── */
  const analysis = useMemo(() => {
    const currentMs = dateToMs(state.currentDate);
    const targetMs = dateToMs(state.targetExpiration);
    const currentPrice = parseFloat(state.currentPrice);
    const increment = parseFloat(state.strikeIncrement) || 5;

    const ascA1 = state.asc.a1d && state.asc.a1c ? { time: dateToMs(state.asc.a1d), close: parseFloat(state.asc.a1c) } : null;
    const ascA2 = state.asc.a2d && state.asc.a2c ? { time: dateToMs(state.asc.a2d), close: parseFloat(state.asc.a2c) } : null;
    const ascA3 = state.asc.a3d && state.asc.a3c ? { time: dateToMs(state.asc.a3d), close: parseFloat(state.asc.a3c) } : null;
    const descA1 = state.desc.a1d && state.desc.a1c ? { time: dateToMs(state.desc.a1d), close: parseFloat(state.desc.a1c) } : null;
    const descA2 = state.desc.a2d && state.desc.a2c ? { time: dateToMs(state.desc.a2d), close: parseFloat(state.desc.a2c) } : null;
    const descA3 = state.desc.a3d && state.desc.a3c ? { time: dateToMs(state.desc.a3d), close: parseFloat(state.desc.a3c) } : null;

    const asc = buildChannel(ascA1, ascA2, ascA3, "ascending");
    const desc = buildChannel(descA1, descA2, descA3, "descending");

    const wedge = (asc && desc) ? findWedge(asc, desc) : null;
    const checks = sanityChecks(asc, desc, ascA1, ascA2, descA1, descA2, isFinite(currentMs) ? currentMs : Date.now());
    const mode = classifyMode(currentPrice, asc, desc, isFinite(currentMs) ? currentMs : Date.now());

    // Strike projections
    let strikeProj = null;
    if (asc && desc && isFinite(targetMs)) {
      const ascResAtExp = asc.resistanceAt(targetMs);
      const descSupAtExp = desc.supportAt(targetMs);
      const descResAtExp = desc.resistanceAt(targetMs);
      const ascSupAtExp = asc.supportAt(targetMs);
      const dteFromCurrent = isFinite(currentMs) ? Math.round((targetMs - currentMs) / 86400000) : null;
      const wedgeBeforeExp = wedge && wedge.time < targetMs;
      const mode1Strike = roundNumberCeiling(ascResAtExp, increment);
      const mode2Strike = roundNumberCeiling(descResAtExp, increment);
      const mode1Buffer = ((mode1Strike - ascResAtExp) / ascResAtExp) * 100;

      strikeProj = {
        targetMs, dteFromCurrent,
        ascResAtExp, descSupAtExp, descResAtExp, ascSupAtExp,
        wedgeBeforeExp,
        mode1Strike, mode1Buffer,
        mode2Strike,
        widthAtExp: Math.min(asc.widthAt(targetMs), desc.widthAt(targetMs)),
      };
    }

    return {
      currentMs: isFinite(currentMs) ? currentMs : null,
      currentPrice: isFinite(currentPrice) ? currentPrice : null,
      targetMs: isFinite(targetMs) ? targetMs : null,
      asc, desc, wedge, checks, mode, strikeProj,
    };
  }, [state]);

  if (!ready) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontFamily: font.mono }}>
      Initializing analyzer...
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: font.sans, padding: "0 0 40px" }}>

      {/* HEADER */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.surface }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: font.mono, letterSpacing: "0.08em", color: C.cyan }}>
            DUAL-CHANNEL ANALYZER
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, fontFamily: font.mono, marginTop: 2 }}>
            Flywheel Playbook — read channels off Fidelity, compute geometry & strike candidates
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small color={C.purple} onClick={() => { setState(SAMPLE); persist(SAMPLE); }}>Load Sample</Btn>
          <Btn small color={C.red} onClick={() => { if (window.confirm("Clear all inputs?")) { setState(EMPTY); persist(EMPTY); } }}>Clear</Btn>
        </div>
      </div>

      {/* SCREENSHOT EXTRACTION */}
      <div style={{ padding: "16px 24px 0" }}>
        <Card>
          <SectionHead right={
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {imagePreview && (
                <>
                  <Btn small color={C.cyan} onClick={extractFromImage} disabled={extracting}>
                    {extracting ? "⏳ Extracting..." : "⚡ Extract Channels"}
                  </Btn>
                  <Btn small color={C.textDim} onClick={clearImage} disabled={extracting}>Clear Image</Btn>
                </>
              )}
            </div>
          }>
            Screenshot Input
          </SectionHead>

          {!imagePreview ? (
            <div>
              <div
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                style={{
                  border: `2px dashed ${imageLoading ? C.cyan : extractError ? C.red : C.border}`,
                  borderRadius: 8,
                  padding: "32px 20px",
                  textAlign: "center",
                  background: C.bg,
                  cursor: imageLoading ? "wait" : "pointer",
                  transition: "border-color .15s",
                }}
                onClick={() => { if (!imageLoading) document.getElementById("dca-file-input")?.click(); }}
              >
                <input id="dca-file-input" type="file" accept="image/*" onChange={onFilePicker} style={{ display: "none" }} />
                {imageLoading ? (
                  <>
                    <div style={{ fontSize: 14, fontFamily: font.mono, color: C.cyan, fontWeight: 700, marginBottom: 6 }}>
                      ⏳ Loading image...
                    </div>
                    <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim }}>
                      Decoding and resizing for vision API. Large screenshots may take a few seconds.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontFamily: font.mono, color: C.cyan, fontWeight: 700, marginBottom: 10 }}>
                      Upload chart screenshot
                    </div>

                    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                      <Btn color={C.cyan} onClick={pasteFromClipboard}>
                        📋 Paste from Clipboard
                      </Btn>
                      <Btn color={C.green} onClick={() => document.getElementById("dca-file-input")?.click()}>
                        📁 Pick File
                      </Btn>
                    </div>

                    <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textDim, lineHeight: 1.6 }}>
                      Or drag &amp; drop the image directly into this box.
                    </div>
                    <div style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted, marginTop: 6, lineHeight: 1.5 }}>
                      Note: Ctrl+V on the page may not reach the artifact iframe. The <strong style={{ color: C.cyan }}>Paste from Clipboard</strong> button uses the Clipboard API directly and is the reliable path. The browser may prompt for clipboard permission the first time.
                    </div>
                    <div style={{ marginTop: 16, fontSize: 10, fontFamily: font.mono, color: C.textMuted, lineHeight: 1.6, textAlign: "left", maxWidth: 720, margin: "16px auto 0", paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                      <strong style={{ color: C.amber }}>Conventions for best extraction:</strong><br />
                      · Full-screen Fidelity chart screenshot — y-axis prices and x-axis dates clearly visible<br />
                      · Current price marker visible on the right edge<br />
                      · Ticker + timeframe label visible at top<br />
                      · Channels drawn as filled parallelograms or parallel line pairs (Fidelity defaults work)<br />
                      · If you have both an ascending channel and a smaller compression wedge inside it, vision will classify the wedge as a separate descending channel based on its slope<br />
                      · Tool downscales internally to 1568px on longest edge — full 5120-wide screenshots are fine to upload
                    </div>
                  </>
                )}
              </div>
              {extractError && !imageLoading && (
                <div style={{ marginTop: 10, padding: "10px 14px", background: C.redDim + "30", border: `1px solid ${C.red}50`, borderRadius: 6, fontSize: 11, fontFamily: font.mono, color: C.red, lineHeight: 1.5 }}>
                  ⚠ {extractError}
                </div>
              )}
              {debugLog.length > 0 && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 9, fontFamily: font.mono, color: C.textMuted, letterSpacing: "0.12em", fontWeight: 700 }}>
                      DEBUG LOG (last {debugLog.length})
                    </span>
                    <button onClick={() => setDebugLog([])} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 10, fontFamily: font.mono, textDecoration: "underline" }}>
                      clear
                    </button>
                  </div>
                  <div style={{ fontSize: 10, fontFamily: font.mono, color: C.textDim, lineHeight: 1.5, maxHeight: 160, overflowY: "auto" }}>
                    {debugLog.map((line, i) => (
                      <div key={i} style={{ color: line.includes("ERROR") ? C.red : line.includes("WARN") ? C.amber : line.includes("SUCCESS") ? C.green : C.textDim }}>
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12, alignItems: "start" }}>
              <div style={{ background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, padding: 6, overflow: "hidden" }}>
                <img src={imagePreview} alt="Chart screenshot" style={{ width: "100%", display: "block", borderRadius: 4 }} />
                {imageMeta && (
                  <div style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted, padding: "6px 8px 2px" }}>
                    {imageMeta.originalWidth}×{imageMeta.originalHeight} → {imageMeta.width}×{imageMeta.height} {imageMeta.mediaType?.replace("image/", "") || "jpeg"}{imageMeta.attempts > 1 ? ` · downscaled to fit (attempt ${imageMeta.attempts})` : " · downscaled for vision"}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {extracting && (
                  <div style={{ padding: "12px 14px", background: C.cyanDim + "30", border: `1px solid ${C.cyan}50`, borderRadius: 6, fontSize: 11, fontFamily: font.mono, color: C.cyan, lineHeight: 1.5 }}>
                    Sending to Claude vision API...<br />
                    Extracting ticker, current price, and channel anchors.
                  </div>
                )}
                {extractError && (
                  <div style={{ padding: "12px 14px", background: C.redDim + "30", border: `1px solid ${C.red}50`, borderRadius: 6, fontSize: 11, fontFamily: font.mono, color: C.red, lineHeight: 1.5 }}>
                    ⚠ {extractError}
                  </div>
                )}
                {extractResult && !extracting && (
                  <div style={{ padding: "10px 12px", background: C.greenDim + "20", border: `1px solid ${C.green}40`, borderRadius: 6, fontSize: 10, fontFamily: font.mono, color: C.text, lineHeight: 1.6 }}>
                    <div style={{ color: C.green, fontWeight: 700, marginBottom: 4 }}>✓ Extracted</div>
                    {extractResult.ticker && <div>Ticker: <strong>{extractResult.ticker}</strong> · {extractResult.timeframe || "—"}</div>}
                    {extractResult.current_price && <div>Current: <strong>${Number(extractResult.current_price).toLocaleString()}</strong> ({extractResult.current_date})</div>}
                    <div style={{ marginTop: 4 }}>
                      Asc: {extractResult.ascending_channel?.found ? <span style={{ color: C.green }}>found ({extractResult.ascending_channel.confidence})</span> : <span style={{ color: C.textMuted }}>none</span>}
                    </div>
                    <div>
                      Desc: {extractResult.descending_channel?.found ? <span style={{ color: C.red }}>found ({extractResult.descending_channel.confidence})</span> : <span style={{ color: C.textMuted }}>none</span>}
                    </div>
                    {extractResult.global_notes && (
                      <div style={{ marginTop: 6, color: C.textDim, fontStyle: "italic" }}>{extractResult.global_notes}</div>
                    )}
                    {(extractResult.ascending_channel?.notes || extractResult.descending_channel?.notes) && (
                      <div style={{ marginTop: 4, color: C.textDim }}>
                        {extractResult.ascending_channel?.notes && <div>↗ {extractResult.ascending_channel.notes}</div>}
                        {extractResult.descending_channel?.notes && <div>↘ {extractResult.descending_channel.notes}</div>}
                      </div>
                    )}
                    <div style={{ marginTop: 6, color: C.amber }}>Verify the auto-filled fields below against your chart, then read the analysis on the right.</div>
                  </div>
                )}
                {!extracting && !extractResult && !extractError && (
                  <div style={{ padding: "12px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, fontFamily: font.mono, color: C.textDim, lineHeight: 1.5 }}>
                    Image loaded. Click <strong style={{ color: C.cyan }}>Extract Channels</strong> to send it to Claude vision and auto-fill the form below.
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* CONTEXT BAR */}
      <div style={{ padding: "16px 24px 0" }}>
        <Card>
          <SectionHead>Context</SectionHead>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12 }}>
            <Field label="Ticker" value={state.ticker} onChange={v => update({ ticker: v.toUpperCase() })} placeholder="NVDA" />
            <Field label="Current date" type="date" value={state.currentDate} onChange={v => update({ currentDate: v })} />
            <Field label="Current price" type="number" value={state.currentPrice} onChange={v => update({ currentPrice: v })} placeholder="210.00" />
            <Field label="Target expiration" type="date" value={state.targetExpiration} onChange={v => update({ targetExpiration: v })} hint="for strike projection" />
            <Field label="Strike increment" type="number" value={state.strikeIncrement} onChange={v => update({ strikeIncrement: v })} placeholder="5" hint="$5 NVDA · $1 IBIT" />
          </div>
        </Card>
      </div>

      {/* MAIN GRID */}
      <div style={{ padding: "16px 24px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>

        {/* INPUTS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          <Card>
            <SectionHead right={<span style={{ fontSize: 10, fontFamily: font.mono, color: C.green, letterSpacing: "0.08em" }}>↗ ASCENDING</span>}>
              Ascending Channel
            </SectionHead>
            <div style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
              <strong style={{ color: C.green }}>a1, a2</strong>: two swing-low closes that define the support line.{"  "}
              <strong style={{ color: C.green }}>a3</strong>: a swing-high close that defines the parallel resistance offset.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <AnchorRow idx={1} label="swing low" channelColor={C.green}
                dateValue={state.asc.a1d} closeValue={state.asc.a1c}
                onDate={v => updateAsc({ a1d: v })} onClose={v => updateAsc({ a1c: v })} />
              <AnchorRow idx={2} label="swing low" channelColor={C.green}
                dateValue={state.asc.a2d} closeValue={state.asc.a2c}
                onDate={v => updateAsc({ a2d: v })} onClose={v => updateAsc({ a2c: v })} />
              <AnchorRow idx={3} label="swing high" channelColor={C.green}
                dateValue={state.asc.a3d} closeValue={state.asc.a3c}
                onDate={v => updateAsc({ a3d: v })} onClose={v => updateAsc({ a3c: v })} />
            </div>
          </Card>

          <Card>
            <SectionHead right={<span style={{ fontSize: 10, fontFamily: font.mono, color: C.red, letterSpacing: "0.08em" }}>↘ DESCENDING</span>}>
              Descending Channel
            </SectionHead>
            <div style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
              <strong style={{ color: C.red }}>a1, a2</strong>: two swing-high closes that define the resistance line.{"  "}
              <strong style={{ color: C.red }}>a3</strong>: a swing-low close that defines the parallel support offset.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <AnchorRow idx={1} label="swing high" channelColor={C.red}
                dateValue={state.desc.a1d} closeValue={state.desc.a1c}
                onDate={v => updateDesc({ a1d: v })} onClose={v => updateDesc({ a1c: v })} />
              <AnchorRow idx={2} label="swing high" channelColor={C.red}
                dateValue={state.desc.a2d} closeValue={state.desc.a2c}
                onDate={v => updateDesc({ a2d: v })} onClose={v => updateDesc({ a2c: v })} />
              <AnchorRow idx={3} label="swing low" channelColor={C.red}
                dateValue={state.desc.a3d} closeValue={state.desc.a3c}
                onDate={v => updateDesc({ a3d: v })} onClose={v => updateDesc({ a3c: v })} />
            </div>
          </Card>

          <Card style={{ background: C.surface, borderColor: C.borderHi }}>
            <SectionHead>Right-Tick Reminder</SectionHead>
            <div style={{ fontSize: 10, fontFamily: font.mono, color: C.textDim, lineHeight: 1.5 }}>
              All anchors are <strong style={{ color: C.amber }}>closing prices only</strong>. If you're reading off a Fidelity chart, hover the bar and read the <strong>Close</strong> value (right tick), not the high or low. Wicks are noted for context but never anchor the channel.
            </div>
          </Card>
        </div>

        {/* RESULTS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Geometry */}
          <Card>
            <SectionHead>Channel Geometry</SectionHead>
            {analysis.asc ? (
              <>
                <div style={{ fontSize: 10, fontFamily: font.mono, color: C.green, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>↗ ASCENDING</div>
                <ResultRow label="Slope" value={`${analysis.asc.slopePerDay >= 0 ? "+" : ""}${fmtUSDk(analysis.asc.slopePerDay)}/day`} color={analysis.asc.slope > 0 ? C.green : C.red} />
                <ResultRow label="Channel width (now)" value={analysis.currentMs ? fmtUSD(analysis.asc.widthAt(analysis.currentMs)) : "—"} sub={analysis.currentPrice && analysis.currentMs ? `${((analysis.asc.widthAt(analysis.currentMs) / analysis.currentPrice) * 100).toFixed(1)}% of price` : null} />
              </>
            ) : (
              <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textMuted, fontStyle: "italic" }}>Enter all 3 ascending anchors.</div>
            )}
            <div style={{ height: 1, background: C.border, margin: "10px 0" }} />
            {analysis.desc ? (
              <>
                <div style={{ fontSize: 10, fontFamily: font.mono, color: C.red, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>↘ DESCENDING</div>
                <ResultRow label="Slope" value={`${analysis.desc.slopePerDay >= 0 ? "+" : ""}${fmtUSDk(analysis.desc.slopePerDay)}/day`} color={analysis.desc.slope < 0 ? C.red : C.amber} />
                <ResultRow label="Channel width (now)" value={analysis.currentMs ? fmtUSD(analysis.desc.widthAt(analysis.currentMs)) : "—"} sub={analysis.currentPrice && analysis.currentMs ? `${((analysis.desc.widthAt(analysis.currentMs) / analysis.currentPrice) * 100).toFixed(1)}% of price` : null} />
              </>
            ) : (
              <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textMuted, fontStyle: "italic" }}>Enter all 3 descending anchors.</div>
            )}
          </Card>

          {/* Wedge */}
          <Card>
            <SectionHead>Compression Wedge</SectionHead>
            {analysis.wedge ? (
              <>
                <ResultRow label="Convergence date" value={fmtDate(analysis.wedge.time)} color={analysis.currentMs && analysis.wedge.time < analysis.currentMs ? C.red : C.cyan} />
                <ResultRow label="Convergence price" value={fmtUSD(analysis.wedge.price)} />
                {analysis.currentMs && (
                  <ResultRow
                    label={analysis.wedge.time >= analysis.currentMs ? "Days from now" : "Days ago (already crossed)"}
                    value={`${Math.abs(Math.round((analysis.wedge.time - analysis.currentMs) / 86400000))}d`}
                    color={analysis.wedge.time >= analysis.currentMs ? C.cyan : C.red}
                  />
                )}
                {analysis.strikeProj && (
                  <ResultRow label="Wedge vs target exp" value={analysis.strikeProj.wedgeBeforeExp ? "BEFORE expiration" : "AFTER expiration"} color={analysis.strikeProj.wedgeBeforeExp ? C.amber : C.green}
                    sub={analysis.strikeProj.wedgeBeforeExp ? "channels collapse before exp — strike unreliable past wedge" : "still in compression at exp"} />
                )}
              </>
            ) : (analysis.asc && analysis.desc) ? (
              <div style={{ fontSize: 11, fontFamily: font.mono, color: C.red }}>
                Channels parallel — wedge does not converge.
              </div>
            ) : (
              <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textMuted, fontStyle: "italic" }}>Need both channels.</div>
            )}
          </Card>

          {/* Strike projections */}
          <Card>
            <SectionHead>Strike Projection at Target Expiration</SectionHead>
            {analysis.strikeProj ? (
              <>
                <ResultRow label="Target expiration" value={fmtDate(analysis.strikeProj.targetMs)} sub={analysis.strikeProj.dteFromCurrent !== null ? `${analysis.strikeProj.dteFromCurrent} DTE from current date` : null} />
                <div style={{ height: 1, background: C.border, margin: "8px 0" }} />
                <div style={{ fontSize: 10, fontFamily: font.mono, color: C.green, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>MODE 1 — ASCENDING RESISTANCE</div>
                <ResultRow label="Asc. resistance @ exp" value={fmtUSD(analysis.strikeProj.ascResAtExp)} />
                <ResultRow label="Round-number ceiling" value={fmtUSD(analysis.strikeProj.mode1Strike)} color={C.green}
                  sub={`+${analysis.strikeProj.mode1Buffer.toFixed(2)}% above resistance · structural barrier candidate`} />
                <div style={{ height: 1, background: C.border, margin: "8px 0" }} />
                <div style={{ fontSize: 10, fontFamily: font.mono, color: C.red, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>MODE 2 — DESCENDING RESISTANCE</div>
                <ResultRow label="Desc. resistance @ exp" value={fmtUSD(analysis.strikeProj.descResAtExp)} />
                <ResultRow label="Round-number ceiling" value={fmtUSD(analysis.strikeProj.mode2Strike)} color={C.red}
                  sub="planned-exit candidate (assignment intended)" />
                <div style={{ marginTop: 10, padding: "8px 10px", background: C.bg, borderRadius: 5, border: `1px solid ${C.border}`, fontSize: 10, fontFamily: font.mono, color: C.textDim, lineHeight: 1.5 }}>
                  These are the <strong style={{ color: C.amber }}>structural</strong> half of the Double Barrier. Run each candidate through Fidelity for the <strong style={{ color: C.amber }}>0.20-delta confirmation</strong> before writing.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textMuted, fontStyle: "italic" }}>Enter target expiration date and complete both channels.</div>
            )}
          </Card>

          {/* Mode classification */}
          <Card>
            <SectionHead>Mode Classification (current price)</SectionHead>
            {analysis.mode ? (
              <>
                <div style={{ fontSize: 14, fontFamily: font.mono, fontWeight: 700, color:
                  analysis.mode.tone === "green" ? C.green :
                  analysis.mode.tone === "red" ? C.red :
                  analysis.mode.tone === "amber" ? C.amber : C.blue, marginBottom: 6 }}>
                  {analysis.mode.mode}
                </div>
                <div style={{ fontSize: 11, fontFamily: font.sans, color: C.textDim, lineHeight: 1.55 }}>
                  {analysis.mode.detail}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textMuted, fontStyle: "italic" }}>Need both channels and current price.</div>
            )}
          </Card>

          {/* Sanity checks */}
          <Card>
            <SectionHead right={<span style={{ fontSize: 10, fontFamily: font.mono, color: C.textMuted }}>{analysis.checks.length} {analysis.checks.length === 1 ? "check" : "checks"}</span>}>
              Sanity Checks
            </SectionHead>
            {analysis.checks.length === 0 ? (
              <div style={{ fontSize: 11, fontFamily: font.mono, color: C.textMuted, fontStyle: "italic" }}>Enter both channels to run checks.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {analysis.checks.map((c, i) => {
                  const color = c.severity === "error" ? C.red : c.severity === "warn" ? C.amber : c.severity === "ok" ? C.green : C.textDim;
                  const icon = c.severity === "error" ? "✕" : c.severity === "warn" ? "⚠" : c.severity === "ok" ? "✓" : "·";
                  return (
                    <div key={i} style={{ padding: "8px 10px", background: C.bg, borderRadius: 5, border: `1px solid ${color}30`, display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 12, fontFamily: font.mono, color, fontWeight: 700, lineHeight: 1.4 }}>{icon}</span>
                      <span style={{ fontSize: 11, fontFamily: font.sans, color: C.text, lineHeight: 1.5 }}>{c.msg}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

        </div>
      </div>
    </div>
  );
}
