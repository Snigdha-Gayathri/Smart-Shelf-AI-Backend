"""Orchestrator Controller — Thin delegation layer to the Agent Orchestrator.

All request handling for Phase 4 agent-based flows.
Contains NO business logic — delegates entirely to the orchestrator.
"""

from __future__ import annotations

import logging
from typing import Dict

from models.schemas import BookInteractionRequest, TherapistStartRequest
from services.agents.agent_orchestrator import (
    handle_book_interaction,
    handle_therapist_session,
    get_recommendations,
    get_active_therapist_session,
    end_therapist_session,
    get_reading_habits,
    get_growth_insights,
    get_dashboard,
)

logger = logging.getLogger(__name__)


def handle_orchestrated_book_interaction(payload: BookInteractionRequest) -> Dict:
    """Process book interaction through the full agent pipeline."""
    try:
        return handle_book_interaction(
            user_id=payload.user_id,
            book_id=payload.book_id,
            emotional_tags=payload.emotional_tags,
            rating=payload.rating,
            liked_mmc_type=payload.liked_mmc_type,
            is_dnf=payload.is_dnf,
            completion_percentage=payload.completion_percentage,
            explicit_feedback=payload.explicit_feedback,
        )
    except ValueError as ve:
        logger.warning(f"Validation error in orchestrated book interaction: {ve}")
        raise
    except Exception as e:
        logger.error(f"Error in orchestrated book interaction: {e}", exc_info=True)
        raise


def handle_orchestrated_therapist_session(payload: TherapistStartRequest) -> Dict:
    """Start therapist session through the orchestrator."""
    try:
        return handle_therapist_session(
            user_id=payload.user_id,
            input_text=payload.input_text,
            intensity_level=payload.intensity_level,
        )
    except ValueError as ve:
        logger.warning(f"Validation error in orchestrated therapist session: {ve}")
        raise
    except Exception as e:
        logger.error(f"Error in orchestrated therapist session: {e}", exc_info=True)
        raise


def handle_orchestrated_recommendations(user_id: int, limit: int = 10) -> Dict:
    """Get recommendations through the orchestrator."""
    try:
        return get_recommendations(user_id, limit=limit)
    except Exception as e:
        logger.error(f"Error in orchestrated recommendations: {e}", exc_info=True)
        raise


def handle_orchestrated_active_session(user_id: int) -> Dict:
    """Get active therapist session through the orchestrator."""
    try:
        return get_active_therapist_session(user_id)
    except Exception as e:
        logger.error(f"Error fetching active session via orchestrator: {e}", exc_info=True)
        raise


def handle_orchestrated_end_session(user_id: int) -> Dict:
    """End therapist session through the orchestrator."""
    try:
        return end_therapist_session(user_id)
    except Exception as e:
        logger.error(f"Error ending session via orchestrator: {e}", exc_info=True)
        raise


def handle_orchestrated_reading_habits(user_id: int) -> Dict:
    """Get reading habit analytics through the orchestrator."""
    try:
        return get_reading_habits(user_id)
    except Exception as e:
        logger.error(f"Error fetching reading habits via orchestrator: {e}", exc_info=True)
        raise


def handle_orchestrated_growth_insights(user_id: int) -> Dict:
    """Get growth insights through the orchestrator."""
    try:
        return get_growth_insights(user_id)
    except Exception as e:
        logger.error(f"Error fetching growth insights via orchestrator: {e}", exc_info=True)
        raise


def handle_orchestrated_dashboard(user_id: int, rec_limit: int = 10) -> Dict:
    """Get full user dashboard through the orchestrator."""
    try:
        return get_dashboard(user_id, rec_limit=rec_limit)
    except Exception as e:
        logger.error(f"Error fetching dashboard via orchestrator: {e}", exc_info=True)
        raise
