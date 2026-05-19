"""
Classify an event description into force IDs using the force-event-mapping reference.

Two-stage classification:
  Stage 1: Keyword matching against references/force-event-mapping.md patterns.
           Fast, deterministic, no LLM.
  Stage 2: If keyword match is ambiguous or confidence is low, outputs a structured
           prompt fragment for the calling LLM agent to resolve.

Usage:
    py classify_event.py "Intel Q1 FY26 earnings beat, DCAI +22% YoY"
    py classify_event.py --ticker INTC "strong earnings beat"
    py classify_event.py --json '{"description": "...", "ticker": "INTC"}'

Output JSON:
    {
      "primary_force_id": "A1",
      "direction": "bullish",
      "confidence": "high",
      "secondary_forces": [{"force_id": "B3", "direction": "bullish"}, ...],
      "f1_tier": 4,
      "confounded": false,
      "ambiguous": false,
      "match_keyword": "intel_earnings beat",
      "llm_prompt": null
    }
"""

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
PROJECT_ROOT = HERE.parent.parent.parent

# ---------------------------------------------------------------------------
# Keyword → force mapping (mirrors references/force-event-mapping.md)
# Order matters: more specific patterns first.
# ---------------------------------------------------------------------------
KEYWORD_RULES: list[dict] = [
    # NVDA-specific
    {"keywords": ["nvda earnings", "nvidia earnings", "nvidia q", "nvda q"],
     "sub_bearish": ["miss", "disappoint", "below", "weak guidance"],
     "primary": "A1", "direction_beat": "bullish", "direction_miss": "bearish",
     "secondary_beat": [("F1", "bullish")], "f1_tier_beat": 1,
     "secondary_miss": [("D1", "bearish"), ("D2", "bearish")], "f1_tier_miss": None},

    {"keywords": ["nvidia launched", "nvda launched", "nvidia announced", "nvda product"],
     "primary": "A1", "direction": "bullish",
     "secondary": [("B1", "bullish")], "f1_tier": None},

    # Hyperscaler earnings
    {"keywords": ["intel earnings", "intel q", "intc earnings"],
     "sub_bearish": ["miss", "disappoint", "weak", "below"],
     "primary": "F1", "direction_beat": "bullish", "direction_miss": "bearish",
     "secondary_beat": [("A1", "bullish"), ("B3", "bullish")], "f1_tier_beat": 4,
     "secondary_miss": [("E2", "bearish")], "f1_tier_miss": None},

    {"keywords": ["tsmc earnings", "tsmc monthly revenue", "tsmc q"],
     "sub_bearish": ["miss", "disappoint", "weak"],
     "primary": "B1", "direction_beat": "bullish", "direction_miss": "bearish",
     "secondary_beat": [("A1", "bullish"), ("F1", "bullish")], "f1_tier_beat": 4,
     "secondary_miss": [("A1", "bearish")], "f1_tier_miss": None},

    {"keywords": ["microsoft earnings", "msft earnings", "amazon earnings", "amzn earnings",
                  "google earnings", "googl earnings", "alphabet earnings",
                  "meta earnings", "oracle earnings"],
     "sub_bearish": ["miss", "disappoint", "weak", "below"],
     "primary": "A1", "direction_beat": "bullish", "direction_miss": "bearish",
     "secondary_beat": [("A2", "bullish"), ("F1", "bullish")], "f1_tier_beat": 3,
     "secondary_miss": [("A2", "bearish")], "f1_tier_miss": None},

    # Export controls
    {"keywords": ["bis", "export control", "export restriction", "entity list",
                  "h200 block", "h20 block", "blackwell block", "chip ban"],
     "sub_bullish": ["lifted", "clarif", "unlock", "approv", "case-by-case"],
     "primary": "C1", "direction": "bearish", "direction_bullish": "bullish",
     "secondary": [("B2", "bearish"), ("D3", "bearish")],
     "secondary_bullish": [("A1", "bullish")], "f1_tier": None},

    # US policy / tariffs
    {"keywords": ["section 232", "tariff chip", "tariff semiconductor",
                  "chips act", "us industrial policy", "reshoring"],
     "sub_bullish": ["chips act", "funding", "domestic fab", "pro"],
     "primary": "C2", "direction": "bearish", "direction_bullish": "bullish",
     "secondary": [("B1", "bearish"), ("C1", "bearish")],
     "secondary_bullish": [("A3", "bullish")], "f1_tier": None},

    # Fed / macro
    {"keywords": ["fomc", "federal reserve", "fed decision", "rate decision"],
     "sub_bullish": ["cut", "dovish", "pause", "hold", "dissent for cut"],
     "primary": "C3", "direction": "bearish", "direction_bullish": "bullish",
     "secondary": [("E2", "bearish")], "secondary_bullish": [("E2", "bullish")],
     "f1_tier": None},

    {"keywords": ["cpi", "pce", "inflation"],
     "sub_bullish": ["cooler", "miss", "below", "lower"],
     "primary": "C3", "direction": "bearish", "direction_bullish": "bullish",
     "secondary": [("E2", "bearish")], "secondary_bullish": [("E2", "bullish")],
     "f1_tier": None},

    # AMD / competitive
    {"keywords": ["amd earnings", "amd gpu", "mi300", "mi325", "instinct"],
     "sub_bullish": ["miss", "weak", "disappoints"],
     "primary": "D1", "direction": "bearish", "direction_bullish": "bullish",
     "secondary": [], "f1_tier": None},

    # Custom silicon
    {"keywords": ["tpu", "trainium", "maia", "mtia", "custom silicon", "custom chip",
                  "in-house chip"],
     "primary": "D2", "direction": "bearish",
     "secondary": [("A1", "bearish")], "f1_tier": None},

    # Market structure
    {"keywords": ["opex", "options expiration", "triple witching"],
     "primary": "E1", "direction": "neutral",
     "secondary": [], "f1_tier": None},

    {"keywords": ["vix spike", "risk-off", "credit spread", "broad selloff"],
     "primary": "E2", "direction": "bearish",
     "secondary": [("E1", "bearish")], "f1_tier": None},

    # Hyperscaler capex statements
    {"keywords": ["capex", "data center spending", "ai spending", "infrastructure spending"],
     "sub_bearish": ["cut", "pause", "slow", "reduce", "peak"],
     "primary": "A1", "direction": "bullish", "direction_bearish": "bearish",
     "secondary": [("A2", "bullish")], "f1_tier": None},
]

# Forces that default to E1 (no identifiable catalyst)
E1_DEFAULT = {
    "primary_force_id": "E1", "direction": "neutral", "confidence": "low",
    "secondary_forces": [], "f1_tier": None, "confounded": False,
    "ambiguous": False, "match_keyword": "no_catalyst_default", "llm_prompt": None,
}


def _contains(text: str, keywords: list[str]) -> bool:
    text_lower = text.lower()
    return any(kw in text_lower for kw in keywords)


def classify(description: str, ticker: str | None = None) -> dict:
    desc = description.lower()

    for rule in KEYWORD_RULES:
        if not _contains(desc, rule["keywords"]):
            continue

        # Determine direction
        if "sub_bullish" in rule and _contains(desc, rule["sub_bullish"]):
            direction = rule.get("direction_bullish", rule.get("direction_beat", "bullish"))
            secondary = rule.get("secondary_bullish", rule.get("secondary_beat", []))
            f1_tier = rule.get("f1_tier_beat", rule.get("f1_tier"))
        elif "sub_bearish" in rule and _contains(desc, rule["sub_bearish"]):
            direction = rule.get("direction_miss", rule.get("direction_bearish", "bearish"))
            secondary = rule.get("secondary_miss", rule.get("secondary", []))
            f1_tier = rule.get("f1_tier_miss", rule.get("f1_tier"))
        elif "direction_beat" in rule:
            # Default to beat direction if no sub-keyword matched
            direction = rule["direction_beat"]
            secondary = rule.get("secondary_beat", rule.get("secondary", []))
            f1_tier = rule.get("f1_tier_beat", rule.get("f1_tier"))
        else:
            direction = rule["direction"]
            secondary = rule.get("secondary", [])
            f1_tier = rule.get("f1_tier")

        primary = rule["primary"]
        confidence = "high" if direction != "neutral" else "low"

        return {
            "primary_force_id": primary,
            "direction": direction,
            "confidence": confidence,
            "secondary_forces": [{"force_id": f, "direction": d} for f, d in secondary],
            "f1_tier": f1_tier,
            "confounded": len(secondary) >= 2,
            "ambiguous": False,
            "match_keyword": rule["keywords"][0],
            "llm_prompt": None,
        }

    # No keyword match — flag as ambiguous for LLM resolution
    llm_prompt = (
        f"Event: \"{description}\"\n"
        f"Ticker: {ticker or 'unspecified'}\n"
        "Using the Flywheel force taxonomy (A1-F1), classify this event:\n"
        "1. Primary force ID and direction (bullish/bearish/neutral)\n"
        "2. Secondary forces if confounded\n"
        "3. F1 tier if applicable\n"
        "4. Confidence (high/medium/low)\n"
        "Return JSON matching the classify_event.py output schema."
    )
    return {
        "primary_force_id": "E1",
        "direction": "neutral",
        "confidence": "low",
        "secondary_forces": [],
        "f1_tier": None,
        "confounded": False,
        "ambiguous": True,
        "match_keyword": None,
        "llm_prompt": llm_prompt,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("description", nargs="?", default=None)
    parser.add_argument("--ticker", default=None)
    parser.add_argument("--json", dest="json_input", default=None)
    args = parser.parse_args()

    if args.json_input:
        inp = json.loads(args.json_input)
        desc = inp["description"]
        ticker = inp.get("ticker")
    elif args.description:
        desc = args.description
        ticker = args.ticker
    else:
        inp = json.load(sys.stdin)
        desc = inp["description"]
        ticker = inp.get("ticker")

    result = classify(desc, ticker)
    print(json.dumps(result, indent=2))
