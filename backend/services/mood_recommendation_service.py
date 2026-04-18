"""Mood-aware recommendation service for free-text reader intent."""

from __future__ import annotations

import logging
import math
import os
from functools import lru_cache
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from services.book_repository import get_all_books
from services.mood_processor import get_intensity_multiplier, process_mood_query

logger = logging.getLogger(__name__)

if os.getenv("SKIP_ML", "0") == "1":
    generate_embeddings = None
else:
    try:
        from services.quantum_emotion_pipeline import generate_embeddings
    except Exception:  # pragma: no cover - model stack may be unavailable in tests
        generate_embeddings = None


def _cosine_similarity(vector_a: Sequence[float], vector_b: Sequence[float]) -> float:
    if not vector_a or not vector_b or len(vector_a) != len(vector_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vector_a, vector_b))
    norm_a = math.sqrt(sum(a * a for a in vector_a))
    norm_b = math.sqrt(sum(b * b for b in vector_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _tokenize(text: str) -> set[str]:
    import re

    return set(re.findall(r"[a-z0-9']+", (text or "").lower()))


def _fallback_similarity(a: str, b: str) -> float:
    tokens_a = _tokenize(a)
    tokens_b = _tokenize(b)
    if not tokens_a or not tokens_b:
        return 0.0
    overlap = len(tokens_a & tokens_b)
    return overlap / max(len(tokens_a), len(tokens_b))


def _book_tags(book: Dict) -> List[str]:
    tags = []
    for value in book.get("tags", []):
        if value and value not in tags:
            tags.append(value)
    for value in book.get("embedding_tags", []):
        if value and value not in tags:
            tags.append(value)
    for value in str(book.get("genre") or "").split():
        if value and value not in tags:
            tags.append(value)
    return tags


def _book_emotions(book: Dict) -> List[str]:
    emotions = []
    for value in book.get("emotionProfile", []):
        if value and value not in emotions:
            emotions.append(value)
    for value in book.get("emotion_tags", []):
        if value and value not in emotions:
            emotions.append(value)
    return emotions


def _book_text(book: Dict) -> str:
    return " ".join([
        str(book.get("title") or ""),
        str(book.get("author") or ""),
        str(book.get("synopsis") or ""),
        " ".join(book.get("tags", [])),
        " ".join(book.get("emotionProfile", [])),
        str(book.get("mood") or ""),
        str(book.get("tone") or ""),
    ])


@lru_cache(maxsize=32)
def _embed_text(text: str) -> Optional[Tuple[float, ...]]:
    if generate_embeddings is None:
        return None
    try:
        embedding = generate_embeddings([text])
        if len(embedding) == 0:
            return None
        return tuple(float(v) for v in embedding[0])
    except Exception as exc:  # pragma: no cover - model stack may fail in CI
        logger.warning(f"Embedding failed, using lexical similarity fallback: {exc}")
        return None


def _score_overlap(needles: Iterable[str], haystack: Iterable[str]) -> float:
    need_set = {str(item).strip().lower() for item in needles if item}
    hay_set = {str(item).strip().lower() for item in haystack if item}
    if not need_set or not hay_set:
        return 0.0
    return len(need_set & hay_set) / len(need_set)


def generate_mood_recommendations(query: str, limit: int = 10) -> Dict:
    """Return mood-aware recommendations for the provided free-text query."""
    mood = process_mood_query(query)
    books = get_all_books()

    if mood.get("clarification_prompt") and not mood.get("matched_mood"):
        return {
            "detectedMood": mood["detected_mood"],
            "matchedMood": mood["matched_mood"],
            "matchedTags": mood["matched_tags"],
            "matchedEmotions": mood["matched_emotions"],
            "fallbackUsed": mood["fallback_used"],
            "similarityScore": mood["similarity_score"],
            "clarificationPrompt": mood["clarification_prompt"],
            "recommendations": [],
        }

    if not books:
        return {
            "detectedMood": mood["detected_mood"],
            "matchedMood": mood["matched_mood"],
            "matchedTags": mood["matched_tags"],
            "matchedEmotions": mood["matched_emotions"],
            "fallbackUsed": mood["fallback_used"],
            "similarityScore": mood["similarity_score"],
            "clarificationPrompt": mood.get("clarification_prompt"),
            "recommendations": [],
        }

    query_embedding = mood.get("query_embedding")
    if query_embedding is not None and not isinstance(query_embedding, tuple):
        query_embedding = tuple(query_embedding)

    scored_books: List[Dict] = []
    intensity_multiplier = get_intensity_multiplier(mood.get("intensity", "medium"))

    for book in books:
        tags = _book_tags(book)
        emotions = _book_emotions(book)
        book_text = _book_text(book)

        if query_embedding is not None:
            book_embedding = _embed_text(book_text)
            embedding_similarity = _cosine_similarity(query_embedding, book_embedding) if book_embedding else _fallback_similarity(mood["normalized_query"], book_text)
        else:
            embedding_similarity = _fallback_similarity(mood["normalized_query"], book_text)

        tag_match_score = _score_overlap(mood.get("matched_tags", []), tags)
        emotion_match_score = _score_overlap(mood.get("matched_emotions", []), emotions)

        score = (0.5 * embedding_similarity) + (0.3 * tag_match_score) + (0.2 * emotion_match_score)
        score *= intensity_multiplier

        scored_books.append({
            "book_id": book.get("id") or book.get("title"),
            "title": book.get("title", ""),
            "author": book.get("author", ""),
            "genre": book.get("genre", ""),
            "synopsis": book.get("synopsis", ""),
            "cover": book.get("cover"),
            "tags": tags,
            "emotionProfile": emotions,
            "matchedTags": [tag for tag in mood.get("matched_tags", []) if tag in tags],
            "matchedEmotions": [emotion for emotion in mood.get("matched_emotions", []) if emotion in emotions],
            "embeddingSimilarity": round(embedding_similarity, 3),
            "tagMatchScore": round(tag_match_score, 3),
            "emotionMatchScore": round(emotion_match_score, 3),
            "intensityMultiplier": round(intensity_multiplier, 3),
            "score": round(score, 3),
            "mood": book.get("mood"),
            "tone": book.get("tone"),
            "type": book.get("type"),
            "pacing": book.get("pacing"),
        })

    scored_books.sort(key=lambda item: (item["score"], item["embeddingSimilarity"]), reverse=True)
    recommendations = scored_books[:limit]

    logger.info(
        f"Mood recommendation generated: detected={mood['detected_mood']}, "
        f"similarity={mood['similarity_score']:.3f}, fallback={mood['fallback_used']}, "
        f"returned={len(recommendations)}"
    )

    return {
        "detectedMood": mood["detected_mood"],
        "matchedMood": mood["matched_mood"],
        "matchedTags": mood["matched_tags"],
        "matchedEmotions": mood["matched_emotions"],
        "similarityScore": round(mood["similarity_score"], 3),
        "fallbackUsed": mood["fallback_used"],
        "clarificationPrompt": mood.get("clarification_prompt"),
        "recommendations": recommendations,
    }
