"""Therapist Agent — Mood-aware book recommendation sessions.

Single responsibility:
  • Use Emotion Agent result (received from orchestrator)
  • Compute temporary mood-based trope adjustments
  • Request recommendations from Recommendation Agent (via orchestrator callback)
  • Generate personalized explanation
  • Manage therapist session lifecycle (create / get / end)

IMPORTANT:
  • Does NOT directly call Emotion Agent or Recommendation Agent.
  • Receives emotion_result and recommendation_fn from the orchestrator.
  • Does NOT modify base trope weights permanently.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Callable, Dict, List, Optional

from database.connection import get_connection
from database.migrations import ensure_memory_user
from services.therapist_service import (
    compute_mood_adjustments,
    apply_mood_context,
    generate_therapist_explanation,
    get_active_session as _core_get_active,
    end_therapist_session as _core_end_session,
    MOOD_MMC_PREFERENCES,
    SESSION_DURATION_HOURS,
    MIN_INPUT_LENGTH,
)

logger = logging.getLogger(__name__)

AGENT_TAG = "[Agent:Therapist]"


# ────────────────────────── Public API ──────────────────────────

def build_therapist_session(
    user_id: int,
    input_text: str,
    intensity_level: int,
    emotion_result: Dict,
    recommendation_fn: Callable,
    limit: int = 10,
) -> Dict:
    """Build a full therapist session using pre-analyzed emotion data
    and a recommendation callback provided by the orchestrator.

    Args:
        user_id: Target user.
        input_text: Original emotional input text.
        intensity_level: 1–4 slider.
        emotion_result: Pre-computed from Emotion Agent (via orchestrator).
        recommendation_fn: Callback to get recommendations (injected by orchestrator).
        limit: Max books to return.

    Returns:
        Full therapist session dict with recommendations + explanation.
    """
    if intensity_level < 1 or intensity_level > 4:
        raise ValueError("Intensity level must be between 1 and 4")

    ensure_memory_user(user_id)

    detected_emotion = emotion_result["detected_emotion"]
    confidence_score = emotion_result["confidence_score"]

    logger.info(
        f"{AGENT_TAG} Building session: user={user_id}, "
        f"emotion={detected_emotion}, intensity={intensity_level}"
    )

    # 1. Deactivate previous sessions
    _deactivate_all_sessions(user_id)

    # 2. Compute mood adjustments
    mood_adjustments = compute_mood_adjustments(detected_emotion, intensity_level)

    # 3. Apply mood context (temporary weight overlay — NOT persisted)
    adjusted_weights = apply_mood_context(user_id, detected_emotion, intensity_level)

    # 4. Get user profile data for explanation
    from services.personality_service import get_personality_profile
    profile = get_personality_profile(user_id)
    user_top_tropes = profile.get("top_tropes", []) if profile else []
    preferred_mmc = profile.get("preferred_mmc_type", "") if profile else ""
    preferred_mmc = preferred_mmc if preferred_mmc else None

    mood_mmc_types = MOOD_MMC_PREFERENCES.get(detected_emotion, [])

    # 5. Get recommendations via orchestrator callback (dependency injection)
    rec_result = recommendation_fn(
        user_id=user_id,
        limit=limit,
        weight_overrides=adjusted_weights,
        preferred_mmc_override=preferred_mmc,
        extra_mmc_bonus_types=mood_mmc_types,
    )
    recommendations = rec_result.get("recommendations", [])

    # 6. Generate personalized explanation
    explanation = generate_therapist_explanation(
        detected_emotion=detected_emotion,
        user_top_tropes=user_top_tropes,
        preferred_mmc=preferred_mmc,
        mood_adjustments=mood_adjustments,
        intensity_level=intensity_level,
    )

    # 7. Persist session
    now = datetime.utcnow()
    expires_at = now + timedelta(hours=SESSION_DURATION_HOURS)

    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO therapist_sessions "
            "(user_id, input_text, detected_emotion, confidence_score, "
            " intensity_level, mood_adjustments, explanation, "
            " started_at, expires_at, is_active) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
            (
                user_id,
                input_text.strip(),
                detected_emotion,
                confidence_score,
                intensity_level,
                json.dumps(mood_adjustments),
                explanation,
                now.isoformat(),
                expires_at.isoformat(),
            ),
        )
        session_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    logger.info(
        f"{AGENT_TAG} Session #{session_id} created: "
        f"emotion={detected_emotion}, expires={expires_at.isoformat()}"
    )

    return {
        "session_id": session_id,
        "user_id": user_id,
        "detected_emotion": detected_emotion,
        "confidence_score": confidence_score,
        "intensity_level": intensity_level,
        "explanation": explanation,
        "recommended_books": recommendations,
        "session_expires_at": expires_at.isoformat(),
        "mood_adjustments": mood_adjustments,
        "agent": "therapist",
    }


def get_active_session(user_id: int) -> Optional[Dict]:
    """Retrieve the current active therapist session.

    Auto-expires stale sessions. Delegates to core service.
    """
    logger.info(f"{AGENT_TAG} Checking active session for user={user_id}")
    session = _core_get_active(user_id)
    if session:
        session["agent"] = "therapist"
    return session


def end_session(user_id: int) -> Dict:
    """Manually end the active therapist session."""
    logger.info(f"{AGENT_TAG} Ending session for user={user_id}")
    result = _core_end_session(user_id)
    result["agent"] = "therapist"
    return result


# ────────────────────────── Internal Helpers ──────────────────────────

def _deactivate_all_sessions(user_id: int) -> int:
    """Deactivate all active sessions for a user."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE therapist_sessions SET is_active = 0 "
            "WHERE user_id = ? AND is_active = 1",
            (user_id,),
        )
        count = cur.rowcount
        conn.commit()
        return count
    finally:
        conn.close()
