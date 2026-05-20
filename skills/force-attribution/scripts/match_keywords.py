"""
match_keywords.py — passive force surveillance

Scans any text blob against the trigger_keywords of all forces in forces.json.
Returns matched forces sorted by match count, with DORMANT and ATTENUATING
hits flagged separately — these are the surveillance catches.

Called passively during any step that touches external text:
  - /status Step 4: news research content for each significant day
  - /weekend: macro analysis text
  - Any web fetch whose content should be checked for force relevancy

Usage:
    # Pipe text directly
    py match_keywords.py --text "Hyperscaler capex is accelerating with CoWoS supply constraints"

    # Read from file
    py match_keywords.py --file data/_tmp_news.txt

    # Limit to DORMANT/ATTENUATING forces only (surveillance mode)
    py match_keywords.py --text "..." --inactive-only

    # JSON output for pipeline use
    py match_keywords.py --text "..." --json

Output (default):
    FORCE KEYWORD SCAN
    ------------------
    ACTIVE hits:
      A1 Hyperscaler Capex Cycle (3 matches): hyperscaler capex, GPU demand, data center buildout
      B1 Advanced Packaging (1 match): CoWoS

    DORMANT/ATTENUATING hits — potential reactivation signals:
      [DORMANT] A3 Sovereign AI (0 matches)
      [ATTENUATING] C2 US Industrial Policy (0 matches)

    Surveillance flags: none
"""

import argparse
import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DEFAULT_FORCES = PROJECT_ROOT / "data" / "forces.json"


def load_forces(path: Path) -> dict:
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def normalise(text: str) -> str:
    """Lowercase and collapse whitespace for matching."""
    return re.sub(r"\s+", " ", text.lower()).strip()


def find_matches(text_norm: str, keywords: list[str]) -> list[str]:
    """Return list of keywords found in the normalised text."""
    matched = []
    for kw in keywords:
        kw_norm = normalise(kw)
        if kw_norm in text_norm:
            matched.append(kw)
    return matched


def scan(text: str, forces_data: dict) -> list[dict]:
    """
    Scan text against all forces. Returns list of result dicts, one per force,
    sorted by match count descending.
    """
    text_norm = normalise(text)
    results = []

    for force in forces_data.get("forces", []):
        keywords = force.get("trigger_keywords", [])
        matched = find_matches(text_norm, keywords)
        results.append({
            "force_id":    force["id"],
            "force_name":  force["name"],
            "state":       force.get("state", "DORMANT"),
            "type":        force.get("type", "additive"),
            "match_count": len(matched),
            "matched_terms": matched,
            "is_inactive": force.get("state") in ("DORMANT", "ATTENUATING"),
        })

    results.sort(key=lambda r: (-r["match_count"], r["force_id"]))
    return results


def render_text(results: list[dict], inactive_only: bool) -> str:
    lines = ["FORCE KEYWORD SCAN", "-" * 40]

    active_hits   = [r for r in results if not r["is_inactive"] and r["match_count"] > 0]
    inactive_hits = [r for r in results if r["is_inactive"]     and r["match_count"] > 0]
    surv_flags    = [r for r in results if r["is_inactive"]     and r["match_count"] > 0]

    if not inactive_only:
        lines.append("ACTIVE hits:")
        if active_hits:
            for r in active_hits:
                terms = ", ".join(r["matched_terms"])
                n = r["match_count"]
                lines.append(f"  {r['force_id']} {r['force_name']} ({n} match{'es' if n != 1 else ''}): {terms}")
        else:
            lines.append("  none")
        lines.append("")

    lines.append("DORMANT / ATTENUATING hits — potential reactivation signals:")
    if inactive_hits:
        for r in inactive_hits:
            terms = ", ".join(r["matched_terms"])
            n = r["match_count"]
            tag = f"[{r['state']}]"
            lines.append(f"  {tag} {r['force_id']} {r['force_name']} ({n} match{'es' if n != 1 else ''}): {terms}")
    else:
        lines.append("  none")

    lines.append("")
    if surv_flags:
        lines.append(f"Surveillance flags: {len(surv_flags)} inactive force(s) showing keyword activity")
        for r in surv_flags:
            lines.append(f"  >> {r['force_id']} ({r['state']}) — consider reactivation research")
    else:
        lines.append("Surveillance flags: none")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Scan text against force trigger_keywords for passive force surveillance"
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--text", help="Text to scan (inline string)")
    source.add_argument("--file", help="Path to text file to scan")

    parser.add_argument("--forces",        default=None, help="Override forces.json path")
    parser.add_argument("--inactive-only", action="store_true", dest="inactive_only",
                        help="Show only DORMANT/ATTENUATING matches (surveillance mode)")
    parser.add_argument("--json",          action="store_true", dest="as_json",
                        help="Output as JSON array instead of human-readable text")
    parser.add_argument("--min-matches",   type=int, default=0, dest="min_matches",
                        help="Only show forces with at least N matches (default: 0 = all)")
    args = parser.parse_args()

    forces_path = Path(args.forces) if args.forces else DEFAULT_FORCES
    forces_data = load_forces(forces_path)

    if args.text:
        text = args.text
    else:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"ERROR: file not found: {file_path}", file=sys.stderr)
            sys.exit(1)
        text = file_path.read_text(encoding="utf-8-sig")

    results = scan(text, forces_data)

    if args.min_matches > 0:
        results = [r for r in results if r["match_count"] >= args.min_matches]

    if args.inactive_only:
        results = [r for r in results if r["is_inactive"]]

    if args.as_json:
        print(json.dumps(results, indent=2))
    else:
        print(render_text(results, args.inactive_only))


if __name__ == "__main__":
    main()
