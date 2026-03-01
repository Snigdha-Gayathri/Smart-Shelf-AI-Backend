import os
import json
from typing import List, Dict
from datetime import datetime
import numpy as np

CACHE_PATH = os.path.join(os.path.dirname(__file__), '..', 'quantum_similarity_cache.json')


def save_cache(cache: Dict):
    try:
        with open(CACHE_PATH, 'w', encoding='utf-8') as f:
            json.dump(cache, f, indent=2)
    except Exception:
        pass


def load_cache() -> Dict:
    if not os.path.exists(CACHE_PATH):
        return {}
    try:
        with open(CACHE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def build_quantum_cache(books: List[Dict], generate_embeddings_fn, n_qubits: int = 6) -> Dict:
    """Compute and store reduced-angle vectors for each book so quantum similarity
    can be computed classically at request time.

    The quantum kernel used in the project encodes embeddings via RY(angle) where angle = emb * pi.
    The probability of the all-zero state when encoding two embeddings equals product_i cos^2((a_i - b_i)/2).

    We store the first n_qubits angle components for each book: angles = (embedding[:n_qubits] * pi).
    """
    cache = {}
    if not books:
        return cache

    book_descriptions = [f"{b.get('title','')} {b.get('author','')} {b.get('synopsis','')} {b.get('mood','')} {b.get('tone','')}" for b in books]
    try:
        embeddings = generate_embeddings_fn(book_descriptions)
    except Exception:
        embeddings = [None] * len(books)

    for idx, emb in enumerate(embeddings):
        angles = None
        try:
            if emb is not None:
                vec = np.array(emb)
                # take first n_qubits components, pad with zeros if needed
                v = vec[:n_qubits]
                if v.shape[0] < n_qubits:
                    v = np.pad(v, (0, n_qubits - v.shape[0]))
                angles = (v * np.pi).tolist()
        except Exception:
            angles = None

        cache[str(idx)] = {
            'title': books[idx].get('title'),
            'angles': angles,
            'genre': books[idx].get('genre'),
            'timestamp': datetime.utcnow().isoformat()
        }

    save_cache(cache)
    return cache


def classical_quantum_similarity(angles1: List[float], angles2: List[float]) -> float:
    """Compute classical equivalent of the quantum kernel (probability of all-zero state).

    angles arrays are expected to be lists of floats (radians) of same length.
    similarity = product_i cos^2((a_i - b_i)/2)
    """
    try:
        a = np.array(angles1, dtype=float)
        b = np.array(angles2, dtype=float)
        if a.shape != b.shape:
            # pad shorter
            n = max(a.shape[0], b.shape[0])
            a = np.pad(a, (0, n - a.shape[0]))
            b = np.pad(b, (0, n - b.shape[0]))
        dif = (a - b) / 2.0
        vals = np.cos(dif) ** 2
        prod = float(np.prod(vals))
        return prod
    except Exception:
        return 0.0
