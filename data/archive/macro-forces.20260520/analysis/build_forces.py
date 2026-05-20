"""
Build per-force baselines, state assignments, and composite score.

Merges:
  - significant-days.json (statistical context: z-scores, OHLCV, gap class)
  - research-jan-feb.json + research-mar-apr.json (event attribution)

Outputs:
  - events/YYYY-MM-DD-{slug}.json for each significant day
  - forces.json (master force registry with state and weight)
  - composite.json (current composite score)
  - analysis/decomposition.json (confounded event analysis)
"""

import json
import math
from pathlib import Path
from collections import defaultdict

HERE = Path(__file__).parent.parent
ANALYSIS = HERE / "analysis"
EVENTS = HERE / "events"
EVENTS.mkdir(exist_ok=True)

# --- Force taxonomy ---
FORCES = {
    "A1": {"name": "Hyperscaler Capex Cycle", "category": "A", "type": "additive"},
    "A2": {"name": "Enterprise AI Adoption", "category": "A", "type": "additive"},
    "A3": {"name": "Sovereign AI", "category": "A", "type": "additive"},
    "B1": {"name": "Advanced Packaging & Foundry (CoWoS, HBM)", "category": "B", "type": "additive"},
    "B2": {"name": "Taiwan Geopolitical Risk", "category": "B", "type": "additive"},
    "B3": {"name": "Power & Grid Infrastructure", "category": "B", "type": "additive"},
    "C1": {"name": "China Export Controls", "category": "C", "type": "additive"},
    "C2": {"name": "US Industrial Policy", "category": "C", "type": "additive"},
    "C3": {"name": "Federal Reserve Policy", "category": "C", "type": "additive"},
    "C4": {"name": "AI & Antitrust Regulation", "category": "C", "type": "additive"},
    "D1": {"name": "AMD Competitive Pressure", "category": "D", "type": "additive"},
    "D2": {"name": "Custom Silicon Displacement", "category": "D", "type": "additive"},
    "D3": {"name": "China Domestic Chip Capability", "category": "D", "type": "additive"},
    "E1": {"name": "Positioning & Flows", "category": "E", "type": "oscillating"},
    "E2": {"name": "Cross-Asset Risk Regime", "category": "E", "type": "oscillating"},
    "F1": {"name": "Narrative Validation / 3rd Party Corroboration", "category": "F", "type": "multiplier"},
}


def load_json(path):
    with open(path, "r") as f:
        return json.load(f)


def slugify(description):
    """Turn a description into a filename slug."""
    s = description.lower()[:40]
    keep = "abcdefghijklmnopqrstuvwxyz0123456789"
    out = "".join(c if c in keep else "-" for c in s)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


def merge_event_record(stat_row, research_row):
    """Merge statistical screening row with research attribution into full event record."""
    date = stat_row["date"]
    record = {
        "id": f"{date}-{slugify(research_row['primary_catalyst']['description'])[:30]}",
        "date": date,
        "event_window": research_row["primary_catalyst"].get("event_window", "intraday"),
        "primary_catalyst": research_row["primary_catalyst"],
        "secondary_catalysts": research_row.get("secondary_catalysts", []),
        "price_data": {
            "prior_close": stat_row["prior_close"],
            "event_day": {
                "open": stat_row["open"],
                "high": stat_row["high"],
                "low": stat_row["low"],
                "close": stat_row["close"],
                "volume": stat_row["volume"],
                "gap_open_pct": round(stat_row["gap_pct"], 3) if stat_row.get("gap_pct") is not None else None,
                "intraday_range_pct": round(stat_row["intraday_range_pct"], 3),
                "close_change_pct": stat_row["pct_change"],
                "close_vs_open_pct": stat_row["close_vs_open_pct"],
            },
        },
        "statistical_context": {
            "close_move_sigma": stat_row["close_z"],
            "volume_sigma": stat_row["volume_z"],
            "range_expansion_sigma": stat_row["range_z"],
            "gap_sigma": stat_row["gap_z"],
            "volume_baseline": stat_row["volume_baseline"],
        },
        "reaction_classification": {
            "close": stat_row["close_class"],
            "volume": stat_row["volume_class"],
            "range": stat_row["range_class"],
        },
        "gap_priority": stat_row["gap_priority"],
        "force_attributions": research_row["force_attributions"],
        "f1_attribution": research_row.get("f1_attribution"),
        "confounded": research_row.get("confounded", False),
        "confidence": research_row.get("confidence", "medium"),
        "notes": research_row.get("notes", ""),
    }
    return record


def write_event_files(events):
    """Write each event to its own JSON file."""
    for ev in events:
        fname = f"{ev['date']}-{slugify(ev['primary_catalyst']['description'])[:30]}.json"
        with open(EVENTS / fname, "w") as f:
            json.dump(ev, f, indent=2)


def compute_force_baselines(events):
    """Compute per-force stats from isolated instances."""
    force_stats = defaultdict(lambda: {
        "isolated_events": [],
        "confounded_events": [],
        "bullish_count": 0,
        "bearish_count": 0,
        "neutral_count": 0,
        "cumulative_weight": 0.0,
        "last_event_date": None,
        "f1_instances": [],
    })
    for ev in events:
        close_pct = ev["price_data"]["event_day"]["close_change_pct"]
        date = ev["date"]
        confounded = ev.get("confounded", False)
        # F1 handling — separate track
        if ev.get("f1_attribution"):
            force_stats["F1"]["f1_instances"].append({
                "date": date,
                "tier": ev["f1_attribution"]["tier"],
                "multiplier": ev["f1_attribution"]["multiplier"],
                "close_pct": close_pct,
                "rationale": ev["f1_attribution"]["rationale"],
            })
            force_stats["F1"]["last_event_date"] = date
        # Force attributions
        for attr in ev["force_attributions"]:
            fid = attr["force_id"]
            weighted_reaction = close_pct * attr["weight_share"]
            entry = {
                "date": date,
                "weighted_reaction": round(weighted_reaction, 3),
                "full_reaction": close_pct,
                "weight_share": attr["weight_share"],
                "direction": attr["direction"],
                "close_sigma": ev["statistical_context"]["close_move_sigma"],
            }
            if confounded:
                force_stats[fid]["confounded_events"].append(entry)
            else:
                force_stats[fid]["isolated_events"].append(entry)
            if attr["direction"] == "bullish":
                force_stats[fid]["bullish_count"] += 1
            elif attr["direction"] == "bearish":
                force_stats[fid]["bearish_count"] += 1
            else:
                force_stats[fid]["neutral_count"] += 1
            force_stats[fid]["cumulative_weight"] += abs(weighted_reaction)
            force_stats[fid]["last_event_date"] = date
    return force_stats


def classify_force_state(fid, stats, today="2026-04-24"):
    """Assign state to a force based on event density and recency."""
    total_events = len(stats["isolated_events"]) + len(stats["confounded_events"])
    # F1 special case — counts f1_instances
    if fid == "F1":
        f1_count = len(stats.get("f1_instances", []))
        if f1_count == 0:
            return "DORMANT", 0.0, "No F1 validation events in YTD window"
        # Use f1_instances for recency check
        last_date = stats["f1_instances"][-1]["date"] if stats["f1_instances"] else None
        from datetime import date
        ly, lm, ld = map(int, last_date.split("-"))
        ty, tm, td = map(int, today.split("-"))
        delta = (date(ty, tm, td) - date(ly, lm, ld)).days
        avg_multiplier = sum(i["multiplier"] for i in stats["f1_instances"]) / f1_count
        if delta > 30:
            state = "ATTENUATING"
        else:
            state = "ACTIVE"
        return state, round(avg_multiplier, 3), "building" if f1_count >= 3 else "stable"
    if total_events == 0:
        return "DORMANT", 0.0, "No events in YTD window"
    # Recency — days since last event
    last_date = stats["last_event_date"]
    # Simple date diff (YYYY-MM-DD)
    from datetime import date
    ly, lm, ld = map(int, last_date.split("-"))
    ty, tm, td = map(int, today.split("-"))
    delta = (date(ty, tm, td) - date(ly, lm, ld)).days
    # Weight — normalize cumulative weight per event
    avg_weighted_reaction = stats["cumulative_weight"] / total_events if total_events else 0
    # Recent trend — compare last 3 events vs earlier events
    all_events = sorted(stats["isolated_events"] + stats["confounded_events"], key=lambda e: e["date"])
    recent_3 = all_events[-3:] if len(all_events) >= 3 else all_events
    earlier = all_events[:-3] if len(all_events) >= 3 else []
    recent_avg_sigma = sum(abs(e["close_sigma"]) for e in recent_3) / len(recent_3) if recent_3 else 0
    earlier_avg_sigma = sum(abs(e["close_sigma"]) for e in earlier) / len(earlier) if earlier else recent_avg_sigma
    attenuation_trend = "stable"
    if earlier_avg_sigma > 0 and recent_avg_sigma < 0.5 * earlier_avg_sigma:
        attenuation_trend = "decaying"
    elif earlier_avg_sigma > 0 and recent_avg_sigma > 1.3 * earlier_avg_sigma:
        attenuation_trend = "building"
    # State rules
    # DORMANT: no events in 30+ days AND low weight
    if delta > 30 and avg_weighted_reaction < 0.5:
        state = "DORMANT"
    # ATTENUATING: recent trend is decaying OR last event >21 days ago
    elif attenuation_trend == "decaying" or delta > 21:
        state = "ATTENUATING"
    else:
        state = "ACTIVE"
    # Weight — a normalized score
    weight = round(avg_weighted_reaction, 3)
    return state, weight, attenuation_trend


def compute_direction(stats):
    """Aggregate directional bias. Sums weighted reactions; direction by sign of sum."""
    events = stats["isolated_events"] + stats["confounded_events"]
    if not events:
        return "neutral", 0.0
    total = sum(e["weighted_reaction"] for e in events)
    if total > 0.5:
        return "bullish", round(total, 3)
    elif total < -0.5:
        return "bearish", round(total, 3)
    return "neutral", round(total, 3)


def build_forces_registry(force_stats):
    """Build the master forces.json structure."""
    registry = []
    for fid, meta in FORCES.items():
        stats = force_stats.get(fid, {
            "isolated_events": [], "confounded_events": [],
            "bullish_count": 0, "bearish_count": 0, "neutral_count": 0,
            "cumulative_weight": 0.0, "last_event_date": None, "f1_instances": [],
        })
        state, weight, attenuation = classify_force_state(fid, stats)
        direction, net_reaction = compute_direction(stats)
        entry = {
            "id": fid,
            "name": meta["name"],
            "category": meta["category"],
            "type": meta["type"],
            "state": state,
            "weight": weight,
            "direction_bias": direction,
            "net_ytd_reaction": net_reaction,
            "attenuation_trend": attenuation,
            "event_counts": {
                "total": len(stats["isolated_events"]) + len(stats["confounded_events"]),
                "isolated": len(stats["isolated_events"]),
                "confounded": len(stats["confounded_events"]),
                "bullish": stats["bullish_count"],
                "bearish": stats["bearish_count"],
                "neutral": stats["neutral_count"],
            },
            "last_event_date": stats["last_event_date"],
            "sample_sufficient_for_decomposition": len(stats["isolated_events"]) >= 3,
        }
        if fid == "F1":
            entry["f1_instances"] = stats["f1_instances"]
            entry["f1_count"] = len(stats["f1_instances"])
        registry.append(entry)
    return registry


def compute_composite_score(registry):
    """Composite = sum of (weight * direction) over additive forces, multiplied by F1 coefficient."""
    net_bullish = 0.0
    net_bearish = 0.0
    f1_multiplier = 1.0
    for f in registry:
        if f["id"] == "F1":
            # F1 multiplier effect
            if f["f1_count"] >= 3:
                # Elevated validation support
                weighted_f1 = sum(inst["multiplier"] for inst in f["f1_instances"]) / f["f1_count"]
                f1_multiplier = 1.0 + (weighted_f1 - 1.0) * 0.3  # partial effect
            continue
        if f["state"] == "DORMANT":
            continue
        if f["type"] == "oscillating":
            # E1/E2 — include but don't treat as structural
            contribution = f["net_ytd_reaction"] * 0.5  # half weight for oscillating
        else:
            contribution = f["net_ytd_reaction"]
        if contribution > 0:
            net_bullish += contribution
        else:
            net_bearish += contribution
    net_directional = net_bullish + net_bearish
    composite = net_directional * f1_multiplier
    return {
        "date": "2026-04-24",
        "net_bullish": round(net_bullish, 3),
        "net_bearish": round(net_bearish, 3),
        "net_directional": round(net_directional, 3),
        "f1_multiplier": round(f1_multiplier, 3),
        "composite_score": round(composite, 3),
        "active_force_count": sum(1 for f in registry if f["state"] == "ACTIVE"),
        "attenuating_force_count": sum(1 for f in registry if f["state"] == "ATTENUATING"),
        "dormant_force_count": sum(1 for f in registry if f["state"] == "DORMANT"),
        "interpretation": (
            "bullish_dominant" if composite > 1.0 else
            "bearish_dominant" if composite < -1.0 else
            "balanced"
        ),
    }


def run_decomposition_analysis(events, force_stats):
    """For confounded events, attempt linear decomposition against isolated baselines.

    Computes per-force baseline mean from isolated instances. Minimum N=2 for baseline
    (relaxed from 3 given YTD sample limitations). For confounded events, builds partial
    expectation using available baselines and flags missing forces.
    """
    decomposition_results = []
    # Compute per-force baseline from isolated events (full_reaction, not weighted,
    # because we want the force's contribution per unit of its weight_share)
    # The baseline represents: "when this force is the dominant driver alone,
    # what does the full-day move look like?" — use weighted reaction as approximation.
    force_means = {}
    force_stds = {}
    MIN_SAMPLE = 2
    for fid, stats in force_stats.items():
        iso = stats["isolated_events"]
        if len(iso) >= MIN_SAMPLE:
            reactions = [e["weighted_reaction"] for e in iso]
            mean = sum(reactions) / len(reactions)
            var = sum((r - mean) ** 2 for r in reactions) / max(1, len(reactions) - 1)
            std = math.sqrt(var)
            force_means[fid] = round(mean, 3)
            force_stds[fid] = round(std, 3)
    for ev in events:
        if not ev.get("confounded"):
            continue
        observed = ev["price_data"]["event_day"]["close_change_pct"]
        # Sum expected reactions per attribution (partial — use whatever baselines exist)
        expected = 0.0
        contributions = []
        missing_baselines = []
        for attr in ev["force_attributions"]:
            fid = attr["force_id"]
            if fid in force_means:
                # In decomposition: baseline is already weighted reaction, so we use
                # as-is (weight_share is already baked in via isolated event weighted_reactions
                # ... but those were weighted by that event's weight_share, not this event's).
                # Correct approach: compute per-unit-weight reaction by dividing mean by avg weight_share.
                # For simplicity, scale by weight_share ratio:
                avg_iso_weight = sum(e["weight_share"] for e in force_stats[fid]["isolated_events"]) / len(force_stats[fid]["isolated_events"])
                per_unit = force_means[fid] / avg_iso_weight if avg_iso_weight > 0 else force_means[fid]
                contribution = per_unit * attr["weight_share"]
                expected += contribution
                contributions.append({"force_id": fid, "contribution": round(contribution, 3), "weight_share": attr["weight_share"]})
            else:
                missing_baselines.append(fid)
        residual = round(observed - expected, 3)
        # Classify with residual context
        # Use a threshold based on NVDA's typical daily realized sigma (~2% per the baselines)
        if missing_baselines and len(missing_baselines) == len(ev["force_attributions"]):
            classification = "no_baselines"
        elif abs(residual) < 1.0:
            classification = "additive"
        elif (residual > 0 and observed > 0) or (residual < 0 and observed < 0):
            if abs(residual) > 2.0:
                classification = "strong_synergy"
            else:
                classification = "synergy"
        else:
            classification = "cancellation"
        decomposition_results.append({
            "date": ev["date"],
            "observed": observed,
            "expected_sum": round(expected, 3),
            "residual": residual,
            "classification": classification,
            "contributions": contributions,
            "missing_baselines": missing_baselines,
            "forces": [a["force_id"] for a in ev["force_attributions"]],
        })
    return decomposition_results


def main():
    # Load data
    sig_days = load_json(HERE / "significant-days.json")["days"]
    research = load_json(ANALYSIS / "research-jan-feb.json") + load_json(ANALYSIS / "research-mar-apr.json")
    # Index research by date
    research_by_date = {r["date"]: r for r in research}
    # Build merged event records
    events = []
    for row in sig_days:
        if row["date"] in research_by_date:
            merged = merge_event_record(row, research_by_date[row["date"]])
            events.append(merged)
    # Write individual event files
    write_event_files(events)
    # Compute force stats
    force_stats = compute_force_baselines(events)
    # Build registry
    registry = build_forces_registry(force_stats)
    with open(HERE / "forces.json", "w") as f:
        json.dump({"updated": "2026-04-24", "forces": registry}, f, indent=2)
    # Composite score
    composite = compute_composite_score(registry)
    with open(HERE / "composite.json", "w") as f:
        json.dump(composite, f, indent=2)
    # Decomposition
    decomposition = run_decomposition_analysis(events, force_stats)
    force_baseline_summary = {
        fid: {
            "isolated_n": len(force_stats[fid]["isolated_events"]),
            "confounded_n": len(force_stats[fid]["confounded_events"]),
            "mean_weighted_reaction": round(sum(e["weighted_reaction"] for e in force_stats[fid]["isolated_events"]) / len(force_stats[fid]["isolated_events"]), 3) if force_stats[fid]["isolated_events"] else None,
        }
        for fid in force_stats
    }
    with open(ANALYSIS / "decomposition.json", "w") as f:
        json.dump({"analyses": decomposition, "force_baselines": force_baseline_summary}, f, indent=2)
    # Console report
    print(f"Events written: {len(events)}")
    print(f"\nForce states:")
    for f in registry:
        if f["state"] != "DORMANT":
            print(f"  {f['id']} {f['name'][:40]:<40} state={f['state']:<12} dir={f['direction_bias']:<8} n={f['event_counts']['total']:<2} wt={f['weight']:+.2f} net={f['net_ytd_reaction']:+.2f}")
    print(f"\nDormant forces:")
    for f in registry:
        if f["state"] == "DORMANT":
            print(f"  {f['id']} {f['name'][:40]}")
    print(f"\nComposite: {composite['composite_score']:+.3f} ({composite['interpretation']})")
    print(f"  Net bullish: {composite['net_bullish']:+.3f}")
    print(f"  Net bearish: {composite['net_bearish']:+.3f}")
    print(f"  F1 multiplier: {composite['f1_multiplier']:.3f}")
    print(f"\nDecomposition findings (confounded events):")
    for d in decomposition:
        print(f"  {d['date']}  obs={d['observed']:+.2f}  exp={d['expected_sum']:+.2f}  residual={d['residual']:+.2f}  -> {d['classification']}")


if __name__ == "__main__":
    main()
