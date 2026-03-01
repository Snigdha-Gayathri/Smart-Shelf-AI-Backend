"""Memory Service — core intelligence for the SmartShelf Memory Brain.

Responsible for:
  • Storing book interactions (emotional tags, rating, MMC preference,
    DNF status, completion percentage, explicit feedback)
  • Dynamically updating trope preference weights (Phase 2: multi-signal)
  • Triggering trope fatigue detection after every interaction
  • Triggering personality profile recalculation after every interaction
  • Manual trope preference updates

All data is persisted in SQLite. No in-memory-only state.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Dict, List, Optional

from database.connection import get_connection
from database.migrations import ensure_memory_user
from utils.validators import clamp_weight, validate_emotional_tags, validate_rating
from utils.trope_mapper import derive_tropes, derive_mmc_type

logger = logging.getLogger(__name__)


# ──────────────────── Book Metadata Helpers ────────────────────

def _load_books_data() -> List[Dict]:
    """Load the local book dataset from disk."""
    import os
    from pathlib import Path
    books_path = Path(__file__).parent.parent / "data" / "books_data.json"
    if not books_path.exists():
        logger.warning(f"books_data.json not found at {books_path}")
        return []
    with open(books_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _get_book_by_id(book_id: str) -> Optional[Dict]:
    """Find a book in the dataset by title (used as book_id)."""
    books = _load_books_data()
    for book in books:
        if book.get("title", "").lower() == book_id.lower():
            return book
    # Fallback: partial match
    for book in books:
        if book_id.lower() in book.get("title", "").lower():
            return book
    return None


def _ensure_book_tropes(book_id: str, tropes: List[str], mmc_type: str) -> None:
    """Persist derived tropes and MMC type for a book in the database."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        for trope in tropes:
            cur.execute(
                "INSERT OR IGNORE INTO book_tropes (book_id, trope_name) VALUES (?, ?)",
                (book_id, trope),
            )
        cur.execute(
            "INSERT OR REPLACE INTO book_mmc_types (book_id, mmc_type) VALUES (?, ?)",
            (book_id, mmc_type),
        )
        conn.commit()
    finally:
        conn.close()


def get_book_tropes(book_id: str) -> List[str]:
    """Retrieve stored tropes for a book, deriving and storing them if needed."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT trope_name FROM book_tropes WHERE book_id = ?", (book_id,))
        rows = cur.fetchall()
        if rows:
            return [r["trope_name"] for r in rows]
    finally:
        conn.close()

    # Tropes not yet stored — derive from metadata
    book = _get_book_by_id(book_id)
    if book:
        tropes = derive_tropes(book)
        mmc_type = derive_mmc_type(book)
        _ensure_book_tropes(book_id, tropes, mmc_type)
        return tropes
    return []


def get_book_mmc_type(book_id: str) -> Optional[str]:
    """Retrieve stored MMC type for a book, deriving and storing if needed."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT mmc_type FROM book_mmc_types WHERE book_id = ?", (book_id,))
        row = cur.fetchone()
        if row:
            return row["mmc_type"]
    finally:
        conn.close()

    book = _get_book_by_id(book_id)
    if book:
        tropes = derive_tropes(book)
        mmc_type = derive_mmc_type(book)
        _ensure_book_tropes(book_id, tropes, mmc_type)
        return mmc_type
    return None


# ──────────────────── Trope Weight Update Logic ────────────────────

def _update_trope_weights(user_id: int, tropes: List[str], rating: int) -> None:
    """Adjust trope weights based on the book rating.

    Rules:
      • Rating 4–5: increase each trope weight by +1
      • Rating 1–2: decrease each trope weight by -1
      • Rating 3: no change
    Weights are clamped to [-5, +5].
    """
    if not tropes:
        return

    if rating >= 4:
        delta = +1
    elif rating <= 2:
        delta = -1
    else:
        return  # neutral rating, no adjustment

    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    try:
        for trope in tropes:
            # Get current weight or create with 0
            cur.execute(
                "SELECT weight FROM trope_preferences WHERE user_id = ? AND trope_name = ?",
                (user_id, trope),
            )
            row = cur.fetchone()
            if row is not None:
                new_weight = clamp_weight(row["weight"] + delta)
                cur.execute(
                    "UPDATE trope_preferences SET weight = ?, last_updated = ? "
                    "WHERE user_id = ? AND trope_name = ?",
                    (new_weight, now, user_id, trope),
                )
            else:
                new_weight = clamp_weight(delta)
                cur.execute(
                    "INSERT INTO trope_preferences (user_id, trope_name, weight, last_updated) "
                    "VALUES (?, ?, ?, ?)",
                    (user_id, trope, new_weight, now),
                )
        conn.commit()
    finally:
        conn.close()


# ──────────────────── Core Memory Update ────────────────────

def update_user_memory(
    user_id: int,
    book_id: str,
    emotional_tags: List[str],
    rating: int,
    liked_mmc_type: Optional[str] = None,
    is_dnf: bool = False,
    completion_percentage: int = 100,
    explicit_feedback: Optional[str] = None,
) -> Dict:
    """Store a book interaction and update all memory subsystems.

    This is the primary entry point called when a user finishes (or DNFs) a book.

    Steps:
      1. Validate inputs
      2. Ensure user exists in memory_users
      3. Store the book interaction (incl. Phase 2 fields)
      4. Derive book tropes if not already stored
      5. Update trope weights with dynamic signals (Phase 2)
      6. Detect trope fatigue and apply auto-suppression
      7. Recalculate personality profile

    Returns:
        The stored interaction record as a dict.
    """
    # 1. Validate
    valid, err = validate_emotional_tags(emotional_tags)
    if not valid:
        raise ValueError(err)
    valid, err = validate_rating(rating)
    if not valid:
        raise ValueError(err)

    # 2. Ensure user exists
    ensure_memory_user(user_id)

    # 3. Store interaction (with Phase 2 columns)
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    tags_json = json.dumps(emotional_tags)
    try:
        cur.execute(
            "INSERT INTO book_interactions "
            "(user_id, book_id, emotional_tags, rating, liked_mmc_type, "
            " is_dnf, completion_percentage, explicit_feedback, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, book_id, tags_json, rating, liked_mmc_type,
             1 if is_dnf else 0, completion_percentage, explicit_feedback, now),
        )
        interaction_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    logger.info(
        f"Stored interaction #{interaction_id}: user={user_id}, "
        f"book={book_id}, rating={rating}, tags={emotional_tags}, "
        f"dnf={is_dnf}, completion={completion_percentage}%"
    )

    # 4. Derive and store book tropes
    tropes = get_book_tropes(book_id)
    mmc = liked_mmc_type or get_book_mmc_type(book_id)

    # 5. Update trope weights with ALL behavioral signals (Phase 2)
    from services.trope_engine_service import (
        update_trope_weights_dynamic,
        detect_trope_fatigue,
    )
    updated_weights = update_trope_weights_dynamic(
        user_id, tropes, rating,
        is_dnf=is_dnf,
        completion_percentage=completion_percentage,
    )

    # 6. Detect trope fatigue and apply auto-suppression
    fatigued = detect_trope_fatigue(user_id)

    # 7. Recalculate personality profile (import here to avoid circular)
    from services.personality_service import generate_personality_profile
    generate_personality_profile(user_id)

    return {
        "id": interaction_id,
        "user_id": user_id,
        "book_id": book_id,
        "emotional_tags": emotional_tags,
        "rating": rating,
        "liked_mmc_type": liked_mmc_type,
        "is_dnf": is_dnf,
        "completion_percentage": completion_percentage,
        "explicit_feedback": explicit_feedback,
        "created_at": now,
        "derived_tropes": tropes,
        "updated_weights": updated_weights,
        "newly_fatigued_tropes": fatigued,
    }


# ──────────────────── Manual Trope Preference Update ────────────────────

def update_trope_preference(user_id: int, trope_name: str, action: str) -> Dict:
    """Manually update a single trope preference.

    Actions:
      • 'like'        → set weight to +2 (or increase by +1 if already positive)
      • 'dislike'     → set weight to -1 (or decrease by -1 if already negative)
      • 'tired_of'    → set weight to -3
      • 'never_again' → set weight to -5
      • 'reset'       → set weight to 0

    Returns:
        The updated trope preference dict.
    """
    ensure_memory_user(user_id)

    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()

    try:
        # Get current weight
        cur.execute(
            "SELECT weight FROM trope_preferences WHERE user_id = ? AND trope_name = ?",
            (user_id, trope_name),
        )
        row = cur.fetchone()
        current = row["weight"] if row else 0

        # Compute new weight by action
        if action == "like":
            new_weight = clamp_weight(max(current + 1, 2))
        elif action == "dislike":
            new_weight = clamp_weight(min(current - 1, -1))
        elif action == "tired_of":
            new_weight = -3
        elif action == "never_again":
            new_weight = -5
        elif action == "reset":
            new_weight = 0
        else:
            raise ValueError(f"Unknown action: {action}")

        # Upsert
        if row is not None:
            cur.execute(
                "UPDATE trope_preferences SET weight = ?, last_updated = ? "
                "WHERE user_id = ? AND trope_name = ?",
                (new_weight, now, user_id, trope_name),
            )
        else:
            cur.execute(
                "INSERT INTO trope_preferences (user_id, trope_name, weight, last_updated) "
                "VALUES (?, ?, ?, ?)",
                (user_id, trope_name, new_weight, now),
            )
        conn.commit()
    finally:
        conn.close()

    # Recalculate personality after manual update
    from services.personality_service import generate_personality_profile
    generate_personality_profile(user_id)

    return {
        "user_id": user_id,
        "trope_name": trope_name,
        "weight": new_weight,
        "last_updated": now,
    }


# ──────────────────── Query Helpers ────────────────────

def get_user_interactions(user_id: int, limit: int = 100) -> List[Dict]:
    """Retrieve all book interactions for a user."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT * FROM book_interactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        )
        rows = cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["emotional_tags"] = json.loads(d["emotional_tags"])
            result.append(d)
        return result
    finally:
        conn.close()


def get_user_trope_preferences(user_id: int) -> List[Dict]:
    """Retrieve all trope preferences for a user, sorted by weight desc."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT trope_name, weight, temporary_suppression_until, last_updated "
            "FROM trope_preferences "
            "WHERE user_id = ? ORDER BY weight DESC",
            (user_id,),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()
