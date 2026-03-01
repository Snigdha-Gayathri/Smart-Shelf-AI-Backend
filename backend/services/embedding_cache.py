import json
import os
from typing import List, Dict
from datetime import datetime

CACHE_PATH = os.path.join(os.path.dirname(__file__), '..', 'book_embeddings_cache.json')


def load_cache() -> Dict:
    if not os.path.exists(CACHE_PATH):
        return {}
    try:
        with open(CACHE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_cache(cache: Dict):
    try:
        with open(CACHE_PATH, 'w', encoding='utf-8') as f:
            json.dump(cache, f, indent=2)
    except Exception:
        pass


def build_cache(books: List[Dict], analyze_prompt_fn, generate_embeddings_fn) -> Dict:
    """Compute emotion vectors and embeddings for each book and save to CACHE_PATH.

    books: list of book dicts loaded from books_data.json
    analyze_prompt_fn: function to compute compound_emotions for text
    generate_embeddings_fn: function to compute embeddings for list of texts
    Returns cache dict mapping index -> {title, embedding, emotions, timestamp}
    """
    cache = {}
    if not books:
        return cache

    # Create book descriptions for embeddings
    book_descriptions = [f"{b.get('title','')} {b.get('author','')} {b.get('synopsis','')} {b.get('mood','')} {b.get('tone','')}" for b in books]

    # Generate embeddings in batch
    try:
        embeddings = generate_embeddings_fn(book_descriptions)
    except Exception:
        embeddings = [None] * len(books)

    # Generate emotion analysis per book (use synopsis) sequentially
    emotions_list = []
    for b in books:
        text = b.get('synopsis') or b.get('mood') or b.get('title')
        try:
            res = analyze_prompt_fn(text)
            emotions = res.get('compound_emotions', {}) if isinstance(res, dict) else {}
        except Exception:
            emotions = {}
        emotions_list.append(emotions)

    for idx, b in enumerate(books):
        emb = None
        try:
            if embeddings is not None and len(embeddings) > idx and embeddings[idx] is not None:
                emb = list(map(float, embeddings[idx].tolist())) if hasattr(embeddings[idx], 'tolist') else list(map(float, embeddings[idx]))
        except Exception:
            emb = None

        cache[str(idx)] = {
            'title': b.get('title'),
            'author': b.get('author'),
            'embedding': emb,
            'emotions': emotions_list[idx] if idx < len(emotions_list) else {},
            'genre': b.get('genre'),
            'emotion_tags': b.get('emotion_tags', []),
            'cover': b.get('cover'),
            'timestamp': datetime.utcnow().isoformat()
        }

    save_cache(cache)
    return cache
