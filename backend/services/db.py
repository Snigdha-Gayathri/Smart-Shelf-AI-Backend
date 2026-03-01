import sqlite3
import os
from datetime import datetime
from typing import List, Dict

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'previous_books.db')


def _get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS previous_books_read (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_name TEXT NOT NULL,
            genre TEXT,
            theme TEXT,
            timestamp TEXT NOT NULL
        )
        """
    )
    # Users table for local auth (email unique, password hash) + OAuth support
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            name TEXT,
            profile_picture TEXT,
            oauth_provider TEXT,
            oauth_provider_id TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(oauth_provider, oauth_provider_id)
        )
        """
    )
    conn.commit()
    conn.close()


def add_previous_book(book_name: str, genre: str = None, theme: str = None, timestamp: str = None):
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    ts = timestamp or datetime.utcnow().isoformat()
    cur.execute(
        "INSERT INTO previous_books_read (book_name, genre, theme, timestamp) VALUES (?, ?, ?, ?)",
        (book_name, genre, theme, ts),
    )
    conn.commit()
    conn.close()


def get_history(limit: int = 100) -> List[Dict]:
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM previous_books_read ORDER BY id DESC LIMIT ?", (limit,))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_analytics():
    """Return simple analytics: total read, counts by genre and by theme, monthly counts."""
    init_db()
    conn = _get_conn()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) as total FROM previous_books_read")
    total = cur.fetchone()[0]

    cur.execute("SELECT genre, COUNT(*) as cnt FROM previous_books_read GROUP BY genre ORDER BY cnt DESC")
    genre_counts = {row[0] or 'Unknown': row[1] for row in cur.fetchall()}

    cur.execute("SELECT theme, COUNT(*) as cnt FROM previous_books_read GROUP BY theme ORDER BY cnt DESC")
    theme_counts = {row[0] or 'Unknown': row[1] for row in cur.fetchall()}

    # monthly counts (YYYY-MM)
    cur.execute("SELECT substr(timestamp,1,7) as month, COUNT(*) as cnt FROM previous_books_read GROUP BY month ORDER BY month")
    monthly = {row[0]: row[1] for row in cur.fetchall()}

    conn.close()
    return {
        "total_books_read": total,
        "by_genre": genre_counts,
        "by_theme": theme_counts,
        "monthly_counts": monthly,
    }


# ---------- Local Auth Helpers ----------

def add_user(email: str, password_hash: str, created_at: str | None = None):
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    ts = created_at or datetime.utcnow().isoformat()
    cur.execute(
        "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
        (email.lower(), password_hash, ts),
    )
    conn.commit()
    conn.close()


def get_user_by_email(email: str) -> Dict | None:
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, email, password_hash, created_at FROM users WHERE email = ?", (email.lower(),))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def update_user_password(email: str, password_hash: str) -> bool:
    """Update the stored password hash for the given email.
    Returns True if a row was updated, False otherwise.
    """
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE users SET password_hash = ? WHERE email = ?", (password_hash, email.lower()))
    conn.commit()
    updated = cur.rowcount > 0
    conn.close()
    return updated


def delete_user(email: str):
    """Delete user and all associated data from the database."""
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    # Delete user record
    cur.execute("DELETE FROM users WHERE email = ?", (email.lower(),))
    # Note: If we had user-specific book records, we'd delete them here too
    # For now, previous_books_read is not user-specific
    conn.commit()
    conn.close()


def add_oauth_user(email: str, name: str, profile_picture: str, oauth_provider: str, oauth_provider_id: str, created_at: str | None = None) -> Dict | None:
    """Create or update user via OAuth provider."""
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    ts = created_at or datetime.utcnow().isoformat()
    
    try:
        # Try to insert new OAuth user
        cur.execute(
            """INSERT INTO users (email, name, profile_picture, oauth_provider, oauth_provider_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (email.lower(), name, profile_picture, oauth_provider, oauth_provider_id, ts),
        )
        conn.commit()
        return get_user_by_email(email)
    except Exception as e:
        # User already exists, update it
        conn.rollback()
        cur.execute(
            """UPDATE users SET name = ?, profile_picture = ? WHERE email = ?""",
            (name, profile_picture, email.lower()),
        )
        conn.commit()
        return get_user_by_email(email)
    finally:
        conn.close()


def get_user_by_oauth(oauth_provider: str, oauth_provider_id: str) -> Dict | None:
    """Get user by OAuth provider and provider ID."""
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT id, email, name, profile_picture, oauth_provider, oauth_provider_id, created_at 
           FROM users WHERE oauth_provider = ? AND oauth_provider_id = ?""",
        (oauth_provider, oauth_provider_id),
    )
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None

