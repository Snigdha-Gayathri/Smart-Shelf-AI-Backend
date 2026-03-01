"""Agent Orchestrator — Central coordination layer for the SmartShelf AI agent ecosystem.

All inter-agent communication flows through this orchestrator.
No agent directly calls another agent. The orchestrator:

  1. Routes user actions to the appropriate agent(s)
  2. Manages cross-agent data flow
  3. Ensures proper sequencing
  4. Logs the full execution flow

Flows:
  • handleBookInteraction:  Memory → Tropes → ReadingHabit → Growth (conditional)
  • handleTherapistSession: Emotion → Therapist (→ Recommendation via callback)
  • getRecommendations:     Recommendation Agent (standard or mood-adjusted)
  • getActiveTherapistSession / endTherapistSession
  • getReadingHabits / getGrowthInsights
  • getDashboard: Personality + ReadingHabit + Growth + Recommendations (combined)
"""

from __future__ import annotations

import logging
from typing import Dict, Optional

# ── Core Phase 1-3 services (data layer — NOT agents) ──
from services.memory_service import update_user_memory
from services.trope_engine_service import get_trope_analytics
from services.personality_service import get_personality_profile

# ── Agents (each imported individually — no cross-imports between agents) ──
from services.agents.emotion_agent import analyze_emotion as _emotion_analyze
from services.agents.recommendation_agent import get_recommendations as _rec_get
from services.agents.reading_habit_agent import analyze_reading_habits as _habit_analyze
from services.agents.therapist_agent import (
    build_therapist_session as _therapist_build,
    get_active_session as _therapist_active,
    end_session as _therapist_end,
)
from services.agents.growth_agent import analyze_growth as _growth_analyze

logger = logging.getLogger(__name__)

ORCH_TAG = "[Orchestrator]"


# ────────────────────────────────────────────────────────────────
#  FLOW 1 — Book Interaction
# ────────────────────────────────────────────────────────────────

def handle_book_interaction(
    user_id: int,
    book_id: str,
    emotional_tags: list,
    rating: int,
    liked_mmc_type: Optional[str] = None,
    is_dnf: bool = False,
    completion_percentage: int = 100,
    explicit_feedback: Optional[str] = None,
) -> Dict:
    """Orchestrate the full book-interaction pipeline.

    Sequence:
      1. Memory Agent (Phase 1) — store interaction + update trope weights
      2. (Trope Engine already triggered inside memory service)
      3. Reading Habit Agent — recalculate habit analytics
      4. Growth Agent — check if diversification suggestion is needed

    Returns:
        Combined result from all agents.
    """
    logger.info(f"{ORCH_TAG} ▶ handleBookInteraction: user={user_id}, book={book_id}")

    # ── Step 1: Memory update (Phase 1+2: stores interaction, updates weights,
    #    detects fatigue, recalculates personality) ──
    logger.info(f"{ORCH_TAG}   → Memory update")
    memory_result = update_user_memory(
        user_id=user_id,
        book_id=book_id,
        emotional_tags=emotional_tags,
        rating=rating,
        liked_mmc_type=liked_mmc_type,
        is_dnf=is_dnf,
        completion_percentage=completion_percentage,
        explicit_feedback=explicit_feedback,
    )

    # ── Step 2: Reading Habit Agent ──
    logger.info(f"{ORCH_TAG}   → Reading Habit Agent")
    habit_result = _habit_analyze(user_id)

    # ── Step 3: Growth Agent (uses trope analytics + habit data) ──
    logger.info(f"{ORCH_TAG}   → Growth Agent")
    trope_analytics = get_trope_analytics(user_id)
    growth_result = _growth_analyze(
        user_id=user_id,
        trope_analytics=trope_analytics,
        habit_data=habit_result,
    )

    logger.info(
        f"{ORCH_TAG} ✔ handleBookInteraction complete: "
        f"growth_needed={growth_result['needs_growth']}"
    )

    return {
        "status": "ok",
        "interaction": memory_result,
        "reading_habits": habit_result,
        "growth_insights": growth_result,
        "message": "Book interaction processed through agent pipeline",
    }


# ────────────────────────────────────────────────────────────────
#  FLOW 2 — Therapist Session
# ────────────────────────────────────────────────────────────────

def handle_therapist_session(
    user_id: int,
    input_text: str,
    intensity_level: int = 2,
    limit: int = 10,
) -> Dict:
    """Orchestrate a therapist session.

    Sequence:
      1. Emotion Agent — classify emotional state
      2. Therapist Agent — build session (internally requests recs via callback)
         The Therapist Agent receives a recommendation_fn that wraps the
         Recommendation Agent, satisfying the "no direct agent call" rule.

    Returns:
        Full therapist session with recommendations and explanation.
    """
    logger.info(
        f"{ORCH_TAG} ▶ handleTherapistSession: user={user_id}, "
        f"intensity={intensity_level}"
    )

    # Validate input text early
    if not input_text or len(input_text.strip()) < 3:
        raise ValueError("Input text must be at least 3 characters")

    # ── Step 1: Emotion Agent ──
    logger.info(f"{ORCH_TAG}   → Emotion Agent")
    emotion_result = _emotion_analyze(input_text)

    # ── Step 2: Therapist Agent (gets recommendation via injected callback) ──
    logger.info(f"{ORCH_TAG}   → Therapist Agent")
    therapist_result = _therapist_build(
        user_id=user_id,
        input_text=input_text,
        intensity_level=intensity_level,
        emotion_result=emotion_result,
        recommendation_fn=_rec_get,  # dependency injection
        limit=limit,
    )

    logger.info(
        f"{ORCH_TAG} ✔ handleTherapistSession complete: "
        f"emotion={therapist_result['detected_emotion']}, "
        f"session_id={therapist_result['session_id']}"
    )

    return {
        "status": "ok",
        **therapist_result,
    }


# ────────────────────────────────────────────────────────────────
#  FLOW 3 — Recommendations
# ────────────────────────────────────────────────────────────────

def get_recommendations(user_id: int, limit: int = 10) -> Dict:
    """Get personalized recommendations through the Recommendation Agent.

    Does not break if therapist is inactive — uses standard effective weights.

    Returns:
        Recommendation result dict.
    """
    logger.info(f"{ORCH_TAG} ▶ getRecommendations: user={user_id}, limit={limit}")
    result = _rec_get(user_id, limit=limit)
    logger.info(f"{ORCH_TAG} ✔ getRecommendations complete: {len(result.get('recommendations', []))} books")
    return {
        "status": "ok",
        **result,
    }


# ────────────────────────────────────────────────────────────────
#  FLOW 4 — Therapist Session Management
# ────────────────────────────────────────────────────────────────

def get_active_therapist_session(user_id: int) -> Dict:
    """Retrieve the active therapist session (if any)."""
    logger.info(f"{ORCH_TAG} ▶ getActiveTherapistSession: user={user_id}")
    session = _therapist_active(user_id)
    return {
        "status": "ok",
        "session": session,
        "message": "Active therapist session found" if session else "No active therapist session",
    }


def end_therapist_session(user_id: int) -> Dict:
    """End the active therapist session."""
    logger.info(f"{ORCH_TAG} ▶ endTherapistSession: user={user_id}")
    result = _therapist_end(user_id)
    return {
        "status": "ok",
        **result,
    }


# ────────────────────────────────────────────────────────────────
#  FLOW 5 — Reading Habits + Growth (standalone queries)
# ────────────────────────────────────────────────────────────────

def get_reading_habits(user_id: int) -> Dict:
    """Get reading habit analytics."""
    logger.info(f"{ORCH_TAG} ▶ getReadingHabits: user={user_id}")
    result = _habit_analyze(user_id)
    return {
        "status": "ok",
        **result,
    }


def get_growth_insights(user_id: int) -> Dict:
    """Get growth / diversification insights.

    Orchestrates: TropeAnalytics → ReadingHabit → Growth Agent.
    """
    logger.info(f"{ORCH_TAG} ▶ getGrowthInsights: user={user_id}")

    trope_analytics = get_trope_analytics(user_id)
    habit_data = _habit_analyze(user_id)
    growth = _growth_analyze(
        user_id=user_id,
        trope_analytics=trope_analytics,
        habit_data=habit_data,
    )
    return {
        "status": "ok",
        **growth,
    }


# ────────────────────────────────────────────────────────────────
#  FLOW 6 — Dashboard (combined view)
# ────────────────────────────────────────────────────────────────

def get_dashboard(user_id: int, rec_limit: int = 10) -> Dict:
    """Full user dashboard: personality + habits + growth + recommendations.

    Orchestrates multiple agents in sequence.
    """
    logger.info(f"{ORCH_TAG} ▶ getDashboard: user={user_id}")

    # Personality
    personality = get_personality_profile(user_id)

    # Recommendations
    recs = _rec_get(user_id, limit=rec_limit)

    # Reading habits
    habits = _habit_analyze(user_id)

    # Growth insights
    trope_analytics = get_trope_analytics(user_id)
    growth = _growth_analyze(user_id, trope_analytics, habits)

    # Active therapist session (if any)
    therapist_session = _therapist_active(user_id)

    logger.info(f"{ORCH_TAG} ✔ getDashboard complete for user={user_id}")

    return {
        "status": "ok",
        "user_id": user_id,
        "personality": personality,
        "recommendations": recs.get("recommendations", []),
        "reading_habits": habits,
        "growth_insights": growth,
        "active_therapist_session": therapist_session,
    }
