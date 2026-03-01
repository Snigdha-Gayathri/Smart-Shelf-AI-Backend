"""
Quantum Emotion Analysis Pipeline
==================================
A local, privacy-preserving emotion analysis system using:
- GoEmotions (Hugging Face transformers)
- SentenceTransformers embeddings
- Enhanced PennyLane quantum kernel with IQP feature maps for similarity computation
- PCA-based dimensionality reduction (384d → n_qubits)
- Persistent compiled quantum circuits for optimized latency
"""

import numpy as np
import torch
import os
import time
# We'll import transformers and sentence_transformers lazily inside load_models()
_TRANSFORMERS_IMPORTED = False
import pennylane as qml
from typing import Dict, List, Tuple
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Model names
GOEMOTIONS_MODEL = "joeddav/distilbert-base-uncased-go-emotions-student"
SENTENCE_MODEL = "all-MiniLM-L6-v2"

# Global model cache
_emotion_tokenizer = None
_emotion_model = None
_sentence_embedder = None


def load_models():
    """
    Load pre-trained models locally and cache them for reuse.
    Models are downloaded once and stored in Hugging Face cache.
    """
    global _emotion_tokenizer, _emotion_model, _sentence_embedder, _TRANSFORMERS_IMPORTED

    # Ensure transformers does not try to import TensorFlow/Keras
    os.environ.setdefault("TRANSFORMERS_NO_TF", "1")

    if not _TRANSFORMERS_IMPORTED:
        try:
            # Import here so the env var is set first
            from transformers import AutoTokenizer, AutoModelForSequenceClassification
            from sentence_transformers import SentenceTransformer
            # store references to these constructors in the module globals for use below
            globals()["_AutoTokenizer"] = AutoTokenizer
            globals()["_AutoModelForSequenceClassification"] = AutoModelForSequenceClassification
            globals()["_SentenceTransformer"] = SentenceTransformer
            _TRANSFORMERS_IMPORTED = True
        except Exception as e:
            logger.error(f"Failed to import transformers or sentence_transformers: {e}")
            raise

    AutoTokenizer = globals().get("_AutoTokenizer")
    AutoModelForSequenceClassification = globals().get("_AutoModelForSequenceClassification")
    SentenceTransformer = globals().get("_SentenceTransformer")

    if _emotion_tokenizer is None:
        logger.info(f"Loading GoEmotions tokenizer: {GOEMOTIONS_MODEL}")
        _emotion_tokenizer = AutoTokenizer.from_pretrained(GOEMOTIONS_MODEL)

    if _emotion_model is None:
        logger.info(f"Loading GoEmotions model: {GOEMOTIONS_MODEL}")
        _emotion_model = AutoModelForSequenceClassification.from_pretrained(GOEMOTIONS_MODEL)
        _emotion_model.eval()  # Set to evaluation mode

    if _sentence_embedder is None:
        logger.info(f"Loading SentenceTransformer: {SENTENCE_MODEL}")
        _sentence_embedder = SentenceTransformer(SENTENCE_MODEL)
    
    logger.info("All models loaded successfully")
    return _emotion_tokenizer, _emotion_model, _sentence_embedder


def detect_emotions(text: str, threshold: float = 0.1) -> Dict[str, float]:
    """
    Detect compound emotions from input text using GoEmotions model.
    
    Args:
        text: Input text to analyze
        threshold: Minimum probability threshold for emotion detection (0-1)
    
    Returns:
        Dictionary mapping emotion labels to their probability scores
        Example: {"joy": 0.85, "surprise": 0.32, "admiration": 0.21}
    """
    tokenizer, model, _ = load_models()
    
    # Tokenize input
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    
    # Get predictions
    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits
    
    # Apply sigmoid for multi-label classification
    probs = torch.sigmoid(logits).squeeze().numpy()
    
    # Get emotion labels from model config
    emotion_labels = list(model.config.id2label.values())
    
    # Create emotion dictionary with scores above threshold
    emotions = {
        label: float(score)
        for label, score in zip(emotion_labels, probs)
        if score >= threshold
    }
    
    # Sort by score descending
    emotions = dict(sorted(emotions.items(), key=lambda x: x[1], reverse=True))
    
    logger.info(f"Detected {len(emotions)} emotions above threshold {threshold}")
    return emotions


def generate_embeddings(texts: List[str]) -> np.ndarray:
    """
    Generate sentence embeddings using SentenceTransformers.
    
    Args:
        texts: List of text strings to embed
    
    Returns:
        Numpy array of shape (len(texts), embedding_dim)
        Typical embedding_dim for all-MiniLM-L6-v2 is 384
    """
    _, _, embedder = load_models()
    
    embeddings = embedder.encode(texts, convert_to_numpy=True)
    logger.info(f"Generated embeddings with shape {embeddings.shape}")
    
    return embeddings


def quantum_similarity(embedding1: np.ndarray, embedding2: np.ndarray, n_qubits: int = 8) -> float:
    """
    Compute similarity between two embeddings using the enhanced PennyLane quantum kernel.

    Uses the Quantum Similarity Engine with:
      • IQP-style entangling feature map (Hadamard + RZ + CNOT-RZ-CNOT + RY)
      • PCA-based dimensionality reduction (384d → n_qubits)
      • Inversion test (fidelity) for kernel evaluation
      • Persistent compiled QNode — device & circuit created once, reused

    Args:
        embedding1: First embedding vector (e.g. 384-d from SentenceTransformer)
        embedding2: Second embedding vector
        n_qubits: Number of qubits to use (default: 8)

    Returns:
        Similarity score between 0 and 1 (quantum kernel fidelity)
    """
    from services.quantum_similarity_engine import quantum_similarity as _qsim

    t0 = time.perf_counter()
    similarity = _qsim(
        np.asarray(embedding1, dtype=np.float64),
        np.asarray(embedding2, dtype=np.float64),
        n_qubits=n_qubits,
    )
    elapsed = time.perf_counter() - t0
    logger.info(f"Quantum similarity computed: {similarity:.4f} ({elapsed*1000:.1f}ms)")
    return similarity


def analyze_prompt(text: str, reference_emotions: List[str] = None) -> Dict:
    """
    Complete emotion analysis pipeline: detect emotions, generate embeddings,
    and compute quantum similarity scores.
    
    Args:
        text: Input text to analyze
        reference_emotions: Optional list of reference emotion words to compare against
    
    Returns:
        Dictionary containing:
        - compound_emotions: Dict of detected emotions and scores
        - text_embedding: Embedding of input text
        - quantum_similarities: Dict mapping reference emotions to quantum similarity scores
    """
    logger.info(f"Analyzing prompt: '{text[:50]}...'")
    
    # Step 1: Detect compound emotions
    emotions = detect_emotions(text)
    
    # Step 2: Generate embedding for input text
    text_embedding = generate_embeddings([text])[0]
    
    # Step 3: Compute quantum similarity with reference emotions
    #   Uses batch computation for speed when multiple references exist.
    quantum_similarities = {}

    if reference_emotions:
        emotion_words = reference_emotions
    elif emotions:
        emotion_words = list(emotions.keys())[:5]  # Top 5 emotions
    else:
        emotion_words = []

    if emotion_words:
        # Batch-generate embeddings for all reference emotions at once
        emotion_embeddings = generate_embeddings(emotion_words)

        try:
            from services.quantum_similarity_engine import batch_quantum_similarity
            # Batch quantum similarity — single compiled circuit, all emotions at once
            q_scores = batch_quantum_similarity(
                text_embedding,
                np.array(emotion_embeddings, dtype=np.float64),
                n_qubits=8,
            )
            for word, score in zip(emotion_words, q_scores):
                quantum_similarities[word] = float(score)
        except Exception as e:
            logger.warning(f"Batch quantum similarity failed, falling back to sequential: {e}")
            for emotion_word, emotion_emb in zip(emotion_words, emotion_embeddings):
                similarity = quantum_similarity(text_embedding, emotion_emb)
                quantum_similarities[emotion_word] = similarity

    result = {
        "compound_emotions": emotions,
        "text_embedding": text_embedding.tolist(),
        "quantum_similarities": quantum_similarities,
        "top_emotion": max(emotions.items(), key=lambda x: x[1])[0] if emotions else None,
        "emotion_count": len(emotions)
    }

    logger.info(f"Analysis complete: {len(emotions)} emotions detected")
    return result


# Warmup function to preload models
def warmup():
    """
    Warmup function to preload all models into memory.
    Call this at application startup for better performance.
    """
    logger.info("Warming up emotion analysis pipeline...")
    try:
        load_models()
        # Run a test analysis
        test_result = analyze_prompt("I feel happy and excited about this new project!")
        logger.info(f"Warmup complete. Test emotions: {list(test_result['compound_emotions'].keys())[:3]}")
    except Exception as e:
        logger.warning(f"Warmup failed (models not available): {e}")
        # Fallback: nothing to warm up


# --- Fallback simple similarity (no ML) ---
def fallback_recommend_similarity(user_text: str, book_text: str) -> float:
    """
    Simple token-overlap similarity for offline testing when models are unavailable.
    Returns a score between 0 and 1.
    """
    import re
    def tokenize(s):
        return set(re.findall(r"\w+", s.lower()))

    u = tokenize(user_text)
    b = tokenize(book_text)
    if not u or not b:
        return 0.0
    overlap = len(u & b)
    denom = max(len(u), len(b))
    return float(overlap) / denom


if __name__ == "__main__":
    # Example usage
    print("="*60)
    print("Quantum Emotion Analysis Pipeline - Local Test")
    print("="*60)
    
    # Warmup
    warmup()
    
    # Test with sample text
    sample_text = "I'm feeling nostalgic yet hopeful about returning to my childhood home."
    print(f"\nAnalyzing: '{sample_text}'")
    print("-"*60)
    
    result = analyze_prompt(sample_text)
    
    print("\n📊 Detected Compound Emotions:")
    for emotion, score in list(result['compound_emotions'].items())[:5]:
        print(f"  {emotion}: {score:.3f}")
    
    print("\n⚛️ Quantum Similarity Scores:")
    for emotion, similarity in result['quantum_similarities'].items():
        print(f"  {emotion}: {similarity:.3f}")
    
    print(f"\n🎯 Top Emotion: {result['top_emotion']}")
    print(f"📈 Total Emotions Detected: {result['emotion_count']}")
    print("\n" + "="*60)
