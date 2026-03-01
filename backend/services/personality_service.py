"""Personality Profile Service — generates dynamic user reading personalities.

Analyzes all of a user's book interactions to compute:
  • Dominant emotional reactions
  • Preferred MMC archetype
  • Top-weighted tropes (favorites)
  • Avoided tropes (rejected/fatigued)

The profile is stored in the database and auto-updated after every interaction.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from datetime import datetime
from typing import Dict, List, Optional

from database.connection import get_connection
from database.migrations import ensure_memory_user

logger = logging.getLogger(__name__)


def generate_personality_profile(user_id: int) -> Dict:
    """Build and persist a user's personality profile from their interaction history.

    Logic:
      1. Count all emotional tags across interactions → top 5 = dominantEmotions
      2. Count all liked_mmc_type values → most common = preferredMMCType
      3. Fetch trope weights: top 5 positive = topTropes
      4. Fetch trope weights: all with weight <= -3 = avoidedTropes

    The result is stored in `user_personality_profiles` and also returned.
    """
    ensure_memory_user(user_id)
    conn = get_connection()
    cur = conn.cursor()

    try:
        # ── 1. Count emotional tags ──
        cur.execute(
            "SELECT emotional_tags FROM book_interactions WHERE user_id = ?",
            (user_id,),
        )
        emotion_counter: Counter = Counter()
        for row in cur.fetchall():
            tags = json.loads(row["emotional_tags"])
            emotion_counter.update(tags)

        dominant_emotions = [tag for tag, _ in emotion_counter.most_common(5)]

        # ── 2. Most common MMC type ──
        cur.execute(
            "SELECT liked_mmc_type, COUNT(*) as cnt "
            "FROM book_interactions "
            "WHERE user_id = ? AND liked_mmc_type IS NOT NULL AND liked_mmc_type != '' "
            "GROUP BY liked_mmc_type ORDER BY cnt DESC LIMIT 1",
            (user_id,),
        )
        mmc_row = cur.fetchone()
        preferred_mmc_type = mmc_row["liked_mmc_type"] if mmc_row else ""

        # ── 3. Top tropes (highest weight, positive only) ──
        cur.execute(
            "SELECT trope_name FROM trope_preferences "
            "WHERE user_id = ? AND weight > 0 ORDER BY weight DESC LIMIT 5",
            (user_id,),
        )
        top_tropes = [r["trope_name"] for r in cur.fetchall()]

        # ── 4. Avoided tropes (weight <= -3) ──
        cur.execute(
            "SELECT trope_name FROM trope_preferences "
            "WHERE user_id = ? AND weight <= -3 ORDER BY weight ASC",
            (user_id,),
        )
        avoided_tropes = [r["trope_name"] for r in cur.fetchall()]

        # ── Store the profile ──
        now = datetime.utcnow().isoformat()
        profile_data = {
            "user_id": user_id,
            "dominant_emotions": dominant_emotions,
            "preferred_mmc_type": preferred_mmc_type,
            "top_tropes": top_tropes,
            "avoided_tropes": avoided_tropes,
            "last_updated": now,
        }

        cur.execute(
            "SELECT id FROM user_personality_profiles WHERE user_id = ?",
            (user_id,),
        )
        existing = cur.fetchone()

        if existing:
            cur.execute(
                "UPDATE user_personality_profiles SET "
                "dominant_emotions = ?, preferred_mmc_type = ?, "
                "top_tropes = ?, avoided_tropes = ?, last_updated = ? "
                "WHERE user_id = ?",
                (
                    json.dumps(dominant_emotions),
                    preferred_mmc_type,
                    json.dumps(top_tropes),
                    json.dumps(avoided_tropes),
                    now,
                    user_id,
                ),
            )
        else:
            cur.execute(
                "INSERT INTO user_personality_profiles "
                "(user_id, dominant_emotions, preferred_mmc_type, "
                "top_tropes, avoided_tropes, last_updated) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    user_id,
                    json.dumps(dominant_emotions),
                    preferred_mmc_type,
                    json.dumps(top_tropes),
                    json.dumps(avoided_tropes),
                    now,
                ),
            )

        conn.commit()
        logger.info(
            f"Updated personality profile for user {user_id}: "
            f"emotions={dominant_emotions}, mmc={preferred_mmc_type}, "
            f"top_tropes={top_tropes}, avoided={avoided_tropes}"
        )
        return profile_data

    finally:
        conn.close()


def get_personality_profile(user_id: int) -> Optional[Dict]:
    """Retrieve the stored personality profile for a user.

    If no profile exists yet, generates one on-the-fly.
    Returns None only if the user has no interactions at all.
    """
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT * FROM user_personality_profiles WHERE user_id = ?",
            (user_id,),
        )
        row = cur.fetchone()
        if row:
            return {
                "user_id": row["user_id"],
                "dominant_emotions": json.loads(row["dominant_emotions"]),
                "preferred_mmc_type": row["preferred_mmc_type"],
                "top_tropes": json.loads(row["top_tropes"]),
                "avoided_tropes": json.loads(row["avoided_tropes"]),
                "last_updated": row["last_updated"],
            }
    finally:
        conn.close()

    # Check if user has any interactions
    conn2 = get_connection()
    cur2 = conn2.cursor()
    try:
        cur2.execute(
            "SELECT COUNT(*) as cnt FROM book_interactions WHERE user_id = ?",
            (user_id,),
        )
        cnt = cur2.fetchone()["cnt"]
    finally:
        conn2.close()

    if cnt > 0:
        # Has interactions but no profile yet — generate it
        return generate_personality_profile(user_id)

    return None
