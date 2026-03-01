"""Pydantic request/response schemas for the Memory Brain API.

These schemas enforce strict validation at the API boundary so that
controllers and services never receive invalid data.

Phase 2 additions:
  - BookInteractionRequest: is_dnf, completion_percentage, explicit_feedback
  - TropeFeedbackRequest: for POST /users/:id/trope-feedback
  - TropeAnalyticsResponse, EffectiveTropeWeight

Phase 3 additions:
  - TherapistStartRequest: for POST /therapist/start
  - TherapistSessionResponse, EmotionAnalysisResult
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


# ────────────────────────── Allowed Values ──────────────────────────

VALID_EMOTIONAL_TAGS = frozenset([
    "safe", "obsessed", "healed", "destroyed", "anxious",
    "empowered", "comforted", "heartbroken", "attached", "indifferent",
])


# ────────────────────────── Request Schemas ──────────────────────────

class BookInteractionRequest(BaseModel):
    """Payload for POST /books/interact.

    Phase 2: added is_dnf, completion_percentage, explicit_feedback.
    """
    user_id: int = Field(..., gt=0, description="ID of the user")
    book_id: str = Field(..., min_length=1, description="ID or title of the book")
    emotional_tags: List[str] = Field(..., min_length=1, description="Emotional reaction tags")
    rating: int = Field(..., ge=1, le=5, description="Rating from 1 to 5")
    liked_mmc_type: Optional[str] = Field(None, description="Preferred MMC archetype for this book")
    is_dnf: bool = Field(False, description="Did Not Finish flag")
    completion_percentage: int = Field(100, ge=0, le=100, description="How much of the book was read (0-100)")
    explicit_feedback: Optional[str] = Field(None, description="Optional free-text feedback")

    @field_validator("emotional_tags", mode="before")
    @classmethod
    def validate_emotional_tags(cls, v: List[str]) -> List[str]:
        if not isinstance(v, list):
            raise ValueError("emotional_tags must be a list of strings")
        invalid = [tag for tag in v if tag not in VALID_EMOTIONAL_TAGS]
        if invalid:
            raise ValueError(
                f"Invalid emotional tags: {invalid}. "
                f"Allowed: {sorted(VALID_EMOTIONAL_TAGS)}"
            )
        return v


class TropePreferenceUpdateRequest(BaseModel):
    """Payload for PATCH /users/:id/trope-preference."""
    trope_name: str = Field(..., min_length=1, description="Name of the trope")
    action: str = Field(
        ...,
        description="One of: 'like', 'dislike', 'tired_of', 'never_again', 'reset'"
    )

    @field_validator("action")
    @classmethod
    def validate_action(cls, v: str) -> str:
        allowed = {"like", "dislike", "tired_of", "never_again", "reset"}
        if v not in allowed:
            raise ValueError(f"Invalid action '{v}'. Allowed: {sorted(allowed)}")
        return v


class TropeFeedbackRequest(BaseModel):
    """Payload for POST /users/:id/trope-feedback (Phase 2).

    Allows explicit fatigue or rejection signals for specific tropes.
    """
    trope_name: str = Field(..., min_length=1, description="Name of the trope")
    feedback_type: str = Field(
        ...,
        description="One of: 'fatigued', 'rejected', 'suppress', 'restore'"
    )
    suppression_days: Optional[int] = Field(
        None, ge=1, le=365,
        description="Duration in days for temporary suppression (used with 'suppress')"
    )

    @field_validator("feedback_type")
    @classmethod
    def validate_feedback_type(cls, v: str) -> str:
        allowed = {"fatigued", "rejected", "suppress", "restore"}
        if v not in allowed:
            raise ValueError(f"Invalid feedback_type '{v}'. Allowed: {sorted(allowed)}")
        return v


# ────────────────────────── Response Schemas ──────────────────────────

class BookInteractionResponse(BaseModel):
    """Stored book interaction record."""
    id: int
    user_id: int
    book_id: str
    emotional_tags: List[str]
    rating: int
    liked_mmc_type: Optional[str]
    is_dnf: bool = False
    completion_percentage: int = 100
    explicit_feedback: Optional[str] = None
    created_at: str


class TropePreferenceResponse(BaseModel):
    """A single trope weight entry."""
    trope_name: str
    weight: int
    temporary_suppression_until: Optional[str] = None
    last_updated: str


class EffectiveTropeWeight(BaseModel):
    """Phase 2: Computed effective weight for a trope (base + modifiers)."""
    trope_name: str
    base_weight: int
    effective_weight: float
    is_suppressed: bool = False
    is_fatigued: bool = False
    suppression_expires: Optional[str] = None


class PersonalityProfileResponse(BaseModel):
    """The computed user personality profile."""
    user_id: int
    dominant_emotions: List[str]
    preferred_mmc_type: str
    top_tropes: List[str]
    avoided_tropes: List[str]
    last_updated: str


class RecommendationItem(BaseModel):
    """A single book recommendation."""
    book_id: str
    title: str
    author: str
    genre: str
    synopsis: str
    cover: Optional[str] = None
    tropes: List[str] = []
    mmc_type: Optional[str] = None
    match_score: float = Field(..., description="How well this book matches the user's profile")
    emotion_tags: List[str] = []
    mood: Optional[str] = None
    tone: Optional[str] = None


class RecommendationResponse(BaseModel):
    """Personalized recommendation result."""
    user_id: int
    recommendations: List[RecommendationItem]
    profile_summary: Optional[PersonalityProfileResponse] = None


class TropeAnalyticsResponse(BaseModel):
    """Phase 2: Full trope intelligence state for a user."""
    user_id: int
    top_tropes: List[dict]
    fatigued_tropes: List[dict]
    rejected_tropes: List[dict]
    suppressed_tropes: List[dict]
    weight_distribution: dict


# ────────────────────────── Phase 3: Therapist Schemas ──────────────────────────

VALID_THERAPIST_EMOTIONS = frozenset([
    "numb", "heartbroken", "anxious", "overwhelmed",
    "lonely", "empowered", "comfort-seeking", "craving-intensity",
])


class TherapistStartRequest(BaseModel):
    """Payload for POST /therapist/start."""
    user_id: int = Field(..., gt=0, description="ID of the user")
    input_text: str = Field(
        ..., min_length=3, max_length=2000,
        description="User's emotional input text (min 3 characters)",
    )
    intensity_level: int = Field(
        2, ge=1, le=4,
        description="Emotional intensity: 1=Soft comfort, 2=Balanced healing, 3=Emotional intensity, 4=Dark obsession",
    )


class EmotionAnalysisResult(BaseModel):
    """Result of analyzing user emotional input."""
    detected_emotion: str
    confidence_score: float = Field(..., ge=0.0, le=1.0)


class TherapistSessionResponse(BaseModel):
    """Full therapist session response."""
    session_id: int
    user_id: int
    detected_emotion: str
    confidence_score: float
    intensity_level: int
    explanation: str
    recommended_books: List[dict]
    session_expires_at: str
    mood_adjustments: dict
