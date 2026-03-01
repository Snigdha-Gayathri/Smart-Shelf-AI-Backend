"""Recommendation Agent — Generates base book recommendations.

Single responsibility:
  • Receive a weight map (effective trope weights — possibly mood-adjusted)
  • Score and rank books from the local dataset
  • Respect fatigue / suppression logic (via weights already adjusted)
  • Exclude rejected tropes and already-read books
  • Return a ranked list of book dicts

This agent does NOT know about therapist logic.
It only receives pre-computed weight maps.

This agent does NOT call any other agent directly.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from services.recommendation_service import (
    get_personalized_recommendations as _core_recommend,
    _load_books,
    _get_user_read_books,
    _get_user_preferred_mmc,
)
from services.trope_engine_service import (
    get_effective_weight_map,
    get_last_n_read_tropes,
)
from utils.trope_mapper import derive_tropes, derive_mmc_type

logger = logging.getLogger(__name__)

AGENT_TAG = "[Agent:Recommendation]"


# ────────────────────────── Public API ──────────────────────────

def get_recommendations(
    user_id: int,
    *,
    limit: int = 10,
    weight_overrides: Optional[Dict[str, float]] = None,
    preferred_mmc_override: Optional[str] = None,
    extra_mmc_bonus_types: Optional[List[str]] = None,
    exclude_book_ids: Optional[set] = None,
) -> Dict:
    """Generate ranked book recommendations.

    If `weight_overrides` is provided, uses those weights instead of
    the user's effective weights (used by the therapist flow).

    Args:
        user_id: Target user.
        limit: Max books to return.
        weight_overrides: Optional pre-computed weight map (e.g. mood-adjusted).
        preferred_mmc_override: Override the user's preferred MMC (optional).
        extra_mmc_bonus_types: Additional MMC types to give bonus scoring.
        exclude_book_ids: Extra book IDs to exclude beyond already-read.

    Returns:
        {
            "user_id": int,
            "recommendations": [...],
            "agent": "recommendation",
        }
    """
    logger.info(
        f"{AGENT_TAG} Generating recommendations for user={user_id}, "
        f"limit={limit}, overrides={'yes' if weight_overrides else 'no'}"
    )

    # If no weight overrides → use standard Phase 2 path
    if weight_overrides is None:
        result = _core_recommend(user_id, limit=limit)
        result["agent"] = "recommendation"
        logger.info(f"{AGENT_TAG} Returned {len(result['recommendations'])} standard recs")
        return result

    # ── Custom weight path (used by therapist agent) ──
    effective_weights = weight_overrides
    books = _load_books()
    if not books:
        return {
            "user_id": user_id,
            "recommendations": [],
            "reason": "No books in dataset",
            "agent": "recommendation",
        }

    read_books = _get_user_read_books(user_id)
    if exclude_book_ids:
        read_books = read_books | exclude_book_ids

    preferred_mmc = preferred_mmc_override or _get_user_preferred_mmc(user_id)
    extra_mmc = extra_mmc_bonus_types or []

    # Recent-read trope sets for similarity penalty
    recent_trope_sets = get_last_n_read_tropes(user_id, n=2)

    # Tropes to exclude: weight <= -5
    excluded_tropes = {t for t, w in effective_weights.items() if w <= -5}

    scored: List[Dict] = []
    for book in books:
        book_id = book.get("title", "")
        if book_id in read_books:
            continue

        tropes = derive_tropes(book)
        mmc_type = derive_mmc_type(book)

        if excluded_tropes & set(tropes):
            continue

        score = 0.0
        matched = 0
        for trope in tropes:
            if trope in effective_weights:
                score += effective_weights[trope]
                matched += 1

        # MMC bonuses
        if preferred_mmc and mmc_type == preferred_mmc:
            score += 1.5
        if mmc_type in extra_mmc:
            score += 2.0

        # Similarity penalty
        book_trope_set = set(tropes)
        penalty = 0.0
        for recent_set in recent_trope_sets:
            if recent_set and book_trope_set:
                overlap = len(book_trope_set & recent_set)
                total = len(book_trope_set | recent_set)
                if total > 0 and (overlap / total) > 0.6:
                    penalty += 1.5
        score -= penalty

        normalized = score / len(tropes) if tropes else 0.0

        scored.append({
            "book_id": book_id,
            "title": book.get("title", ""),
            "author": book.get("author", ""),
            "genre": book.get("genre", ""),
            "synopsis": book.get("synopsis", ""),
            "cover": book.get("cover"),
            "tropes": tropes,
            "mmc_type": mmc_type,
            "match_score": round(normalized, 3),
            "raw_score": round(score, 3),
            "matched_tropes": matched,
            "similarity_penalty": round(penalty, 3),
            "emotion_tags": book.get("emotion_tags", []),
            "mood": book.get("mood"),
            "tone": book.get("tone"),
        })

    scored.sort(key=lambda x: (x["match_score"], x.get("raw_score", 0)), reverse=True)
    recommendations = scored[:limit]

    logger.info(f"{AGENT_TAG} Returned {len(recommendations)} custom-weight recs")

    return {
        "user_id": user_id,
        "recommendations": recommendations,
        "total_candidates": len(books),
        "filtered_count": len(scored),
        "agent": "recommendation",
    }
