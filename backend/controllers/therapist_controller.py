"""Therapist Controller — handles therapist session requests (Phase 3).

Validates input, delegates business logic to therapist_service, and
returns structured responses. Contains NO business logic itself.
"""

from __future__ import annotations

import logging
from typing import Dict

from models.schemas import TherapistStartRequest
from services.therapist_service import (
    get_therapist_recommendations,
    get_active_session,
    end_therapist_session,
)

logger = logging.getLogger(__name__)


def handle_start_therapist(payload: TherapistStartRequest) -> Dict:
    """Start a therapist session and return mood-aware recommendations.

    Args:
        payload: Validated TherapistStartRequest.

    Returns:
        Full therapist session response with recommendations and explanation.
    """
    try:
        result = get_therapist_recommendations(
            user_id=payload.user_id,
            input_text=payload.input_text,
            intensity_level=payload.intensity_level,
        )
        return {
            "status": "ok",
            **result,
        }
    except ValueError as ve:
        logger.warning(f"Validation error in therapist start: {ve}")
        raise
    except Exception as e:
        logger.error(f"Error starting therapist session: {e}", exc_info=True)
        raise


def handle_get_active_session(user_id: int) -> Dict:
    """Retrieve the active therapist session for a user.

    Args:
        user_id: The user's ID.

    Returns:
        Dict with active session or null status.
    """
    try:
        session = get_active_session(user_id)
        if session is None:
            return {
                "status": "ok",
                "session": None,
                "message": "No active therapist session",
            }
        return {
            "status": "ok",
            "session": session,
        }
    except Exception as e:
        logger.error(f"Error fetching active therapist session for user {user_id}: {e}", exc_info=True)
        raise


def handle_end_therapist_session(user_id: int) -> Dict:
    """Manually end the active therapist session for a user.

    Args:
        user_id: The user's ID.

    Returns:
        Dict with end-session confirmation.
    """
    try:
        result = end_therapist_session(user_id)
        return {
            "status": "ok",
            **result,
        }
    except Exception as e:
        logger.error(f"Error ending therapist session for user {user_id}: {e}", exc_info=True)
        raise
