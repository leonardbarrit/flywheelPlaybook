"""
channel_chart.py -- Phase 4, Layer 4 (interaction surface)

Renders all scored channel candidates on a single chart for practitioner selection.
Each candidate is plotted with both its compression and containment rails.
Candidates are numbered for easy CLI selection/rejection.

Input:
  --candidates  JSON from score_channels.py (or select_pair.py iterative output)
  --ohlcv       OHLCV JSON (Massive.com or processed format)
  --accepted    Optional: comma-separated channel_ids already accepted (highlighted)

Output:
  PNG chart saved to data/_tmp_channel_candidates.png (or --out path)
  Numbered legend printed to stdout for CLI selection

Usage:
    py channel_chart.py --candidates data/_tmp_candidates.json --ohlcv data/_tmp_ohlcv_4h.json
    py channel_chart.py --candidates data/_tmp_candidates.json --ohlcv data/_tmp_ohlcv_4h.json --out data/_tmp_chart.png
    py channel_chart.py --candidates data/_tmp_candidates.json --ohlcv data/_tmp_ohlcv_4h.json --accepted asc-2026-04-03-r0
"""

import argparse
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DEFAULT_OUT = PROJECT_ROOT / "data" / "_tmp_channel_candidates.png"

BARS_PER_DAY_4H  = 1.625
BAR_INTERVAL_H   = 4       # hours per 4h bar
TRADING_DAYS     = {0, 1, 2, 3, 4}   # Mon–Fri (weekday() values)

# Color palettes — ascending: blue family, descending: red/orange family
ASC_COLORS  = ["#4fc3f7", "#0288d1", "#01579b", "#81d4fa", "#b3e5fc", "#29b6f6"]
DESC_COLORS = ["#ef9a9a", "#e53935", "#b71c1c", "#ffab91", "#ff7043", "#d84315"]
ACCEPTED_COLOR  = "#69f0ae"   # bright green for already-accepted
COMPRESSION_ALPHA = 0.85
CONTAINMENT_ALPHA = 0.45


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def load_json(path: Path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def load_ohlcv(path: Path) -> list[dict]:
    raw = load_json(path)
    if isinstance(raw, dict) and "results" in raw:
        bars = []
        for r in raw["results"]:
            ts_ms = r.get("t", 0)
            dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
            bars.append({
                "date":   dt.strftime("%Y-%m-%d"),
                "ts":     dt,
                "open":   float(r["o"]),
                "high":   float(r["h"]),
                "low":    float(r["l"]),
                "close":  float(r["c"]),
                "volume": float(r.get("v", 0)),
            })
        return bars
    if isinstance(raw, list):
        bars = []
        for r in raw:
            d = r.get("date", "")
            bars.append({
                "date":   d,
                "ts":     datetime.strptime(d[:10], "%Y-%m-%d") if d else datetime.now(),
                "open":   float(r.get("open",   r.get("o", 0))),
                "high":   float(r.get("high",   r.get("h", 0))),
                "low":    float(r.get("low",    r.get("l", 0))),
                "close":  float(r.get("close",  r.get("c", 0))),
                "volume": float(r.get("volume", r.get("v", 0))),
            })
        return bars
    raise ValueError("Unrecognised OHLCV format")


def parse_date(s: str) -> date:
    return date.fromisoformat(s[:10])


def bar_index_for_date(bars: list[dict], target: date) -> int | None:
    target_str = target.isoformat()
    for i, b in enumerate(bars):
        if b["date"] >= target_str:
            return i
    return None


# ---------------------------------------------------------------------------
# Trading-day-aware future timestamp generation
# ---------------------------------------------------------------------------

def compute_apex(asc_anchor_bar: int, asc_anchor_price: float, asc_slope: float,
                 desc_anchor_bar: int, desc_anchor_price: float, desc_slope: float
                 ) -> tuple[float, float] | None:
    """
    Returns (apex_bar_index, apex_price) where ascending and descending compression rails converge.
    Returns None if rails are parallel or diverging.
    apex_bar_index is a float (fractional bar); convert to timestamp for rendering.
    """
    denom = asc_slope - desc_slope
    if abs(denom) < 1e-9:
        return None
    apex_bar = (desc_anchor_price - desc_slope * desc_anchor_bar
                - asc_anchor_price + asc_slope * asc_anchor_bar) / denom
    apex_price = asc_anchor_price + asc_slope * (apex_bar - asc_anchor_bar)
    return apex_bar, apex_price


def future_bar_timestamps(start_ts: datetime, n_bars: int) -> list[datetime]:
    """
    Generate n_bars future timestamps at BAR_INTERVAL_H-hour intervals,
    skipping Saturday and Sunday.  Produces the same visual gap pattern as
    the historical bar series (which also has no weekend bars), so projected
    rails maintain a consistent visual slope across the Today boundary.
    """
    bar_gap = timedelta(hours=BAR_INTERVAL_H)
    ts      = start_ts
    result  = []
    while len(result) < n_bars:
        ts = ts + bar_gap
        while ts.weekday() not in TRADING_DAYS:   # skip Sat / Sun
            ts = ts + bar_gap
        result.append(ts)
    return result


# ---------------------------------------------------------------------------
# Rail projection
# ---------------------------------------------------------------------------

def project_rail(anchor_price: float, slope: float, anchor_bar: int,
                 start_bar: int, end_bar: int, bars: list[dict]):
    """Return (timestamps, prices) for a rail from start_bar to end_bar."""
    ts, prices = [], []
    for i in range(max(0, start_bar), min(len(bars), end_bar + 1)):
        ts.append(bars[i]["ts"])
        prices.append(anchor_price + slope * (i - anchor_bar))
    return ts, prices


# ---------------------------------------------------------------------------
# Chart
# ---------------------------------------------------------------------------

def render(
    candidates_data: dict,
    bars: list[dict],
    accepted_ids: set[str],
    out_path: Path,
):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    import pandas as pd

    asc_cands  = candidates_data.get("ascending",  [])
    desc_cands = candidates_data.get("descending", [])
    # Also handle iterative pass output
    if "iterative_candidates" in candidates_data:
        direction = candidates_data.get("missing_direction", "ascending")
        if direction == "ascending":
            asc_cands  = candidates_data["iterative_candidates"]
        else:
            desc_cands = candidates_data["iterative_candidates"]

    all_cands = list(enumerate(asc_cands, 1)) + \
                list(enumerate(desc_cands, len(asc_cands) + 1))

    today_bar = len(bars) - 1
    today_ts  = bars[-1]["ts"]

    # T+45 bar count via weekday-aware 4h projection
    t45_future_ts = future_bar_timestamps(today_ts, 500)
    t45_cutoff    = today_ts + timedelta(days=63)
    extend_bars   = sum(1 for t in t45_future_ts if t <= t45_cutoff)

    # Future bar timestamp list — used for x-axis labels and apex date lookup.
    # Stored as a list so index fi → bar index (len(bars) + fi).
    future_bar_list: list[datetime] = future_bar_timestamps(today_ts, extend_bars + 30)
    future_dates: dict[int, str] = {
        len(bars) + fi: fts.strftime("%b %d")
        for fi, fts in enumerate(future_bar_list)
    }

    def bar_ts(idx: int) -> datetime | None:
        """Return the datetime for a given bar index (historical or future)."""
        if idx < len(bars):
            return bars[idx]["ts"]
        fi = idx - len(bars)
        return future_bar_list[fi] if fi < len(future_bar_list) else None

    def bar_label(idx: int) -> str:
        """Map bar index → 'MM-DD' label for x-axis ticks."""
        if idx < len(bars):
            return bars[idx]["date"][5:]
        return future_dates.get(idx, "")

    earliest_rendered_bar = today_bar
    best_asc = None

    fig, ax = plt.subplots(figsize=(16, 9))
    fig.patch.set_facecolor("#1a1a2e")
    ax.set_facecolor("#0f0f1a")

    # ── OHLC bars — x-axis is bar index, no weekend gaps ──────────────────
    tick_w = 0.35   # fraction of one bar-width for open/close tick marks
    for i, b in enumerate(bars):
        col = "#4caf50" if b["close"] >= b["open"] else "#f44336"
        ax.plot([i, i],           [b["low"],   b["high"]],  color=col, linewidth=0.6, alpha=0.75, zorder=2)
        ax.plot([i - tick_w, i],  [b["open"],  b["open"]],  color=col, linewidth=0.6, alpha=0.75, zorder=2)
        ax.plot([i, i + tick_w],  [b["close"], b["close"]], color=col, linewidth=0.6, alpha=0.75, zorder=2)

    # ── Channel candidates ────────────────────────────────────────────────
    legend_entries = []
    label_number   = 1

    for cands, palette, direction in [
        (asc_cands,  ASC_COLORS,  "ascending"),
        (desc_cands, DESC_COLORS, "descending"),
    ]:
        for idx, c in enumerate(cands):
            cid   = c["channel_id"]
            slope = c.get("slope_per_bar")
            score = c.get("score", 0)
            if slope is None or score == 0:
                label_number += 1
                continue

            is_accepted    = cid in accepted_ids
            is_provisional = c.get("provisional", False)
            color = ACCEPTED_COLOR if is_accepted else palette[idx % len(palette)]

            a1 = c["compression_rail"]["anchor1"]
            anchor_date  = parse_date(a1["date"])
            anchor_price = a1["price"]
            anchor_bar   = bar_index_for_date(bars, anchor_date) or 0

            # Track earliest rendered anchor for x-axis clipping
            earliest_rendered_bar = min(earliest_rendered_bar, anchor_bar)

            # Track best ascending channel geometry for wedge apex computation
            if direction == "ascending" and (best_asc is None or score > best_asc["score"]):
                best_asc = {
                    "score":        score,
                    "anchor_bar":   anchor_bar,
                    "anchor_price": anchor_price,
                    "slope":        slope,
                }

            # ── Rail geometry — x-axis is bar index throughout ────────────
            # 2 points per rail: anchor bar index → endpoint bar index.
            # Perfectly straight, no stair-stepping from calendar gaps.
            t45_bar    = today_bar + extend_bars
            bars_to_t45 = t45_bar - anchor_bar

            if is_provisional:
                # ── Provisional descending channel ─────────────────────────
                # Solid compression rail from APH → wedge apex.
                # No containment drawn (insufficient history).
                apex_result = None
                if best_asc is not None:
                    apex_result = compute_apex(
                        best_asc["anchor_bar"], best_asc["anchor_price"], best_asc["slope"],
                        anchor_bar, anchor_price, slope,
                    )

                if apex_result is not None:
                    apex_bar_f, apex_price_f = apex_result

                    # Solid line: APH (anchor_bar) → apex (apex_bar_f)
                    ax.plot([anchor_bar, apex_bar_f],
                            [anchor_price, apex_price_f],
                            color=color, linewidth=0.9, alpha=0.65,
                            zorder=4, linestyle="-")

                    # Apex date — look up directly from timestamp, no string round-trip
                    apex_bar_i = int(apex_bar_f)
                    apex_ts = bar_ts(apex_bar_i)
                    apex_date_fmt = apex_ts.strftime("%b %d") if apex_ts else "?"

                    apex_days = (apex_bar_f - today_bar) / max(extend_bars / 45.0, 1)
                    if abs(apex_days) > 1:
                        apex_label = f"APEX {apex_date_fmt} ({int(apex_days):+d}d)"
                    else:
                        apex_label = f"APEX {apex_date_fmt} (~now)"
                    # No marker — text only; marker obstructs price data
                    ax.annotate(f" [{label_number}] {apex_label} ${apex_price_f:.0f} (prov)",
                                xy=(apex_bar_f, apex_price_f),
                                color=color, fontsize=8.5, fontweight="bold",
                                va="center", alpha=0.92)
                else:
                    stub_end = today_bar + 5
                    stub_px  = anchor_price + slope * (stub_end - anchor_bar)
                    ax.plot([anchor_bar, stub_end], [anchor_price, stub_px],
                            color=color, linewidth=0.9, alpha=0.65,
                            zorder=4, linestyle="-")

            else:
                # ── Confirmed channel: solid compression + dashed containment
                comp_end = anchor_price + slope * bars_to_t45
                ax.plot([anchor_bar, t45_bar], [anchor_price, comp_end],
                        color=color,
                        linewidth=1.4 if is_accepted else 0.9,
                        alpha=COMPRESSION_ALPHA, zorder=4, linestyle="-")

                offset = c.get("containment_offset")
                if offset is None:
                    label_number += 1
                    continue

                cont_start = anchor_price + offset
                cont_end   = cont_start + slope * bars_to_t45
                ax.plot([anchor_bar, t45_bar], [cont_start, cont_end],
                        color=color,
                        linewidth=1.0 if is_accepted else 0.6,
                        alpha=CONTAINMENT_ALPHA, zorder=3, linestyle="--")

                # T+45 marker on containment rail
                ax.scatter([t45_bar], [cont_end],
                           color=color, s=60, zorder=6, marker="*",
                           edgecolors="white", linewidths=0.5)
                ax.annotate(f" [{label_number}] T+45 ${cont_end:.0f}",
                            xy=(t45_bar, cont_end),
                            color=color, fontsize=7, va="center")

            # No anchor marker — dots obstruct bar data

            # Legend entry
            span_days = c.get("span_days", 0)
            score     = c.get("score", 0)
            slope_str = f"{slope:+.4f}/bar"
            tag = "ACCEPTED" if is_accepted else ("provisional" if is_provisional else "")
            legend_entries.append(
                (label_number, direction[:3].upper(), cid, score, slope_str, span_days, color, tag)
            )
            label_number += 1

    # ── Today line ────────────────────────────────────────────────────────
    ax.axvline(today_bar, color="#ffffff", linewidth=0.5, alpha=0.3, linestyle=":", zorder=3)
    ax.annotate("Today", xy=(today_bar, ax.get_ylim()[1] if ax.get_ylim()[1] != 1.0 else 250),
                color="#aaaaaa", fontsize=7, ha="left", va="top")

    # ── Axes ──────────────────────────────────────────────────────────────
    x_start_bar = max(0, earliest_rendered_bar - 10)
    x_end_bar   = today_bar + extend_bars + 5
    ax.set_xlim(x_start_bar, x_end_bar)

    # Y-axis on right
    ax.yaxis.tick_right()
    ax.yaxis.set_label_position("right")

    # X-axis ticks: Fridays only (one tick per week, clean visual cadence)
    friday_ticks: list[tuple[int, str]] = []
    seen_friday: set[str] = set()
    for i in range(x_start_bar, min(len(bars), x_end_bar + 1)):
        if bars[i]["ts"].weekday() == 4:          # Friday
            fdate = bars[i]["date"]
            if fdate not in seen_friday:
                friday_ticks.append((i, bars[i]["date"][5:]))   # 'MM-DD'
                seen_friday.add(fdate)
    for fi, fts in enumerate(future_bar_timestamps(today_ts, extend_bars + 20)):
        bidx = len(bars) + fi
        if bidx > x_end_bar:
            break
        if fts.weekday() == 4:
            fdate = fts.strftime("%Y-%m-%d")
            if fdate not in seen_friday:
                friday_ticks.append((bidx, fts.strftime("%m-%d")))
                seen_friday.add(fdate)
    ax.set_xticks([t[0] for t in friday_ticks])
    ax.set_xticklabels([t[1] for t in friday_ticks], rotation=30, ha="right")

    ax.tick_params(colors="white", labelsize=8)
    for spine in ax.spines.values():
        spine.set_edgecolor("#444444")
    ax.yaxis.label.set_color("white")
    ax.xaxis.label.set_color("white")
    ax.set_ylabel("Price ($)", color="white", fontsize=9)

    rendered_asc  = sum(1 for c in asc_cands  if c.get("slope_per_bar") and c.get("score", 0) > 0)
    rendered_desc = sum(1 for c in desc_cands if c.get("slope_per_bar") and c.get("score", 0) > 0)
    ax.set_title(
        f"NVDA Channel Candidates — {rendered_asc} ascending / {rendered_desc} descending\n"
        "Solid = compression rail  |  Dashed = containment rail  |  * = T+45 projection",
        color="white", fontsize=10, pad=10,
    )

    plt.tight_layout()
    fig.savefig(str(out_path), dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close()

    return legend_entries


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Render channel candidates chart")
    parser.add_argument("--candidates", required=True, help="Candidates JSON from score_channels.py")
    parser.add_argument("--ohlcv",      required=True, help="OHLCV JSON file")
    parser.add_argument("--accepted",   default="",    help="Already-accepted channel IDs (comma-separated)")
    parser.add_argument("--out",        default=str(DEFAULT_OUT), help="Output PNG path")
    args = parser.parse_args()

    candidates_path = Path(args.candidates)
    ohlcv_path      = Path(args.ohlcv)
    out_path        = Path(args.out)
    if not candidates_path.is_absolute():
        candidates_path = PROJECT_ROOT / candidates_path
    if not ohlcv_path.is_absolute():
        ohlcv_path = PROJECT_ROOT / ohlcv_path
    if not out_path.is_absolute():
        out_path = PROJECT_ROOT / out_path

    candidates_data = load_json(candidates_path)
    bars            = load_ohlcv(ohlcv_path)
    accepted_ids    = {x.strip() for x in args.accepted.split(",") if x.strip()}

    if not bars:
        print("ERROR: No OHLCV bars loaded", file=sys.stderr)
        sys.exit(1)

    legend_entries = render(candidates_data, bars, accepted_ids, out_path)

    print(f"\nChart saved: {out_path}")
    print("\n  #   DIR   SCORE    SLOPE/BAR   SPAN   CHANNEL_ID")
    print("  " + "-" * 75)
    for num, dirn, cid, score, slope_str, span, color, tag in legend_entries:
        tag_str = f"  << {tag}" if tag else ""
        print(f"  [{num}] {dirn}  {score:7.1f}  {slope_str:>12}  {span:4}d  {cid}{tag_str}")

    print()
    print("To accept candidates, run:")
    print("  py skills/channel-pipeline/scripts/select_pair.py")
    print("    --candidates <candidates_file>")
    print("    --ohlcv      <ohlcv_file>")
    print("    --accept     <comma-separated numbers or IDs>")
    print("    --out        data/_tmp_accepted_pair.json")


if __name__ == "__main__":
    main()
