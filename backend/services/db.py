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
            user_identifier TEXT,
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
            username TEXT UNIQUE,
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
    # Lightweight in-place migrations for existing local DB files.
    cur.execute("PRAGMA table_info(previous_books_read)")
    previous_cols = {row[1] for row in cur.fetchall()}
    if "user_identifier" not in previous_cols:
        cur.execute("ALTER TABLE previous_books_read ADD COLUMN user_identifier TEXT")

    cur.execute("PRAGMA table_info(users)")
    user_cols = {row[1] for row in cur.fetchall()}
    if "password_hash" not in user_cols:
        cur.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
    if "username" not in user_cols:
        cur.execute("ALTER TABLE users ADD COLUMN username TEXT")
    if "name" not in user_cols:
        cur.execute("ALTER TABLE users ADD COLUMN name TEXT")
    if "profile_picture" not in user_cols:
        cur.execute("ALTER TABLE users ADD COLUMN profile_picture TEXT")
    if "oauth_provider" not in user_cols:
        cur.execute("ALTER TABLE users ADD COLUMN oauth_provider TEXT")
    if "oauth_provider_id" not in user_cols:
        cur.execute("ALTER TABLE users ADD COLUMN oauth_provider_id TEXT")
    if "created_at" not in user_cols:
        cur.execute("ALTER TABLE users ADD COLUMN created_at TEXT")

    # Enforce uniqueness for username when present.
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username)")

    conn.commit()
    conn.close()


def add_previous_book(book_name: str, genre: str = None, theme: str = None, timestamp: str = None, user_identifier: str = None):
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    ts = timestamp or datetime.utcnow().isoformat()
    cur.execute(
        "INSERT INTO previous_books_read (book_name, genre, theme, user_identifier, timestamp) VALUES (?, ?, ?, ?, ?)",
        (book_name, genre, theme, (user_identifier or "").strip().lower() or None, ts),
    )
    conn.commit()
    conn.close()


def get_history(limit: int = 100, user_identifier: str = None) -> List[Dict]:
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    normalized_user = (user_identifier or "").strip().lower()
    if normalized_user:
        cur.execute(
            "SELECT * FROM previous_books_read WHERE user_identifier = ? ORDER BY id DESC LIMIT ?",
            (normalized_user, limit),
        )
    else:
        cur.execute("SELECT * FROM previous_books_read ORDER BY id DESC LIMIT ?", (limit,))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_analytics(user_identifier: str = None):
    """Return simple analytics: total read, counts by genre and by theme, monthly counts."""
    init_db()
    conn = _get_conn()
    cur = conn.cursor()

    normalized_user = (user_identifier or "").strip().lower()

    if normalized_user:
        cur.execute("SELECT COUNT(*) as total FROM previous_books_read WHERE user_identifier = ?", (normalized_user,))
        total = cur.fetchone()[0]

        cur.execute(
            "SELECT genre, COUNT(*) as cnt FROM previous_books_read WHERE user_identifier = ? GROUP BY genre ORDER BY cnt DESC",
            (normalized_user,),
        )
        genre_counts = {row[0] or 'Unknown': row[1] for row in cur.fetchall()}

        cur.execute(
            "SELECT theme, COUNT(*) as cnt FROM previous_books_read WHERE user_identifier = ? GROUP BY theme ORDER BY cnt DESC",
            (normalized_user,),
        )
        theme_counts = {row[0] or 'Unknown': row[1] for row in cur.fetchall()}

        cur.execute(
            "SELECT substr(timestamp,1,7) as month, COUNT(*) as cnt FROM previous_books_read WHERE user_identifier = ? GROUP BY month ORDER BY month",
            (normalized_user,),
        )
        monthly = {row[0]: row[1] for row in cur.fetchall()}
    else:
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

def add_user(email: str, password_hash: str, created_at: str | None = None, username: str | None = None, name: str | None = None):
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    ts = created_at or datetime.utcnow().isoformat()
    normalized_email = (email or "").strip().lower() if email else None
    normalized_username = (username or "").strip().lower() if username else None
    cur.execute(
        "INSERT INTO users (email, username, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)",
        (normalized_email, normalized_username, password_hash, name, ts),
    )
    conn.commit()
    conn.close()


def get_user_by_email(email: str) -> Dict | None:
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, email, username, name, password_hash, created_at FROM users WHERE email = ?", (email.lower(),))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_username(username: str) -> Dict | None:
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, email, username, name, password_hash, created_at FROM users WHERE username = ?", ((username or "").strip().lower(),))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def username_exists(username: str) -> bool:
    return get_user_by_username(username) is not None


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


def update_user_password_by_username(username: str, password_hash: str) -> bool:
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE users SET password_hash = ? WHERE username = ?", (password_hash, (username or "").strip().lower()))
    conn.commit()
    updated = cur.rowcount > 0
    conn.close()
    return updated


def delete_user(email: str):
    """Delete user and all associated data from the database."""
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    normalized_email = (email or "").strip().lower()

    # Lookup username before deleting user record to clean user-linked reading history too.
    cur.execute("SELECT username FROM users WHERE email = ?", (normalized_email,))
    row = cur.fetchone()
    username = (row[0] or "").strip().lower() if row else ""

    # Delete user record
    cur.execute("DELETE FROM users WHERE email = ?", (normalized_email,))

    # Delete reading records linked to this user by username/email identifier.
    if username:
        cur.execute("DELETE FROM previous_books_read WHERE user_identifier = ?", (username,))
    cur.execute("DELETE FROM previous_books_read WHERE user_identifier = ?", (normalized_email,))

    conn.commit()
    conn.close()


def delete_user_by_username(username: str):
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    normalized_username = (username or "").strip().lower()

    # Fetch email for cleanup before deleting.
    cur.execute("SELECT email FROM users WHERE username = ?", (normalized_username,))
    row = cur.fetchone()
    email = (row[0] or "").strip().lower() if row else ""

    cur.execute("DELETE FROM users WHERE username = ?", (normalized_username,))
    cur.execute("DELETE FROM previous_books_read WHERE user_identifier = ?", (normalized_username,))
    if email:
        cur.execute("DELETE FROM previous_books_read WHERE user_identifier = ?", (email,))

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

