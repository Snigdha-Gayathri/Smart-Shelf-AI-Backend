"""Emotion Agent — Classifies user emotional state from text input.

Single responsibility:
  • Accept raw text input
  • Analyze keywords / sentiment
  • Return a structured EmotionResult

Used by:
  • Therapist Agent (via Orchestrator)
  • Discussion Agent (via Orchestrator — future Lexi hooks)

This agent does NOT call any other agent directly.
All data is returned to the orchestrator as structured dicts.
"""

from __future__ import annotations

import logging
from typing import Dict

from services.therapist_service import (
    analyze_user_emotion as _core_analyze,
    EMOTION_KEYWORD_MAP,
)

logger = logging.getLogger(__name__)

AGENT_TAG = "[Agent:Emotion]"


# ────────────────────────── Public API ──────────────────────────

def analyze_emotion(input_text: str) -> Dict:
    """Classify emotional state from user text.

    Args:
        input_text: Raw emotional description (min 3 chars).

    Returns:
        {
            "detected_emotion": str,   # e.g. "heartbroken"
            "confidence_score": float, # 0.3 – 1.0
            "agent": "emotion",
        }

    Raises:
        ValueError: If input_text is empty / too short.
    """
    logger.info(f"{AGENT_TAG} Analyzing emotion for input: {input_text[:60]}...")
    result = _core_analyze(input_text)
    logger.info(
        f"{AGENT_TAG} Detected emotion={result['detected_emotion']} "
        f"confidence={result['confidence_score']}"
    )
    return {
        **result,
        "agent": "emotion",
    }


def get_supported_emotions() -> list[str]:
    """Return the list of detectable emotion categories."""
    return sorted(EMOTION_KEYWORD_MAP.keys())
