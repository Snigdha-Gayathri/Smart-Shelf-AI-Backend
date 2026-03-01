"""Personalized Recommendation Service — Memory-Based Book Recommendations.

Uses the user's personality profile (effective trope weights, emotional
preferences, MMC type) to filter and rank books from the local dataset.

Logic (Phase 2 — Dynamic Tropes):
  1. Fetch EFFECTIVE trope weights (accounts for fatigue & suppression)
  2. Derive tropes for every book in the dataset
  3. Score each book by how well its tropes match the user's effective weights
  4. Exclude any book whose tropes include one with effective weight -5
  5. Exclude books the user has already interacted with
  6. De-prioritize books too similar to the last 2 reads
  7. Return top N recommendations

NO hardcoded suggestions. All ranking comes from the trope intelligence engine.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

from database.connection import get_connection
from services.memory_service import get_book_tropes, get_book_mmc_type
from utils.trope_mapper import derive_tropes, derive_mmc_type

logger = logging.getLogger(__name__)


def _load_books() -> List[Dict]:
    """Load the local book dataset."""
    books_path = Path(__file__).parent.parent / "data" / "books_data.json"
    if not books_path.exists():
        return []
    with open(books_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _get_user_trope_weights(user_id: int) -> Dict[str, int]:
    """Fetch all trope weights for a user as a {trope_name: weight} dict."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT trope_name, weight FROM trope_preferences WHERE user_id = ?",
            (user_id,),
        )
        return {r["trope_name"]: r["weight"] for r in cur.fetchall()}
    finally:
        conn.close()


def _get_user_read_books(user_id: int) -> set:
    """Get the set of book_ids the user has already interacted with."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT DISTINCT book_id FROM book_interactions WHERE user_id = ?",
            (user_id,),
        )
        return {r["book_id"] for r in cur.fetchall()}
    finally:
        conn.close()


def _get_user_preferred_mmc(user_id: int) -> Optional[str]:
    """Get the user's preferred MMC type from their personality profile."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT preferred_mmc_type FROM user_personality_profiles WHERE user_id = ?",
            (user_id,),
        )
        row = cur.fetchone()
        return row["preferred_mmc_type"] if row and row["preferred_mmc_type"] else None
    finally:
        conn.close()


def get_personalized_recommendations(
    user_id: int,
    limit: int = 10,
) -> Dict:
    """Generate personalized book recommendations for a user.

    Phase 2 enhancements:
      • Uses effective trope weights (fatigue + suppression modifiers)
      • De-prioritizes books too similar to last 2 reads (penalty)
      • Excludes tropes with effective weight <= -5

    Returns:
        Dict with 'recommendations' list and metadata.
    """
    from services.trope_engine_service import (
        get_effective_weight_map,
        get_last_n_read_tropes,
    )

    books = _load_books()
    if not books:
        return {"user_id": user_id, "recommendations": [], "reason": "No books in dataset"}

    # Use effective weights instead of raw DB weights
    effective_weights = get_effective_weight_map(user_id)
    read_books = _get_user_read_books(user_id)
    preferred_mmc = _get_user_preferred_mmc(user_id)

    # Get last 2 read trope-sets for similarity penalty
    recent_trope_sets = get_last_n_read_tropes(user_id, n=2)

    # If user has no trope data at all, return top books by default ordering
    if not effective_weights:
        recs = []
        for book in books[:limit]:
            book_id = book.get("title", "")
            tropes = derive_tropes(book)
            mmc_type = derive_mmc_type(book)
            recs.append({
                "book_id": book_id,
                "title": book.get("title", ""),
                "author": book.get("author", ""),
                "genre": book.get("genre", ""),
                "synopsis": book.get("synopsis", ""),
                "cover": book.get("cover"),
                "tropes": tropes,
                "mmc_type": mmc_type,
                "match_score": 0.0,
                "emotion_tags": book.get("emotion_tags", []),
                "mood": book.get("mood"),
                "tone": book.get("tone"),
                "type": book["type"],
                "pacing": book.get("pacing"),
            })
        return {
            "user_id": user_id,
            "recommendations": recs,
            "reason": "No preference data yet — showing default selection",
        }

    # Identify tropes to exclude: effective weight <= -5
    excluded_tropes = {t for t, w in effective_weights.items() if w <= -5}

    # Score each book
    scored_books: List[Dict] = []
    for book in books:
        book_id = book.get("title", "")

        # Skip already-read books
        if book_id in read_books:
            continue

        # Derive tropes for this book
        tropes = derive_tropes(book)
        mmc_type = derive_mmc_type(book)

        # Exclude if any trope is excluded
        if excluded_tropes & set(tropes):
            continue

        # Calculate match score using effective weights
        score = 0.0
        matched_tropes = 0
        for trope in tropes:
            if trope in effective_weights:
                score += effective_weights[trope]
                matched_tropes += 1

        # Bonus for matching MMC type preference
        if preferred_mmc and mmc_type == preferred_mmc:
            score += 2.0

        # De-prioritize books too similar to recent reads
        book_trope_set = set(tropes)
        similarity_penalty = 0.0
        for recent_set in recent_trope_sets:
            if recent_set and book_trope_set:
                overlap = len(book_trope_set & recent_set)
                total = len(book_trope_set | recent_set)
                if total > 0:
                    jaccard = overlap / total
                    if jaccard > 0.6:  # high overlap threshold
                        similarity_penalty += 1.5

        score -= similarity_penalty

        # Normalize by number of tropes (avoid bias toward books with many tropes)
        if len(tropes) > 0:
            normalized_score = score / len(tropes)
        else:
            normalized_score = 0.0

        scored_books.append({
            "book_id": book_id,
            "title": book.get("title", ""),
            "author": book.get("author", ""),
            "genre": book.get("genre", ""),
            "synopsis": book.get("synopsis", ""),
            "cover": book.get("cover"),
            "tropes": tropes,
            "mmc_type": mmc_type,
            "match_score": round(normalized_score, 3),
            "raw_score": round(score, 3),
            "matched_tropes": matched_tropes,
            "similarity_penalty": round(similarity_penalty, 3),
            "emotion_tags": book.get("emotion_tags", []),
            "mood": book.get("mood"),
            "tone": book.get("tone"),
            "type": book["type"],
            "pacing": book.get("pacing"),
        })

    # Sort by match_score descending, then by raw_score as tiebreaker
    scored_books.sort(key=lambda x: (x["match_score"], x.get("raw_score", 0)), reverse=True)

    # Take top N
    recommendations = scored_books[:limit]

    # Build summary of active filters
    positive_tropes = sorted(
        [(t, w) for t, w in effective_weights.items() if w > 0],
        key=lambda x: x[1],
        reverse=True,
    )
    excluded_list = sorted(excluded_tropes)

    return {
        "user_id": user_id,
        "recommendations": recommendations,
        "active_preferences": {
            "top_tropes": [{"trope": t, "effective_weight": w} for t, w in positive_tropes[:5]],
            "excluded_tropes": excluded_list,
            "preferred_mmc_type": preferred_mmc,
        },
        "total_candidates": len(books),
        "filtered_count": len(scored_books),
    }
