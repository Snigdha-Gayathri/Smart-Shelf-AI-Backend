"""Therapist Service — AI Book Therapist Mode (Phase 3).

A fully separate recommendation intelligence module that:
  • Accepts user emotional input text
  • Analyzes emotional state via keyword + sentiment analysis
  • Temporarily adjusts trope weights based on detected mood
  • Generates emotionally aligned book recommendations
  • Provides personalized explanations referencing user profile
  • Auto-expires sessions after 24 hours

This service ORCHESTRATES other services (Phase 1 memory, Phase 2 trope engine,
recommendation service internals) but does NOT live inside them.
It does NOT permanently modify trope base weights.
"""

from __future__ import annotations

import json
import logging
import re
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from database.connection import get_connection
from database.migrations import ensure_memory_user
from utils.trope_mapper import derive_tropes, derive_mmc_type

logger = logging.getLogger(__name__)

# ─── Constants ───
SESSION_DURATION_HOURS = 24
MIN_INPUT_LENGTH = 3
MAX_INPUT_LENGTH = 2000

# ────────────────────────── Emotion Keywords ──────────────────────────
# Each emotion maps to weighted keyword lists for detection.
# Scores are accumulated; highest-scoring emotion wins.

EMOTION_KEYWORD_MAP: Dict[str, Dict[str, float]] = {
    "heartbroken": {
        "heartbroken": 3.0, "heartbreak": 3.0, "broken heart": 3.0,
        "devastated": 2.5, "gutted": 2.5, "shattered": 2.5,
        "betrayed": 2.0, "cheated": 2.0, "dumped": 2.0,
        "breakup": 2.0, "break up": 2.0, "split": 1.5,
        "lost love": 2.5, "grief": 2.0, "mourning": 2.0,
        "crying": 1.5, "tears": 1.5, "miss him": 2.0, "miss her": 2.0,
        "hurt": 1.5, "pain": 1.5, "rejection": 2.0, "rejected": 2.0,
        "abandoned": 2.0, "lonely after": 1.5, "ended": 1.5,
    },
    "anxious": {
        "anxious": 3.0, "anxiety": 3.0, "panic": 2.5,
        "worried": 2.0, "nervous": 2.0, "uneasy": 2.0,
        "restless": 1.5, "overthinking": 2.0, "spiraling": 2.0,
        "can't sleep": 1.5, "insomnia": 1.5, "stressed": 2.0,
        "stress": 2.0, "tense": 1.5, "on edge": 2.0,
        "dread": 2.0, "fear": 1.5, "scared": 1.5,
        "racing thoughts": 2.0, "overwhelmed": 1.0,
    },
    "overwhelmed": {
        "overwhelmed": 3.0, "too much": 2.5, "drowning": 2.5,
        "burnt out": 2.5, "burnout": 2.5, "exhausted": 2.0,
        "can't cope": 2.5, "falling apart": 2.5,
        "breaking down": 2.0, "overloaded": 2.0,
        "swamped": 1.5, "suffocating": 2.0, "trapped": 2.0,
        "paralyzed": 2.0, "frozen": 1.5, "shut down": 2.0,
    },
    "lonely": {
        "lonely": 3.0, "loneliness": 3.0, "alone": 2.5,
        "isolated": 2.5, "no one": 2.0, "nobody": 2.0,
        "disconnected": 2.0, "invisible": 2.0,
        "forgotten": 2.0, "left out": 2.0, "outcast": 2.0,
        "miss someone": 2.0, "empty": 1.5, "void": 1.5,
        "craving connection": 2.5, "need a hug": 2.0,
    },
    "numb": {
        "numb": 3.0, "nothing": 2.0, "feel nothing": 3.0,
        "empty": 2.5, "hollow": 2.5, "blank": 2.0,
        "apathetic": 2.5, "apathy": 2.5, "indifferent": 2.0,
        "detached": 2.0, "disconnected": 1.5, "flat": 2.0,
        "dead inside": 3.0, "emotionless": 2.5,
        "going through the motions": 2.0, "robotic": 2.0,
    },
    "empowered": {
        "empowered": 3.0, "strong": 2.0, "powerful": 2.0,
        "confident": 2.5, "fierce": 2.5, "independent": 2.0,
        "in control": 2.5, "unstoppable": 2.5,
        "fire": 1.5, "inspired": 2.0, "motivated": 2.0,
        "badass": 2.5, "queen": 2.0, "warrior": 2.0,
        "standing up": 2.0, "fighting back": 2.0,
        "taking charge": 2.0, "resilient": 2.0,
    },
    "comfort-seeking": {
        "comfort": 3.0, "cozy": 2.5, "safe": 2.5,
        "warm": 2.0, "gentle": 2.0, "soft": 2.0,
        "hug": 2.0, "cuddle": 2.0, "soothing": 2.0,
        "need warmth": 2.5, "wholesome": 2.5,
        "fluffy": 2.0, "sweet": 1.5, "tender": 2.0,
        "healing": 2.0, "nurturing": 2.0, "calm": 1.5,
        "peace": 1.5, "blanket": 1.5, "escapism": 2.0,
        "feel-good": 2.5, "lighthearted": 2.0,
    },
    "craving-intensity": {
        "intensity": 3.0, "intense": 2.5, "dark": 2.5,
        "obsession": 3.0, "obsessed": 2.5, "possessive": 2.5,
        "danger": 2.0, "dangerous": 2.0, "thrill": 2.0,
        "adrenaline": 2.0, "edge": 2.0, "passionate": 2.0,
        "consuming": 2.5, "all-consuming": 3.0,
        "villain": 2.0, "morally grey": 2.5, "toxic": 2.0,
        "forbidden": 2.0, "taboo": 2.0, "sinister": 2.0,
        "addictive": 2.0, "unhinged": 2.5, "feral": 2.5,
        "chaos": 2.0, "burn": 1.5, "crave": 2.5,
    },
}

# ────────────────────────── Mood → Trope Adjustment Maps ──────────────────────────
# Each emotion maps tropes to weight adjustments.
# Positive = boost, Negative = suppress.
# Adjustments are scaled by intensity_level.

MOOD_TROPE_ADJUSTMENTS: Dict[str, Dict[str, float]] = {
    "heartbroken": {
        "second-chance": 3.0, "slow-burn": 2.0, "friends-to-lovers": 2.0,
        "grumpy-sunshine": 1.5, "protector": 2.5,
        "childhood-friends": 1.5,
        "dark-romance": -2.0, "revenge": -2.5, "love-triangle": -3.0,
    },
    "anxious": {
        "slow-burn": 2.5, "friends-to-lovers": 2.0, "grumpy-sunshine": 2.0,
        "forced-proximity": 1.5,
        "dark-romance": -2.5, "mafia": -2.0, "revenge": -2.0,
        "love-triangle": -1.5,
    },
    "overwhelmed": {
        "grumpy-sunshine": 3.0, "friends-to-lovers": 2.0,
        "slow-burn": 1.5, "forced-proximity": 1.5,
        "dark-romance": -3.0, "mafia": -2.5, "billionaire": -1.0,
        "revenge": -2.0, "arranged-marriage": -1.5,
    },
    "lonely": {
        "friends-to-lovers": 3.0, "forced-proximity": 2.5,
        "childhood-friends": 2.5, "grumpy-sunshine": 2.0,
        "slow-burn": 1.5, "protector": 2.0,
        "brother's-best-friend": 1.5,
        "revenge": -1.5,
    },
    "numb": {
        "enemies-to-lovers": 2.5, "dark-romance": 2.0,
        "forced-proximity": 2.0, "mafia": 1.5,
        "grumpy-sunshine": 1.5,
        "slow-burn": -1.0,
    },
    "empowered": {
        "enemies-to-lovers": 3.0, "boss-employee": 2.0,
        "revenge": 2.0, "billionaire": 1.5,
        "sports-romance": 1.5, "academic": 1.5,
        "protector": -1.0,
    },
    "comfort-seeking": {
        "grumpy-sunshine": 3.0, "friends-to-lovers": 2.5,
        "slow-burn": 2.5, "forced-proximity": 2.0,
        "childhood-friends": 2.0, "single-parent": 1.5,
        "protector": 2.0, "royal-romance": 1.0,
        "dark-romance": -3.0, "mafia": -2.5, "revenge": -2.5,
        "love-triangle": -2.0,
    },
    "craving-intensity": {
        "dark-romance": 3.0, "mafia": 2.5, "enemies-to-lovers": 2.5,
        "revenge": 2.0, "arranged-marriage": 2.0,
        "forbidden-love": 2.0, "age-gap": 1.5,
        "boss-employee": 1.5, "billionaire": 1.0,
        "grumpy-sunshine": -2.0, "friends-to-lovers": -1.5,
        "slow-burn": -1.5, "childhood-friends": -2.0,
    },
}

# Intensity multipliers: how much the mood adjustments are scaled
INTENSITY_MULTIPLIERS = {
    1: 0.5,   # Soft comfort
    2: 1.0,   # Balanced healing
    3: 1.5,   # Emotional intensity
    4: 2.0,   # Dark obsession
}

# MMC preferences by emotion (used for explanation + bonus scoring)
MOOD_MMC_PREFERENCES: Dict[str, List[str]] = {
    "heartbroken": ["protector", "cinnamon-roll", "tortured"],
    "anxious": ["cinnamon-roll", "protector"],
    "overwhelmed": ["cinnamon-roll", "grumpy"],
    "lonely": ["cinnamon-roll", "protector", "brooding"],
    "numb": ["morally-grey", "cold", "brooding"],
    "empowered": ["alpha", "morally-grey", "dominant"],
    "comfort-seeking": ["cinnamon-roll", "protector", "grumpy"],
    "craving-intensity": ["morally-grey", "possessive", "dominant", "alpha"],
}


# ────────────────────────── 1. Emotion Analysis Engine ──────────────────────────

def analyze_user_emotion(input_text: str) -> Dict:
    """Analyze user emotional input text and classify into a detected emotion.

    Uses keyword matching with weighted scoring. Each keyword hit adds to the
    corresponding emotion's score. The highest-scoring emotion wins.

    Args:
        input_text: The user's emotional description text.

    Returns:
        {"detected_emotion": str, "confidence_score": float}

    Raises:
        ValueError: If input is empty or too short.
    """
    if not input_text or not input_text.strip():
        raise ValueError("Emotional input text cannot be empty")
    text = input_text.strip()
    if len(text) < MIN_INPUT_LENGTH:
        raise ValueError(f"Input text must be at least {MIN_INPUT_LENGTH} characters")
    if len(text) > MAX_INPUT_LENGTH:
        raise ValueError(f"Input text must not exceed {MAX_INPUT_LENGTH} characters")

    text_lower = text.lower()

    # Score every emotion
    emotion_scores: Dict[str, float] = {}
    for emotion, keywords in EMOTION_KEYWORD_MAP.items():
        score = 0.0
        for keyword, weight in keywords.items():
            # Use word boundary-ish matching for short keywords to avoid false positives
            if len(keyword) <= 4:
                # Exact substring is fine for short words
                if keyword in text_lower:
                    score += weight
            else:
                if keyword in text_lower:
                    score += weight
        emotion_scores[emotion] = score

    # Find winner
    max_score = max(emotion_scores.values()) if emotion_scores else 0
    if max_score == 0:
        # No keyword matched — fall back to comfort-seeking as default
        return {
            "detected_emotion": "comfort-seeking",
            "confidence_score": 0.3,
        }

    detected = max(emotion_scores, key=emotion_scores.get)

    # Compute confidence: ratio of winner to total scores
    total = sum(emotion_scores.values())
    confidence = round(max_score / total, 3) if total > 0 else 0.3

    # Clamp confidence to reasonable range
    confidence = max(0.3, min(1.0, confidence))

    return {
        "detected_emotion": detected,
        "confidence_score": confidence,
    }


# ────────────────────────── 2. Mood-Based Trope Adjustment ──────────────────────────

def compute_mood_adjustments(
    detected_emotion: str,
    intensity_level: int,
) -> Dict[str, float]:
    """Compute temporary trope weight adjustments for a mood.

    Multiplies the base mood→trope map by the intensity multiplier.

    Args:
        detected_emotion: One of the valid therapist emotions.
        intensity_level: 1–4 intensity slider value.

    Returns:
        Dict mapping trope_name → adjustment delta (float).
    """
    base_adjustments = MOOD_TROPE_ADJUSTMENTS.get(detected_emotion, {})
    multiplier = INTENSITY_MULTIPLIERS.get(intensity_level, 1.0)

    return {
        trope: round(adj * multiplier, 2)
        for trope, adj in base_adjustments.items()
    }


def apply_mood_context(
    user_id: int,
    detected_emotion: str,
    intensity_level: int,
) -> Dict[str, float]:
    """Fetch effective trope weights and apply temporary mood adjustments.

    This does NOT modify the database. Returns a new weight map to be used
    ONLY for this therapist session's recommendation cycle.

    Args:
        user_id: The user's ID.
        detected_emotion: Classified emotion.
        intensity_level: 1–4.

    Returns:
        Dict mapping trope_name → adjusted effective weight.
    """
    from services.trope_engine_service import get_effective_weight_map

    # Start with the user's actual effective weights
    base_weights = get_effective_weight_map(user_id)

    # Compute mood deltas
    mood_deltas = compute_mood_adjustments(detected_emotion, intensity_level)

    # Merge: apply mood deltas on top of base weights
    adjusted: Dict[str, float] = dict(base_weights)
    for trope, delta in mood_deltas.items():
        current = adjusted.get(trope, 0.0)
        adjusted[trope] = max(-5.0, min(5.0, current + delta))

    return adjusted


# ────────────────────────── 3. Therapist Recommendation Flow ──────────────────────────

def _load_books() -> List[Dict]:
    """Load the local book dataset."""
    books_path = Path(__file__).parent.parent / "data" / "books_data.json"
    if not books_path.exists():
        return []
    with open(books_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _get_user_read_books(user_id: int) -> set:
    """Get books the user has already interacted with."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT DISTINCT book_id FROM book_interactions WHERE user_id = ?",
            (user_id,),
        )
        return {r["book_id"] for r in cur.fetchall()}
    finally:
        conn.close()


def _score_books_with_mood_weights(
    adjusted_weights: Dict[str, float],
    preferred_mmc: Optional[str],
    mood_mmc_types: List[str],
    read_books: set,
    limit: int = 10,
) -> List[Dict]:
    """Score and rank books using mood-adjusted weights.

    Independent from the standard recommendation service — uses its own
    scoring that gives bonus weight to mood-preferred MMC types.
    """
    books = _load_books()
    if not books:
        return []

    # Tropes to exclude: adjusted weight <= -5
    excluded_tropes = {t for t, w in adjusted_weights.items() if w <= -5}

    scored: List[Dict] = []
    for book in books:
        book_id = book.get("title", "")
        if book_id in read_books:
            continue

        tropes = derive_tropes(book)
        mmc_type = derive_mmc_type(book)

        # Exclude books with hard-rejected tropes
        if excluded_tropes & set(tropes):
            continue

        score = 0.0
        matched = 0
        for trope in tropes:
            if trope in adjusted_weights:
                score += adjusted_weights[trope]
                matched += 1

        # MMC bonus: user's profile preference
        if preferred_mmc and mmc_type == preferred_mmc:
            score += 1.5

        # MMC bonus: mood-aligned MMC types
        if mmc_type in mood_mmc_types:
            score += 2.0

        if len(tropes) > 0:
            normalized = score / len(tropes)
        else:
            normalized = 0.0

        scored.append({
            "book_id": book_id,
            "title": book.get("title", ""),
            "author": book.get("author", ""),
            "genre": book.get("genre", ""),
            "synopsis": book.get("synopsis", ""),
            "cover": book.get("cover"),
            "tropes": tropes,
            "mmc_type": mmc_type,
            "match_score": round(normalized, 3),
            "raw_score": round(score, 3),
            "matched_tropes": matched,
            "emotion_tags": book.get("emotion_tags", []),
            "mood": book.get("mood"),
            "tone": book.get("tone"),
        })

    scored.sort(key=lambda x: (x["match_score"], x.get("raw_score", 0)), reverse=True)
    return scored[:limit]


# ────────────────────────── 4. Personalized Explanation Generator ──────────────────────────

EMOTION_DESCRIPTIONS = {
    "heartbroken": "heartbroken and in need of healing",
    "anxious": "anxious and seeking calm reassurance",
    "overwhelmed": "overwhelmed and craving emotional relief",
    "lonely": "lonely and yearning for deep connection",
    "numb": "emotionally numb and looking for something to break through",
    "empowered": "empowered and ready for fierce, powerful stories",
    "comfort-seeking": "seeking comfort and emotional warmth",
    "craving-intensity": "craving raw intensity and consuming passion",
}

EMOTION_BOOK_DESCRIPTORS = {
    "heartbroken": "healing through devotion, second chances, and emotional safety",
    "anxious": "gentle pacing, warmth, and reassuring emotional arcs",
    "overwhelmed": "lighthearted escapes, cozy warmth, and low-stakes joy",
    "lonely": "found-family warmth, deep bonds, and intimate connection",
    "numb": "breaking through emotional walls with intensity and tension",
    "empowered": "fierce heroines, power dynamics, and triumphant arcs",
    "comfort-seeking": "soft warmth, protective love, and feel-good healing",
    "craving-intensity": "moral ambiguity, possessive devotion, and dark passion",
}


def generate_therapist_explanation(
    detected_emotion: str,
    user_top_tropes: List[str],
    preferred_mmc: Optional[str],
    mood_adjustments: Dict[str, float],
    intensity_level: int,
) -> str:
    """Generate a personalized explanation for why these books were chosen.

    References the detected emotion, user's dominant trope preferences,
    MMC preference, and intensity level. No static templates — built
    dynamically from user data.

    Args:
        detected_emotion: The classified emotion.
        user_top_tropes: User's current top trope preferences.
        preferred_mmc: User's preferred MMC type (may be None).
        mood_adjustments: The trope adjustments applied this session.
        intensity_level: 1–4.

    Returns:
        A personalized explanation string.
    """
    emotion_desc = EMOTION_DESCRIPTIONS.get(detected_emotion, "experiencing complex emotions")
    book_focus = EMOTION_BOOK_DESCRIPTORS.get(detected_emotion, "emotional resonance")

    # Identify which tropes were boosted
    boosted = sorted(
        [(t, d) for t, d in mood_adjustments.items() if d > 0],
        key=lambda x: x[1], reverse=True,
    )
    suppressed = sorted(
        [(t, d) for t, d in mood_adjustments.items() if d < 0],
        key=lambda x: x[1],
    )

    intensity_labels = {
        1: "a gentle, comforting",
        2: "a balanced, healing",
        3: "an emotionally charged",
        4: "a deeply intense, consuming",
    }
    intensity_desc = intensity_labels.get(intensity_level, "an emotionally tuned")

    # Build the explanation dynamically
    parts = [f"You mentioned feeling {emotion_desc}."]

    # Reference user's existing trope preferences if available
    if user_top_tropes:
        trope_names = ", ".join(t.replace("-", " ").replace("_", " ") for t in user_top_tropes[:3])
        parts.append(f"Based on your preference for {trope_names},")
    else:
        parts.append("Based on your emotional input,")

    parts.append(f"we've selected {intensity_desc} reading experience focusing on {book_focus}.")

    # Reference MMC preference
    if preferred_mmc:
        mmc_display = preferred_mmc.replace("-", " ").replace("_", " ")
        mood_mmcs = MOOD_MMC_PREFERENCES.get(detected_emotion, [])
        if preferred_mmc in mood_mmcs:
            parts.append(
                f"Your preference for {mmc_display} MMCs aligns well with this mood — "
                f"these stories feature characters who match that energy."
            )
        elif mood_mmcs:
            mood_mmc_display = ", ".join(m.replace("-", " ") for m in mood_mmcs[:2])
            parts.append(
                f"For this emotional state, we've also prioritized {mood_mmc_display} characters "
                f"alongside your usual {mmc_display} preference."
            )

    # Reference specific trope adjustments
    if boosted:
        boosted_names = ", ".join(t.replace("-", " ") for t, _ in boosted[:3])
        parts.append(f"We've boosted {boosted_names} themes to match your current emotional needs.")

    if suppressed:
        suppressed_names = ", ".join(t.replace("-", " ") for t, _ in suppressed[:2])
        parts.append(f"We've temporarily reduced {suppressed_names} to protect your emotional space.")

    return " ".join(parts)


# ────────────────────────── 5. Session Management ──────────────────────────

def _expire_old_sessions(user_id: int) -> None:
    """Mark expired sessions as inactive."""
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    try:
        cur.execute(
            "UPDATE therapist_sessions SET is_active = 0 "
            "WHERE user_id = ? AND is_active = 1 AND expires_at < ?",
            (user_id, now),
        )
        conn.commit()
    finally:
        conn.close()


def _deactivate_all_sessions(user_id: int) -> int:
    """Deactivate all active sessions for a user. Returns count deactivated."""
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


def get_active_session(user_id: int) -> Optional[Dict]:
    """Retrieve the current active therapist session for a user.

    Auto-expires stale sessions before checking.

    Returns:
        Session dict or None if no active session.
    """
    _expire_old_sessions(user_id)
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT * FROM therapist_sessions "
            "WHERE user_id = ? AND is_active = 1 "
            "ORDER BY started_at DESC LIMIT 1",
            (user_id,),
        )
        row = cur.fetchone()
        if row:
            return {
                "session_id": row["id"],
                "user_id": row["user_id"],
                "input_text": row["input_text"],
                "detected_emotion": row["detected_emotion"],
                "confidence_score": row["confidence_score"],
                "intensity_level": row["intensity_level"],
                "mood_adjustments": json.loads(row["mood_adjustments"]),
                "explanation": row["explanation"],
                "started_at": row["started_at"],
                "expires_at": row["expires_at"],
                "is_active": bool(row["is_active"]),
            }
        return None
    finally:
        conn.close()


def end_therapist_session(user_id: int) -> Dict:
    """Manually end the active therapist session for a user.

    Returns:
        Status dict with count of sessions ended.
    """
    count = _deactivate_all_sessions(user_id)
    logger.info(f"Therapist session manually ended for user {user_id} ({count} sessions deactivated)")
    return {
        "user_id": user_id,
        "sessions_ended": count,
        "message": "Therapist session ended — recommendations reverted to normal mode",
    }


# ────────────────────────── 6. Main Orchestrator ──────────────────────────

def get_therapist_recommendations(
    user_id: int,
    input_text: str,
    intensity_level: int = 2,
    limit: int = 10,
) -> Dict:
    """Full therapist recommendation flow.

    Orchestrates:
      1. Emotion analysis
      2. Deactivate any previous session
      3. Compute mood-based trope adjustments
      4. Apply mood context (temporary weight overlay)
      5. Generate emotionally aligned recommendations
      6. Generate personalized explanation
      7. Persist session to database
      8. Return full response

    Args:
        user_id: The user's ID.
        input_text: User's emotional input text.
        intensity_level: 1–4 intensity slider (default 2).
        limit: Max number of books to recommend.

    Returns:
        Full therapist session response dict.
    """
    # Validate
    if not input_text or len(input_text.strip()) < MIN_INPUT_LENGTH:
        raise ValueError(f"Input text must be at least {MIN_INPUT_LENGTH} characters")
    if intensity_level < 1 or intensity_level > 4:
        raise ValueError("Intensity level must be between 1 and 4")

    ensure_memory_user(user_id)

    # 1. Analyze emotion
    analysis = analyze_user_emotion(input_text)
    detected_emotion = analysis["detected_emotion"]
    confidence_score = analysis["confidence_score"]

    # 2. Deactivate any previous active sessions
    _deactivate_all_sessions(user_id)

    # 3. Compute mood adjustments
    mood_adjustments = compute_mood_adjustments(detected_emotion, intensity_level)

    # 4. Apply mood context (get adjusted weights — NOT persisted)
    adjusted_weights = apply_mood_context(user_id, detected_emotion, intensity_level)

    # 5. Fetch user profile data for explanation + scoring
    from services.personality_service import get_personality_profile
    profile = get_personality_profile(user_id)
    user_top_tropes = profile.get("top_tropes", []) if profile else []
    preferred_mmc = profile.get("preferred_mmc_type", "") if profile else ""
    preferred_mmc = preferred_mmc if preferred_mmc else None

    # Get mood-aligned MMC types
    mood_mmc_types = MOOD_MMC_PREFERENCES.get(detected_emotion, [])

    # Get read books
    read_books = _get_user_read_books(user_id)

    # 6. Score and rank books with mood-adjusted weights
    recommendations = _score_books_with_mood_weights(
        adjusted_weights=adjusted_weights,
        preferred_mmc=preferred_mmc,
        mood_mmc_types=mood_mmc_types,
        read_books=read_books,
        limit=limit,
    )

    # 7. Generate personalized explanation
    explanation = generate_therapist_explanation(
        detected_emotion=detected_emotion,
        user_top_tropes=user_top_tropes,
        preferred_mmc=preferred_mmc,
        mood_adjustments=mood_adjustments,
        intensity_level=intensity_level,
    )

    # 8. Persist session
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
        f"Therapist session #{session_id} created: user={user_id}, "
        f"emotion={detected_emotion}, confidence={confidence_score}, "
        f"intensity={intensity_level}, expires={expires_at.isoformat()}"
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
    }
