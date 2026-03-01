"""Input validation utilities for the Memory Brain system.

Centralizes all validation logic so that controllers/services
can call these functions to enforce data integrity.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

from models.schemas import VALID_EMOTIONAL_TAGS


def validate_emotional_tags(tags: List[str]) -> Tuple[bool, Optional[str]]:
    """Validate that all emotional tags are in the allowed set.

    Returns:
        (is_valid, error_message) — error_message is None if valid.
    """
    if not isinstance(tags, list):
        return False, "emotional_tags must be a list"
    if len(tags) == 0:
        return False, "At least one emotional tag is required"
    invalid = [t for t in tags if t not in VALID_EMOTIONAL_TAGS]
    if invalid:
        return False, (
            f"Invalid emotional tags: {invalid}. "
            f"Allowed tags: {sorted(VALID_EMOTIONAL_TAGS)}"
        )
    return True, None


def validate_rating(rating: int) -> Tuple[bool, Optional[str]]:
    """Validate that the rating is between 1 and 5.

    Returns:
        (is_valid, error_message).
    """
    if not isinstance(rating, int):
        return False, "Rating must be an integer"
    if rating < 1 or rating > 5:
        return False, "Rating must be between 1 and 5"
    return True, None


def validate_trope_action(action: str) -> Tuple[bool, Optional[str]]:
    """Validate that the trope action is one of the allowed values.

    Returns:
        (is_valid, error_message).
    """
    allowed_actions = {"like", "dislike", "tired_of", "never_again", "reset"}
    if action not in allowed_actions:
        return False, f"Invalid action '{action}'. Allowed: {sorted(allowed_actions)}"
    return True, None


def validate_user_id(user_id) -> Tuple[bool, Optional[str]]:
    """Validate that user_id is a positive integer.

    Returns:
        (is_valid, error_message).
    """
    if not isinstance(user_id, int) or user_id <= 0:
        return False, "user_id must be a positive integer"
    return True, None


def validate_book_id(book_id) -> Tuple[bool, Optional[str]]:
    """Validate that book_id is a non-empty string.

    Returns:
        (is_valid, error_message).
    """
    if not isinstance(book_id, str) or not book_id.strip():
        return False, "book_id must be a non-empty string"
    return True, None


def clamp_weight(weight: int) -> int:
    """Clamp a trope weight to the valid range [-5, +5]."""
    return max(-5, min(5, weight))
