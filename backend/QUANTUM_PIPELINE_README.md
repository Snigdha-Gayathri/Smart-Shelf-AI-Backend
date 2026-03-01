# Quantum Emotion Analysis Pipeline

A **fully local, privacy-preserving** emotion analysis system that combines:
- 🧠 **GoEmotions** (27-class emotion classifier)
- 🔤 **SentenceTransformers** (semantic embeddings)
- ⚛️ **PennyLane Quantum Kernel** (quantum similarity computation)

## Features

✅ **Compound Emotion Detection** - Detects multiple nuanced emotions (e.g., "nostalgic yet hopeful")  
✅ **Semantic Embeddings** - Generates 384-dim embeddings using all-MiniLM-L6-v2  
✅ **Quantum Similarity** - Uses 6-qubit quantum kernel for embedding comparison  
✅ **100% Local** - No external API calls, fully privacy-preserving  
✅ **Model Caching** - Downloads models once, reuses for performance  
✅ **FastAPI Integration** - Production-ready REST endpoint  

## Architecture

```
User Input Text
     ↓
[GoEmotions Classifier] → Compound Emotions (27 classes)
     ↓
[SentenceTransformer] → Text Embedding (384-dim)
     ↓
[PennyLane Quantum Kernel] → Quantum Similarity Scores
     ↓
JSON Response
```

## Installation

All dependencies are already in `requirements.txt`:

```bash
pip install transformers torch sentence-transformers pennylane numpy
```

## Usage

### 1. Standalone Python

```python
from services.quantum_emotion_pipeline import analyze_prompt

# Analyze any text
result = analyze_prompt("I'm feeling nostalgic yet hopeful about my childhood")

print(result['compound_emotions'])  # {'nostalgia': 0.87, 'optimism': 0.65, ...}
print(result['quantum_similarities'])  # {'nostalgia': 0.923, 'optimism': 0.812, ...}
print(result['top_emotion'])  # 'nostalgia'
```

### 2. FastAPI Endpoint

**Start the backend:**
```bash
cd backend
uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

**Make a request:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/analyze_emotion \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a mafia romance with a powerful female lead and a happy ending"}'
```

**Response:**
```json
{
  "prompt": "a mafia romance with a powerful female lead and a happy ending",
  "compound_emotions": {
    "love": 0.82,
    "admiration": 0.67,
    "excitement": 0.54,
    "joy": 0.48
  },
  "quantum_similarities": {
    "love": 0.891,
    "admiration": 0.823,
    "excitement": 0.756
  },
  "top_emotion": "love",
  "emotion_count": 4,
  "analysis_method": "local_quantum_pipeline"
}
```

## API Reference

### `detect_emotions(text, threshold=0.1)`
Detects compound emotions using GoEmotions model.

**Args:**
- `text` (str): Input text to analyze
- `threshold` (float): Min probability for emotion detection (0-1)

**Returns:** `Dict[str, float]` - Emotion labels mapped to scores

---

### `generate_embeddings(texts)`
Generates sentence embeddings using SentenceTransformers.

**Args:**
- `texts` (List[str]): List of text strings

**Returns:** `np.ndarray` - Embeddings with shape (len(texts), 384)

---

### `quantum_similarity(embedding1, embedding2, n_qubits=6)`
Computes similarity using PennyLane quantum kernel.

**Args:**
- `embedding1` (np.ndarray): First embedding vector
- `embedding2` (np.ndarray): Second embedding vector
- `n_qubits` (int): Number of qubits (default: 6)

**Returns:** `float` - Similarity score (0-1)

---

### `analyze_prompt(text, reference_emotions=None)`
Complete pipeline: detect → embed → quantum similarity.

**Args:**
- `text` (str): Input text to analyze
- `reference_emotions` (List[str], optional): Custom reference emotions

**Returns:** `Dict` with keys:
- `compound_emotions`: Detected emotions and scores
- `text_embedding`: 384-dim embedding
- `quantum_similarities`: Quantum scores for each emotion
- `top_emotion`: Highest-scoring emotion
- `emotion_count`: Number of detected emotions

## Testing

Run the test suite:

```bash
cd backend
python test_quantum_pipeline.py
```

Expected output:
```
🧪 TESTING QUANTUM EMOTION ANALYSIS PIPELINE
[TEST 1] Loading models...
✅ Models loaded successfully

[TEST 2] Testing emotion detection...
✅ Detected 5 emotions:
   - nostalgia: 0.876
   - optimism: 0.654
   - admiration: 0.432
...
✅ ALL TESTS PASSED - Pipeline is ready!
```

## Performance

- **First run:** 5-10 seconds (downloads models ~200MB)
- **Subsequent runs:** <1 second (models cached locally)
- **Memory usage:** ~500MB (models in RAM)
- **CPU only:** Works without GPU (faster with GPU)

## GoEmotions Label Set

27 emotions detected:
- admiration, amusement, anger, annoyance, approval, caring, confusion, curiosity
- desire, disappointment, disapproval, disgust, embarrassment, excitement, fear
- gratitude, grief, joy, love, nervousness, optimism, pride, realization, relief
- remorse, sadness, surprise, neutral

## Privacy & Security

🔒 **100% Local Processing**
- No external API calls
- No data leaves your machine
- Models stored in Hugging Face cache (~/.cache/huggingface)
- GDPR compliant (no data collection)

## Advanced Usage

### Custom Reference Emotions

```python
result = analyze_prompt(
    "I feel bittersweet about graduating",
    reference_emotions=["happiness", "sadness", "nostalgia", "hope"]
)
```

### Batch Processing

```python
from services.quantum_emotion_pipeline import detect_emotions, generate_embeddings

texts = ["prompt 1", "prompt 2", "prompt 3"]
embeddings = generate_embeddings(texts)  # Batch encode
```

### Adjust Quantum Qubits

```python
from services.quantum_emotion_pipeline import quantum_similarity

# Use more qubits for higher dimensionality
sim = quantum_similarity(emb1, emb2, n_qubits=10)
```

## Troubleshooting

**Issue:** `ModuleNotFoundError: No module named 'transformers'`  
**Fix:** `pip install transformers torch sentence-transformers pennylane`

**Issue:** Models downloading slowly  
**Fix:** Set `HF_HUB_OFFLINE=1` after first download to use cached models

**Issue:** High memory usage  
**Fix:** Reduce `n_qubits` parameter or use smaller sentence transformer model

## License

This pipeline uses:
- GoEmotions: Apache 2.0
- SentenceTransformers: Apache 2.0
- PennyLane: Apache 2.0

All models are open-source and free for commercial use.

## Citation

If you use this pipeline in research:

```bibtex
@misc{smartshelf_quantum_emotion,
  title={Quantum Emotion Analysis Pipeline},
  author={Smart Shelf AI},
  year={2025},
  note={Local emotion analysis using GoEmotions, SentenceTransformers, and PennyLane}
}
```
