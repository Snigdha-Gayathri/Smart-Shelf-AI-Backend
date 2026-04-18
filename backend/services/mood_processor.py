"""Natural-language mood processing for reader intent and emotion mapping."""

from __future__ import annotations

import logging
import math
import os
import re
from functools import lru_cache
from typing import Dict, List, Optional, Sequence, Tuple

from config.mood_map import GOEMOTIONS_LABELS, INTENSITY_MULTIPLIERS, moodMap, resolve_mood_context

logger = logging.getLogger(__name__)

if os.getenv("SKIP_ML", "0") == "1":
    generate_embeddings = None
else:
    try:
        from services.quantum_emotion_pipeline import generate_embeddings
    except Exception:  # pragma: no cover - model stack may be unavailable in tests
        generate_embeddings = None


STOPWORDS = {
    "a", "an", "and", "but", "for", "i", "im", "i'm", "me", "my",
    "need", "want", "please", "to", "the", "this", "that", "with", "of",
    "in", "on", "at", "do", "does", "you", "your", "really", "so", "just",
}

TOKEN_NORMALIZATION = {
    "obsessed": "obsession",
    "obsessive": "obsession",
    "obsession": "obsession",
    "numb": "numb",
    "numbness": "numb",
    "emotionally": "emotional",
    "emotional": "emotional",
    "protective": "protective",
    "possessive": "possessive",
    "ruin": "ruin",
    "ruined": "ruin",
    "destroy": "ruin",
    "destroyed": "ruin",
    "cry": "sadness",
    "crying": "sadness",
    "hurt": "sadness",
    "love": "love",
    "desire": "desire",
}


def normalize_text(text: Optional[str]) -> str:
    """Lowercase and trim free-text mood input."""
    normalized = (text or "").strip().lower()
    normalized = re.sub(r"[\u2018\u2019]", "'", normalized)
    normalized = re.sub(r"[^a-z0-9\s'-]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def tokenize(text: str) -> List[str]:
    tokens = re.findall(r"[a-z']+", normalize_text(text))
    result: List[str] = []
    for token in tokens:
        mapped = TOKEN_NORMALIZATION.get(token, token)
        if mapped in STOPWORDS:
            continue
        result.append(mapped)
    return result


def _cosine_similarity(vector_a: Sequence[float], vector_b: Sequence[float]) -> float:
    if not vector_a or not vector_b:
        return 0.0
    if len(vector_a) != len(vector_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vector_a, vector_b))
    norm_a = math.sqrt(sum(a * a for a in vector_a))
    norm_b = math.sqrt(sum(b * b for b in vector_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _lexical_similarity(text_a: str, text_b: str) -> float:
    tokens_a = set(tokenize(text_a))
    tokens_b = set(tokenize(text_b))
    if not tokens_a or not tokens_b:
        return 0.0
    overlap = len(tokens_a & tokens_b)
    denom = max(len(tokens_a), len(tokens_b))
    return overlap / denom if denom else 0.0


@lru_cache(maxsize=1)
def _mood_candidates() -> List[Tuple[str, Dict[str, object], str]]:
    candidates: List[Tuple[str, Dict[str, object], str]] = []
    for canonical_mood, payload in moodMap.items():
        candidates.append((canonical_mood, payload, canonical_mood))
        for alias in payload.get("aliases", []):
            candidates.append((canonical_mood, payload, alias))
    return candidates


@lru_cache(maxsize=1)
def _candidate_embeddings() -> Optional[List[List[float]]]:
    if generate_embeddings is None:
        return None
    candidate_phrases = [candidate[2] for candidate in _mood_candidates()]
    if not candidate_phrases:
        return None
    try:
        embeddings = generate_embeddings(candidate_phrases)
        return [list(row) for row in embeddings]
    except Exception as exc:  # pragma: no cover - model stack may fail in CI
        logger.warning(f"Mood embedding cache unavailable: {exc}")
        return None


def _embed_text(text: str) -> Optional[List[float]]:
    if generate_embeddings is None:
        return None
    try:
        embeddings = generate_embeddings([text])
        if len(embeddings) == 0:
            return None
        return list(embeddings[0])
    except Exception as exc:  # pragma: no cover - model stack may fail in CI
        logger.warning(f"Mood embedding failed, using lexical fallback: {exc}")
        return None


def _best_match_by_embedding(query_text: str) -> Tuple[Optional[str], Optional[Dict[str, object]], float]:
    query_embedding = _embed_text(query_text)
    candidate_embeddings = _candidate_embeddings()
    if query_embedding is None or not candidate_embeddings:
        return None, None, 0.0

    best_index = -1
    best_score = 0.0
    for index, candidate_embedding in enumerate(candidate_embeddings):
        score = _cosine_similarity(query_embedding, candidate_embedding)
        if score > best_score:
            best_index = index
            best_score = score

    if best_index < 0:
        return None, None, 0.0

    canonical_mood, payload, _ = _mood_candidates()[best_index]
    return canonical_mood, payload, best_score


def _best_match_by_lexical(query_text: str) -> Tuple[Optional[str], Optional[Dict[str, object]], float]:
    best_canonical = None
    best_payload = None
    best_score = 0.0
    for canonical_mood, payload, phrase in _mood_candidates():
        score = _lexical_similarity(query_text, phrase)
        if score > best_score:
            best_canonical = canonical_mood
            best_payload = payload
            best_score = score
    return best_canonical, best_payload, best_score


def _resolve_goemotions_label(query_text: str) -> Optional[str]:
    if query_text in GOEMOTIONS_LABELS:
        return query_text
    return None


def process_mood_query(raw_query: Optional[str], threshold: float = 0.7) -> Dict:
    """Analyze a free-text mood request and return canonical mood metadata."""
    normalized_query = normalize_text(raw_query)
    if not normalized_query:
        raise ValueError("Query text cannot be empty")

    contextual_mood, contextual_payload = resolve_mood_context(normalized_query)
    if contextual_mood and contextual_payload:
        logger.info(f"Detected contextual mood: {contextual_mood}")
        return {
            "normalized_query": normalized_query,
            "detected_mood": contextual_mood,
            "matched_mood": contextual_mood,
            "matched_emotions": list(contextual_payload.get("emotions", [])),
            "matched_tags": list(contextual_payload.get("tags", [])),
            "intensity": str(contextual_payload.get("intensity", "medium")),
            "emotion_category": contextual_mood,
            "semantic_meaning": contextual_payload.get("semantic_meaning") or contextual_mood.replace("_", " "),
            "similarity_score": 1.0,
            "fallback_used": False,
            "clarification_prompt": None,
            "query_embedding": _embed_text(normalized_query),
        }

    goemotion_label = _resolve_goemotions_label(normalized_query)
    if goemotion_label:
        logger.info(f"Detected GoEmotions label: {goemotion_label}")
        return {
            "normalized_query": normalized_query,
            "detected_mood": goemotion_label,
            "matched_mood": goemotion_label,
            "matched_emotions": [goemotion_label],
            "matched_tags": [],
            "intensity": "medium",
            "emotion_category": goemotion_label,
            "semantic_meaning": goemotion_label,
            "similarity_score": 1.0,
            "fallback_used": False,
            "clarification_prompt": None,
            "query_embedding": _embed_text(normalized_query),
        }

    embedding_match, embedding_payload, embedding_score = _best_match_by_embedding(normalized_query)
    lexical_match, lexical_payload, lexical_score = _best_match_by_lexical(normalized_query)

    if embedding_score >= threshold and embedding_payload is not None:
        payload = embedding_payload
        detected_mood = embedding_match
        similarity_score = embedding_score
        match_source = "embedding"
    elif lexical_score >= threshold and lexical_payload is not None:
        payload = lexical_payload
        detected_mood = lexical_match
        similarity_score = lexical_score
        match_source = "lexical"
    else:
        fallback_label = None
        for token in tokenize(normalized_query):
            if token in {"hungry", "bored", "lonely", "overthinking"}:
                fallback_label = {
                    "hungry": "curiosity",
                    "bored": "neutral",
                    "lonely": "sadness",
                    "overthinking": "anxiety",
                }[token]
                break

        logger.info(
            "No moodMap match found; falling back to raw embedding search "
            f"(threshold={threshold}, lexical={lexical_score:.3f}, embedding={embedding_score:.3f})"
        )
        return {
            "normalized_query": normalized_query,
            "detected_mood": fallback_label or normalized_query,
            "matched_mood": None,
            "matched_emotions": [fallback_label] if fallback_label else [],
            "matched_tags": [],
            "intensity": "medium",
            "emotion_category": fallback_label,
            "semantic_meaning": fallback_label or normalized_query,
            "similarity_score": max(embedding_score, lexical_score),
            "fallback_used": True,
            "clarification_prompt": None if fallback_label else "That's an interesting mood. Do you want something light, emotional, or intense?",
            "query_embedding": _embed_text(normalized_query),
        }

    logger.info(
        f"Mood mapped via {match_source}: {detected_mood} (score={similarity_score:.3f})"
    )
    return {
        "normalized_query": normalized_query,
        "detected_mood": detected_mood,
        "matched_mood": detected_mood,
        "matched_emotions": list(payload.get("emotions", [])),
        "matched_tags": list(payload.get("tags", [])),
        "intensity": str(payload.get("intensity", "medium")),
        "emotion_category": detected_mood,
        "semantic_meaning": payload.get("semantic_meaning") or detected_mood,
        "similarity_score": similarity_score,
        "fallback_used": False,
        "clarification_prompt": None,
        "query_embedding": _embed_text(normalized_query),
    }


def get_intensity_multiplier(intensity: str) -> float:
    return INTENSITY_MULTIPLIERS.get(intensity, 1.0)
