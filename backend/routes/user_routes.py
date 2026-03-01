"""User Routes — API endpoints for user profiles, recommendations, and trope intelligence.

GET   /users/:id/personality        → Returns personality profile
GET   /users/:id/recommendations    → Orchestrator.getRecommendations()
PATCH /users/:id/trope-preference   → Update specific trope manually
GET   /users/:id/trope-preferences  → List all trope preferences
POST  /users/:id/trope-feedback     → Submit explicit trope feedback (Phase 2)
GET   /users/:id/trope-analytics    → Comprehensive trope intelligence report (Phase 2)
GET   /users/:id/effective-weights  → Effective trope weights with modifiers (Phase 2)
GET   /users/:id/reading-habits     → Reading habit analytics (Phase 4)
GET   /users/:id/growth-insights    → Growth / diversification suggestions (Phase 4)
GET   /users/:id/dashboard          → Full combined dashboard (Phase 4)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from models.schemas import TropePreferenceUpdateRequest, TropeFeedbackRequest
from controllers.user_controller import (
    handle_get_personality,
    handle_get_recommendations,
    handle_update_trope_preference,
    handle_get_trope_preferences,
    handle_trope_feedback,
    handle_get_trope_analytics,
    handle_get_effective_weights,
)
from controllers.orchestrator_controller import (
    handle_orchestrated_recommendations,
    handle_orchestrated_reading_habits,
    handle_orchestrated_growth_insights,
    handle_orchestrated_dashboard,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}/personality")
def get_personality(user_id: int):
    """Return the user's dynamically generated personality profile.

    The profile contains:
      - dominantEmotions: most frequent emotional reactions
      - preferredMMCType: most commonly liked MMC archetype
      - topTropes: highest-weighted trope preferences
      - avoidedTropes: tropes the user is fatigued/rejected on
    """
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="user_id must be a positive integer")
    try:
        return handle_get_personality(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}/recommendations")
def get_recommendations(
    user_id: int,
    limit: int = Query(default=10, ge=1, le=50, description="Max recommendations"),
):
    """Return personalized book recommendations via the Recommendation Agent.

    Phase 4: Routed through the Agent Orchestrator.
    Recommendations are ranked by trope weight matching.
    Books with 'never again' tropes (weight = -5) are excluded.
    Already-read books are excluded.
    Does not break if therapist session is inactive.
    """
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="user_id must be a positive integer")
    try:
        return handle_orchestrated_recommendations(user_id, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{user_id}/trope-preference")
def update_trope_preference(user_id: int, payload: TropePreferenceUpdateRequest):
    """Manually update a specific trope preference.

    Supported actions:
      - 'like': set/increase weight toward +2
      - 'dislike': set/decrease weight toward -1
      - 'tired_of': set weight to -3
      - 'never_again': set weight to -5
      - 'reset': set weight to 0

    This also triggers a personality profile recalculation.
    """
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="user_id must be a positive integer")
    try:
        return handle_update_trope_preference(user_id, payload)
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}/trope-preferences")
def get_trope_preferences(user_id: int):
    """Retrieve all trope preferences for a user, sorted by weight (highest first)."""
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="user_id must be a positive integer")
    try:
        return handle_get_trope_preferences(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────── Phase 2: Trope Intelligence Routes ────────────────────

@router.post("/{user_id}/trope-feedback")
def submit_trope_feedback(user_id: int, payload: TropeFeedbackRequest):
    """Submit explicit trope feedback.

    Feedback types:
      - 'fatigued': Mark trope as over-consumed (sets weight to -3 + temporary suppression)
      - 'rejected': Permanently reject trope (weight → -5)
      - 'suppress': Temporarily suppress without changing base weight
      - 'restore': Remove suppression and reset weight to 0
    """
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="user_id must be a positive integer")
    try:
        return handle_trope_feedback(user_id, payload)
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}/trope-analytics")
def get_trope_analytics(user_id: int):
    """Return comprehensive trope intelligence report.

    Includes:
      - top_tropes: Highest effective-weighted tropes
      - fatigued_tropes: Currently over-consumed tropes
      - rejected_tropes: Permanently rejected tropes
      - suppressed_tropes: Temporarily suppressed tropes
      - weight_distribution: Histogram of base weights
    """
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="user_id must be a positive integer")
    try:
        return handle_get_trope_analytics(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}/effective-weights")
def get_effective_weights(user_id: int):
    """Return effective trope weights with fatigue/suppression modifiers applied.

    Each weight includes:
      - base_weight: Raw stored weight
      - effective_weight: After fatigue/suppression adjustments
      - is_suppressed: Whether temporarily suppressed
      - is_fatigued: Whether fatigue-detected
      - suppression_expires: Expiry timestamp (if suppressed)
    """
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="user_id must be a positive integer")
    try:
        return handle_get_effective_weights(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────── Phase 4: Agent-Orchestrated Routes ────────────────────

@router.get("/{user_id}/reading-habits")
def get_reading_habits(user_id: int):
    """Return reading habit analytics via the Reading Habit Agent.

    Includes:
      - reading_frequency (total, last 7/30 days, avg per week)
      - dominant_reading_time
      - binge_score (0–1)
      - inactivity detection
      - trope_repetition_score (0–1)
    """
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="user_id must be a positive integer")
    try:
        return handle_orchestrated_reading_habits(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}/growth-insights")
def get_growth_insights(user_id: int):
    """Return growth / diversification suggestions via the Growth Agent.

    Detects:
      - Narrow trope patterns
      - Cluster over-reliance
      - MMC repetition
    """
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="user_id must be a positive integer")
    try:
        return handle_orchestrated_growth_insights(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}/dashboard")
def get_dashboard(
    user_id: int,
    rec_limit: int = Query(default=10, ge=1, le=50, description="Max recommendations"),
):
    """Return full user dashboard via the Agent Orchestrator.

    Combines personality, recommendations, reading habits,
    growth insights, and active therapist session.
    """
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="user_id must be a positive integer")
    try:
        return handle_orchestrated_dashboard(user_id, rec_limit=rec_limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
