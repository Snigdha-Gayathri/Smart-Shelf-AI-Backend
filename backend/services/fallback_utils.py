"""
Fallback utilities for Smart Shelf AI when ML models are unavailable.
No ML dependencies—only standard library.
"""

import re
import logging

logger = logging.getLogger(__name__)


def fallback_recommend_similarity(user_text: str, book_text: str) -> float:
    """
    Simple token-overlap similarity for offline testing when models are unavailable.
    Returns a score between 0 and 1.
    """
    def tokenize(s):
        return set(re.findall(r"\w+", s.lower()))

    u = tokenize(user_text)
    b = tokenize(book_text)
    if not u or not b:
        return 0.0
    overlap = len(u & b)
    denom = max(len(u), len(b))
    return float(overlap) / denom
