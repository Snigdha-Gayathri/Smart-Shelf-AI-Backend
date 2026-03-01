"""Trope Engine Service — Dynamic Tropes Intelligence Engine (Phase 2).

This is the central intelligence service for all trope-related logic:
  • Dynamic weight adjustment with multi-signal support (rating, DNF, completion, feedback)
  • Trope fatigue detection (auto-detects over-exposure to specific tropes)
  • Temporary suppression system (time-limited weight overrides, auto-expiring)
  • Effective weight calculation (base weight + fatigue + suppression modifiers)
  • Trope analytics aggregation

All trope intelligence logic lives HERE, not in controllers or routes.
All state is persisted in the database. No in-memory-only data.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from database.connection import get_connection
from database.migrations import ensure_memory_user
from utils.validators import clamp_weight

logger = logging.getLogger(__name__)

# ─── Constants ───
FATIGUE_THRESHOLD = 4         # consecutive books with same trope before fatigue triggers
FATIGUE_SUPPRESSION_DAYS = 7  # default suppression period for auto-detected fatigue
FATIGUE_WEIGHT_PENALTY = 2    # how much effective weight is reduced during fatigue


# ────────────────────────── Dynamic Weight Adjustment ──────────────────────────

def compute_weight_delta(
    rating: int,
    is_dnf: bool = False,
    completion_percentage: int = 100,
) -> int:
    """Compute the weight delta for tropes based on all behavioral signals.

    Rules:
      • Rating 4–5  → +1
      • Rating 1–2  → -1
      • Rating 3    → 0
      • DNF         → -2 (overrides rating-based delta)
      • Completion < 30% → additional -1

    Returns:
        Integer delta to apply to each associated trope weight.
    """
    if is_dnf:
        return -2

    if rating >= 4:
        delta = +1
    elif rating <= 2:
        delta = -1
    else:
        delta = 0

    # Very low completion is an additional negative signal
    if completion_percentage < 30 and delta >= 0:
        delta -= 1

    return delta


def update_trope_weights_dynamic(
    user_id: int,
    tropes: List[str],
    rating: int,
    is_dnf: bool = False,
    completion_percentage: int = 100,
) -> Dict[str, int]:
    """Apply dynamic weight adjustments to tropes based on all behavior signals.

    This replaces the Phase 1 _update_trope_weights function.
    Weights are clamped to [-5, +5]. All changes are persisted atomically.

    Returns:
        Dict mapping trope_name → new_weight after adjustment.
    """
    if not tropes:
        return {}

    delta = compute_weight_delta(rating, is_dnf, completion_percentage)
    if delta == 0:
        return {}

    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    results: Dict[str, int] = {}

    try:
        for trope in tropes:
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
            results[trope] = new_weight
        conn.commit()
    finally:
        conn.close()

    return results


# ────────────────────────── Trope Fatigue Detection ──────────────────────────

def detect_trope_fatigue(user_id: int) -> List[str]:
    """Detect tropes that have been over-consumed and trigger automatic fatigue.

    Logic:
      1. Look at the user's last `FATIGUE_THRESHOLD` interactions (by created_at DESC)
      2. Collect all tropes from those books
      3. If any single trope appears in ALL of those interactions, it's fatigued
      4. Apply temporary suppression for FATIGUE_SUPPRESSION_DAYS
      5. Do NOT permanently change the base weight

    Returns:
        List of trope names that were newly fatigued.
    """
    conn = get_connection()
    cur = conn.cursor()

    try:
        # Get the last N interactions for this user
        cur.execute(
            "SELECT book_id FROM book_interactions "
            "WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, FATIGUE_THRESHOLD),
        )
        recent_interactions = cur.fetchall()

        if len(recent_interactions) < FATIGUE_THRESHOLD:
            return []  # Not enough data to detect fatigue

        # Collect tropes for each recent book
        trope_sets: List[set] = []
        for row in recent_interactions:
            book_id = row["book_id"]
            cur.execute(
                "SELECT trope_name FROM book_tropes WHERE book_id = ?",
                (book_id,),
            )
            tropes = {r["trope_name"] for r in cur.fetchall()}
            trope_sets.append(tropes)

        if not trope_sets:
            return []

        # Find tropes that appear in ALL recent interactions
        common_tropes = trope_sets[0]
        for ts in trope_sets[1:]:
            common_tropes = common_tropes & ts

        if not common_tropes:
            return []

        # Apply temporary suppression to fatigued tropes
        newly_fatigued: List[str] = []
        now = datetime.utcnow()
        suppression_until = (now + timedelta(days=FATIGUE_SUPPRESSION_DAYS)).isoformat()

        for trope in common_tropes:
            # Check if already suppressed
            cur.execute(
                "SELECT temporary_suppression_until FROM trope_preferences "
                "WHERE user_id = ? AND trope_name = ?",
                (user_id, trope),
            )
            pref_row = cur.fetchone()

            if pref_row is not None:
                # Only suppress if not already suppressed or suppression has expired
                existing_suppression = pref_row["temporary_suppression_until"]
                if existing_suppression:
                    try:
                        exp = datetime.fromisoformat(existing_suppression)
                        if exp > now:
                            continue  # Already suppressed and not expired
                    except (ValueError, TypeError):
                        pass

                cur.execute(
                    "UPDATE trope_preferences SET temporary_suppression_until = ?, last_updated = ? "
                    "WHERE user_id = ? AND trope_name = ?",
                    (suppression_until, now.isoformat(), user_id, trope),
                )
            else:
                # Create preference entry with suppression (base weight 0)
                cur.execute(
                    "INSERT INTO trope_preferences "
                    "(user_id, trope_name, weight, temporary_suppression_until, last_updated) "
                    "VALUES (?, ?, 0, ?, ?)",
                    (user_id, trope, suppression_until, now.isoformat()),
                )
            newly_fatigued.append(trope)

        conn.commit()

        if newly_fatigued:
            logger.info(
                f"Trope fatigue detected for user {user_id}: {newly_fatigued} "
                f"(suppressed until {suppression_until})"
            )
        return newly_fatigued

    finally:
        conn.close()


# ────────────────────────── Temporary Suppression System ──────────────────────────

def apply_temporary_suppression(
    user_id: int,
    trope_name: str,
    duration_in_days: int = FATIGUE_SUPPRESSION_DAYS,
) -> Dict:
    """Manually apply a temporary suppression to a trope.

    This reduces the effective recommendation weight for the given duration
    WITHOUT modifying the base weight permanently.

    Args:
        user_id: The user's ID.
        trope_name: Name of the trope to suppress.
        duration_in_days: How many days the suppression should last.

    Returns:
        Dict with suppression details.
    """
    ensure_memory_user(user_id)
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow()
    suppression_until = (now + timedelta(days=duration_in_days)).isoformat()

    try:
        cur.execute(
            "SELECT id, weight FROM trope_preferences WHERE user_id = ? AND trope_name = ?",
            (user_id, trope_name),
        )
        row = cur.fetchone()

        if row:
            cur.execute(
                "UPDATE trope_preferences SET temporary_suppression_until = ?, last_updated = ? "
                "WHERE user_id = ? AND trope_name = ?",
                (suppression_until, now.isoformat(), user_id, trope_name),
            )
        else:
            cur.execute(
                "INSERT INTO trope_preferences "
                "(user_id, trope_name, weight, temporary_suppression_until, last_updated) "
                "VALUES (?, ?, 0, ?, ?)",
                (user_id, trope_name, suppression_until, now.isoformat()),
            )

        conn.commit()
        base_weight = row["weight"] if row else 0

        logger.info(
            f"Temporary suppression applied: user={user_id}, trope={trope_name}, "
            f"until={suppression_until}, base_weight={base_weight}"
        )
        return {
            "user_id": user_id,
            "trope_name": trope_name,
            "base_weight": base_weight,
            "suppression_until": suppression_until,
            "duration_days": duration_in_days,
        }
    finally:
        conn.close()


def remove_suppression(user_id: int, trope_name: str) -> Dict:
    """Remove temporary suppression from a trope (restore it).

    Returns:
        Dict with restored trope details.
    """
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()

    try:
        cur.execute(
            "UPDATE trope_preferences SET temporary_suppression_until = NULL, last_updated = ? "
            "WHERE user_id = ? AND trope_name = ?",
            (now, user_id, trope_name),
        )
        conn.commit()

        cur.execute(
            "SELECT weight FROM trope_preferences WHERE user_id = ? AND trope_name = ?",
            (user_id, trope_name),
        )
        row = cur.fetchone()
        weight = row["weight"] if row else 0

        return {
            "user_id": user_id,
            "trope_name": trope_name,
            "weight": weight,
            "suppression_removed": True,
        }
    finally:
        conn.close()


# ────────────────────────── Effective Weight Calculation ──────────────────────────

def get_effective_trope_weights(user_id: int) -> Dict[str, Dict]:
    """Calculate effective trope weights for a user.

    The effective weight accounts for:
      1. Base weight from database
      2. Temporary suppression (if active and not expired)
      3. Fatigue reduction (FATIGUE_WEIGHT_PENALTY applied during active suppression)

    Expired suppressions are auto-cleaned during this call.

    Returns:
        Dict mapping trope_name → {
            base_weight, effective_weight, is_suppressed, is_fatigued,
            suppression_expires
        }
    """
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow()

    try:
        cur.execute(
            "SELECT trope_name, weight, temporary_suppression_until, last_updated "
            "FROM trope_preferences WHERE user_id = ?",
            (user_id,),
        )
        rows = cur.fetchall()

        results: Dict[str, Dict] = {}
        expired_tropes: List[str] = []

        for row in rows:
            trope_name = row["trope_name"]
            base_weight = row["weight"]
            suppression_until = row["temporary_suppression_until"]

            is_suppressed = False
            is_fatigued = False
            effective_weight = float(base_weight)
            suppression_expires = None

            if suppression_until:
                try:
                    exp = datetime.fromisoformat(suppression_until)
                    if exp > now:
                        # Active suppression
                        is_suppressed = True
                        is_fatigued = True
                        effective_weight = float(base_weight) - FATIGUE_WEIGHT_PENALTY
                        # Clamp effective weight
                        effective_weight = max(-5.0, min(5.0, effective_weight))
                        suppression_expires = suppression_until
                    else:
                        # Suppression has expired — clean it up
                        expired_tropes.append(trope_name)
                except (ValueError, TypeError):
                    expired_tropes.append(trope_name)

            results[trope_name] = {
                "trope_name": trope_name,
                "base_weight": base_weight,
                "effective_weight": effective_weight,
                "is_suppressed": is_suppressed,
                "is_fatigued": is_fatigued,
                "suppression_expires": suppression_expires,
            }

        # Auto-clean expired suppressions
        if expired_tropes:
            for trope in expired_tropes:
                cur.execute(
                    "UPDATE trope_preferences SET temporary_suppression_until = NULL, last_updated = ? "
                    "WHERE user_id = ? AND trope_name = ?",
                    (now.isoformat(), user_id, trope),
                )
            conn.commit()
            logger.info(
                f"Auto-cleaned {len(expired_tropes)} expired suppressions for user {user_id}"
            )

        return results
    finally:
        conn.close()


def get_effective_weight_map(user_id: int) -> Dict[str, float]:
    """Convenience: return a simple {trope_name: effective_weight} dict.

    This is what the recommendation engine should use.
    """
    full = get_effective_trope_weights(user_id)
    return {name: data["effective_weight"] for name, data in full.items()}


# ────────────────────────── Trope Feedback Processing ──────────────────────────

def process_trope_feedback(
    user_id: int,
    trope_name: str,
    feedback_type: str,
    suppression_days: Optional[int] = None,
) -> Dict:
    """Process explicit trope feedback from a user.

    Feedback types:
      • 'fatigued'  → set base weight to -3 + apply temporary suppression
      • 'rejected'  → set base weight to -5 (permanent, no suppression needed)
      • 'suppress'  → apply temporary suppression without changing base weight
      • 'restore'   → remove suppression and reset weight to 0

    Returns:
        Dict with updated trope state.
    """
    ensure_memory_user(user_id)
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow()
    now_str = now.isoformat()

    try:
        # Get or create the preference entry
        cur.execute(
            "SELECT weight, temporary_suppression_until FROM trope_preferences "
            "WHERE user_id = ? AND trope_name = ?",
            (user_id, trope_name),
        )
        row = cur.fetchone()
        current_weight = row["weight"] if row else 0

        if feedback_type == "fatigued":
            new_weight = -3
            duration = suppression_days or FATIGUE_SUPPRESSION_DAYS
            suppression_until = (now + timedelta(days=duration)).isoformat()

            if row:
                cur.execute(
                    "UPDATE trope_preferences SET weight = ?, temporary_suppression_until = ?, last_updated = ? "
                    "WHERE user_id = ? AND trope_name = ?",
                    (new_weight, suppression_until, now_str, user_id, trope_name),
                )
            else:
                cur.execute(
                    "INSERT INTO trope_preferences "
                    "(user_id, trope_name, weight, temporary_suppression_until, last_updated) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (user_id, trope_name, new_weight, suppression_until, now_str),
                )
            conn.commit()
            return {
                "user_id": user_id,
                "trope_name": trope_name,
                "feedback_type": feedback_type,
                "base_weight": new_weight,
                "suppression_until": suppression_until,
            }

        elif feedback_type == "rejected":
            new_weight = -5
            if row:
                cur.execute(
                    "UPDATE trope_preferences SET weight = ?, temporary_suppression_until = NULL, last_updated = ? "
                    "WHERE user_id = ? AND trope_name = ?",
                    (new_weight, now_str, user_id, trope_name),
                )
            else:
                cur.execute(
                    "INSERT INTO trope_preferences "
                    "(user_id, trope_name, weight, last_updated) "
                    "VALUES (?, ?, ?, ?)",
                    (user_id, trope_name, new_weight, now_str),
                )
            conn.commit()
            return {
                "user_id": user_id,
                "trope_name": trope_name,
                "feedback_type": feedback_type,
                "base_weight": new_weight,
                "suppression_until": None,
            }

        elif feedback_type == "suppress":
            duration = suppression_days or FATIGUE_SUPPRESSION_DAYS
            suppression_until = (now + timedelta(days=duration)).isoformat()

            if row:
                cur.execute(
                    "UPDATE trope_preferences SET temporary_suppression_until = ?, last_updated = ? "
                    "WHERE user_id = ? AND trope_name = ?",
                    (suppression_until, now_str, user_id, trope_name),
                )
            else:
                cur.execute(
                    "INSERT INTO trope_preferences "
                    "(user_id, trope_name, weight, temporary_suppression_until, last_updated) "
                    "VALUES (?, ?, 0, ?, ?)",
                    (user_id, trope_name, suppression_until, now_str),
                )
            conn.commit()
            return {
                "user_id": user_id,
                "trope_name": trope_name,
                "feedback_type": feedback_type,
                "base_weight": current_weight,
                "suppression_until": suppression_until,
            }

        elif feedback_type == "restore":
            new_weight = 0
            if row:
                cur.execute(
                    "UPDATE trope_preferences SET weight = 0, temporary_suppression_until = NULL, last_updated = ? "
                    "WHERE user_id = ? AND trope_name = ?",
                    (now_str, user_id, trope_name),
                )
            else:
                cur.execute(
                    "INSERT INTO trope_preferences "
                    "(user_id, trope_name, weight, last_updated) "
                    "VALUES (?, ?, 0, ?)",
                    (user_id, trope_name, now_str),
                )
            conn.commit()
            return {
                "user_id": user_id,
                "trope_name": trope_name,
                "feedback_type": feedback_type,
                "base_weight": 0,
                "suppression_until": None,
            }

        else:
            raise ValueError(f"Unknown feedback_type: {feedback_type}")

    finally:
        conn.close()


# ────────────────────────── Trope Analytics ──────────────────────────

def get_trope_analytics(user_id: int) -> Dict:
    """Build a comprehensive trope intelligence report for a user.

    Returns:
        {
            top_tropes: [{trope_name, weight, effective_weight}],
            fatigued_tropes: [{trope_name, suppression_expires, effective_weight}],
            rejected_tropes: [{trope_name, weight}],
            suppressed_tropes: [{trope_name, base_weight, suppression_expires}],
            weight_distribution: {"-5": n, "-4": n, ..., "5": n}
        }
    """
    effective = get_effective_trope_weights(user_id)

    top_tropes = []
    fatigued_tropes = []
    rejected_tropes = []
    suppressed_tropes = []
    weight_dist: Dict[str, int] = {str(i): 0 for i in range(-5, 6)}

    for trope_name, data in effective.items():
        base = data["base_weight"]
        eff = data["effective_weight"]
        is_sup = data["is_suppressed"]
        is_fat = data["is_fatigued"]
        exp = data["suppression_expires"]

        # Weight distribution counts base weights
        key = str(base)
        if key in weight_dist:
            weight_dist[key] += 1

        if base == -5:
            rejected_tropes.append({
                "trope_name": trope_name,
                "weight": base,
            })
        elif is_sup or is_fat:
            fatigued_tropes.append({
                "trope_name": trope_name,
                "base_weight": base,
                "effective_weight": eff,
                "suppression_expires": exp,
            })
            suppressed_tropes.append({
                "trope_name": trope_name,
                "base_weight": base,
                "suppression_expires": exp,
            })
        elif base > 0:
            top_tropes.append({
                "trope_name": trope_name,
                "weight": base,
                "effective_weight": eff,
            })

    # Sort top tropes by effective weight descending
    top_tropes.sort(key=lambda x: x["effective_weight"], reverse=True)
    fatigued_tropes.sort(key=lambda x: x["effective_weight"])
    rejected_tropes.sort(key=lambda x: x["weight"])

    return {
        "user_id": user_id,
        "top_tropes": top_tropes,
        "fatigued_tropes": fatigued_tropes,
        "rejected_tropes": rejected_tropes,
        "suppressed_tropes": suppressed_tropes,
        "weight_distribution": weight_dist,
    }


# ────────────────────────── Recent-Read Similarity Check ──────────────────────────

def get_last_n_read_tropes(user_id: int, n: int = 2) -> List[set]:
    """Get the trope sets for the user's last N read books.

    Used by the recommendation engine to avoid recommending books
    too similar to recent reads.
    """
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT book_id FROM book_interactions "
            "WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, n),
        )
        recent = cur.fetchall()
        result = []
        for row in recent:
            cur.execute(
                "SELECT trope_name FROM book_tropes WHERE book_id = ?",
                (row["book_id"],),
            )
            trope_set = {r["trope_name"] for r in cur.fetchall()}
            result.append(trope_set)
        return result
    finally:
        conn.close()
