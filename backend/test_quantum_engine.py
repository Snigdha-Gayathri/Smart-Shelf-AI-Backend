"""
Tests for the Enhanced Quantum Similarity Engine.
Validates PennyLane circuit execution, PCA reduction, batch scoring, and latency.
"""

import sys
import os
import time

# Ensure backend is on the import path
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

import numpy as np
import pennylane as qml


def test_iqp_feature_map():
    """Test that the IQP feature map executes without error and produces valid probabilities."""
    from services.quantum_similarity_engine import (
        get_kernel_circuit,
        DEFAULT_N_QUBITS,
        DEFAULT_N_LAYERS,
    )

    kernel = get_kernel_circuit(DEFAULT_N_QUBITS, DEFAULT_N_LAYERS)

    # Two random feature vectors
    np.random.seed(42)
    f1 = np.random.uniform(0, 2 * np.pi, DEFAULT_N_QUBITS)
    f2 = np.random.uniform(0, 2 * np.pi, DEFAULT_N_QUBITS)

    probs = kernel(f1, f2)
    assert probs.shape[0] == 2 ** DEFAULT_N_QUBITS, f"Expected {2**DEFAULT_N_QUBITS} probs, got {probs.shape[0]}"
    assert abs(probs.sum() - 1.0) < 1e-6, f"Probabilities should sum to 1, got {probs.sum()}"
    assert probs[0] >= 0 and probs[0] <= 1, "Similarity should be in [0,1]"
    print(f"  IQP kernel probs[0] = {probs[0]:.6f} (all-zero state probability)")


def test_identical_vectors_high_similarity():
    """Identical feature vectors should have quantum similarity close to 1."""
    from services.quantum_similarity_engine import quantum_similarity_from_features, get_kernel_circuit

    f = np.array([1.0, 0.5, 2.0, 3.0, 1.5, 0.8, 2.5, 1.2])
    sim = quantum_similarity_from_features(f, f)
    print(f"  Identical vectors similarity: {sim:.6f}")
    assert sim > 0.95, f"Identical vectors should have similarity > 0.95, got {sim}"


def test_orthogonal_vectors_low_similarity():
    """Very different feature vectors should have lower similarity."""
    from services.quantum_similarity_engine import quantum_similarity_from_features

    f1 = np.array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
    f2 = np.array([np.pi, np.pi, np.pi, np.pi, np.pi, np.pi, np.pi, np.pi])
    sim = quantum_similarity_from_features(f1, f2)
    print(f"  Opposite vectors similarity: {sim:.6f}")
    assert sim < 0.5, f"Very different vectors should have low similarity, got {sim}"


def test_pca_fitting_and_reduction():
    """Test PCA fitting on synthetic embeddings and dimensionality reduction."""
    from services.quantum_similarity_engine import (
        fit_pca_projection,
        pca_reduce,
        pca_reduce_batch,
    )

    np.random.seed(123)
    # Simulate 50 book embeddings of dimension 384
    embeddings = np.random.randn(50, 384).astype(np.float64)

    projection, mean = fit_pca_projection(embeddings, n_components=8)
    assert projection.shape == (8, 384), f"Expected (8,384), got {projection.shape}"
    assert mean.shape == (384,), f"Expected (384,), got {mean.shape}"

    # Single vector reduction
    reduced = pca_reduce(embeddings[0], 8)
    assert reduced.shape == (8,), f"Expected (8,), got {reduced.shape}"

    # Batch reduction
    batch = pca_reduce_batch(embeddings, 8)
    assert batch.shape == (50, 8), f"Expected (50,8), got {batch.shape}"
    print(f"  PCA reduction: 384d -> 8d, batch shape {batch.shape}")


def test_quantum_similarity_full_pipeline():
    """Test the full quantum_similarity function with realistic embeddings."""
    from services.quantum_similarity_engine import (
        fit_pca_projection,
        quantum_similarity,
    )

    np.random.seed(7)
    corpus = np.random.randn(20, 384)
    fit_pca_projection(corpus, 8)

    emb1 = corpus[0]
    emb2 = corpus[1]
    emb_same = corpus[0]

    sim_same = quantum_similarity(emb1, emb_same)
    sim_diff = quantum_similarity(emb1, emb2)

    print(f"  Same embedding similarity: {sim_same:.6f}")
    print(f"  Different embedding similarity: {sim_diff:.6f}")
    assert sim_same > sim_diff, "Same embedding should have higher similarity"


def test_batch_quantum_similarity():
    """Test batch processing of quantum similarity."""
    from services.quantum_similarity_engine import (
        fit_pca_projection,
        batch_quantum_similarity,
    )

    np.random.seed(99)
    corpus = np.random.randn(15, 384)
    fit_pca_projection(corpus, 8)

    user = corpus[0]
    books = corpus[1:]

    t0 = time.perf_counter()
    scores = batch_quantum_similarity(user, books)
    elapsed = time.perf_counter() - t0

    assert scores.shape == (14,), f"Expected (14,), got {scores.shape}"
    assert all(0 <= s <= 1 for s in scores), "All scores should be in [0,1]"
    print(f"  Batch similarity: {len(scores)} books in {elapsed*1000:.1f}ms")
    print(f"  Score range: [{scores.min():.4f}, {scores.max():.4f}]")


def test_classical_approximation():
    """Test the classical approximation of the quantum kernel."""
    from services.quantum_similarity_engine import (
        classical_quantum_kernel_approximation,
        batch_classical_quantum_approximation,
    )

    np.random.seed(55)
    f1 = np.random.uniform(0, 2 * np.pi, 8)
    f2 = np.random.uniform(0, 2 * np.pi, 8)

    sim = classical_quantum_kernel_approximation(f1, f2)
    assert 0 <= sim <= 1, f"Similarity {sim} out of [0,1]"
    print(f"  Classical approximation: {sim:.6f}")

    # Same vector should give ~1
    sim_same = classical_quantum_kernel_approximation(f1, f1)
    assert sim_same > 0.99, f"Same vector should give ~1, got {sim_same}"

    # Batch version
    book_features = np.random.uniform(0, 2 * np.pi, (20, 8))
    batch_scores = batch_classical_quantum_approximation(f1, book_features)
    assert batch_scores.shape == (20,), f"Expected (20,), got {batch_scores.shape}"

    t0 = time.perf_counter()
    for _ in range(1000):
        batch_classical_quantum_approximation(f1, book_features)
    elapsed = time.perf_counter() - t0
    print(f"  Batch approximation: 20 books x 1000 iters in {elapsed*1000:.1f}ms "
          f"({elapsed/1000*1e6:.1f}μs/call)")


def test_hybrid_scoring():
    """Test the hybrid similarity scoring function."""
    from services.quantum_similarity_engine import (
        fit_pca_projection,
        hybrid_similarity_scores,
    )

    np.random.seed(42)
    corpus = np.random.randn(30, 384)
    fit_pca_projection(corpus, 8)

    user = corpus[0]
    books = corpus[1:]

    # With approximation (fast)
    t0 = time.perf_counter()
    hybrid, cosine, quantum = hybrid_similarity_scores(
        user, books, quantum_weight=0.35, use_approximation=True
    )
    elapsed_approx = time.perf_counter() - t0

    assert hybrid.shape == (29,)
    assert cosine.shape == (29,)
    assert quantum.shape == (29,)
    print(f"  Hybrid scoring (approx): {elapsed_approx*1000:.1f}ms for 29 books")

    # With full quantum circuits
    t0 = time.perf_counter()
    hybrid_q, cosine_q, quantum_q = hybrid_similarity_scores(
        user, books, quantum_weight=0.35, use_approximation=False
    )
    elapsed_full = time.perf_counter() - t0
    print(f"  Hybrid scoring (full circuit): {elapsed_full*1000:.1f}ms for 29 books")
    print(f"  Speedup with approximation: {elapsed_full/max(elapsed_approx,1e-9):.1f}x")


def test_engine_info():
    """Test engine info reporting."""
    from services.quantum_similarity_engine import get_engine_info

    info = get_engine_info()
    print(f"  Engine info: {info}")
    assert "backend" in info
    assert "default_n_qubits" in info


def test_latency_benchmark():
    """Benchmark end-to-end latency for a realistic scenario."""
    from services.quantum_similarity_engine import (
        fit_pca_projection,
        pca_reduce,
        scale_for_quantum,
        batch_classical_quantum_approximation,
        precompute_quantum_features,
    )

    np.random.seed(0)
    n_books = 100
    corpus = np.random.randn(n_books, 384)
    fit_pca_projection(corpus, 8)

    # Pre-compute book features (done at cache-build time)
    book_features = precompute_quantum_features(corpus, 8)

    # Simulate a user query
    user_emb = np.random.randn(384)
    user_reduced = pca_reduce(user_emb, 8)
    user_features = scale_for_quantum(user_reduced)

    # Benchmark classical approximation
    timings = []
    for _ in range(100):
        t0 = time.perf_counter()
        scores = batch_classical_quantum_approximation(user_features, book_features)
        elapsed = time.perf_counter() - t0
        timings.append(elapsed)

    avg_ms = np.mean(timings) * 1000
    p99_ms = np.percentile(timings, 99) * 1000
    print(f"\n  === LATENCY BENCHMARK ({n_books} books) ===")
    print(f"  Avg: {avg_ms:.3f}ms | P99: {p99_ms:.3f}ms")
    print(f"  Per-book: {avg_ms/n_books*1000:.1f}μs")

    assert avg_ms < 50, f"Average latency should be < 50ms for {n_books} books, got {avg_ms:.1f}ms"


if __name__ == "__main__":
    tests = [
        ("IQP Feature Map Circuit Execution", test_iqp_feature_map),
        ("Identical Vectors → High Similarity", test_identical_vectors_high_similarity),
        ("Orthogonal Vectors → Low Similarity", test_orthogonal_vectors_low_similarity),
        ("PCA Fitting & Reduction", test_pca_fitting_and_reduction),
        ("Full Quantum Similarity Pipeline", test_quantum_similarity_full_pipeline),
        ("Batch Quantum Similarity", test_batch_quantum_similarity),
        ("Classical Kernel Approximation", test_classical_approximation),
        ("Hybrid Scoring", test_hybrid_scoring),
        ("Engine Info", test_engine_info),
        ("Latency Benchmark", test_latency_benchmark),
    ]

    print("=" * 70)
    print("Enhanced Quantum Similarity Engine — Test Suite")
    print("=" * 70)

    passed = 0
    failed = 0
    for name, fn in tests:
        print(f"\n▸ {name}")
        try:
            fn()
            print(f"  ✓ PASSED")
            passed += 1
        except Exception as e:
            print(f"  ✗ FAILED: {e}")
            failed += 1

    print("\n" + "=" * 70)
    print(f"Results: {passed} passed, {failed} failed out of {len(tests)}")
    print("=" * 70)
    sys.exit(1 if failed > 0 else 0)
