"""Structured mood mapping for non-standard reader moods."""

from __future__ import annotations

GOEMOTIONS_LABELS = frozenset([
    "admiration",
    "amusement",
    "anger",
    "annoyance",
    "approval",
    "caring",
    "confusion",
    "curiosity",
    "desire",
    "disappointment",
    "disapproval",
    "disgust",
    "embarrassment",
    "excitement",
    "fear",
    "gratitude",
    "grief",
    "joy",
    "love",
    "nervousness",
    "optimism",
    "pride",
    "realization",
    "relief",
    "remorse",
    "sadness",
    "surprise",
    "neutral",
])

moodMap = {
    "i want obsession": {
        "emotions": ["desire", "love"],
        "tags": ["possessive", "obsessive", "dark romance"],
        "intensity": "high",
        "aliases": ["obsession", "obsessive love", "possessive love", "i need obsessive love"],
    },
    "emotionally numb": {
        "emotions": ["neutral", "sadness"],
        "tags": ["slow burn", "introspective"],
        "intensity": "low",
        "aliases": ["numb", "emotionally numb", "empty", "dead inside"],
    },
    "ruin me emotionally": {
        "emotions": ["grief", "sadness"],
        "tags": ["angst", "tragic", "dark"],
        "intensity": "very_high",
        "aliases": ["ruin me", "destroy me emotionally", "make me cry", "hurt me"],
    },
    "touch her and die": {
        "emotions": ["anger", "love"],
        "tags": ["protective mmc", "possessive"],
        "intensity": "high",
        "aliases": ["protective mmc", "touch him and die", "touch them and die"],
    },
    "comfort me": {
        "emotions": ["caring", "relief"],
        "tags": ["cozy", "healing", "heartwarming"],
        "intensity": "low",
        "aliases": ["comfort", "soft healing", "cozy", "warm hug"],
    },
    "chaos": {
        "emotions": ["excitement", "surprise"],
        "tags": ["chaotic", "unhinged", "wild"],
        "intensity": "high",
        "aliases": ["unhinged", "chaotic", "wild ride", "messy"],
    },
    "angry": {
        "emotions": ["anger", "annoyance"],
        "tags": ["revenge", "power", "control", "ruthless"],
        "intensity": "high",
        "aliases": ["mad", "furious", "rage", "irritated"],
    },
    "heartbroken": {
        "emotions": ["sadness", "grief", "love"],
        "tags": ["healing", "emotional recovery", "love", "closure"],
        "intensity": "high",
        "aliases": ["brokenhearted", "devastated", "heart ache", "heartache"],
    },
    "lonely": {
        "emotions": ["sadness", "caring"],
        "tags": ["companionship", "introspection", "comfort", "connection"],
        "intensity": "low",
        "aliases": ["isolated", "alone", "left out"],
    },
    "hungry": {
        "emotions": ["curiosity", "relief"],
        "tags": ["comfort", "cozy", "light-hearted", "engaging"],
        "intensity": "low",
        "aliases": ["craving", "snacky", "needing comfort", "want food"],
    },
    "overthinking": {
        "emotions": ["confusion", "nervousness", "realization"],
        "tags": ["psychological", "introspective", "complex", "thought-provoking"],
        "intensity": "medium",
        "aliases": ["anxious", "spiraling", "ruminating", "in my head"],
    },
    "numb": {
        "emotions": ["neutral", "sadness"],
        "tags": ["gentle", "slow burn", "healing", "soft"],
        "intensity": "low",
        "aliases": ["empty", "detached", "flat"],
    },
}

INTENSITY_MULTIPLIERS = {
    "low": 0.9,
    "medium": 1.0,
    "high": 1.12,
    "very_high": 1.2,
}


def resolve_mood_context(text: str):
    """Return the best matching contextual mood payload for free-form text."""
    normalized = (text or "").strip().lower()
    if not normalized:
      return None, None

    if normalized in moodMap:
        return normalized, moodMap[normalized]

    for canonical_mood, payload in moodMap.items():
        for alias in payload.get("aliases", []):
            if alias and alias.lower() in normalized:
                return canonical_mood, payload

    return None, None
