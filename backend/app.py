from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import os
from pathlib import Path
from dotenv import load_dotenv
import logging
from datetime import datetime
import re
from typing import Optional, List, Dict, Any

load_dotenv()
# Prevent transformers from importing TensorFlow/Keras (avoid Keras 3 incompatibility)
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to load ML pipeline (quantum emotion analysis)
_ML_AVAILABLE = False
_analyze_prompt = None
_generate_embeddings = None
_quantum_similarity = None

# Allow skipping ML imports/warmup for faster local dev by setting SKIP_ML=1 in the environment
SKIP_ML = os.getenv("SKIP_ML", "0") == "1"
if not SKIP_ML:
    try:
        from services.quantum_emotion_pipeline import analyze_prompt, generate_embeddings, quantum_similarity
        _analyze_prompt = analyze_prompt
        _generate_embeddings = generate_embeddings
        _quantum_similarity = quantum_similarity
        _ML_AVAILABLE = True
        logger.info("✅ ML pipeline loaded successfully - quantum emotion analysis enabled")
    except Exception as e:
        logger.warning(f"⚠️ ML pipeline unavailable, using fallback mode: {e}")
        logger.info("To enable full ML features: pip install tf-keras")
else:
    logger.info("SKIP_ML set — skipping ML pipeline import/warmup for faster startup")

# Optional helpers: db and explain client (no external book APIs allowed)
try:
    # Do not import or use any external hardcover/goodreads clients — all book metadata and covers
    # must come from local files (`backend/data/books_data.json` and `frontend/public/covers`).
    hardcover_client = None
except Exception:
    hardcover_client = None

try:
    from services import explain_client
except Exception:
    explain_client = None

try:
    from services import db as db_client
    db_client.init_db()
except Exception:
    db_client = None

# ── Memory Brain: run migrations and register routes ──
try:
    from database.migrations import run_migrations as _run_memory_migrations
    _run_memory_migrations()
    logger.info("✅ Memory Brain database initialized")
except Exception as _mem_err:
    logger.warning(f"⚠️ Memory Brain DB init failed: {_mem_err}")

try:
    from routes.book_routes import router as book_router
    from routes.user_routes import router as user_router
    from routes.therapist_routes import router as therapist_router
except Exception as _route_err:
    book_router = None
    user_router = None
    therapist_router = None
    logger.warning(f"⚠️ Memory Brain routes failed to import: {_route_err}")

# Load embedding cache if present
book_embedding_cache = {}
try:
    from services.embedding_cache import load_cache
    book_embedding_cache = load_cache()
except Exception:
    book_embedding_cache = {}

# Load quantum cache if present (use v2 enhanced cache)
quantum_cache = {}
try:
    from services.quantum_cache_v2 import load_cache as load_quantum_cache
    from services.quantum_cache_v2 import (
        classical_quantum_similarity,
        load_pca_projection,
        cached_quantum_similarity,
    )
    quantum_cache = load_quantum_cache()
    # Restore PCA projection into the quantum similarity engine
    _pca_proj, _pca_mean = load_pca_projection()
    if _pca_proj is not None:
        from services.quantum_similarity_engine import (
            _projection_matrix as _dummy,
        )
        import services.quantum_similarity_engine as _qse
        _qse._projection_matrix = _pca_proj
        _qse._projection_mean = _pca_mean
        logger.info("PCA projection restored into quantum similarity engine")
except Exception as e:
    logger.warning(f"Quantum cache v2 load warning: {e}")
    quantum_cache = {}

app = FastAPI(title="Smart Shelf AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register Memory Brain routers ──
if book_router is not None:
    app.include_router(book_router)
    logger.info("Registered /books routes (Memory Brain)")
if user_router is not None:
    app.include_router(user_router)
    logger.info("Registered /users routes (Memory Brain)")
if therapist_router is not None:
    app.include_router(therapist_router)
    logger.info("Registered /therapist routes (Phase 3: AI Book Therapist)")

# readiness flag (set to True after ML warmup and cache build)
server_ready = False

# ── In-memory book dataset (loaded ONCE at startup — avoids repeated disk I/O) ──
_BOOKS_DATASET: List[Dict[str, Any]] = []

# --- Mock OTP storage (for dev/testing only) ---
# In-memory stores with short-lived entries; replace with real SMS provider later.
otp_store: dict[str, dict] = {}
verified_sessions: dict[str, dict] = {}
latest_demo_otp: dict[str, str] = {}


def _make_placeholder_cover_dataurl(title: str, author: str = '', width: int = 400, height: int = 600) -> str:
    """Return a data URL containing a simple SVG placeholder for a book cover.

    Using an SVG data URL ensures the frontend receives a local resource (no external fetches).
    """
    try:
        safe_title = (title or 'Book').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        safe_author = (author or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        svg = (
            f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'>"
            "<defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='%23e2e8f0'/><stop offset='1' stop-color='%23c7d2fe'/></linearGradient></defs>"
            f"<rect width='100%' height='100%' fill='url(%23g)' rx='12' ry='12'/>"
            "<rect x='16' y='16' width='368' height='568' fill='rgba(255,255,255,0.06)' rx='8'/>"
            f"<text x='50%' y='45%' font-size='22' fill='%2310231a' text-anchor='middle' font-family='Helvetica, Arial, sans-serif' font-weight='700'>{safe_title}</text>"
            f"<text x='50%' y='55%' font-size='14' fill='%230b1220' text-anchor='middle' font-family='Helvetica, Arial, sans-serif'>{safe_author}</text>"
            "</svg>"
        )
        dataurl = 'data:image/svg+xml;utf8,' + svg
        return dataurl
    except Exception:
        # Fallback to an empty 1x1 gif data url
        return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='


class MoodRequest(BaseModel):
    text: str | None = None


class PromptRequest(BaseModel):
    prompt: str


class LexiChatMessage(BaseModel):
    role: str
    content: str


class LexiBookItem(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    genre: Optional[str] = None
    synopsis: Optional[str] = None
    mood: Optional[str] = None
    tone: Optional[str] = None
    emotion_tags: Optional[List[str]] = None


class LexiChatRequest(BaseModel):
    message: str
    history: List[LexiChatMessage] = Field(default_factory=list)
    currently_reading: List[LexiBookItem] = Field(default_factory=list)
    previous_reads: List[LexiBookItem] = Field(default_factory=list)


class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class DeleteAccountPayload(BaseModel):
    email: str


class RequestOtpPayload(BaseModel):
    phone: str


class VerifyOtpPayload(BaseModel):
    phone: str
    otp: str


class ChangePasswordPayload(BaseModel):
    email: str
    new_password: str
    token: str


def _get_books_dataset() -> List[Dict[str, Any]]:
    """Return the in-memory book dataset, loading from disk if not yet cached."""
    global _BOOKS_DATASET
    if _BOOKS_DATASET:
        return _BOOKS_DATASET
    import json as _json
    books_path = Path(__file__).parent / "data" / "books_data.json"
    if books_path.exists():
        with open(books_path, "r", encoding="utf-8") as f:
            _BOOKS_DATASET = _json.load(f)
        logger.info(f"📚 Loaded {len(_BOOKS_DATASET)} books from dataset into memory")
    return _BOOKS_DATASET


def _load_books_dataset() -> List[Dict[str, Any]]:
    """Alias kept for backward-compat with lexi-chat. Uses cached dataset."""
    return _get_books_dataset()


# ── Personality Match Helpers ──────────────────────────────────────────────


def _derive_user_personality_vector(text: str, compound_emotions: Optional[Dict] = None) -> List[float]:
    """Derive a 5-dim Big-5 personality vector from query text + detected emotions.

    Dimensions: [Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism]
    """
    openness_w = {"curious", "wonder", "creative", "adventure", "explore", "discover",
                  "fantasy", "imagination", "mystery", "learn", "magical", "philosophy"}
    conscientiousness_w = {"discipline", "study", "productive", "focus", "goal", "success",
                           "achieve", "work", "organize", "plan", "structured", "strategy"}
    extraversion_w = {"exciting", "fun", "social", "energy", "action", "thrilling",
                      "adventure", "bold", "confident", "lively", "vibrant", "charismatic"}
    agreeableness_w = {"love", "romance", "care", "empathy", "family", "friendship",
                       "warm", "kind", "help", "support", "compassion", "tenderness"}
    neuroticism_w = {"anxiety", "sad", "fear", "dark", "tense", "suspense",
                     "stress", "worry", "lonely", "grief", "trauma", "tension"}

    tokens = set(re.findall(r"\w+", (text or "").lower()))
    dims = [openness_w, conscientiousness_w, extraversion_w, agreeableness_w, neuroticism_w]
    vec = [0.5, 0.5, 0.5, 0.5, 0.5]
    for i, dim_words in enumerate(dims):
        hits = len(tokens & dim_words)
        vec[i] = min(0.9, 0.5 + hits * 0.1)

    # Refine using emotion analysis if available
    if compound_emotions:
        emotion_map = {
            "curiosity": (0, 0.15), "admiration": (0, 0.10),
            "pride": (1, 0.10), "approval": (1, 0.10),
            "excitement": (2, 0.15), "joy": (2, 0.10),
            "love": (3, 0.15), "gratitude": (3, 0.10),
            "sadness": (4, 0.15), "fear": (4, 0.10), "anger": (4, 0.05),
        }
        for emotion, (dim, weight) in emotion_map.items():
            if emotion in compound_emotions:
                vec[dim] = min(0.9, vec[dim] + weight * float(compound_emotions[emotion]))

    return vec


def _compute_personality_match(user_vector: List[float], book_vector: List[float]) -> float:
    """Cosine similarity between user and book personality vectors.

    Returns a score scaled to a realistic display range of 60–95%, rounded to 1 dp.
    This guarantees the field is never 0.0 and varies meaningfully across books.
    """
    import numpy as np
    u = np.array(user_vector, dtype=np.float64)
    b = np.array(book_vector, dtype=np.float64)
    norm_u = np.linalg.norm(u)
    norm_b = np.linalg.norm(b)
    if norm_u < 1e-10 or norm_b < 1e-10:
        return 70.0
    cosine_sim = float(np.dot(u, b) / (norm_u * norm_b))
    # Map cosine similarity [0..1] → display range [60..95]
    score = 60.0 + cosine_sim * 35.0
    return round(min(max(score, 60.0), 95.0), 1)


# ── Query-based genre/tag filtering ────────────────────────────────────────


def _filter_books_by_query(books: List[Dict[str, Any]], query: str) -> List[Dict[str, Any]]:
    """Pre-filter books by genre / embedding_tags before ML scoring.

    Prevents off-topic books (e.g. romance) appearing when user asks for
    'psychological thriller'.  Only applies the filter when ≥3 matches exist
    so we never return an empty list due to an overly strict filter.
    """
    if not query:
        return books

    query_lower = query.lower()
    query_tokens = set(re.findall(r"\w+", query_lower))

    # Genre keyword groups — tokens that strongly signal a genre
    genre_clusters: Dict[str, set] = {
        "thriller":   {"thriller", "suspense", "crime", "psychological", "mystery", "detective"},
        "romance":    {"romance", "romantic", "love", "relationship", "contemporary"},
        "fantasy":    {"fantasy", "magic", "wizard", "dragon", "fairy", "epic"},
        "scifi":      {"scifi", "sci", "space", "robot", "future", "dystopia", "cyberpunk"},
        "horror":     {"horror", "scary", "dark", "ghost", "supernatural", "creepy"},
        "mystery":    {"mystery", "detective", "investigation", "whodunit", "noir"},
        "historical": {"historical", "history", "war", "period", "medieval", "ancient"},
        "self_help":  {"selfhelp", "mindset", "productivity", "habits", "motivation"},
        "educational":{"educational", "learn", "academic", "study", "textbook"},
    }

    matched_filter_tokens: set = set()
    for _cluster_name, keywords in genre_clusters.items():
        if query_tokens & keywords:
            matched_filter_tokens.update(keywords)
            matched_filter_tokens.update(query_tokens & keywords)

    if not matched_filter_tokens:
        return books  # No strong genre signal — return full set

    # Allow query tokens that aren't purely stop-words to contribute too
    stop_words = {"a", "an", "the", "for", "and", "or", "i", "want", "book", "books",
                  "read", "reading", "something", "me", "give", "suggest", "show"}
    meaningful_query_tokens = {t for t in query_tokens if len(t) > 3 and t not in stop_words}
    filter_tokens = matched_filter_tokens | meaningful_query_tokens

    filtered = []
    for book in books:
        genre_str = (book.get("genre") or "").lower()
        etags = [t.lower() for t in (book.get("embedding_tags") or [])]
        book_type = (book.get("type") or "").lower()
        book_tokens = set(re.findall(r"\w+", f"{genre_str} {' '.join(etags)} {book_type}"))
        if filter_tokens & book_tokens:
            filtered.append(book)

    if len(filtered) >= 3:
        logger.info(f"🔍 Query filter: {len(filtered)}/{len(books)} books matched genre/tag tokens")
        return filtered

    logger.info(f"⚠️  Query filter too restrictive ({len(filtered)} hits) — returning full set of {len(books)}")
    return books


def _tokenize_text(value: str) -> set[str]:
    if not value:
        return set()
    return set(re.findall(r"\w+", value.lower()))


def _detect_requested_book_type(prompt: str) -> Optional[str]:
    """Detect whether the user explicitly asked for a specific book type.

    Returns one of: "educational", "fiction", "self-help", or None.
    """
    if not prompt:
        return None

    normalized = prompt.lower()

    educational_terms = {
        "educational", "education", "learn", "learning", "study", "studying",
        "textbook", "academic", "course", "curriculum", "teaching",
    }
    self_help_terms = {
        "self-help", "self help", "selfhelp", "motivational", "mindset",
        "personal growth", "productivity", "habit", "habits", "wellness",
    }
    fiction_terms = {
        "fiction", "novel", "novels", "story", "stories", "fantasy",
        "romance", "thriller", "mystery", "sci-fi", "scifi", "literary fiction",
    }

    # Prefer exact phrase checks first for multi-word phrases.
    if any(term in normalized for term in educational_terms):
        return "educational"
    if any(term in normalized for term in self_help_terms):
        return "self-help"
    if any(term in normalized for term in fiction_terms):
        return "fiction"

    return None


def _retrieve_relevant_books(user_message: str, books: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
    query_tokens = _tokenize_text(user_message)
    if not query_tokens:
        return []

    scored = []
    for book in books:
        title = book.get("title", "")
        author = book.get("author", "")
        genre = book.get("genre", "")
        synopsis = book.get("synopsis", "")
        mood = book.get("mood", "")
        tone = book.get("tone", "")
        tags = " ".join(book.get("emotion_tags", []) or [])

        haystack = f"{title} {author} {genre} {synopsis} {mood} {tone} {tags}"
        book_tokens = _tokenize_text(haystack)
        if not book_tokens:
            continue

        overlap = len(query_tokens & book_tokens)
        if overlap <= 0:
            continue

        title_author_bonus = 0
        title_tokens = _tokenize_text(title)
        author_tokens = _tokenize_text(author)
        if query_tokens & title_tokens:
            title_author_bonus += 3
        if query_tokens & author_tokens:
            title_author_bonus += 2

        score = overlap + title_author_bonus
        scored.append((score, book))

    scored.sort(key=lambda row: row[0], reverse=True)
    unique = []
    seen = set()
    for _, book in scored:
        key = (book.get("title"), book.get("author"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(book)
        if len(unique) >= top_k:
            break
    return unique


# Warmup quantum emotion pipeline on startup (if available)
@app.on_event("startup")
async def startup_event():
    logger.info("Starting Smart Shelf AI backend...")
    # Load caches from disk so backend can be ready immediately for local-only usage.
    # If ML pipeline is enabled and caches are missing, we attempt to build them
    # synchronously so /ready returns true only after caches are present.
    try:
        from services.embedding_cache import load_cache as load_embedding_cache
        from services.quantum_cache import load_cache as load_quantum_cache
    except Exception:
        load_embedding_cache = None
        load_quantum_cache = None

    global book_embedding_cache, quantum_cache, server_ready, _BOOKS_DATASET

    # ── Load books dataset into memory FIRST (fast, ~1 ms) ──
    try:
        import json as _json
        _bp = Path(__file__).parent / "data" / "books_data.json"
        if _bp.exists():
            with open(_bp, "r", encoding="utf-8") as _f:
                _BOOKS_DATASET = _json.load(_f)
            logger.info(f"✅ Dataset loaded: {len(_BOOKS_DATASET)} books cached in memory")
        else:
            logger.warning("⚠️  books_data.json not found — dataset will be empty")
    except Exception as _ds_err:
        logger.error(f"❌ Failed to load books dataset: {_ds_err}")

    # Try loading caches from disk
    try:
        if load_embedding_cache is not None:
            book_embedding_cache = load_embedding_cache() or {}
        if load_quantum_cache is not None:
            quantum_cache = load_quantum_cache() or {}
    except Exception as e:
        logger.warning(f"Error loading caches at startup: {e}")

    # If ML is enabled and caches are missing, build them synchronously so the server is fully ready.
    if _ML_AVAILABLE and (not book_embedding_cache or not quantum_cache):
        try:
            from services.quantum_emotion_pipeline import warmup, generate_embeddings, analyze_prompt
            from services.embedding_cache import build_cache
            from services.quantum_cache_v2 import build_quantum_cache, save_pca_projection, load_pca_projection
            import json

            logger.info("ML pipeline enabled — warming up and (re)building caches...")
            try:
                warmup()
            except Exception as e:
                logger.warning(f"warmup() failed: {e}")

            # Reuse the already-loaded in-memory dataset (avoid second disk read)
            books = _BOOKS_DATASET or []
            if not books:
                books_path = Path(__file__).parent / "data" / "books_data.json"
                with open(books_path, 'r', encoding='utf-8') as f:
                    books = json.load(f)

            if not book_embedding_cache:
                logger.info("Building book embeddings cache (this may take a while)...")
                book_embedding_cache = build_cache(books, analyze_prompt, generate_embeddings)
                logger.info(f"Book embeddings cache built with {len(book_embedding_cache)} entries")

            if not quantum_cache:
                logger.info("Building enhanced quantum similarity cache (8 qubits, IQP kernel)...")
                quantum_cache = build_quantum_cache(books, generate_embeddings, n_qubits=8)
                logger.info(f"Quantum cache built with {len(quantum_cache)} entries")

            # Ensure PCA projection is loaded into engine after cache build
            try:
                import services.quantum_similarity_engine as _qse
                _p, _m = load_pca_projection()
                if _p is not None:
                    _qse._projection_matrix = _p
                    _qse._projection_mean = _m
            except Exception:
                pass

        except Exception as e:
            logger.warning(f"Could not warmup or build caches synchronously: {e}")
    else:
        logger.info("ML pipeline disabled or caches already present — skipping synchronous build")

    # mark server ready now that caches have been loaded/built
    server_ready = True
    logger.info("Server marked ready (caches loaded)")


# ------------------------ Auth Endpoints (Local Only) ------------------------

def _is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email or ""))


def _is_valid_password(pw: str) -> Optional[str]:
    if not pw or len(pw) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        return "Password must include letters and numbers."
    return None


@app.post("/auth/register")
def register_user(payload: RegisterRequest):
    logger.info(f"Register request received for email: {payload.email}")
    
    if not _is_valid_email(payload.email):
        logger.warning(f"Invalid email format: {payload.email}")
        return {"status": "error", "error": "Invalid email address"}
    
    pw_err = _is_valid_password(payload.password)
    if pw_err:
        logger.warning(f"Invalid password for {payload.email}: {pw_err}")
        return {"status": "error", "error": pw_err}

    try:
        from services import db as db_client
        from passlib.context import CryptContext
        # Use pbkdf2_sha256 for wide compatibility (no external binaries) and strong hashing
        pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

        existing = db_client.get_user_by_email(payload.email)
        if existing:
            logger.warning(f"Registration attempt with existing email: {payload.email}")
            return {"status": "error", "error": "Email already registered"}

        pw_hash = pwd_ctx.hash(payload.password)
        db_client.add_user(payload.email, pw_hash)
        logger.info(f"✅ Registered new user successfully: {payload.email}")
        return {"status": "ok", "user": {"email": payload.email, "id": payload.email}}
    except Exception as e:
        logger.error(f"❌ Register error for {payload.email}: {str(e)}", exc_info=True)
        return {"status": "error", "error": str(e)}


@app.post("/auth/login")
def login_user(payload: LoginRequest):
    logger.info(f"Login request received for email: {payload.email}")
    
    if not _is_valid_email(payload.email):
        logger.warning(f"Invalid email format for login: {payload.email}")
        return {"status": "error", "error": "Invalid email or password"}
    try:
        from services import db as db_client
        from passlib.context import CryptContext
        pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

        user = db_client.get_user_by_email(payload.email)
        if not user:
            logger.warning(f"Login attempt with non-existent email: {payload.email}")
            return {"status": "error", "error": "Invalid email or password"}
        if not pwd_ctx.verify(payload.password, user.get("password_hash")):
            logger.warning(f"Login failed for {payload.email}: invalid password")
            return {"status": "error", "error": "Invalid email or password"}

        # Minimal token for client-side storage; not used by backend auth yet
        import secrets
        token = secrets.token_urlsafe(24)
        logger.info(f"✅ Login successful for: {payload.email}")
        return {"status": "ok", "user": {"email": user.get("email"), "id": user.get("id")}, "token": token}
    except Exception as e:
        logger.error(f"❌ Login error for {payload.email}: {str(e)}", exc_info=True)
        return {"status": "error", "error": str(e)}


@app.delete("/auth/delete")
def delete_user_account(payload: DeleteAccountPayload):
    """Delete user account and all associated data."""
    try:
        from services import db as db_client
        
        # Verify user exists
        user = db_client.get_user_by_email(payload.email)
        if not user:
            return {"status": "error", "error": "User not found"}
        
        # Delete user from database
        db_client.delete_user(payload.email)
        
        return {"status": "ok", "message": "Account deleted successfully"}
    except Exception as e:
        logger.error(f"Delete account error: {e}")
        return {"status": "error", "error": str(e)}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    """Return whether the backend has finished ML warmup and cache building.

    Frontend can poll this endpoint and wait until ready==true before requesting heavy endpoints.
    """
    return {"ready": bool(server_ready), "has_embedding_cache": bool(book_embedding_cache), "has_quantum_cache": bool(quantum_cache)}

# ------------------------ Mock OTP + Password Change ------------------------

@app.post("/auth/request-otp")
def request_otp(payload: RequestOtpPayload):
    """Generate a random 6-digit OTP for the provided phone number and store temporarily.
    No SMS is sent; OTP is logged to the backend console for testing.
    """
    import random, time
    phone = (payload.phone or "").strip()
    if not phone:
        return {"status": "error", "error": "Phone number is required"}
    otp = f"{random.randint(0, 999999):06d}"
    otp_store[phone] = {"otp": otp, "ts": time.time()}
    latest_demo_otp["phone"] = phone
    latest_demo_otp["otp"] = otp
    latest_demo_otp["generated_at"] = datetime.utcnow().isoformat()
    logger.warning(f"[DEMO OTP] Phone={phone} OTP={otp}")
    print("\n" + "=" * 62, flush=True)
    print(f"[DEMO OTP GENERATED] Phone: {phone}", flush=True)
    print(f"[DEMO OTP GENERATED] OTP  : {otp}", flush=True)
    print("=" * 62 + "\n", flush=True)
    return {"status": "ok", "message": "OTP generated in backend terminal for demo."}


@app.get("/auth/latest-otp")
def get_latest_otp():
    if not latest_demo_otp:
        return {"status": "ok", "has_otp": False}
    return {
        "status": "ok",
        "has_otp": True,
        "phone": latest_demo_otp.get("phone"),
        "otp": latest_demo_otp.get("otp"),
        "generated_at": latest_demo_otp.get("generated_at"),
    }


@app.post("/auth/verify-otp")
def verify_otp(payload: VerifyOtpPayload):
    import time, secrets
    phone = (payload.phone or "").strip()
    entered_otp = (payload.otp or "").strip()
    if not entered_otp.isdigit() or len(entered_otp) != 6:
        return {"status": "error", "error": "OTP must be a 6-digit code"}
    entry = otp_store.get(phone)
    if not entry or entry.get("otp") != entered_otp:
        return {"status": "error", "error": "Invalid OTP"}
    # Optional: expire OTP after 5 minutes
    if time.time() - float(entry.get("ts", 0)) > 300:
        otp_store.pop(phone, None)
        return {"status": "error", "error": "OTP expired"}
    # Mark verified by issuing a short-lived session token
    token = secrets.token_urlsafe(16)
    verified_sessions[token] = {"phone": phone, "ts": time.time()}
    # Clear OTP so it cannot be reused
    otp_store.pop(phone, None)
    return {"status": "ok", "token": token}


@app.post("/auth/change-password")
def change_password(payload: ChangePasswordPayload):
    """Change the user's password after OTP verification.
    Requires a valid verification token from /auth/verify-otp.
    """
    # Validate token exists and is fresh
    import time
    session = verified_sessions.get(payload.token)
    if not session:
        return {"status": "error", "error": "OTP verification required"}
    if time.time() - float(session.get("ts", 0)) > 600:
        verified_sessions.pop(payload.token, None)
        return {"status": "error", "error": "Verification session expired"}

    pw_err = _is_valid_password(payload.new_password)
    if pw_err:
        return {"status": "error", "error": pw_err}

    try:
        from services import db as db_client
        from passlib.context import CryptContext
        pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

        pw_hash = pwd_ctx.hash(payload.new_password)

        # Upsert semantics: if user does not exist yet (e.g., OAuth-only flow),
        # create a local credential record so login with new password works.
        user = db_client.get_user_by_email(payload.email)
        if user:
            updated = db_client.update_user_password(payload.email, pw_hash)
            if not updated:
                return {"status": "error", "error": "Password update failed"}
        else:
            db_client.add_user(payload.email, pw_hash)

        # Read-after-write verification to guarantee login will work.
        persisted = db_client.get_user_by_email(payload.email)
        if not persisted or not persisted.get("password_hash"):
            return {"status": "error", "error": "Password update failed: no stored credentials"}
        if not pwd_ctx.verify(payload.new_password, persisted.get("password_hash")):
            return {"status": "error", "error": "Password update failed: verification mismatch"}

        # Invalidate session token after successful change
        verified_sessions.pop(payload.token, None)
        logger.info(f"Password updated successfully for user: {payload.email}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Change password error: {e}")
        return {"status": "error", "error": str(e)}
@app.post("/api/v1/recommend")
async def recommend(mood: MoodRequest):
    """
    Local book recommendation endpoint.
    Uses enhanced quantum emotion pipeline + local book dataset.
    NO external APIs - fully local processing.

    Latency optimizations:
      • Vectorized cosine similarity (single NumPy matmul)
      • Batch quantum similarity via pre-computed IQP kernel features
      • Classical approximation of quantum kernel when cache available (<1ms)
      • Pre-compiled PennyLane QNodes (no per-request device creation)
      • CPU-bound work offloaded to thread pool
    """
    try:
        import time as _time

        t_start = _time.perf_counter()
        text = mood.text or ""
        logger.info(f"🔎 Recommendation request: '{text[:80]}'")

        # ── Use in-memory dataset (loaded once at startup) ──
        books = list(_get_books_dataset())
        if not books:
            logger.error("Books dataset is empty — check books_data.json")
            return {"error": "Local book dataset not found", "recommendations": []}

        logger.info(f"📚 Dataset: {len(books)} books available")

        # ── Step 1: filter by explicit book type ──
        requested_type = _detect_requested_book_type(text)
        if requested_type:
            books = [b for b in books if b.get("type") == requested_type]
            logger.info(f"Type filter '{requested_type}': {len(books)} candidates")

        # ── Step 2: filter by genre / embedding_tags before ML scoring ──
        books = _filter_books_by_query(books, text)
        logger.info(f"After query filter: {len(books)} candidate books")

        if not books:
            logger.warning("No books available after applying requested type filter")
            return {
                "recommendations": [],
                "user_emotions": {},
                "analysis_method": "local_quantum_hybrid",
                "quantum_method": "none",
                "latency_ms": 0.0,
            }

        # Analyze user's emotional prompt (if models available).
        # Run heavy ML work in background threads to avoid blocking the event loop.
        import asyncio
        import numpy as np

        if _ML_AVAILABLE:
            try:
                user_analysis = await asyncio.to_thread(_analyze_prompt, text)
            except Exception as e:
                logger.warning(f"analyze_prompt failed: {e}")
                user_analysis = {"compound_emotions": {}}

            try:
                user_embeddings = await asyncio.to_thread(_generate_embeddings, [text])
                user_embedding = np.asarray(user_embeddings[0], dtype=np.float64)
            except Exception as e:
                logger.warning(f"generate_embeddings failed: {e}")
                user_embedding = None
        else:
            user_analysis = {"compound_emotions": {}}
            user_embedding = None

        # ── Derive user personality vector from text + detected emotions ──
        user_personality_vector = _derive_user_personality_vector(
            text, user_analysis.get("compound_emotions", {})
        )
        logger.info(f"👤 User personality vector: {[round(v,2) for v in user_personality_vector]}")

        # Calculate similarity for each book
        recommendations = []
        book_descriptions = [
            f"{book.get('title', '')} {book.get('author', '')} "
            f"{book.get('synopsis', '')} {book.get('mood', '')} {book.get('tone', '')}"
            for book in books
        ]

        if _ML_AVAILABLE and user_embedding is not None:
            # ---- Load book embeddings (prefer cache) ----
            book_embeddings_matrix = None
            try:
                if book_embedding_cache and len(book_embedding_cache) >= len(books):
                    cached = []
                    all_found = True
                    for i in range(len(books)):
                        entry = book_embedding_cache.get(str(i))
                        if entry and entry.get('embedding') is not None:
                            cached.append(np.array(entry['embedding'], dtype=np.float64))
                        else:
                            all_found = False
                            break
                    if all_found:
                        book_embeddings_matrix = np.array(cached)  # (N, 384)

                if book_embeddings_matrix is None:
                    raw = await asyncio.to_thread(_generate_embeddings, book_descriptions)
                    book_embeddings_matrix = np.array(raw, dtype=np.float64)
            except Exception as e:
                logger.warning(f"generate_embeddings for books failed: {e}")
                book_embeddings_matrix = None

            if book_embeddings_matrix is not None:
                n_books = book_embeddings_matrix.shape[0]

                # ---- Vectorized cosine similarity (one matmul) ----
                user_norm = user_embedding / (np.linalg.norm(user_embedding) + 1e-10)
                book_norms = book_embeddings_matrix / (
                    np.linalg.norm(book_embeddings_matrix, axis=1, keepdims=True) + 1e-10
                )
                cosine_scores = book_norms @ user_norm  # (N,)

                # ---- Quantum similarity (batch, optimized) ----
                quantum_scores = np.zeros(n_books, dtype=np.float64)
                quantum_method = "none"
                try:
                    if quantum_cache and len(quantum_cache) >= n_books:
                        # Ultra-fast path: use pre-computed quantum features + classical approximation
                        from services.quantum_similarity_engine import (
                            pca_reduce,
                            scale_for_quantum,
                        )
                        from services.quantum_cache_v2 import cached_quantum_similarity

                        user_reduced = pca_reduce(user_embedding, 8)
                        user_features = scale_for_quantum(user_reduced)

                        quantum_scores = await asyncio.to_thread(
                            cached_quantum_similarity,
                            user_features,
                            quantum_cache,
                            n_books,
                            True,  # use_approximation=True for speed
                        )
                        quantum_method = "cached_iqp_approximation"
                    else:
                        # Full PennyLane circuit execution (batch)
                        from services.quantum_similarity_engine import batch_quantum_similarity

                        quantum_scores = await asyncio.to_thread(
                            batch_quantum_similarity,
                            user_embedding,
                            book_embeddings_matrix,
                            8,  # n_qubits
                            2,  # n_layers
                        )
                        quantum_method = "pennylane_iqp_circuit"
                except Exception as e:
                    logger.warning(f"Quantum similarity batch failed: {e}")
                    quantum_scores = np.zeros(n_books, dtype=np.float64)
                    quantum_method = "failed_fallback_zero"

                # ---- Hybrid scoring ----
                hybrid_scores = 0.65 * cosine_scores + 0.35 * quantum_scores

                for idx, book in enumerate(books):
                    recommendations.append({
                        "title": book.get("title"),
                        "author": book.get("author"),
                        "cover": book.get("cover"),
                        "synopsis": book.get("synopsis"),
                        "genre": book.get("genre"),
                        "type": book["type"],
                        "emotion_tags": book.get("emotion_tags", []),
                        "mood": book.get("mood"),
                        "tone": book.get("tone"),
                        "pacing": book.get("pacing"),
                        "personality_vector": book.get("personality_vector", []),
                        "score": float(hybrid_scores[idx]),
                        "matchScore": float(hybrid_scores[idx]),
                        "classical_similarity": float(cosine_scores[idx]),
                        "quantum_similarity": float(quantum_scores[idx]),
                    })
            else:
                # Embeddings unavailable — zero scores
                for book in books:
                    recommendations.append({
                        "title": book.get("title"),
                        "author": book.get("author"),
                        "cover": book.get("cover"),
                        "synopsis": book.get("synopsis"),
                        "genre": book.get("genre"),
                        "type": book["type"],
                        "emotion_tags": book.get("emotion_tags", []),
                        "mood": book.get("mood"),
                        "tone": book.get("tone"),
                        "pacing": book.get("pacing"),
                        "personality_vector": book.get("personality_vector", []),
                        "score": 0.0,
                        "matchScore": 0.0,
                        "classical_similarity": 0.0,
                        "quantum_similarity": 0.0,
                    })
                quantum_method = "none_no_embeddings"
        else:
            # Fallback lightweight path (no ML)
            quantum_method = "fallback_token_overlap"
            from services.fallback_utils import fallback_recommend_similarity
            for idx, book in enumerate(books):
                book_description = book_descriptions[idx]
                classical_sim = fallback_recommend_similarity(text, book_description)
                recommendations.append({
                    "title": book.get("title"),
                    "author": book.get("author"),
                    "cover": book.get("cover"),
                    "synopsis": book.get("synopsis"),
                    "genre": book.get("genre"),
                    "type": book["type"],
                    "emotion_tags": book.get("emotion_tags", []),
                    "mood": book.get("mood"),
                    "tone": book.get("tone"),
                    "pacing": book.get("pacing"),
                    "personality_vector": book.get("personality_vector", []),
                    "score": float(classical_sim),
                    "matchScore": float(classical_sim),
                    "classical_similarity": float(classical_sim),
                    "quantum_similarity": 0.0,
                })

        # Sort by matchScore descending (strict)
        recommendations.sort(key=lambda x: x["matchScore"], reverse=True)

        # ── Compute personality match for every candidate ──
        for rec in recommendations:
            book_pv = rec.get("personality_vector") or [0.5, 0.5, 0.5, 0.5, 0.5]
            rec["personality_match"] = _compute_personality_match(user_personality_vector, book_pv)

        if recommendations:
            scores_sample = [r["personality_match"] for r in recommendations[:5]]
            logger.info(f"🧬 Personality match scores (top 5): {scores_sample}")

        # Enrich top recommendations with cover images and explanation
        enriched = []
        for book in recommendations[:10]:
            cover = book.get("cover")
            book["cover"] = cover

            reason = None
            try:
                if explain_client is not None:
                    reason = explain_client.explain_reason(mood.text or "", book)
            except Exception:
                reason = None
            book["reason"] = reason
            logger.debug(
                f"  📖 {book.get('title')} | match={book.get('matchScore', 0):.3f} "
                f"personality={book.get('personality_match')}%"
            )
            enriched.append(book)

        elapsed_ms = (_time.perf_counter() - t_start) * 1000
        logger.info(
            f"Returning {len(enriched)} recommendations in {elapsed_ms:.0f}ms "
            f"(quantum_method={quantum_method})"
        )
        return {
            "recommendations": enriched,
            "user_emotions": user_analysis["compound_emotions"],
            "analysis_method": "local_quantum_hybrid",
            "quantum_method": quantum_method,
            "latency_ms": round(elapsed_ms, 1),
        }

    except Exception as e:
        logger.error(f"Error in recommendation: {e}")
        return {
            "error": str(e),
            "details": "Failed to generate recommendations",
            "recommendations": []
        }



@app.post("/api/v1/select_book")
async def select_book(payload: dict):
    """Store a user selection (book chosen to read) into persistent storage.

    Expected JSON fields: book_name, genre, theme (optional).
    """
    try:
        book_name = payload.get("book_name") or payload.get("title")
        genre = payload.get("genre")
        theme = payload.get("theme") or (payload.get("emotion_tags") or [None])[0]
        ts = datetime.utcnow().isoformat()
        if db_client is None:
            logger.warning("DB client not available; selection will not be persisted")
            return {"status": "ok", "message": "selection received (no DB configured)"}

        db_client.add_previous_book(book_name, genre, theme, ts)
        return {"status": "ok", "message": "book selection saved"}
    except Exception as e:
        logger.error(f"Error saving selection: {e}")
        return {"status": "error", "error": str(e)}


@app.get("/api/v1/history")
def get_history(limit: int = 100):
    if db_client is None:
        return {"history": []}
    return {"history": db_client.get_history(limit)}


@app.get("/api/v1/analytics")
def get_analytics():
    if db_client is None:
        return {"analytics": {}}
    analytics = db_client.get_analytics()

    # Personality summary (attempt AI-generated short paragraph)
    personality = None
    try:
        if explain_client is not None:
            # Use local-only personality summary helper (no external APIs)
            personality = explain_client.personality_summary_from_analytics(analytics)
    except Exception:
        personality = None

    return {
        "analytics": analytics,
        "personality_summary": personality
    }


@app.post("/api/v1/lexi-chat")
async def lexi_chat(payload: LexiChatRequest):
    """
    Groq-backed Lexi chat endpoint.
    Retrieves relevant local book context first, then asks Groq to answer in Lexi's style.
    """
    try:
        from services import groq_client

        user_message = (payload.message or "").strip()
        if not user_message:
            return {"error": "message is required", "reply": ""}

        if not groq_client.is_configured():
            raise HTTPException(status_code=503, detail="GROQ_API_KEY is not configured on the backend")

        books = _load_books_dataset()
        retrieved = _retrieve_relevant_books(user_message, books, top_k=5)

        normalized_retrieved = [
            {
                "title": b.get("title"),
                "author": b.get("author"),
                "genre": b.get("genre"),
                "synopsis": b.get("synopsis"),
                "mood": b.get("mood"),
                "tone": b.get("tone"),
                "emotion_tags": b.get("emotion_tags", []),
            }
            for b in retrieved
        ]

        def _to_dict(item: Any) -> Dict[str, Any]:
            if hasattr(item, "model_dump"):
                return item.model_dump()
            if hasattr(item, "dict"):
                return item.dict()
            return dict(item)

        user_books_context = {
            "currently_reading": [_to_dict(item) for item in payload.currently_reading[:10]],
            "previous_reads": [_to_dict(item) for item in payload.previous_reads[:20]],
        }

        system_prompt = (
            "You are Q Lexi, a friendly and modern book assistant. "
            "Answer with real, accurate book information based on the provided retrieved context. "
            "If the requested fact is missing from context, say you don't have that detail instead of inventing it. "
            "Style: warm, slightly playful, concise, supportive. "
            "Always prefer factual correctness over creativity. "
            "When possible, mention title and author clearly."
        )

        context_prompt = (
            f"User message:\n{user_message}\n\n"
            f"Retrieved books context (authoritative):\n{normalized_retrieved}\n\n"
            f"User bookshelf context:\n{user_books_context}\n\n"
            "Instructions: give the best answer grounded in the retrieved context. "
            "If user asks for recommendations while chatting, suggest 2-4 relevant titles from retrieved books."
        )

        prior_history = payload.history[-8:] if payload.history else []
        messages = [{"role": "system", "content": system_prompt}]
        for msg in prior_history:
            role = (msg.role or "user").lower()
            if role not in {"user", "assistant", "system"}:
                role = "user"
            messages.append({"role": role, "content": msg.content})
        messages.append({"role": "user", "content": context_prompt})

        response = groq_client.chat_completion(messages=messages, temperature=0.5)
        choice = (response.get("choices") or [{}])[0]
        message = (choice.get("message") or {})
        reply = (message.get("content") or "").strip()

        if not reply:
            reply = "I couldn't generate a response right now. Try asking about a specific title or author."

        return {
            "reply": reply,
            "retrieved_books": normalized_retrieved,
            "model": groq_client.GROQ_MODEL,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lexi chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Lexi chat failed: {e}")


@app.post("/api/v1/analyze_emotion")
async def analyze_emotion(payload: PromptRequest):
    """
    Quantum emotion analysis endpoint.
    Analyzes text using local GoEmotions + SentenceTransformers + PennyLane quantum kernel.
    
    Returns compound emotions and quantum similarity scores.
    Fully local - no external API calls.
    """
    try:
        from services.quantum_emotion_pipeline import analyze_prompt
        
        prompt = payload.prompt
        logger.info(f"Analyzing emotion for prompt: '{prompt[:50]}...'")
        
        # Run complete analysis pipeline
        result = analyze_prompt(prompt)
        
        # Format response
        return {
            "prompt": prompt,
            "compound_emotions": result["compound_emotions"],
            "quantum_similarities": result["quantum_similarities"],
            "top_emotion": result["top_emotion"],
            "emotion_count": result["emotion_count"],
            "analysis_method": "local_quantum_pipeline"
        }
    except Exception as e:
        logger.error(f"Error in emotion analysis: {e}")
        return {
            "error": str(e),
            "prompt": payload.prompt,
            "compound_emotions": {},
            "quantum_similarities": {}
        }


@app.get("/api/v1/quantum_info")
def quantum_info():
    """Return diagnostic info about the quantum similarity engine."""
    info = {
        "ml_available": _ML_AVAILABLE,
        "quantum_cache_size": len(quantum_cache),
        "embedding_cache_size": len(book_embedding_cache),
    }
    try:
        from services.quantum_similarity_engine import get_engine_info
        info["engine"] = get_engine_info()
    except Exception as e:
        info["engine"] = {"error": str(e)}
    return info


@app.get("/api/v1/download/{filename}")
async def download_book(filename: str, request: Request):
    """Serve downloadable book files (PDFs) with correct Content-Disposition header.

    Files are served from frontend/dist/assets/ (populated from frontend/public/assets/).
    Example: GET /api/v1/download/Building%20AI%20Agents.pdf

    NOTE: Ensure PDF files are placed in frontend/public/assets/ before running
    `npm run build` so they are included in the dist output.
    """
    # Prevent path traversal
    safe_name = Path(filename).name
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Search in frontend/dist/assets (production build) and frontend/public/assets (dev)
    candidates = [
        _FRONTEND_DIR / "assets" / safe_name,
        Path(__file__).resolve().parent.parent / "frontend" / "public" / "assets" / safe_name,
    ]
    file_path = next((p for p in candidates if p.is_file()), None)

    if file_path is None:
        logger.warning(f"Download requested for missing file: {safe_name}")
        raise HTTPException(status_code=404, detail=f"File '{safe_name}' not found")

    logger.info(f"📥 Download: {safe_name} from {file_path}")
    return FileResponse(
        str(file_path),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


# ══════════════════════════════════════════════════════════
#  Serve the built React SPA (frontend/dist) in production
# ══════════════════════════════════════════════════════════
_FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if _FRONTEND_DIR.is_dir():
    # ── Static asset mounts ──────────────────────────────────────────────────
    # /assets  → JS, CSS, images, videos, PDFs (Vite builds here)
    _assets_dir = _FRONTEND_DIR / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="frontend-assets")
        logger.info(f"📁 Mounted /assets → {_assets_dir}")

    # /covers  → book cover images (SVG/PNG copied from public/covers)
    _covers_dir = _FRONTEND_DIR / "covers"
    if _covers_dir.is_dir():
        app.mount("/covers", StaticFiles(directory=str(_covers_dir)), name="frontend-covers")
        logger.info(f"📁 Mounted /covers → {_covers_dir}")

    # /static/covers  → same covers, via /static prefix (backward-compat)
    if _covers_dir.is_dir():
        app.mount("/static/covers", StaticFiles(directory=str(_covers_dir)), name="static-covers")

    # /static/backgrounds  → background images
    _bg_dir = _assets_dir if _assets_dir.is_dir() else None
    if _bg_dir and _bg_dir.is_dir():
        app.mount("/static/backgrounds", StaticFiles(directory=str(_bg_dir)), name="static-backgrounds")

    # /static/videos  → video files (served from assets)
    if _bg_dir and _bg_dir.is_dir():
        app.mount("/static/videos", StaticFiles(directory=str(_bg_dir)), name="static-videos")

    # /static/downloads  → downloadable PDFs (served from assets)
    if _assets_dir.is_dir():
        app.mount("/static/downloads", StaticFiles(directory=str(_assets_dir)), name="static-downloads")
        logger.info(f"📁 Mounted /static/downloads → {_assets_dir}")

    # ── SPA catch-all: serve index.html for all non-API routes ──────────────
    @app.get("/{full_path:path}")
    async def _spa_fallback(request: Request, full_path: str):
        # Skip API / auth / docs routes
        if any(full_path.startswith(p) for p in ("api/", "auth/", "docs", "openapi", "redoc")):
            raise HTTPException(status_code=404, detail="Not found")
        # Try to serve the exact file first (favicon, robots.txt, etc.)
        requested_path = (_FRONTEND_DIR / full_path).resolve()
        try:
            requested_path.relative_to(_FRONTEND_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=404, detail="Not found")

        if requested_path.is_file():
            return FileResponse(str(requested_path))

        # Return 404 for explicit asset-like paths that are missing
        if full_path and "." in Path(full_path).name:
            raise HTTPException(status_code=404, detail="Not found")

        # Fallback: return index.html for SPA client-side routing
        return FileResponse(str(_FRONTEND_DIR / "index.html"))

    logger.info(f"📦 Serving frontend SPA from {_FRONTEND_DIR}")
else:
    logger.info("ℹ️  No frontend/dist found — run 'npm run build' in frontend/ to enable SPA serving")
