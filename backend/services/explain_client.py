import logging
from typing import Dict

logger = logging.getLogger(__name__)


def explain_reason(user_prompt: str, book: Dict) -> str:
    """Return a short, local-only explanation string for why the book was recommended.

    This function does not call external APIs; it uses book metadata and the user's prompt
    to craft a concise sentence.
    """
    title = book.get("title") or book.get("book_name") or "this book"
    genre = book.get("genre") or "varied"
    themes = book.get("emotion_tags") or []
    mood = book.get("mood") or book.get("tone") or "an engaging mood"

    # Simple heuristic: prefer explicit emotion tags, else fall back to mood or genre
    reason_parts = []
    if themes:
        reason_parts.append(f"matches your preference for {themes[0]}")
    elif any(k in (user_prompt or "").lower() for k in (genre or "").split()):
        reason_parts.append(f"aligns with your interest in {genre}")
    else:
        reason_parts.append(f"offers {mood}")

    reason_parts.append(f"as a {genre}")
    return f"Recommended because it {', '.join(reason_parts)}."


def personality_summary_from_analytics(analytics: Dict) -> str:
    """Generate a short personality summary purely from analytics data (no external APIs).

    analytics: dict with keys by_genre, by_theme, total_books_read
    """
    if not analytics:
        return "No reading history yet to summarize a personality."

    total = analytics.get('total_books_read', 0)
    by_genre = analytics.get('by_genre', {}) or {}
    by_theme = analytics.get('by_theme', {}) or {}

    top_genre = next(iter(by_genre.keys()), None)
    top_theme = next(iter(by_theme.keys()), None)

    parts = []
    if total:
        parts.append(f"You've read {total} book{'s' if total!=1 else ''} so far.")
    if top_genre:
        parts.append(f"You tend to prefer {top_genre}.")
    if top_theme:
        parts.append(f"Themes you enjoy include {top_theme}.")

    return ' '.join(parts)
