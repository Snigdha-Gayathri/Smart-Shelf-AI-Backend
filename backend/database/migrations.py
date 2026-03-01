"""Database migrations for the SmartShelf AI Memory Brain system.

Creates all required tables for:
- Users (references the existing users table concept but stores memory-specific data)
- BookInteraction (stores per-book emotional reactions, ratings, MMC preferences,
  DNF status, completion percentage, explicit feedback — Phase 2)
- TropePreference (per-user trope weights with temporary suppression — Phase 2)
- UserPersonalityProfile (computed personality snapshot)
- BookTropes (maps book IDs to their tropes, derived from book metadata)
- TherapistSession (Phase 3: temporary mood-based therapy sessions)
"""

import logging
from database.connection import get_connection

logger = logging.getLogger(__name__)

MIGRATION_SQL = [
    # ─── Users table (memory-brain specific, links via id to existing auth users) ───
    """
    CREATE TABLE IF NOT EXISTS memory_users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """,

    # ─── BookInteraction (Phase 2: added is_dnf, completion_percentage, explicit_feedback) ───
    """
    CREATE TABLE IF NOT EXISTS book_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        book_id TEXT NOT NULL,
        emotional_tags TEXT NOT NULL DEFAULT '[]',
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        liked_mmc_type TEXT,
        is_dnf INTEGER NOT NULL DEFAULT 0,
        completion_percentage INTEGER NOT NULL DEFAULT 100 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
        explicit_feedback TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES memory_users(id) ON DELETE CASCADE
    )
    """,

    # Index for fast user lookups
    """
    CREATE INDEX IF NOT EXISTS idx_book_interactions_user
    ON book_interactions(user_id)
    """,

    # ─── TropePreference (Phase 2: added temporary_suppression_until) ───
    """
    CREATE TABLE IF NOT EXISTS trope_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        trope_name TEXT NOT NULL,
        weight INTEGER NOT NULL DEFAULT 0 CHECK (weight >= -5 AND weight <= 5),
        temporary_suppression_until TEXT,
        last_updated TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES memory_users(id) ON DELETE CASCADE,
        UNIQUE(user_id, trope_name)
    )
    """,

    # Index for user trope lookups
    """
    CREATE INDEX IF NOT EXISTS idx_trope_preferences_user
    ON trope_preferences(user_id)
    """,

    # ─── UserPersonalityProfile ───
    """
    CREATE TABLE IF NOT EXISTS user_personality_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        dominant_emotions TEXT NOT NULL DEFAULT '[]',
        preferred_mmc_type TEXT DEFAULT '',
        top_tropes TEXT NOT NULL DEFAULT '[]',
        avoided_tropes TEXT NOT NULL DEFAULT '[]',
        last_updated TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES memory_users(id) ON DELETE CASCADE
    )
    """,

    # ─── BookTropes (derived mapping of book_id → tropes) ───
    """
    CREATE TABLE IF NOT EXISTS book_tropes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id TEXT NOT NULL,
        trope_name TEXT NOT NULL,
        UNIQUE(book_id, trope_name)
    )
    """,

    # Index for book trope lookups
    """
    CREATE INDEX IF NOT EXISTS idx_book_tropes_book
    ON book_tropes(book_id)
    """,

    # ─── BookMMCTypes (derived MMC type for each book) ───
    """
    CREATE TABLE IF NOT EXISTS book_mmc_types (
        book_id TEXT PRIMARY KEY,
        mmc_type TEXT NOT NULL
    )
    """,

    # ─── Phase 3: TherapistSession (temporary mood-based recommendation sessions) ───
    """
    CREATE TABLE IF NOT EXISTS therapist_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        input_text TEXT NOT NULL,
        detected_emotion TEXT NOT NULL,
        confidence_score REAL NOT NULL DEFAULT 0.0,
        intensity_level INTEGER NOT NULL DEFAULT 2 CHECK (intensity_level >= 1 AND intensity_level <= 4),
        mood_adjustments TEXT NOT NULL DEFAULT '{}',
        explanation TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES memory_users(id) ON DELETE CASCADE
    )
    """,

    # Index for fast active session lookups
    """
    CREATE INDEX IF NOT EXISTS idx_therapist_sessions_user_active
    ON therapist_sessions(user_id, is_active)
    """,
]

# ─── Phase 2 ALTER migrations (safe to re-run — uses IF NOT EXISTS pattern) ───
PHASE2_ALTER_SQL = [
    # Add Phase 2 columns to book_interactions if missing
    ("book_interactions", "is_dnf", "ALTER TABLE book_interactions ADD COLUMN is_dnf INTEGER NOT NULL DEFAULT 0"),
    ("book_interactions", "completion_percentage", "ALTER TABLE book_interactions ADD COLUMN completion_percentage INTEGER NOT NULL DEFAULT 100"),
    ("book_interactions", "explicit_feedback", "ALTER TABLE book_interactions ADD COLUMN explicit_feedback TEXT"),
    # Add Phase 2 columns to trope_preferences if missing
    ("trope_preferences", "temporary_suppression_until", "ALTER TABLE trope_preferences ADD COLUMN temporary_suppression_until TEXT"),
]


def run_migrations() -> None:
    """Execute all migration statements to ensure tables exist, then run Phase 2 ALTERs."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        for sql in MIGRATION_SQL:
            cur.execute(sql)
        conn.commit()

        # Phase 2 ALTER migrations — add columns if they don't exist yet
        for table, col, alter_sql in PHASE2_ALTER_SQL:
            cur.execute(f"PRAGMA table_info({table})")
            existing_cols = {row[1] for row in cur.fetchall()}
            if col not in existing_cols:
                cur.execute(alter_sql)
                logger.info(f"  Added column {table}.{col}")
        conn.commit()

        logger.info("✅ Memory Brain database migrations completed successfully (Phase 1 + Phase 2 + Phase 3)")
    except Exception as e:
        conn.rollback()
        logger.error(f"❌ Migration error: {e}")
        raise
    finally:
        conn.close()


def ensure_memory_user(user_id: int, email: str = None, name: str = None) -> None:
    """Ensure a user record exists in memory_users.

    This bridges the existing auth system with the memory brain.
    If the user doesn't exist, create them.
    """
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM memory_users WHERE id = ?", (user_id,))
        if cur.fetchone() is None:
            cur.execute(
                "INSERT INTO memory_users (id, email, name) VALUES (?, ?, ?)",
                (user_id, email, name),
            )
            conn.commit()
    finally:
        conn.close()
