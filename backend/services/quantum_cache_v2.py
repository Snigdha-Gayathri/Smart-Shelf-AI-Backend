"""
Enhanced Quantum Cache
======================
Pre-computes and persists quantum-ready feature vectors for all books,
using the new PennyLane-based quantum similarity engine.

Features:
  • PCA projection matrix persistence (fitted once, reused)
  • Pre-computed quantum feature vectors per book
  • Vectorized batch similarity at request time (no per-book quantum circuit)
  • Classical approximation mode for sub-millisecond scoring
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime
from typing import Callable, Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..")
QUANTUM_CACHE_PATH = os.path.join(CACHE_DIR, "quantum_similarity_cache.json")
PCA_CACHE_PATH = os.path.join(CACHE_DIR, "pca_projection_cache.npz")

# Default qubit count — must match what the engine uses
DEFAULT_N_QUBITS = 8


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------

def save_cache(cache: Dict):
    """Save quantum cache to disk."""
    try:
        with open(QUANTUM_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
        logger.info(f"Quantum cache saved ({len(cache)} entries)")
    except Exception as e:
        logger.warning(f"Failed to save quantum cache: {e}")


def load_cache() -> Dict:
    """Load quantum cache from disk."""
    if not os.path.exists(QUANTUM_CACHE_PATH):
        return {}
    try:
        with open(QUANTUM_CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_pca_projection(projection: np.ndarray, mean: np.ndarray):
    """Persist PCA projection matrix and mean vector to disk."""
    try:
        np.savez_compressed(PCA_CACHE_PATH, projection=projection, mean=mean)
        logger.info(f"PCA projection saved to {PCA_CACHE_PATH}")
    except Exception as e:
        logger.warning(f"Failed to save PCA projection: {e}")


def load_pca_projection():
    """Load PCA projection from disk and install it into the engine."""
    if not os.path.exists(PCA_CACHE_PATH):
        return None, None
    try:
        data = np.load(PCA_CACHE_PATH)
        projection = data["projection"]
        mean = data["mean"]
        logger.info(f"PCA projection loaded: {projection.shape}")
        return projection, mean
    except Exception as e:
        logger.warning(f"Failed to load PCA projection: {e}")
        return None, None


# ---------------------------------------------------------------------------
# Cache Building
# ---------------------------------------------------------------------------

def build_quantum_cache(
    books: List[Dict],
    generate_embeddings_fn: Callable,
    n_qubits: int = DEFAULT_N_QUBITS,
) -> Dict:
    """
    Build the quantum cache for all books:

    1. Generate sentence embeddings for all books (batch)
    2. Fit PCA projection on the corpus
    3. Compute quantum-ready feature vectors for each book
    4. Persist everything to disk

    Returns: cache dict mapping book index → {title, quantum_features, genre, ...}
    """
    from services.quantum_similarity_engine import (
        fit_pca_projection,
        precompute_quantum_features,
        scale_for_quantum,
        pca_reduce_batch,
    )

    t0 = time.perf_counter()
    cache = {}

    if not books:
        return cache

    # Step 1: Generate embeddings for all books
    book_descriptions = [
        f"{b.get('title', '')} {b.get('author', '')} "
        f"{b.get('synopsis', '')} {b.get('mood', '')} {b.get('tone', '')}"
        for b in books
    ]

    try:
        embeddings = generate_embeddings_fn(book_descriptions)
        embeddings = np.array(embeddings, dtype=np.float64)
    except Exception as e:
        logger.error(f"Failed to generate book embeddings: {e}")
        return cache

    # Step 2: Fit PCA projection on the corpus
    try:
        projection, mean = fit_pca_projection(embeddings, n_components=n_qubits)
        save_pca_projection(projection, mean)
    except Exception as e:
        logger.warning(f"PCA fitting failed: {e}")

    # Step 3: Compute quantum feature vectors
    try:
        quantum_features = precompute_quantum_features(embeddings, n_qubits)
    except Exception as e:
        logger.warning(f"Quantum feature pre-computation failed: {e}")
        quantum_features = np.zeros((len(books), n_qubits))

    # Step 4: Build cache entries
    for idx in range(len(books)):
        cache[str(idx)] = {
            "title": books[idx].get("title"),
            "quantum_features": quantum_features[idx].tolist(),
            "genre": books[idx].get("genre"),
            "n_qubits": n_qubits,
            "timestamp": datetime.utcnow().isoformat(),
        }

    save_cache(cache)

    elapsed = time.perf_counter() - t0
    logger.info(
        f"Quantum cache built: {len(cache)} books, {n_qubits} qubits, {elapsed:.2f}s"
    )

    return cache


# ---------------------------------------------------------------------------
# Fast Similarity Using Cache
# ---------------------------------------------------------------------------

def cached_quantum_similarity(
    user_features: np.ndarray,
    cache: Dict,
    n_books: int,
    use_approximation: bool = True,
) -> np.ndarray:
    """
    Compute quantum similarity between user features and all cached book features.

    Args:
        user_features: Pre-computed quantum features for user query (n_qubits,)
        cache: Loaded quantum cache dict
        n_books: Number of books
        use_approximation: If True, use ultra-fast classical approximation

    Returns:
        Array of similarity scores (n_books,)
    """
    from services.quantum_similarity_engine import (
        batch_classical_quantum_approximation,
        quantum_similarity_from_features,
        get_kernel_circuit,
        DEFAULT_N_QUBITS,
        DEFAULT_N_LAYERS,
    )

    n_qubits = len(user_features)

    # Collect book features from cache
    book_features_list = []
    for i in range(n_books):
        entry = cache.get(str(i))
        if entry and entry.get("quantum_features"):
            book_features_list.append(np.array(entry["quantum_features"], dtype=np.float64))
        else:
            book_features_list.append(np.zeros(n_qubits, dtype=np.float64))

    book_features_matrix = np.array(book_features_list)  # (n_books, n_qubits)

    if use_approximation:
        # Vectorized classical approximation — sub-millisecond for entire catalog
        return batch_classical_quantum_approximation(user_features, book_features_matrix)
    else:
        # Real PennyLane circuit execution per book
        kernel = get_kernel_circuit(n_qubits, DEFAULT_N_LAYERS)
        scores = np.zeros(n_books, dtype=np.float64)
        for i in range(n_books):
            probs = kernel(user_features, book_features_matrix[i])
            scores[i] = float(probs[0])
        return scores


# ---------------------------------------------------------------------------
# Legacy compatibility: classical_quantum_similarity
# ---------------------------------------------------------------------------

def classical_quantum_similarity(angles1: List[float], angles2: List[float]) -> float:
    """
    Backward-compatible wrapper. Uses the enhanced IQP kernel approximation.
    """
    from services.quantum_similarity_engine import classical_quantum_kernel_approximation

    f1 = np.array(angles1, dtype=np.float64)
    f2 = np.array(angles2, dtype=np.float64)
    return classical_quantum_kernel_approximation(f1, f2)
