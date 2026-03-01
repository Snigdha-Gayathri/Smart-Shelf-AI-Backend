"""Growth Agent — Detects trope over-reliance and suggests diversification.

Single responsibility:
  • Detect narrow trope patterns from trope analytics + reading habits
  • Identify over-reliance on one trope cluster
  • Suggest concrete diversification actions
  • Return structured growth insights

This agent receives pre-computed data from the orchestrator:
  • trope_analytics (from trope engine)
  • habit_data (from Reading Habit Agent)

This agent does NOT call any other agent directly.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from database.connection import get_connection

logger = logging.getLogger(__name__)

AGENT_TAG = "[Agent:Growth]"

# ─── Thresholds ───
CONSECUTIVE_THRESHOLD = 4       # ≥N consecutive same-trope reads triggers suggestion
OVER_RELIANCE_WEIGHT = 4        # base weight ≥ N is considered over-reliance
CLUSTER_DOMINANCE_RATIO = 0.5   # if one cluster accounts for >50% of positive tropes
MIN_INTERACTIONS_FOR_GROWTH = 3 # need at least N reads before growth analysis

# ─── Trope Clusters ───
# Groups of related tropes for cluster-level analysis
TROPE_CLUSTERS: Dict[str, List[str]] = {
    "dark-intensity": [
        "dark-romance", "mafia", "revenge", "enemies-to-lovers",
        "forbidden-love", "arranged-marriage",
    ],
    "soft-comfort": [
        "grumpy-sunshine", "friends-to-lovers", "slow-burn",
        "childhood-friends", "forced-proximity", "single-parent",
    ],
    "power-dynamics": [
        "boss-employee", "billionaire", "age-gap", "royal-romance",
        "academic", "sports-romance",
    ],
    "emotional-tension": [
        "second-chance", "love-triangle", "brother's-best-friend",
        "protector", "secret-baby",
    ],
}

# ─── MMC Diversification Suggestions ───
MMC_DIVERSIFICATION: Dict[str, str] = {
    "morally-grey": "emotionally stable protectors or cinnamon-roll heroes",
    "alpha": "brooding intellectuals or cinnamon-roll heroes",
    "cinnamon-roll": "morally grey antiheroes or dominant alphas",
    "protector": "morally grey characters or academic rivals",
    "dominant": "gentle protectors or slow-burn cinnamon-roll heroes",
    "possessive": "respectful cinnamon-roll heroes or grumpy-but-soft characters",
    "cold": "warm protectors or sunshine heroes",
    "brooding": "lighthearted cinnamon-roll or sunshine heroes",
    "tortured": "stable protectors or warm cinnamon-roll heroes",
    "grumpy": "morally grey antiheroes or alpha heroes",
}


# ────────────────────────── Public API ──────────────────────────

def analyze_growth(
    user_id: int,
    trope_analytics: Dict,
    habit_data: Dict,
) -> Dict:
    """Analyze reading patterns and suggest diversification.

    Args:
        user_id: Target user.
        trope_analytics: Pre-computed from trope engine (via orchestrator).
        habit_data: Pre-computed from Reading Habit Agent (via orchestrator).

    Returns:
        {
            "user_id": int,
            "needs_growth": bool,
            "growth_suggestions": [...],
            "over_reliant_tropes": [...],
            "dominant_cluster": str | None,
            "cluster_dominance_ratio": float,
            "consecutive_pattern": str | None,
            "mmc_suggestion": str | None,
            "agent": "growth",
        }
    """
    logger.info(f"{AGENT_TAG} Analyzing growth for user={user_id}")

    top_tropes = trope_analytics.get("top_tropes", [])
    total_books = habit_data.get("reading_frequency", {}).get("total_books", 0)
    trope_rep_score = habit_data.get("trope_repetition_score", 0.0)
    dominant_trope_loop = habit_data.get("dominant_trope_loop")

    # Not enough data
    if total_books < MIN_INTERACTIONS_FOR_GROWTH:
        logger.info(f"{AGENT_TAG} Not enough data for user={user_id} ({total_books} books)")
        return _empty_growth(user_id)

    suggestions: List[str] = []
    over_reliant: List[str] = []

    # ── 1. Detect over-reliance on individual tropes ──
    for trope_data in top_tropes:
        trope_name = trope_data.get("trope_name", "")
        weight = trope_data.get("effective_weight", trope_data.get("weight", 0))
        if weight >= OVER_RELIANCE_WEIGHT:
            over_reliant.append(trope_name)
            display = trope_name.replace("-", " ").replace("_", " ")
            cluster = _find_opposite_cluster(trope_name)
            if cluster:
                suggestions.append(
                    f"You've been heavily gravitating toward {display} stories "
                    f"(weight: {weight}). Consider exploring {cluster} tropes for variety."
                )

    # ── 2. Detect consecutive trope loops ──
    consecutive_pattern = None
    if dominant_trope_loop and trope_rep_score >= 0.6:
        consecutive_pattern = dominant_trope_loop
        display = dominant_trope_loop.replace("-", " ").replace("_", " ")
        suggestions.append(
            f"You have read {display} books in {int(trope_rep_score * 100)}% of "
            f"your recent reads. Consider mixing in different themes to avoid fatigue."
        )

    # ── 3. Cluster dominance analysis ──
    dominant_cluster, cluster_ratio = _compute_cluster_dominance(top_tropes)

    if dominant_cluster and cluster_ratio >= CLUSTER_DOMINANCE_RATIO:
        opposite = _get_opposite_cluster(dominant_cluster)
        if opposite:
            suggestions.append(
                f"Your reading is {int(cluster_ratio * 100)}% concentrated in "
                f"{dominant_cluster.replace('-', ' ')} themes. "
                f"Try some {opposite.replace('-', ' ')} books for a fresh perspective."
            )

    # ── 4. MMC diversification ──
    mmc_suggestion = _get_mmc_suggestion(user_id)

    if mmc_suggestion:
        suggestions.append(mmc_suggestion)

    needs_growth = len(suggestions) > 0

    logger.info(
        f"{AGENT_TAG} user={user_id}: needs_growth={needs_growth}, "
        f"suggestions={len(suggestions)}, over_reliant={len(over_reliant)}"
    )

    return {
        "user_id": user_id,
        "needs_growth": needs_growth,
        "growth_suggestions": suggestions,
        "over_reliant_tropes": over_reliant,
        "dominant_cluster": dominant_cluster,
        "cluster_dominance_ratio": round(cluster_ratio, 3) if cluster_ratio else 0.0,
        "consecutive_pattern": consecutive_pattern,
        "mmc_suggestion": mmc_suggestion,
        "agent": "growth",
    }


# ────────────────────────── Internal Helpers ──────────────────────────

def _find_opposite_cluster(trope_name: str) -> Optional[str]:
    """Find the opposite cluster name for a trope."""
    for cluster_name, tropes in TROPE_CLUSTERS.items():
        if trope_name in tropes:
            opp = _get_opposite_cluster(cluster_name)
            return opp
    return None


def _get_opposite_cluster(cluster_name: str) -> Optional[str]:
    """Map cluster → suggested opposite."""
    opposites = {
        "dark-intensity": "soft-comfort",
        "soft-comfort": "dark-intensity",
        "power-dynamics": "emotional-tension",
        "emotional-tension": "power-dynamics",
    }
    return opposites.get(cluster_name)


def _compute_cluster_dominance(top_tropes: List[Dict]) -> tuple:
    """Compute which cluster dominates and its share of total positive weight."""
    cluster_scores: Dict[str, float] = {}
    total_weight = 0.0

    for trope_data in top_tropes:
        trope_name = trope_data.get("trope_name", "")
        weight = trope_data.get("effective_weight", trope_data.get("weight", 0))
        if weight <= 0:
            continue
        total_weight += weight

        for cluster_name, cluster_tropes in TROPE_CLUSTERS.items():
            if trope_name in cluster_tropes:
                cluster_scores[cluster_name] = cluster_scores.get(cluster_name, 0) + weight
                break

    if not cluster_scores or total_weight == 0:
        return None, 0.0

    dominant = max(cluster_scores, key=cluster_scores.get)
    ratio = cluster_scores[dominant] / total_weight
    return dominant, ratio


def _get_mmc_suggestion(user_id: int) -> Optional[str]:
    """Check if user has been reading the same MMC type repeatedly."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT liked_mmc_type FROM book_interactions "
            "WHERE user_id = ? AND liked_mmc_type IS NOT NULL AND liked_mmc_type != '' "
            "ORDER BY created_at DESC LIMIT 6",
            (user_id,),
        )
        rows = cur.fetchall()
        if len(rows) < CONSECUTIVE_THRESHOLD:
            return None

        mmc_types = [r["liked_mmc_type"] for r in rows]
        from collections import Counter
        mc = Counter(mmc_types).most_common(1)
        if not mc:
            return None

        dominant_mmc, count = mc[0]
        if count >= CONSECUTIVE_THRESHOLD:
            display = dominant_mmc.replace("-", " ").replace("_", " ")
            alt = MMC_DIVERSIFICATION.get(dominant_mmc)
            if alt:
                return (
                    f"You have read {count} {display} MMC books consecutively. "
                    f"Consider exploring {alt}."
                )
        return None
    finally:
        conn.close()


def _empty_growth(user_id: int) -> Dict:
    """Return an empty growth result for users with insufficient data."""
    return {
        "user_id": user_id,
        "needs_growth": False,
        "growth_suggestions": [],
        "over_reliant_tropes": [],
        "dominant_cluster": None,
        "cluster_dominance_ratio": 0.0,
        "consecutive_pattern": None,
        "mmc_suggestion": None,
        "agent": "growth",
    }
