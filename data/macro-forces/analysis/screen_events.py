"""
NVDA Event-Day Statistical Screening

Reads nvda-ohlcv-ytd.csv and produces:
  - baselines.json: rolling 20-day realized vol and avg volume per trading day
  - significant-days.json: days where |close_z| >= 1.0 OR |volume_z| >= 1.5 OR |range_z| >= 1.5

Uses expanding window for the first 20 days (insufficient history for full rolling),
then strict rolling-20 thereafter.
"""

import csv
import json
import math
from pathlib import Path

HERE = Path(__file__).parent.parent
CSV_PATH = HERE / "nvda-ohlcv-ytd.csv"
BASELINES_PATH = HERE / "baselines.json"
SIG_DAYS_PATH = HERE / "significant-days.json"

# Thresholds
CLOSE_Z_THRESHOLD = 1.0
VOLUME_Z_THRESHOLD = 1.5
RANGE_Z_THRESHOLD = 1.5


def parse_rows():
    rows = []
    with open(CSV_PATH, "r") as f:
        reader = csv.DictReader(f)
        for r in reader:
            date = r["Date"].split("T")[0]
            o = float(r["Open"])
            h = float(r["High"])
            l = float(r["Low"])
            c = float(r["Close"])
            pct_change = float(r["% Change"])
            vol = int(r["Volume"].replace(",", ""))
            rows.append({
                "date": date,
                "open": o, "high": h, "low": l, "close": c,
                "pct_change": pct_change,
                "volume": vol,
                "intraday_range_pct": (h - l) / o * 100.0,
            })
    # Compute gap vs prior close
    for i in range(len(rows)):
        if i == 0:
            rows[i]["prior_close"] = None
            rows[i]["gap_pct"] = None
            rows[i]["close_vs_open_pct"] = (rows[i]["close"] - rows[i]["open"]) / rows[i]["open"] * 100.0
        else:
            prior_c = rows[i - 1]["close"]
            rows[i]["prior_close"] = prior_c
            rows[i]["gap_pct"] = (rows[i]["open"] - prior_c) / prior_c * 100.0
            rows[i]["close_vs_open_pct"] = (rows[i]["close"] - rows[i]["open"]) / rows[i]["open"] * 100.0
    return rows


def compute_baselines(rows, window=20):
    """For each row i, compute rolling stats using rows [max(0,i-window):i]."""
    for i, row in enumerate(rows):
        # Use all history up to but not including i, cap at window size
        start = max(0, i - window)
        hist = rows[start:i]
        if len(hist) < 2:
            row["vol_baseline_pct"] = None
            row["volume_baseline"] = None
            row["range_baseline_pct"] = None
            row["close_z"] = None
            row["volume_z"] = None
            row["range_z"] = None
            row["gap_z"] = None
            row["n_baseline"] = len(hist)
            continue
        # std of pct_change (daily close-to-close returns)
        returns = [r["pct_change"] for r in hist]
        mean_r = sum(returns) / len(returns)
        var_r = sum((x - mean_r) ** 2 for x in returns) / max(1, len(returns) - 1)
        std_r = math.sqrt(var_r)
        # mean/std volume
        volumes = [r["volume"] for r in hist]
        mean_v = sum(volumes) / len(volumes)
        var_v = sum((x - mean_v) ** 2 for x in volumes) / max(1, len(volumes) - 1)
        std_v = math.sqrt(var_v)
        # mean/std intraday range
        ranges = [r["intraday_range_pct"] for r in hist]
        mean_rg = sum(ranges) / len(ranges)
        var_rg = sum((x - mean_rg) ** 2 for x in ranges) / max(1, len(ranges) - 1)
        std_rg = math.sqrt(var_rg)
        # gap baseline (only on rows that have gap values)
        gaps = [r["gap_pct"] for r in hist if r["gap_pct"] is not None]
        if len(gaps) >= 2:
            mean_g = sum(gaps) / len(gaps)
            var_g = sum((x - mean_g) ** 2 for x in gaps) / max(1, len(gaps) - 1)
            std_g = math.sqrt(var_g)
        else:
            mean_g, std_g = 0.0, 1.0
        row["vol_baseline_pct"] = round(std_r, 4)
        row["volume_baseline"] = int(mean_v)
        row["volume_std"] = int(std_v)
        row["range_baseline_pct"] = round(mean_rg, 4)
        row["range_std"] = round(std_rg, 4)
        row["n_baseline"] = len(hist)
        # z-scores
        row["close_z"] = round((row["pct_change"] - mean_r) / std_r, 3) if std_r > 0 else 0.0
        row["volume_z"] = round((row["volume"] - mean_v) / std_v, 3) if std_v > 0 else 0.0
        row["range_z"] = round((row["intraday_range_pct"] - mean_rg) / std_rg, 3) if std_rg > 0 else 0.0
        if row["gap_pct"] is not None and std_g > 0:
            row["gap_z"] = round((row["gap_pct"] - mean_g) / std_g, 3)
        else:
            row["gap_z"] = None
    return rows


def classify_reaction(z):
    if z is None:
        return "insufficient_history"
    absz = abs(z)
    if absz < 1.0:
        return "negligible"
    elif absz < 1.5:
        return "notable"
    elif absz < 2.5:
        return "significant"
    elif absz < 3.5:
        return "major"
    else:
        return "regime-changing"


def classify_gap(row):
    """Gap priority per dashboard schema."""
    gap = row.get("gap_pct")
    if gap is None:
        return "none"
    close_vs_open = row.get("close_vs_open_pct", 0)
    abs_gap = abs(gap)
    # Did gap hold? Same-direction close move means yes
    if abs_gap < 1.0:
        return "low"
    # Check if gap was filled (close moved >50% opposite of gap direction)
    gap_direction = 1 if gap > 0 else -1
    close_direction = 1 if close_vs_open > 0 else -1
    if gap_direction != close_direction and abs(close_vs_open) > 0.5 * abs_gap:
        return "failed_gap"
    if abs_gap > 3.0:
        # Critical if hold threshold met
        total_move = abs(row["pct_change"])
        if total_move >= 0.7 * abs_gap:
            return "critical"
        return "high"
    if abs_gap > 2.0:
        return "high"
    return "moderate"


def screen_events(rows):
    significant = []
    for row in rows:
        if row["close_z"] is None:
            continue
        flags = []
        if abs(row["close_z"]) >= CLOSE_Z_THRESHOLD:
            flags.append(f"close_z={row['close_z']:+.2f}")
        if row["volume_z"] is not None and abs(row["volume_z"]) >= VOLUME_Z_THRESHOLD:
            flags.append(f"volume_z={row['volume_z']:+.2f}")
        if row["range_z"] is not None and abs(row["range_z"]) >= RANGE_Z_THRESHOLD:
            flags.append(f"range_z={row['range_z']:+.2f}")
        if not flags:
            continue
        significant.append({
            "date": row["date"],
            "open": row["open"],
            "high": row["high"],
            "low": row["low"],
            "close": row["close"],
            "prior_close": row["prior_close"],
            "pct_change": row["pct_change"],
            "gap_pct": row["gap_pct"],
            "close_vs_open_pct": round(row["close_vs_open_pct"], 3),
            "intraday_range_pct": round(row["intraday_range_pct"], 3),
            "volume": row["volume"],
            "volume_baseline": row["volume_baseline"],
            "close_z": row["close_z"],
            "volume_z": row["volume_z"],
            "range_z": row["range_z"],
            "gap_z": row["gap_z"],
            "close_class": classify_reaction(row["close_z"]),
            "volume_class": classify_reaction(row["volume_z"]),
            "range_class": classify_reaction(row["range_z"]),
            "gap_priority": classify_gap(row),
            "flags": flags,
            "n_baseline": row["n_baseline"],
        })
    return significant


def main():
    rows = parse_rows()
    rows = compute_baselines(rows)
    # Write baselines (lightweight — just the computed stats, not original OHLCV)
    baselines = [
        {
            "date": r["date"],
            "vol_baseline_pct": r["vol_baseline_pct"],
            "volume_baseline": r["volume_baseline"],
            "volume_std": r.get("volume_std"),
            "range_baseline_pct": r["range_baseline_pct"],
            "range_std": r.get("range_std"),
            "n_baseline": r["n_baseline"],
            "close_z": r["close_z"],
            "volume_z": r["volume_z"],
            "range_z": r["range_z"],
            "gap_z": r.get("gap_z"),
        }
        for r in rows
    ]
    with open(BASELINES_PATH, "w") as f:
        json.dump({"rows": baselines}, f, indent=2)
    significant = screen_events(rows)
    with open(SIG_DAYS_PATH, "w") as f:
        json.dump({"count": len(significant), "days": significant}, f, indent=2)
    # Console summary
    print(f"Total trading days: {len(rows)}")
    print(f"Significant event days: {len(significant)}")
    print(f"\nBy reaction class (close move):")
    class_counts = {}
    for s in significant:
        class_counts[s["close_class"]] = class_counts.get(s["close_class"], 0) + 1
    for cls, ct in sorted(class_counts.items()):
        print(f"  {cls}: {ct}")
    print(f"\nTop-10 by |close_z|:")
    top = sorted(significant, key=lambda s: abs(s["close_z"]) if s["close_z"] else 0, reverse=True)[:10]
    for s in top:
        print(f"  {s['date']}  close={s['pct_change']:+.2f}%  z={s['close_z']:+.2f}  vol_z={s['volume_z']:+.2f}  gap={s['gap_priority']}")


if __name__ == "__main__":
    main()
