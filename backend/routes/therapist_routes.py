"""Therapist Routes — API endpoints for the AI Book Therapist (Phase 3+4).

POST   /therapist/start        → Orchestrator.handleTherapistSession()
GET    /therapist/:userId/active → Orchestrator.getActiveTherapistSession()
DELETE /therapist/:userId        → Orchestrator.endTherapistSession()

Phase 4: Routes now call the Agent Orchestrator instead of individual services.
The orchestrator coordinates: Emotion Agent → Therapist Agent → Recommendation Agent.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from models.schemas import TherapistStartRequest
from controllers.orchestrator_controller import (
    handle_orchestrated_therapist_session,
    handle_orchestrated_active_session,
    handle_orchestrated_end_session,
)

router = APIRouter(prefix="/therapist", tags=["therapist"])


@router.post("/start")
def start_therapist(payload: TherapistStartRequest):
    """Start an AI Book Therapist session via the Agent Orchestrator.

    Phase 4: The orchestrator coordinates:
      1. Emotion Agent — classifies emotional state
      2. Therapist Agent — builds session with mood adjustments
      3. Recommendation Agent — generates mood-aware recommendations

    The session expires automatically after 24 hours.
    """
    try:
        return handle_orchestrated_therapist_session(payload)
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}/active")
def get_active_session(user_id: int):
    """Retrieve the current active therapist session for a user.

    Returns the session details including detected emotion,
    mood adjustments, explanation, and expiry time.
    Returns null session if no active session exists.
    """
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="user_id must be a positive integer")
    try:
        return handle_orchestrated_active_session(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{user_id}")
def end_therapist_session(user_id: int):
    """Manually end the active therapist session.

    After ending, the system reverts to normal effective
    trope weights for standard recommendations.
    """
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="user_id must be a positive integer")
    try:
        return handle_orchestrated_end_session(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
