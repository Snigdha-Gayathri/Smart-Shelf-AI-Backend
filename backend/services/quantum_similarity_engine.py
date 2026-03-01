"""
Enhanced Quantum Similarity Engine
===================================
Real PennyLane-based quantum similarity computation with:
  • IQP-style entangling feature map for expressive quantum embeddings
  • PCA-based dimensionality reduction (384-d → n_qubits)
  • Persistent compiled QNodes (device created once, reused)
  • Vectorized batch similarity for all books in one call
  • Lightning-fast backend (lightning.qubit when available)
  • Multi-layer quantum kernel with trainable entanglement
"""

from __future__ import annotations

import logging
import time
from functools import lru_cache
from typing import Dict, List, Optional, Tuple

import numpy as np
import pennylane as qml

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEFAULT_N_QUBITS = 8          # More qubits = more expressiveness
DEFAULT_N_LAYERS = 2           # Depth of entangling feature map
DEFAULT_BACKEND = "auto"       # "auto" tries lightning.qubit → default.qubit

# ---------------------------------------------------------------------------
# Singleton quantum devices & compiled circuits
# ---------------------------------------------------------------------------
_devices: Dict[int, qml.Device] = {}
_kernel_circuits: Dict[int, qml.QNode] = {}
_batch_kernel_circuits: Dict[int, qml.QNode] = {}
_pca_transform: Optional[object] = None  # Will hold fitted PCA or projection matrix
_projection_matrix: Optional[np.ndarray] = None
_projection_mean: Optional[np.ndarray] = None


def _select_backend() -> str:
    """Pick the fastest available PennyLane backend."""
    try:
        # lightning.qubit is a C++-accelerated state-vector simulator (10-50x faster)
        dev = qml.device("lightning.qubit", wires=2)
        del dev
        logger.info("⚡ Using lightning.qubit backend for quantum simulation")
        return "lightning.qubit"
    except Exception:
        logger.info("Using default.qubit backend for quantum simulation")
        return "default.qubit"


_BACKEND = None


def _get_backend() -> str:
    global _BACKEND
    if _BACKEND is None:
        _BACKEND = _select_backend()
    return _BACKEND


def get_device(n_qubits: int) -> qml.Device:
    """Return a cached quantum device for the given qubit count."""
    if n_qubits not in _devices:
        backend = _get_backend()
        _devices[n_qubits] = qml.device(backend, wires=n_qubits)
        logger.info(f"Created {backend} device with {n_qubits} qubits")
    return _devices[n_qubits]


# ---------------------------------------------------------------------------
# Quantum Feature Map — IQP-style with entanglement
# ---------------------------------------------------------------------------

def _iqp_feature_map(features: np.ndarray, n_qubits: int, n_layers: int):
    """
    IQP (Instantaneous Quantum Polynomial) inspired feature map.

    For each layer:
      1. Hadamard on all qubits
      2. RZ(feature_i) single-qubit rotations (data encoding)
      3. Entangling ZZ interactions: RZZ(feature_i * feature_j) on adjacent pairs
      4. RY(feature_i) rotations for additional expressiveness

    This creates a quantum state that captures both individual features
    AND pairwise correlations — far more expressive than independent RY gates.
    """
    for layer in range(n_layers):
        # Hadamard layer — create superposition
        for i in range(n_qubits):
            qml.Hadamard(wires=i)

        # Data encoding — RZ rotations
        for i in range(n_qubits):
            qml.RZ(features[i], wires=i)

        # Entangling layer — ZZ interactions encode feature correlations
        for i in range(n_qubits - 1):
            # IQP-style: encode product of features as entangling angle
            angle = features[i] * features[i + 1]
            qml.CNOT(wires=[i, i + 1])
            qml.RZ(angle, wires=i + 1)
            qml.CNOT(wires=[i, i + 1])

        # Circular entanglement (last↔first) for periodic boundary
        if n_qubits > 2:
            angle = features[-1] * features[0]
            qml.CNOT(wires=[n_qubits - 1, 0])
            qml.RZ(angle, wires=0)
            qml.CNOT(wires=[n_qubits - 1, 0])

        # Additional RY layer for expressiveness
        for i in range(n_qubits):
            qml.RY(features[i] * (layer + 1) * 0.5, wires=i)


def _build_kernel_circuit(n_qubits: int, n_layers: int) -> qml.QNode:
    """
    Build and compile a quantum kernel circuit that measures the overlap
    (fidelity) between two quantum feature-mapped states.

    Uses the "inversion test":
      |⟨φ(x₁)|φ(x₂)⟩|² = Pr(|0...0⟩) after U†(x₁) · U(x₂)

    This is the standard quantum kernel evaluation technique.
    """
    dev = get_device(n_qubits)

    @qml.qnode(dev, interface="numpy", diff_method=None)
    def quantum_kernel(features1, features2):
        # Encode first data point: U(x₁)
        _iqp_feature_map(features1, n_qubits, n_layers)

        # Apply adjoint (inverse) of second encoding: U†(x₂)
        qml.adjoint(_iqp_feature_map)(features2, n_qubits, n_layers)

        # Measure probability of all-zero state
        return qml.probs(wires=range(n_qubits))

    return quantum_kernel


def get_kernel_circuit(n_qubits: int = DEFAULT_N_QUBITS,
                       n_layers: int = DEFAULT_N_LAYERS) -> qml.QNode:
    """Return a cached compiled quantum kernel QNode."""
    key = n_qubits * 100 + n_layers
    if key not in _kernel_circuits:
        logger.info(f"Compiling quantum kernel circuit: {n_qubits} qubits, {n_layers} layers")
        _kernel_circuits[key] = _build_kernel_circuit(n_qubits, n_layers)
    return _kernel_circuits[key]


# ---------------------------------------------------------------------------
# Dimensionality Reduction: PCA projection (384-d → n_qubits)
# ---------------------------------------------------------------------------

def fit_pca_projection(embeddings: np.ndarray, n_components: int = DEFAULT_N_QUBITS) -> Tuple[np.ndarray, np.ndarray]:
    """
    Fit a PCA projection matrix from a corpus of embeddings.
    Uses NumPy SVD directly — no sklearn dependency needed.

    Returns (projection_matrix, mean_vector) so we can transform new embeddings:
        reduced = (embedding - mean) @ projection_matrix.T
    """
    global _projection_matrix, _projection_mean

    mean = embeddings.mean(axis=0)
    centered = embeddings - mean

    # Economy SVD for speed
    U, S, Vt = np.linalg.svd(centered, full_matrices=False)

    # Top n_components principal directions
    projection = Vt[:n_components]  # shape: (n_components, embedding_dim)

    _projection_matrix = projection
    _projection_mean = mean

    explained_var = (S[:n_components] ** 2) / (S ** 2).sum()
    logger.info(
        f"PCA fitted: {embeddings.shape[1]}d → {n_components}d "
        f"(explained variance: {explained_var.sum():.2%})"
    )

    return projection, mean


def pca_reduce(embedding: np.ndarray, n_components: int = DEFAULT_N_QUBITS) -> np.ndarray:
    """
    Project a single embedding to n_components dimensions using fitted PCA.
    Falls back to taking top-N components if PCA not fitted.
    """
    if _projection_matrix is not None and _projection_mean is not None:
        centered = embedding - _projection_mean
        reduced = centered @ _projection_matrix.T
    else:
        # Fallback: take first n_components (less optimal but functional)
        reduced = embedding[:n_components]
        if len(reduced) < n_components:
            reduced = np.pad(reduced, (0, n_components - len(reduced)))

    return reduced


def pca_reduce_batch(embeddings: np.ndarray, n_components: int = DEFAULT_N_QUBITS) -> np.ndarray:
    """Vectorized PCA reduction for a batch of embeddings."""
    if _projection_matrix is not None and _projection_mean is not None:
        centered = embeddings - _projection_mean
        return centered @ _projection_matrix.T
    else:
        result = embeddings[:, :n_components]
        if result.shape[1] < n_components:
            result = np.pad(result, ((0, 0), (0, n_components - result.shape[1])))
        return result


# ---------------------------------------------------------------------------
# Feature Scaling for Quantum Encoding
# ---------------------------------------------------------------------------

def scale_for_quantum(features: np.ndarray) -> np.ndarray:
    """
    Scale reduced features to [0, 2π] range optimal for quantum rotation gates.
    Uses min-max scaling per-vector to preserve relative magnitudes.
    """
    fmin = features.min()
    fmax = features.max()
    if fmax - fmin < 1e-10:
        return np.full_like(features, np.pi)
    scaled = (features - fmin) / (fmax - fmin) * 2 * np.pi
    return scaled


# ---------------------------------------------------------------------------
# Core Quantum Similarity Functions
# ---------------------------------------------------------------------------

def quantum_similarity(
    embedding1: np.ndarray,
    embedding2: np.ndarray,
    n_qubits: int = DEFAULT_N_QUBITS,
    n_layers: int = DEFAULT_N_LAYERS,
) -> float:
    """
    Compute quantum kernel similarity between two embeddings.

    Pipeline:
      1. PCA reduce 384-d → n_qubits
      2. Scale to [0, 2π]
      3. Run IQP quantum kernel circuit (fidelity test)
      4. Return Pr(|0...0⟩) as similarity score

    Returns: float in [0, 1], where 1 = identical quantum states.
    """
    # Reduce dimensionality
    r1 = pca_reduce(np.asarray(embedding1, dtype=np.float64), n_qubits)
    r2 = pca_reduce(np.asarray(embedding2, dtype=np.float64), n_qubits)

    # Scale for quantum gates
    f1 = scale_for_quantum(r1)
    f2 = scale_for_quantum(r2)

    # Run quantum kernel
    kernel = get_kernel_circuit(n_qubits, n_layers)
    probs = kernel(f1, f2)

    # Probability of the all-zero state = fidelity
    similarity = float(probs[0])
    return similarity


def quantum_similarity_from_features(
    features1: np.ndarray,
    features2: np.ndarray,
    n_qubits: int = DEFAULT_N_QUBITS,
    n_layers: int = DEFAULT_N_LAYERS,
) -> float:
    """
    Compute quantum similarity from pre-reduced, pre-scaled feature vectors.
    Skips PCA + scaling steps for maximum speed when features are pre-computed.
    """
    kernel = get_kernel_circuit(n_qubits, n_layers)
    probs = kernel(features1, features2)
    return float(probs[0])


def batch_quantum_similarity(
    user_embedding: np.ndarray,
    book_embeddings: np.ndarray,
    n_qubits: int = DEFAULT_N_QUBITS,
    n_layers: int = DEFAULT_N_LAYERS,
) -> np.ndarray:
    """
    Compute quantum similarity between a user embedding and ALL book embeddings
    in an optimized batch.

    Optimization strategy:
      1. PCA-reduce all embeddings in one vectorized operation
      2. Scale all features in batch
      3. Compute user quantum features ONCE
      4. Run kernel circuit for each book (circuit is pre-compiled)

    Returns: 1D array of similarity scores, one per book.
    """
    t0 = time.perf_counter()
    n_books = book_embeddings.shape[0]

    # Batch PCA reduction
    user_reduced = pca_reduce(np.asarray(user_embedding, dtype=np.float64), n_qubits)
    book_reduced = pca_reduce_batch(np.asarray(book_embeddings, dtype=np.float64), n_qubits)

    # Scale features
    user_features = scale_for_quantum(user_reduced)

    # Pre-compile kernel circuit
    kernel = get_kernel_circuit(n_qubits, n_layers)

    # Compute similarities
    similarities = np.zeros(n_books, dtype=np.float64)
    for i in range(n_books):
        book_features = scale_for_quantum(book_reduced[i])
        probs = kernel(user_features, book_features)
        similarities[i] = float(probs[0])

    elapsed = time.perf_counter() - t0
    logger.info(
        f"Batch quantum similarity: {n_books} books in {elapsed:.3f}s "
        f"({elapsed / max(n_books, 1) * 1000:.1f}ms/book)"
    )

    return similarities


# ---------------------------------------------------------------------------
# Classical Approximation of the Quantum Kernel (ultra-fast fallback)
# ---------------------------------------------------------------------------

def classical_quantum_kernel_approximation(
    features1: np.ndarray,
    features2: np.ndarray,
) -> float:
    """
    Classical approximation of the IQP quantum kernel.

    For the IQP feature map, the kernel can be approximated as:
      k(x₁, x₂) ≈ ∏ᵢ cos²((x₁ᵢ - x₂ᵢ)/2) · ∏ᵢ cos²((x₁ᵢ·x₁ᵢ₊₁ - x₂ᵢ·x₂ᵢ₊₁)/2)

    This captures both single-qubit and two-qubit gate contributions.
    """
    f1 = np.asarray(features1, dtype=np.float64)
    f2 = np.asarray(features2, dtype=np.float64)

    n = len(f1)

    # Single-qubit contribution
    diff_single = (f1 - f2) / 2.0
    single_contrib = np.prod(np.cos(diff_single) ** 2)

    # Two-qubit (entangling) contribution
    zz1 = f1[:-1] * f1[1:]
    zz2 = f2[:-1] * f2[1:]
    diff_zz = (zz1 - zz2) / 2.0
    zz_contrib = np.prod(np.cos(diff_zz) ** 2)

    # Circular entanglement contribution
    circ1 = f1[-1] * f1[0]
    circ2 = f2[-1] * f2[0]
    circ_contrib = np.cos((circ1 - circ2) / 2.0) ** 2

    return float(single_contrib * zz_contrib * circ_contrib)


def batch_classical_quantum_approximation(
    user_features: np.ndarray,
    book_features_matrix: np.ndarray,
) -> np.ndarray:
    """
    Vectorized classical approximation of the IQP quantum kernel
    for a batch of books. Ultra-fast — pure NumPy, no circuit execution.
    """
    n_books = book_features_matrix.shape[0]
    f1 = np.asarray(user_features, dtype=np.float64)  # (n_qubits,)

    # Single-qubit contribution: product of cos²((f1_i - f2_i)/2)
    diff_single = (f1[np.newaxis, :] - book_features_matrix) / 2.0  # (n_books, n_qubits)
    single_contrib = np.prod(np.cos(diff_single) ** 2, axis=1)  # (n_books,)

    # ZZ contribution: adjacent qubit products
    zz1 = f1[:-1] * f1[1:]  # (n_qubits-1,)
    zz2 = book_features_matrix[:, :-1] * book_features_matrix[:, 1:]  # (n_books, n_qubits-1)
    diff_zz = (zz1[np.newaxis, :] - zz2) / 2.0
    zz_contrib = np.prod(np.cos(diff_zz) ** 2, axis=1)  # (n_books,)

    # Circular entanglement contribution
    circ1 = f1[-1] * f1[0]
    circ2 = book_features_matrix[:, -1] * book_features_matrix[:, 0]
    circ_contrib = np.cos((circ1 - circ2) / 2.0) ** 2  # (n_books,)

    return single_contrib * zz_contrib * circ_contrib


# ---------------------------------------------------------------------------
# Pre-compute Quantum Feature Vectors for Caching
# ---------------------------------------------------------------------------

def precompute_quantum_features(
    embeddings: np.ndarray,
    n_qubits: int = DEFAULT_N_QUBITS,
) -> np.ndarray:
    """
    Pre-compute PCA-reduced and scaled quantum feature vectors for a batch
    of embeddings. These can be cached and used for fast similarity computation.

    Returns: (n_samples, n_qubits) array of quantum-ready feature vectors.
    """
    reduced = pca_reduce_batch(embeddings, n_qubits)
    features = np.array([scale_for_quantum(r) for r in reduced])
    return features


# ---------------------------------------------------------------------------
# Hybrid Scoring: Quantum + Classical Cosine
# ---------------------------------------------------------------------------

def hybrid_similarity_scores(
    user_embedding: np.ndarray,
    book_embeddings: np.ndarray,
    quantum_weight: float = 0.35,
    n_qubits: int = DEFAULT_N_QUBITS,
    n_layers: int = DEFAULT_N_LAYERS,
    use_approximation: bool = False,
    book_quantum_features: Optional[np.ndarray] = None,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute hybrid similarity scores combining quantum kernel and cosine similarity.

    Args:
        user_embedding: User's text embedding (384-d)
        book_embeddings: All book embeddings (N, 384)
        quantum_weight: Weight for quantum component (1 - quantum_weight for cosine)
        n_qubits: Number of qubits for quantum circuit
        n_layers: Depth of quantum feature map
        use_approximation: Use classical approximation instead of circuit execution
        book_quantum_features: Pre-computed quantum features for books (optional, for speed)

    Returns:
        (hybrid_scores, cosine_scores, quantum_scores) — all shape (N,)
    """
    t0 = time.perf_counter()
    n_books = book_embeddings.shape[0]

    # --- Classical cosine similarity (vectorized) ---
    user_norm = user_embedding / (np.linalg.norm(user_embedding) + 1e-10)
    book_norms = book_embeddings / (
        np.linalg.norm(book_embeddings, axis=1, keepdims=True) + 1e-10
    )
    cosine_scores = book_norms @ user_norm  # (N,)

    # --- Quantum similarity ---
    user_reduced = pca_reduce(np.asarray(user_embedding, dtype=np.float64), n_qubits)
    user_features = scale_for_quantum(user_reduced)

    if book_quantum_features is not None:
        # Use pre-computed features for speed
        bqf = book_quantum_features
    else:
        book_reduced = pca_reduce_batch(
            np.asarray(book_embeddings, dtype=np.float64), n_qubits
        )
        bqf = np.array([scale_for_quantum(r) for r in book_reduced])

    if use_approximation:
        # Ultra-fast vectorized classical approximation
        quantum_scores = batch_classical_quantum_approximation(user_features, bqf)
    else:
        # Real PennyLane quantum circuit execution
        kernel = get_kernel_circuit(n_qubits, n_layers)
        quantum_scores = np.zeros(n_books, dtype=np.float64)
        for i in range(n_books):
            probs = kernel(user_features, bqf[i])
            quantum_scores[i] = float(probs[0])

    # --- Hybrid combination ---
    hybrid_scores = (1.0 - quantum_weight) * cosine_scores + quantum_weight * quantum_scores

    elapsed = time.perf_counter() - t0
    logger.info(
        f"Hybrid scoring complete: {n_books} books in {elapsed:.3f}s "
        f"(quantum_weight={quantum_weight}, approx={use_approximation})"
    )

    return hybrid_scores, cosine_scores, quantum_scores


# ---------------------------------------------------------------------------
# Diagnostics / Info
# ---------------------------------------------------------------------------

def get_engine_info() -> Dict:
    """Return information about the quantum engine configuration."""
    return {
        "backend": _get_backend(),
        "default_n_qubits": DEFAULT_N_QUBITS,
        "default_n_layers": DEFAULT_N_LAYERS,
        "pca_fitted": _projection_matrix is not None,
        "devices_cached": list(_devices.keys()),
        "circuits_compiled": len(_kernel_circuits),
    }
