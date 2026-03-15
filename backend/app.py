from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
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

# Load quantum cache if present (use v2 enhanced cache).
# On constrained instances (e.g. Render free), SKIP_ML=1 should avoid importing
# heavy quantum/ML stack at startup.
quantum_cache = {}
if not SKIP_ML:
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
else:
    logger.info("SKIP_ML set — skipping quantum cache/engine imports at startup")

app = FastAPI(title="Smart Shelf AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local development
    allow_credentials=False,  # Must be False when allow_origins=["*"] to be CORS-spec compliant
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


class RegisterRequest(BaseModel):
    name: str
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class DeleteAccountPayload(BaseModel):
    username: str


class RequestOtpPayload(BaseModel):
    username: str


class VerifyOtpPayload(BaseModel):
    username: str
    otp: str


class ChangePasswordPayload(BaseModel):
    username: str
    current_password: str
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

def _is_valid_username(username: str) -> bool:
    if not username:
        return False
    return bool(re.match(r"^[A-Za-z0-9_.-]{3,32}$", username))


def _is_valid_password(pw: str) -> Optional[str]:
    if not pw or len(pw) < 8:
        return "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", pw):
        return "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", pw):
        return "Password must contain at least one lowercase letter."
    if not re.search(r"\d", pw):
        return "Password must contain at least one number."
    if not re.search(r"[^A-Za-z0-9]", pw):
        return "Password must contain at least one special character."
    return None


def _get_password_context():
    """Use pbkdf2_sha256 for all password hashing and verification."""
    from passlib.context import CryptContext
    return CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


@app.post("/auth/register")
def register_user(payload: RegisterRequest):
    normalized_username = (payload.username or "").strip().lower()
    normalized_name = (payload.name or "").strip()
    logger.info(f"Register request received for username: {normalized_username}")

    if not normalized_name:
        return {"status": "error", "error": "Name is required."}

    if not _is_valid_username(normalized_username):
        return {"status": "error", "error": "Username must be 3-32 characters and can include letters, numbers, ., _, and -."}
    
    pw_err = _is_valid_password(payload.password)
    if pw_err:
        logger.warning(f"Invalid password for {normalized_username}: {pw_err}")
        return {"status": "error", "error": pw_err}

    try:
        from services import db as db_client
        pwd_ctx = _get_password_context()

        existing = db_client.get_user_by_username(normalized_username)
        if existing:
            logger.warning(f"Registration attempt with existing username: {normalized_username}")
            return {
                "status": "error",
                "error": "This username is already registered. Please choose a different username."
            }

        pw_hash = pwd_ctx.hash(payload.password)
        logger.info(f"Generated password hash for {normalized_username}: {pw_hash[:20]}...")

        # Verify the hash is valid BEFORE storing
        if not pwd_ctx.verify(payload.password, pw_hash):
            logger.error(f"❌ Pre-store hash verification failed for {normalized_username}")
            return {"status": "error", "error": "Registration failed. Please try again."}

        synthetic_email = f"{normalized_username}@smartshelf.local"
        db_client.add_user(
            synthetic_email,
            pw_hash,
            username=normalized_username,
            name=normalized_name,
        )

        # Read-after-write verification: ensure the stored hash can verify the password
        created = db_client.get_user_by_username(normalized_username) or {}
        stored_hash = created.get("password_hash")
        if not stored_hash:
            logger.error(f"❌ Post-store read failed for {normalized_username}: no password_hash in DB")
            return {"status": "error", "error": "Registration failed — please try again."}
        if not pwd_ctx.verify(payload.password, stored_hash):
            logger.error(f"❌ Post-store hash verification FAILED for {normalized_username}. Hash may be truncated or corrupted.")
            # Delete the broken record so user can retry
            db_client.delete_user_by_username(normalized_username)
            return {"status": "error", "error": "Registration failed — please try again."}

        logger.info(f"✅ Registered new user successfully (hash verified): {normalized_username}")
        return {
            "status": "ok",
            "user": {
                "id": created.get("id") or normalized_username,
                "name": created.get("name") or normalized_name,
                "username": created.get("username") or normalized_username,
                "email": created.get("email") or synthetic_email,
            }
        }
    except Exception as e:
        logger.error(f"❌ Register error for {normalized_username}: {str(e)}", exc_info=True)
        return {"status": "error", "error": str(e)}


@app.post("/auth/login")
def login_user(payload: LoginRequest):
    normalized_username = (payload.username or "").strip().lower()
    logger.info(f"Login request received for username: {normalized_username}")

    if not _is_valid_username(normalized_username):
        logger.warning(f"Invalid username format for login: {normalized_username}")
        return {"status": "error", "error": "Invalid username or password."}
    try:
        from services import db as db_client
        pwd_ctx = _get_password_context()

        user = db_client.get_user_by_username(normalized_username)
        if not user:
            logger.warning(f"Login attempt with non-existent username: {normalized_username}")
            return {"status": "error", "error": "Invalid username or password."}
        stored_hash = user.get("password_hash")
        if not stored_hash:
            logger.warning(f"Login failed for {normalized_username}: missing stored password hash")
            return {"status": "error", "error": "Invalid username or password."}
        logger.info(f"Login: stored hash for {normalized_username} starts with: {stored_hash[:20]}... (len={len(stored_hash)})")
        try:
            password_ok = pwd_ctx.verify(payload.password, stored_hash)
        except Exception as verify_err:
            logger.error(f"Login: pwd_ctx.verify raised exception for {normalized_username}: {verify_err}")
            return {"status": "error", "error": "Invalid username or password."}
        if not password_ok:
            logger.warning(f"Login failed for {normalized_username}: invalid password (verify returned False)")
            return {"status": "error", "error": "Incorrect password. Please try again."}

        # Minimal token for client-side storage; not used by backend auth yet
        import secrets
        token = secrets.token_urlsafe(24)
        logger.info(f"✅ Login successful for: {normalized_username}")
        return {
            "status": "ok",
            "user": {
                "id": user.get("id"),
                "name": user.get("name"),
                "username": user.get("username"),
                "email": user.get("email"),
            },
            "token": token,
        }
    except Exception as e:
        logger.error(f"❌ Login error for {normalized_username}: {str(e)}", exc_info=True)
        return {"status": "error", "error": str(e)}


@app.delete("/auth/delete")
def delete_user_account(payload: DeleteAccountPayload):
    """Delete user account and all associated data."""
    try:
        from services import db as db_client
        
        normalized_username = (payload.username or "").strip().lower()

        # Verify user exists
        user = db_client.get_user_by_username(normalized_username)
        if not user:
            return {"status": "error", "error": "User not found"}
        
        # Delete user from database
        db_client.delete_user_by_username(normalized_username)
        
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
    username = (payload.username or "").strip().lower()
    if not _is_valid_username(username):
        return {"status": "error", "error": "Valid username is required"}
    otp = f"{random.randint(0, 999999):06d}"
    otp_store[username] = {"otp": otp, "ts": time.time()}
    latest_demo_otp["username"] = username
    latest_demo_otp["otp"] = otp
    latest_demo_otp["generated_at"] = datetime.utcnow().isoformat()
    logger.warning(f"[DEMO OTP] Username={username} OTP={otp}")
    print("\n" + "=" * 62, flush=True)
    print(f"[DEMO OTP GENERATED] Username: {username}", flush=True)
    print(f"[DEMO OTP GENERATED] OTP  : {otp}", flush=True)
    print("=" * 62 + "\n", flush=True)
    return {
        "status": "ok",
        "message": f"Demo OTP: {otp}. Enter this OTP to verify.",
        "otp": otp,
    }


@app.get("/auth/latest-otp")
def get_latest_otp():
    if not latest_demo_otp:
        return {"status": "ok", "has_otp": False}
    return {
        "status": "ok",
        "has_otp": True,
        "username": latest_demo_otp.get("username"),
        "otp": latest_demo_otp.get("otp"),
        "generated_at": latest_demo_otp.get("generated_at"),
    }


@app.post("/auth/verify-otp")
def verify_otp(payload: VerifyOtpPayload):
    import time, secrets
    username = (payload.username or "").strip().lower()
    entered_otp = (payload.otp or "").strip()
    if not entered_otp.isdigit() or len(entered_otp) != 6:
        return {"status": "error", "error": "OTP must be a 6-digit code"}
    entry = otp_store.get(username)
    if not entry or entry.get("otp") != entered_otp:
        return {"status": "error", "error": "Invalid OTP"}
    # Optional: expire OTP after 5 minutes
    if time.time() - float(entry.get("ts", 0)) > 300:
        otp_store.pop(username, None)
        return {"status": "error", "error": "OTP expired"}
    # Mark verified by issuing a short-lived session token
    token = secrets.token_urlsafe(16)
    verified_sessions[token] = {"username": username, "ts": time.time()}
    # Clear OTP so it cannot be reused
    otp_store.pop(username, None)
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

    normalized_username = (payload.username or "").strip().lower()
    if session.get("username") != normalized_username:
        return {"status": "error", "error": "Verification token does not match this account"}

    pw_err = _is_valid_password(payload.new_password)
    if pw_err:
        return {"status": "error", "error": pw_err}

    try:
        from services import db as db_client
        pwd_ctx = _get_password_context()

        user = db_client.get_user_by_username(normalized_username)
        if not user:
            return {"status": "error", "error": "User not found"}

        existing_hash = user.get("password_hash")
        if not existing_hash or not pwd_ctx.verify(payload.current_password, existing_hash):
            return {"status": "error", "error": "Current password is incorrect."}

        pw_hash = pwd_ctx.hash(payload.new_password)
        updated = db_client.update_user_password_by_username(normalized_username, pw_hash)
        if not updated:
            return {"status": "error", "error": "Password update failed"}

        # Read-after-write verification to guarantee login will work.
        persisted = db_client.get_user_by_username(normalized_username)
        if not persisted or not persisted.get("password_hash"):
            return {"status": "error", "error": "Password update failed: no stored credentials"}
        if not pwd_ctx.verify(payload.new_password, persisted.get("password_hash")):
            return {"status": "error", "error": "Password update failed: verification mismatch"}

        # Invalidate session token after successful change
        verified_sessions.pop(payload.token, None)
        logger.info(f"Password updated successfully for user: {normalized_username}")
        return {"status": "ok", "message": "Password successfully updated."}
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
                        "buy_link": book.get("buy_link"),
                        "synopsis": book.get("synopsis"),
                        "genre": book.get("genre"),
                        "type": book["type"],
                        "emotion_tags": book.get("emotion_tags", []),
                        "reading_insights": book.get("reading_insights"),
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
                        "buy_link": book.get("buy_link"),
                        "synopsis": book.get("synopsis"),
                        "genre": book.get("genre"),
                        "type": book["type"],
                        "emotion_tags": book.get("emotion_tags", []),
                        "reading_insights": book.get("reading_insights"),
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
                    "buy_link": book.get("buy_link"),
                    "synopsis": book.get("synopsis"),
                    "genre": book.get("genre"),
                    "type": book["type"],
                    "emotion_tags": book.get("emotion_tags", []),
                    "reading_insights": book.get("reading_insights"),
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

    Expected JSON fields: book_name, genre, theme (optional), username (optional).
    """
    try:
        book_name = payload.get("book_name") or payload.get("title")
        genre = payload.get("genre")
        theme = payload.get("theme") or (payload.get("emotion_tags") or [None])[0]
        user_identifier = (payload.get("username") or payload.get("user_identifier") or payload.get("email") or "").strip().lower() or None
        ts = datetime.utcnow().isoformat()
        if db_client is None:
            logger.warning("DB client not available; selection will not be persisted")
            return {"status": "ok", "message": "selection received (no DB configured)"}

        db_client.add_previous_book(book_name, genre, theme, ts, user_identifier=user_identifier)
        return {"status": "ok", "message": "book selection saved"}
    except Exception as e:
        logger.error(f"Error saving selection: {e}")
        return {"status": "error", "error": str(e)}


@app.get("/api/v1/history")
def get_history(limit: int = 100, username: str | None = None):
    if db_client is None:
        return {"history": []}
    return {"history": db_client.get_history(limit, user_identifier=(username or "").strip().lower() or None)}


@app.get("/api/v1/analytics")
def get_analytics(username: str | None = None):
    if db_client is None:
        return {"analytics": {}}
    analytics = db_client.get_analytics(user_identifier=(username or "").strip().lower() or None)

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


@app.get("/api/free-books")
def get_free_books(request: Request):
    """Return the list of free downloadable books for the Introduction section.
    This is separate from the recommendation dataset (books_data.json).
    """
    import json as _json
    free_books_path = Path(__file__).resolve().parent / "data" / "free_books.json"
    with open(free_books_path, encoding="utf-8") as f:
        books = _json.load(f)

    # Always return backend-hosted download links so clients receive the
    # original PDF via the dedicated /download endpoint (attachment headers).
    base_url = str(request.base_url).rstrip("/")
    normalized_books = []
    for book in books:
        row = dict(book)
        raw_url = str(row.get("download_url", "") or "")
        file_name = Path(raw_url).name
        if file_name:
            row["download_url"] = f"{base_url}/download/{file_name}"
        normalized_books.append(row)

    return normalized_books


@app.get("/download/{filename}")
@app.get("/api/v1/download/{filename}")
async def download_book(filename: str, request: Request):
    """Serve downloadable book files (PDFs) with correct Content-Disposition header.

    Files are searched first in backend/static/books/, then in frontend/dist/assets/.
    Example: GET /download/alice_in_wonderland.pdf
    Example: GET /api/v1/download/Building%20AI%20Agents.pdf
    """
    # Prevent path traversal
    safe_name = Path(filename).name
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")

    _static_books_dir = Path(__file__).resolve().parent / "static" / "books"
    candidates = [
        _static_books_dir / safe_name,
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
        media_type="application/pdf",
        filename=safe_name,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


# ══════════════════════════════════════════════════════════
#  Mount backend/static/books — always available
# ══════════════════════════════════════════════════════════
_STATIC_BOOKS_DIR = Path(__file__).resolve().parent / "static" / "books"
if _STATIC_BOOKS_DIR.is_dir():
    app.mount("/static/books", StaticFiles(directory=str(_STATIC_BOOKS_DIR)), name="static-books")
    logger.info(f"📁 Mounted /static/books → {_STATIC_BOOKS_DIR}")

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

    # /images  → UI background images (copied from public/images by Vite build)
    _images_dir = _FRONTEND_DIR / "images"
    if _images_dir.is_dir():
        app.mount("/images", StaticFiles(directory=str(_images_dir)), name="frontend-images")
        logger.info(f"📁 Mounted /images → {_images_dir}")

    # /videos  → video backgrounds (copied from public/videos by Vite build)
    _videos_dir = _FRONTEND_DIR / "videos"
    if _videos_dir.is_dir():
        app.mount("/videos", StaticFiles(directory=str(_videos_dir)), name="frontend-videos")
        logger.info(f"📁 Mounted /videos → {_videos_dir}")

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
