"""Reading Habit Agent — Analyzes user reading patterns and frequency.

Single responsibility:
  • Analyze reading frequency (books per week / month)
  • Detect binge patterns (many books in short window)
  • Detect long inactivity
  • Detect repeated trope loops (consecutive same-trope reads)
  • Return structured analytics dict

This agent does NOT call any other agent directly.
All data comes from the database (book_interactions, book_tropes).
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from database.connection import get_connection

logger = logging.getLogger(__name__)

AGENT_TAG = "[Agent:ReadingHabit]"

# ─── Thresholds ───
BINGE_WINDOW_DAYS = 7          # 7-day window to detect binge
BINGE_THRESHOLD = 4            # ≥4 books in window = binge
INACTIVITY_THRESHOLD_DAYS = 30 # 30+ days since last read = inactive
TROPE_LOOP_WINDOW = 6          # look at last N books for trope repetition
TROPE_LOOP_THRESHOLD = 0.6     # ≥60% share of dominant trope = loop


# ────────────────────────── Public API ──────────────────────────

def analyze_reading_habits(user_id: int) -> Dict:
    """Build a comprehensive reading-habit analytics report.

    Returns:
        {
            "user_id": int,
            "reading_frequency": {
                "total_books": int,
                "books_last_7_days": int,
                "books_last_30_days": int,
                "avg_books_per_week": float,
            },
            "dominant_reading_time": str | None,  # "morning" | "afternoon" | "evening" | "night" | None
            "binge_score": float,         # 0.0 – 1.0  (higher = more binge-like)
            "inactivity_days": int | None, # days since last read (None if no reads)
            "is_inactive": bool,
            "trope_repetition_score": float,  # 0.0 – 1.0
            "dominant_trope_loop": str | None,  # trope name if looping, else None
            "recent_tropes": list[str],
            "agent": "reading_habit",
        }
    """
    logger.info(f"{AGENT_TAG} Analyzing reading habits for user={user_id}")

    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow()

    try:
        # ── Fetch all interactions ordered by date ──
        cur.execute(
            "SELECT id, book_id, created_at FROM book_interactions "
            "WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
        interactions = cur.fetchall()

        total_books = len(interactions)

        if total_books == 0:
            logger.info(f"{AGENT_TAG} No interactions found for user={user_id}")
            return _empty_result(user_id)

        # Parse dates
        dates = []
        for row in interactions:
            try:
                dates.append(datetime.fromisoformat(row["created_at"]))
            except (ValueError, TypeError):
                pass

        # ── Reading frequency ──
        cutoff_7 = now - timedelta(days=7)
        cutoff_30 = now - timedelta(days=30)
        books_7 = sum(1 for d in dates if d >= cutoff_7)
        books_30 = sum(1 for d in dates if d >= cutoff_30)

        # Average books per week over entire history
        if len(dates) >= 2:
            span_days = max((dates[0] - dates[-1]).total_seconds() / 86400, 1)
            avg_per_week = round(total_books / (span_days / 7), 2)
        elif total_books == 1:
            avg_per_week = 1.0
        else:
            avg_per_week = 0.0

        # ── Dominant reading time ──
        hour_counter: Counter = Counter()
        for d in dates:
            h = d.hour
            if 5 <= h < 12:
                hour_counter["morning"] += 1
            elif 12 <= h < 17:
                hour_counter["afternoon"] += 1
            elif 17 <= h < 21:
                hour_counter["evening"] += 1
            else:
                hour_counter["night"] += 1

        dominant_time = hour_counter.most_common(1)[0][0] if hour_counter else None

        # ── Binge score ──
        # Ratio of books in last BINGE_WINDOW_DAYS to threshold
        binge_raw = books_7 / BINGE_THRESHOLD
        binge_score = round(min(1.0, binge_raw), 3)

        # ── Inactivity ──
        last_read = dates[0] if dates else None
        inactivity_days = int((now - last_read).total_seconds() / 86400) if last_read else None
        is_inactive = (inactivity_days is not None and inactivity_days >= INACTIVITY_THRESHOLD_DAYS)

        # ── Trope repetition score ──
        recent_book_ids = [row["book_id"] for row in interactions[:TROPE_LOOP_WINDOW]]
        all_recent_tropes: List[str] = []
        for bid in recent_book_ids:
            cur.execute(
                "SELECT trope_name FROM book_tropes WHERE book_id = ?", (bid,)
            )
            for r in cur.fetchall():
                all_recent_tropes.append(r["trope_name"])

        trope_repetition_score = 0.0
        dominant_trope_loop = None

        if all_recent_tropes:
            tc = Counter(all_recent_tropes)
            most_common_trope, most_common_count = tc.most_common(1)[0]
            # Repetition score = proportion of recent books that had this trope
            trope_in_books = 0
            for bid in recent_book_ids:
                cur.execute(
                    "SELECT 1 FROM book_tropes WHERE book_id = ? AND trope_name = ?",
                    (bid, most_common_trope),
                )
                if cur.fetchone():
                    trope_in_books += 1

            trope_repetition_score = round(
                trope_in_books / len(recent_book_ids), 3
            ) if recent_book_ids else 0.0

            if trope_repetition_score >= TROPE_LOOP_THRESHOLD:
                dominant_trope_loop = most_common_trope

        logger.info(
            f"{AGENT_TAG} user={user_id}: total={total_books}, "
            f"binge={binge_score}, inactivity={inactivity_days}d, "
            f"trope_rep={trope_repetition_score}"
        )

        return {
            "user_id": user_id,
            "reading_frequency": {
                "total_books": total_books,
                "books_last_7_days": books_7,
                "books_last_30_days": books_30,
                "avg_books_per_week": avg_per_week,
            },
            "dominant_reading_time": dominant_time,
            "binge_score": binge_score,
            "inactivity_days": inactivity_days,
            "is_inactive": is_inactive,
            "trope_repetition_score": trope_repetition_score,
            "dominant_trope_loop": dominant_trope_loop,
            "recent_tropes": list(dict.fromkeys(all_recent_tropes)),  # unique, ordered
            "agent": "reading_habit",
        }

    finally:
        conn.close()


def _empty_result(user_id: int) -> Dict:
    """Return a zeroed-out result for users with no reading history."""
    return {
        "user_id": user_id,
        "reading_frequency": {
            "total_books": 0,
            "books_last_7_days": 0,
            "books_last_30_days": 0,
            "avg_books_per_week": 0.0,
        },
        "dominant_reading_time": None,
        "binge_score": 0.0,
        "inactivity_days": None,
        "is_inactive": False,
        "trope_repetition_score": 0.0,
        "dominant_trope_loop": None,
        "recent_tropes": [],
        "agent": "reading_habit",
    }
