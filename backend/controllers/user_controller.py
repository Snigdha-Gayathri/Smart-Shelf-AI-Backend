"""User Controller — handles user profile and preference requests.

Validates input, delegates business logic to services, and
returns structured responses. Contains NO business logic itself.
"""

from __future__ import annotations

import logging
from typing import Dict, Optional

from models.schemas import TropePreferenceUpdateRequest, TropeFeedbackRequest
from services.personality_service import get_personality_profile
from services.recommendation_service import get_personalized_recommendations
from services.memory_service import update_trope_preference, get_user_trope_preferences
from services.trope_engine_service import (
    process_trope_feedback,
    get_trope_analytics,
    get_effective_trope_weights,
)

logger = logging.getLogger(__name__)


def handle_get_personality(user_id: int) -> Dict:
    """Retrieve user personality profile.

    Args:
        user_id: The user's ID.

    Returns:
        Dict with personality profile or "not found" status.
    """
    try:
        profile = get_personality_profile(user_id)
        if profile is None:
            return {
                "status": "ok",
                "profile": None,
                "message": "No interactions yet — personality profile not available",
            }
        return {
            "status": "ok",
            "profile": profile,
        }
    except Exception as e:
        logger.error(f"Error fetching personality for user {user_id}: {e}", exc_info=True)
        raise


def handle_get_recommendations(user_id: int, limit: int = 10) -> Dict:
    """Retrieve personalized book recommendations.

    Args:
        user_id: The user's ID.
        limit: Maximum number of recommendations to return.

    Returns:
        Dict with recommendation list and metadata.
    """
    try:
        result = get_personalized_recommendations(user_id, limit=limit)
        return {
            "status": "ok",
            **result,
        }
    except Exception as e:
        logger.error(f"Error generating recommendations for user {user_id}: {e}", exc_info=True)
        raise


def handle_update_trope_preference(user_id: int, payload: TropePreferenceUpdateRequest) -> Dict:
    """Update a specific trope preference for a user.

    Args:
        user_id: The user's ID.
        payload: Validated TropePreferenceUpdateRequest.

    Returns:
        Dict with updated trope preference.
    """
    try:
        result = update_trope_preference(
            user_id=user_id,
            trope_name=payload.trope_name,
            action=payload.action,
        )
        return {
            "status": "ok",
            "trope_preference": result,
            "message": f"Trope '{payload.trope_name}' updated with action '{payload.action}'",
        }
    except ValueError as ve:
        logger.warning(f"Validation error in trope update: {ve}")
        raise
    except Exception as e:
        logger.error(f"Error updating trope preference: {e}", exc_info=True)
        raise


def handle_get_trope_preferences(user_id: int) -> Dict:
    """Retrieve all trope preferences for a user.

    Args:
        user_id: The user's ID.

    Returns:
        Dict with list of trope preferences.
    """
    try:
        preferences = get_user_trope_preferences(user_id)
        return {
            "status": "ok",
            "user_id": user_id,
            "preferences": preferences,
        }
    except Exception as e:
        logger.error(f"Error fetching trope preferences for user {user_id}: {e}", exc_info=True)
        raise


# ──────────────────── Phase 2: Trope Intelligence Handlers ────────────────────

def handle_trope_feedback(user_id: int, payload: TropeFeedbackRequest) -> Dict:
    """Process explicit trope feedback from a user.

    Feedback types: fatigued, rejected, suppress, restore.

    Args:
        user_id: The user's ID.
        payload: Validated TropeFeedbackRequest.

    Returns:
        Dict with feedback processing result.
    """
    try:
        result = process_trope_feedback(
            user_id=user_id,
            trope_name=payload.trope_name,
            feedback_type=payload.feedback_type,
            suppression_days=payload.suppression_days,
        )
        return {
            "status": "ok",
            "feedback_result": result,
            "message": f"Trope feedback '{payload.feedback_type}' applied to '{payload.trope_name}'",
        }
    except ValueError as ve:
        logger.warning(f"Validation error in trope feedback: {ve}")
        raise
    except Exception as e:
        logger.error(f"Error processing trope feedback: {e}", exc_info=True)
        raise


def handle_get_trope_analytics(user_id: int) -> Dict:
    """Retrieve comprehensive trope analytics for a user.

    Returns:
        Dict with top, fatigued, rejected, suppressed tropes
        and weight distribution.
    """
    try:
        analytics = get_trope_analytics(user_id)
        return {
            "status": "ok",
            **analytics,
        }
    except Exception as e:
        logger.error(f"Error fetching trope analytics for user {user_id}: {e}", exc_info=True)
        raise


def handle_get_effective_weights(user_id: int) -> Dict:
    """Retrieve effective trope weights for a user.

    Returns all trope weights with fatigue/suppression modifiers applied.
    """
    try:
        weights = get_effective_trope_weights(user_id)
        return {
            "status": "ok",
            "user_id": user_id,
            "effective_weights": weights,
        }
    except Exception as e:
        logger.error(f"Error fetching effective weights for user {user_id}: {e}", exc_info=True)
        raise
