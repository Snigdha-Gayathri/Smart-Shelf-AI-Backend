"""SQLite connection management for SmartShelf AI Memory Brain."""

import sqlite3
import os
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'smartshelf_memory.db')


def get_db_path() -> str:
    """Return the absolute path to the memory database file."""
    return os.path.abspath(DB_PATH)


def get_connection() -> sqlite3.Connection:
    """Create and return a new SQLite connection with row_factory set.

    Enables WAL mode for better concurrent read performance and
    foreign key enforcement.
    """
    conn = sqlite3.connect(get_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn
