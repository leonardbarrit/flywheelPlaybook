"""
recalibrate_weights.py — Phase 3B

Match resolved channel drawings against composite score history.
Discover score thresholds separating ascending / descending / converging regimes.
Propose force weight adjustments to improve composite score predictiveness.

Guardrails:
  - Minimum 3 resolved drawings per regime class before threshold discovery
  - Minimum 3 force observations before any weight adjustment proposed
  - Maximum ±15% change per force per calibration cycle
  - F1 (multiplier type) is never adjusted — different mechanics
  - DORMANT forces (weight = 0) are not adjusted
  - Default mode: PREVIEW — prints diff, writes nothing
  - --apply: writes to forces.json after showing diff (requires explicit invocation)

Usage:
    py recalibrate_weights.py                           # preview diff
    py recalibrate_weights.py --apply                   # write changes after showing diff
    py recalibrate_weights.py --drawings path/to/...    # override drawings path
    py recalibrate_weights.py --history path/to/...     # override composite history path
    py recalibrate_weights.py --forces path/to/...      # override forces path
    py recalibrate_weights.py --min-drawings 5          # raise threshold (default: 3)
    py recalibrate_weights.py --max-change 0.10         # tighten max change (default: 0.15)
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DEFAULT_DRAWINGS = PROJECT_ROOT / "data" / "channel_drawings.json"
DEFAULT_HISTORY  = PROJECT_ROOT / "data" / "composite_history.json"
DEFAULT_FORCES   = PROJECT_ROOT / "data" / "forces.json"

MIN_RESOLVED_PER_CLASS = 3    # minimum resolved drawings in a class to run threshold analysis
MIN_FORCE_OBSERVATIONS = 3    # minimum times a force appears in drawings to propose weight change
MAX_WEIGHT_CHANGE_PCT  = 0.15 # maximum fractional weight change per cycle (15%)
MULTIPLIER_TYPE = "multiplier"


def load_json(path: Path):
    if not path.exists():
        print(f"ERROR: {path} not found", file=sys.stderr)
        sys.exit(1)
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def write_json(path: Path, data) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def parse_date(s) -> date | None:
    try:
        return date.fromisoformat(str(s)[:10])
    except (ValueError, TypeError):
        return None


def get_resolved(drawings: list) -> list:
    return [d for d in drawings if (d.get("outcome") or {}).get("resolved")]


def get_unresolved(drawings: list) -> list:
    return [d for d in drawings if not (d.get("outcome") or {}).get("resolved")]


# ---------------------------------------------------------------------------
# Score matching
# ---------------------------------------------------------------------------

def score_for_drawing(drawing: dict, history: list) -> float | None:
    """
    Return composite score for the drawing's drawn_date from composite_history.
    Falls back to macro_context.composite_score from the drawing itself.
    """
    drawn = (drawing.get("drawn_date") or "")[:10]
    for entry in history:
        if entry.get("date") == drawn:
            return entry["composite_score"]
    # Fallback: use macro context embedded in drawing
    ctx = drawing.get("macro_context") or {}
    return ctx.get("composite_score")


# ---------------------------------------------------------------------------
# Threshold discovery
# ---------------------------------------------------------------------------

def discover_thresholds(resolved: list, history: list, min_per_class: int = MIN_RESOLVED_PER_CLASS) -> dict:
    """
    For each regime class, collect composite scores at drawing time.
    Find score ranges. Identify candidate thresholds between classes.

    Returns:
      {
        "classes": { "ascending_dominant": [scores], "descending_dominant": [scores], "converging": [scores] },
        "stats": { class: { mean, min, max, count } },
        "thresholds": { "asc_desc_midpoint": float or None },
        "sufficient": bool
      }
    """
    classes: dict[str, list[float]] = {
        "ascending_dominant": [],
        "descending_dominant": [],
        "converging": [],
    }

    for d in resolved:
        regime = d.get("regime", "")
        score = score_for_drawing(d, history)
        if regime in classes and score is not None:
            classes[regime].append(score)

    stats = {}
    for cls, scores in classes.items():
        if scores:
            stats[cls] = {
                "count": len(scores),
                "mean":  round(sum(scores) / len(scores), 3),
                "min":   round(min(scores), 3),
                "max":   round(max(scores), 3),
            }
        else:
            stats[cls] = {"count": 0, "mean": None, "min": None, "max": None}

    # Threshold discovery: need at least min obs in BOTH ascending and descending
    asc_scores  = classes["ascending_dominant"]
    desc_scores = classes["descending_dominant"]

    thresholds = {"asc_desc_midpoint": None, "asc_desc_sufficient": False}
    if (len(asc_scores) >= min_per_class and
            len(desc_scores) >= min_per_class):
        asc_mean  = sum(asc_scores)  / len(asc_scores)
        desc_mean = sum(desc_scores) / len(desc_scores)
        thresholds["asc_desc_midpoint"] = round((asc_mean + desc_mean) / 2, 3)
        thresholds["asc_desc_sufficient"] = True

    sufficient = thresholds["asc_desc_sufficient"]
    return {"classes": classes, "stats": stats, "thresholds": thresholds, "sufficient": sufficient}


# ---------------------------------------------------------------------------
# Force activation analysis
# ---------------------------------------------------------------------------

def force_activation_table(resolved: list) -> dict:
    """
    For each force, count how many times it was ACTIVE at drawing time,
    broken down by regime class.

    Returns:
      {
        force_id: {
          "ascending_dominant": N,
          "descending_dominant": N,
          "converging": N,
          "total_drawings": N,
        }
      }
    """
    table: dict[str, dict] = {}

    for d in resolved:
        regime = d.get("regime", "unknown")
        ctx = d.get("macro_context") or {}
        active = set(ctx.get("active_forces") or [])

        # All forces mentioned (active + attenuating + dormant)
        all_forces = (
            set(ctx.get("active_forces") or []) |
            set(ctx.get("attenuating_forces") or []) |
            set(ctx.get("dormant_forces") or [])
        )

        for fid in all_forces:
            if fid not in table:
                table[fid] = {
                    "ascending_dominant": 0,
                    "descending_dominant": 0,
                    "converging": 0,
                    "total_drawings": 0,
                    "active_in_asc": 0,
                    "active_in_desc": 0,
                    "active_in_conv": 0,
                    "active_total": 0,
                }
            if regime in table[fid]:
                table[fid][regime] += 1
            table[fid]["total_drawings"] += 1
            if fid in active:
                table[fid]["active_total"] += 1
                if regime == "ascending_dominant":
                    table[fid]["active_in_asc"] += 1
                elif regime == "descending_dominant":
                    table[fid]["active_in_desc"] += 1
                elif regime == "converging":
                    table[fid]["active_in_conv"] += 1

    return table


# ---------------------------------------------------------------------------
# Weight adjustment proposals
# ---------------------------------------------------------------------------

def propose_weight_changes(
    forces_data: dict,
    activation_table: dict,
    threshold_result: dict,
    max_change_pct: float,
    min_observations: int,
) -> list[dict]:
    """
    For each non-multiplier, non-dormant force with sufficient observations:

    Compute ascending_association = active_in_asc / total_asc_drawings (if any)
    Compute descending_association = active_in_desc / total_desc_drawings (if any)

    If force has bullish direction_bias:
      - high ascending_association → weight should be higher (force is correctly bullish)
      - high descending_association → weight may need reduction
    If force has bearish direction_bias:
      - inverse logic

    Adjustment:
      bias_signal = ascending_assoc - descending_assoc  (range -1 to +1)
      For bullish forces: positive bias_signal = reinforce weight
      For bearish forces: negative bias_signal = reinforce weight (bearish correctly predicted descending)

    Proposed change = current_weight × (bias_signal × 0.5) clamped to ±max_change_pct

    The 0.5 dampening factor means a perfect signal (bias=1.0) produces only a 50% of max_change,
    avoiding overcorrection on sparse data.
    """
    classes = threshold_result["classes"]
    total_asc  = len(classes.get("ascending_dominant", []))
    total_desc = len(classes.get("descending_dominant", []))

    if total_asc == 0 or total_desc == 0:
        return []  # Cannot compute directional associations without both regime classes

    proposals = []
    forces_list = forces_data.get("forces", [])

    for f in forces_list:
        fid   = f["id"]
        ftype = f.get("type", "additive")
        state = f.get("state", "DORMANT")
        weight = f.get("weight", 0.0)
        bias  = f.get("direction_bias", "neutral")

        # Skip multiplier forces (F1) — different mechanics
        if ftype == MULTIPLIER_TYPE:
            continue

        # Skip dormant forces (weight = 0)
        if state == "DORMANT" or weight == 0.0:
            continue

        act = activation_table.get(fid)
        if not act:
            continue

        total_obs = act["total_drawings"]
        if total_obs < min_observations:
            continue

        asc_rate  = act["active_in_asc"]  / total_asc  if total_asc  > 0 else 0.0
        desc_rate = act["active_in_desc"] / total_desc if total_desc > 0 else 0.0

        bias_signal = asc_rate - desc_rate  # positive = associated with ascending

        # Direction-adjusted: bullish forces should be active during ascending
        # bearish forces should be active during descending
        if bias == "bullish":
            adjusted_signal = bias_signal      # positive signal = correct → reinforce
        elif bias == "bearish":
            adjusted_signal = -bias_signal     # negative signal = correct for bearish → reinforce
        else:
            adjusted_signal = bias_signal      # neutral: use raw signal

        # Dampened adjustment
        raw_change = weight * adjusted_signal * 0.5
        # Clamp to ±max_change_pct of current weight
        max_abs = weight * max_change_pct
        clamped_change = max(-max_abs, min(max_abs, raw_change))

        if abs(clamped_change) < 0.001:
            continue  # Negligible change

        new_weight = round(weight + clamped_change, 4)
        pct_change = clamped_change / weight * 100 if weight != 0 else 0.0
        clamped = abs(raw_change) > max_abs

        proposals.append({
            "force_id":       fid,
            "force_name":     f["name"],
            "state":          state,
            "direction_bias": bias,
            "current_weight": weight,
            "proposed_weight": new_weight,
            "change":         round(clamped_change, 4),
            "pct_change":     round(pct_change, 1),
            "clamped":        clamped,
            "asc_rate":       round(asc_rate, 3),
            "desc_rate":      round(desc_rate, 3),
            "observations":   total_obs,
        })

    return proposals


# ---------------------------------------------------------------------------
# Output rendering
# ---------------------------------------------------------------------------

def render_report(
    drawings: list,
    resolved: list,
    threshold_result: dict,
    activation_table: dict,
    proposals: list[dict],
    apply_mode: bool,
    max_change_pct: float,
    min_observations: int,
) -> str:
    lines = []
    lines.append("=== WEIGHT CALIBRATION REPORT — Phase 3B ===")
    lines.append("")
    lines.append(f"Total drawings:    {len(drawings)}")
    lines.append(f"Resolved:          {len(resolved)}")
    lines.append(f"Unresolved:        {len(get_unresolved(drawings))}")
    lines.append("")

    # --- Regime distribution ---
    lines.append("--- Resolved Drawing Regimes ---")
    stats = threshold_result["stats"]
    lines.append(f"  {'Regime':<24} {'Count':>6} {'Mean score':>12} {'Min':>8} {'Max':>8}")
    lines.append("  " + "-" * 64)
    for cls in ("ascending_dominant", "descending_dominant", "converging"):
        s = stats.get(cls, {})
        count = s.get("count", 0)
        mean_str = f"{s['mean']:.3f}" if s.get("mean") is not None else "—"
        min_str  = f"{s['min']:.3f}"  if s.get("min")  is not None else "—"
        max_str  = f"{s['max']:.3f}"  if s.get("max")  is not None else "—"
        lines.append(f"  {cls:<24} {count:>6} {mean_str:>12} {min_str:>8} {max_str:>8}")

    lines.append("")

    # --- Threshold discovery ---
    lines.append("--- Score Threshold Discovery ---")
    thresholds = threshold_result["thresholds"]
    if not threshold_result["sufficient"]:
        lines.append(f"  INSUFFICIENT DATA — need >={MIN_RESOLVED_PER_CLASS} resolved drawings in BOTH")
        lines.append(f"  ascending_dominant AND descending_dominant classes.")
        lines.append(f"  Current: asc={stats.get('ascending_dominant',{}).get('count',0)},")
        lines.append(f"           desc={stats.get('descending_dominant',{}).get('count',0)}")
        lines.append(f"  Continue logging channel drawings and resolving outcomes.")
    else:
        midpoint = thresholds["asc_desc_midpoint"]
        lines.append(f"  Ascending mean score:   {stats['ascending_dominant']['mean']:.3f}")
        lines.append(f"  Descending mean score:  {stats['descending_dominant']['mean']:.3f}")
        lines.append(f"  Candidate threshold:    {midpoint:.3f}  (midpoint)")
        lines.append(f"  Interpretation: composite score > {midpoint:.3f} → ascending regime likely")
        lines.append(f"                  composite score < {midpoint:.3f} → descending regime likely")
        lines.append(f"  Note: threshold is approximate — increase observation count to narrow the band.")

    lines.append("")

    # --- Force activation table ---
    if activation_table and resolved:
        lines.append("--- Force Activation by Regime (resolved drawings only) ---")
        lines.append(f"  {'Force':<6} {'Name':<32} {'Obs':>4} {'Asc rate':>9} {'Desc rate':>10} {'Bias':>8}")
        lines.append("  " + "-" * 78)
        for fid, act in sorted(activation_table.items()):
            total_asc_drawings = len(threshold_result["classes"].get("ascending_dominant", []))
            total_desc_drawings = len(threshold_result["classes"].get("descending_dominant", []))
            asc_r  = f"{act['active_in_asc']/total_asc_drawings:.2f}"   if total_asc_drawings  > 0 else "—"
            desc_r = f"{act['active_in_desc']/total_desc_drawings:.2f}" if total_desc_drawings > 0 else "—"
            bias_str = "—"
            if total_asc_drawings > 0 and total_desc_drawings > 0:
                try:
                    b = float(asc_r) - float(desc_r)
                    bias_str = f"{b:+.2f}"
                except ValueError:
                    pass
            lines.append(f"  {fid:<6} {fid:<32} {act['total_drawings']:>4} {asc_r:>9} {desc_r:>10} {bias_str:>8}")
        lines.append("")

    # --- Proposed changes ---
    lines.append("--- Proposed Weight Changes ---")
    if not proposals:
        if not threshold_result["sufficient"]:
            lines.append("  No proposals — insufficient resolved drawings (see threshold section).")
        else:
            lines.append(f"  No changes proposed (no force meets min {min_observations} observations with meaningful signal).")
    else:
        lines.append(f"  Guardrails: max ±{max_change_pct*100:.0f}% per force | min {min_observations} observations required")
        lines.append(f"  {'Force':<6} {'Current wt':>10} {'Proposed wt':>12} {'Change':>8} {'%':>6} {'Clamped':>8} {'Reason'}")
        lines.append("  " + "-" * 85)
        for p in proposals:
            clamp_tag = "[CLAMPED]" if p["clamped"] else ""
            reason = f"asc_rate={p['asc_rate']:.2f} desc_rate={p['desc_rate']:.2f} bias={p['direction_bias']}"
            lines.append(
                f"  {p['force_id']:<6} {p['current_weight']:>10.4f} {p['proposed_weight']:>12.4f} "
                f"{p['change']:>+8.4f} {p['pct_change']:>5.1f}% {clamp_tag:>8}  {reason}"
            )

    lines.append("")

    if apply_mode:
        if proposals:
            lines.append("--- APPLYING CHANGES ---")
            lines.append("  Writing updated weights to data/forces.json ...")
        else:
            lines.append("  --apply specified but no changes to apply.")
    else:
        lines.append("--- Mode: PREVIEW (no files modified) ---")
        if proposals:
            lines.append("  To apply these changes, re-run with --apply.")
        lines.append("  Every applied weight change should be committed to git:")
        lines.append("  git commit -m 'recalibrate: YYYY-MM-DD -- <force> +/-N% -- N=X obs'")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Apply changes to forces.json
# ---------------------------------------------------------------------------

def apply_proposals(forces_data: dict, proposals: list[dict], forces_path: Path, today: str) -> None:
    for p in proposals:
        for f in forces_data["forces"]:
            if f["id"] == p["force_id"]:
                f["weight"] = p["proposed_weight"]
                break

    forces_data["updated"] = today
    write_json(forces_path, forces_data)
    print(f"\nforces.json updated: {forces_path}")
    print("Commit this change to git:")
    change_summaries = [
        f"{p['force_id']} {p['pct_change']:+.1f}% (N={p['observations']})"
        for p in proposals
    ]
    print(f"  git commit data/forces.json -m \"recalibrate: {today} -- {' | '.join(change_summaries)}\"")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Phase 3B: discover composite score thresholds and propose force weight adjustments"
    )
    parser.add_argument("--drawings", default=None, help="Path to channel_drawings.json")
    parser.add_argument("--history",  default=None, help="Path to composite_history.json")
    parser.add_argument("--forces",   default=None, help="Path to forces.json")
    parser.add_argument("--apply",    action="store_true", help="Write proposed changes to forces.json")
    parser.add_argument("--min-drawings", type=int, default=MIN_RESOLVED_PER_CLASS,
                        help=f"Min resolved drawings per regime class (default: {MIN_RESOLVED_PER_CLASS})")
    parser.add_argument("--min-observations", type=int, default=MIN_FORCE_OBSERVATIONS,
                        help=f"Min force observations before proposing change (default: {MIN_FORCE_OBSERVATIONS})")
    parser.add_argument("--max-change", type=float, default=MAX_WEIGHT_CHANGE_PCT,
                        help=f"Max fractional weight change per cycle (default: {MAX_WEIGHT_CHANGE_PCT})")
    args = parser.parse_args()

    drawings_path = Path(args.drawings) if args.drawings else DEFAULT_DRAWINGS
    history_path  = Path(args.history)  if args.history  else DEFAULT_HISTORY
    forces_path   = Path(args.forces)   if args.forces   else DEFAULT_FORCES

    # Resolve relative paths from project root
    if not drawings_path.is_absolute():
        drawings_path = PROJECT_ROOT / drawings_path
    if not history_path.is_absolute():
        history_path  = PROJECT_ROOT / history_path
    if not forces_path.is_absolute():
        forces_path   = PROJECT_ROOT / forces_path

    drawings_raw = load_json(drawings_path)
    drawings = drawings_raw if isinstance(drawings_raw, list) else [drawings_raw]

    history_raw = load_json(history_path)
    history = history_raw if isinstance(history_raw, list) else []

    forces_data = load_json(forces_path)

    min_resolved = args.min_drawings
    min_obs      = args.min_observations

    resolved   = get_resolved(drawings)
    threshold_result = discover_thresholds(resolved, history, min_per_class=min_resolved)
    activation_table = force_activation_table(resolved)
    proposals = propose_weight_changes(
        forces_data,
        activation_table,
        threshold_result,
        args.max_change,
        min_obs,
    )

    report = render_report(
        drawings, resolved, threshold_result, activation_table,
        proposals, args.apply, args.max_change, min_obs,
    )
    print(report)

    if args.apply:
        if proposals:
            today = date.today().isoformat()
            apply_proposals(forces_data, proposals, forces_path, today)
        else:
            print("Nothing to apply.")


if __name__ == "__main__":
    main()
