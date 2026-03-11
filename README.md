

# Smart Shelf AI: A Quantum-Powered Emotion-Aware Book Recommendation System

Smart Shelf AI is a **100% local, privacy-preserving** full-stack application that recommends books based on nuanced, compound emotions using transformer-based NLP and quantum-inspired similarity. It features a cozy library UI with light/dark mode.

## 🌟 Features
- **Compound Emotion Recognition:** Multi-label emotion detection (e.g., "nostalgic yet hopeful") with intensity scores using GoEmotions (27 emotion classes)
- **Quantum-Powered Recommendation:** Hybrid classical + quantum similarity (PennyLane 6-qubit kernel) for matching user mood to book metadata
- **100% Local Processing:** No external API calls - all book data, covers, and ML models run locally
- **Precomputed Caches:** Book embeddings and quantum similarity angles cached for instant recommendations
- **Cozy Library UI:** High-res blurred library background, theme toggle (light/dark), smooth transitions, and accessible design
- **Local Cover Images:** All book covers served from local SVG files in `frontend/public/covers/`

## 🔒 Privacy & Local-Only Architecture
**Zero external dependencies** - SmartShelf AI runs entirely on your machine:
- ✅ GoEmotions model (local emotion detection)
- ✅ SentenceTransformers (local embeddings via all-MiniLM-L6-v2)
- ✅ PennyLane quantum kernel (local quantum similarity computation)
- ✅ Local book dataset (`backend/data/books_data.json`)
- ✅ Local cover images (`frontend/public/covers/*.svg`)
- ✅ Precomputed caches (`book_embeddings_cache.json`, `quantum_similarity_cache.json`)

**No external APIs used:**
- ❌ No Hardcover API
- ❌ No Goodreads API
- ❌ No external image CDNs
- ❌ No cloud services

## 🔐 Secrets Handling
- Keep secrets in local `.env` files only (`frontend/.env.local`, `backend/.env`)
- Never commit real keys to git
- Optional local encryption workflow is documented in `SECRETS.md`

## 🚀 Quick Start (Local)

### Backend Setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
```

### Start Backend Server
```bash
cd backend
.venv\Scripts\activate
uvicorn app:app --host 127.0.0.1 --port 8000
```

The backend will:
1. Load precomputed caches (`book_embeddings_cache.json`, `quantum_similarity_cache.json`)
2. If caches are missing, it will build them automatically (may take 1-2 minutes on first run)
3. Return `{"ready": true}` at `/ready` when caches are loaded

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173`

## ☁️ Deploy on Render

This repo includes a `render.yaml` blueprint configured for stable first deploys:

- Builds backend and frontend in one service
- Serves built SPA from FastAPI (`frontend/dist`)
- Uses `SKIP_ML=1` by default to avoid startup failures from heavy model downloads
- Uses `/health` for Render health checks

### Steps

1. Push the repository to GitHub.
2. In Render, create a new Blueprint service from the repo.
3. Ensure these env vars are set in Render (as needed by your features):
  - `MONGODB_URI`
  - `JWT_SECRET`
  - `OPENAI_API_KEY`
4. Deploy.

After a successful first deploy, you can set `SKIP_ML=0` only if your plan/resources can handle model loading.

## 📡 API Endpoints

### `/ready` (GET)
Returns server readiness status:
```json
{
  "ready": true,
  "has_embedding_cache": true,
  "has_quantum_cache": true
}
```

### `/api/v1/recommend` (POST)
Returns book recommendations using local quantum-enhanced similarity:
```json
{
  "text": "I want an uplifting, nostalgic book"
}
```

Response includes:
- Top 10 book recommendations with scores
- Cover paths (local `/covers/*.svg`)
- "Why recommended" explanations (generated locally)
- Classical and quantum similarity scores
- User emotion analysis

### `/api/v1/select_book` (POST)
Save a book selection to reading history:
```json
{
  "book_name": "The Midnight Library",
  "genre": "contemporary fiction",
  "theme": "optimism"
}
```

### `/api/v1/analytics` (GET)
Returns reading analytics and personality summary (local-only, no external AI calls)

## 🧪 Running Tests

### Integration Test
```bash
cd backend
.venv\Scripts\activate
python test_integration.py
```

This test validates:
- ✅ Server startup and `/ready` endpoint
- ✅ Recommendation endpoint returns valid JSON
- ✅ All covers are local paths (no external URLs)
- ✅ "Why recommended" explanations are present
- ✅ Book selection and analytics endpoints work

### Quantum Pipeline Test
```bash
cd backend
.venv\Scripts\activate
python test_quantum_pipeline.py
```

## 📁 Project Structure
```
SmartShelf AI/
├── backend/
│   ├── app.py                           # FastAPI server (local-only)
│   ├── data/
│   │   └── books_data.json              # Local book dataset
│   ├── services/
│   │   ├── quantum_emotion_pipeline.py  # GoEmotions + SentenceTransformers + PennyLane
│   │   ├── embedding_cache.py           # Book embeddings cache manager
│   │   ├── quantum_cache.py             # Quantum similarity cache manager
│   │   └── explain_client.py            # Local explanation generator
│   ├── book_embeddings_cache.json       # Precomputed book embeddings
│   ├── quantum_similarity_cache.json    # Precomputed quantum angles
│   ├── test_integration.py              # Integration test suite
│   └── QUANTUM_PIPELINE_README.md       # Detailed ML pipeline docs
├── frontend/
│   ├── public/
│   │   └── covers/                      # Local SVG book covers
│   └── src/
│       ├── App.jsx                      # Main app with /ready polling
│       └── components/
│           └── Recommendations.jsx      # Shows local covers with fallback UI
└── README.md                            # This file
```

## 🎨 UI/UX
- **Cozy library background** (blurred for readability)
- **Theme toggle** (light/dark) with smooth animation and local storage
- **Dodger blue and warm amber palette**, soft shadows, rounded corners
- **Fallback cover UI**: Aesthetic gradient blocks with book titles when covers are missing
- **Local cover images**: All covers served from `frontend/public/covers/` as SVG files

## 🔧 Caching & Performance
- **First run:** 1-2 minutes to build caches (downloads ~200MB of ML models, computes embeddings)
- **Subsequent runs:** <1 second (models and caches loaded from disk)
- **Memory usage:** ~500MB (models in RAM)
- **Offline-ready:** Works without internet after first model download

### Rebuilding Caches
To rebuild caches from scratch:
```bash
cd backend
rm book_embeddings_cache.json quantum_similarity_cache.json
.venv\Scripts\activate
python -c "from services.embedding_cache import build_cache; from services.quantum_cache import build_quantum_cache; from services.quantum_emotion_pipeline import analyze_prompt, generate_embeddings; import json; books = json.load(open('data/books_data.json')); build_cache(books, analyze_prompt, generate_embeddings); build_quantum_cache(books, generate_embeddings)"
```

## 📖 Example Prompts
Try prompts like:
- "nostalgic yet hopeful"
- "anxious but determined"
- "I want an uplifting, romantic book with a happy ending"
- "dark and gritty mafia romance"

## 📚 ML Pipeline
See `backend/QUANTUM_PIPELINE_README.md` for detailed documentation on:
- GoEmotions (27-class emotion classifier)
- SentenceTransformers (384-dim embeddings)
- PennyLane quantum kernel (6-qubit similarity)
- Caching strategy
- API reference

## 🤝 Contributing
This project uses:
- **Backend:** Python 3.10+, FastAPI, transformers, sentence-transformers, PennyLane
- **Frontend:** React, Vite, TailwindCSS, Framer Motion
- **ML Models:** GoEmotions, all-MiniLM-L6-v2 (both Apache 2.0 licensed)

## 📄 License
All models and libraries are open-source (Apache 2.0). See individual component licenses for details.

