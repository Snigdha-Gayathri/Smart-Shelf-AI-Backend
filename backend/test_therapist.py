"""Comprehensive tests for the SmartShelf AI Book Therapist Mode (Phase 3).

Tests cover:
  • Therapist session database table creation
  • Emotion analysis engine (keyword detection, confidence, edge cases)
  • Intensity slider support (1–4 levels)
  • Mood-based trope adjustment computation
  • Mood context application (temporary weight overlay, no DB modification)
  • Therapist recommendation flow (end-to-end)
  • Personalized explanation generation (references emotion, tropes, MMC)
  • Session management (create, get active, expire, manual end)
  • Phase 3 API endpoints (POST /start, GET /active, DELETE /)
  • Differentiation tests: therapist ≠ normal recommendations
  • Multi-mood differentiation: different moods → different results
  • Per-user personalization: same mood, different users → different results
  • Backward compatibility: Phase 1 + Phase 2 still work
  • Session expiration: expired session → normal recommendations restored
  • No-history user: graceful handling

Run with:
    cd backend
    $env:SKIP_ML="1"; python -m pytest test_therapist.py -v --tb=short
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

# ── Ensure backend directory is on sys.path ──
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# ── Use a temporary database for all tests ──
_test_db_dir = tempfile.mkdtemp()
_test_db_path = os.path.join(_test_db_dir, "test_therapist.db")

# Patch the DB path before importing any project modules
import database.connection as _conn_mod
_conn_mod.DB_PATH = _test_db_path

# Now import project modules
from database.migrations import run_migrations, ensure_memory_user
from database.connection import get_connection
from models.schemas import TherapistStartRequest, VALID_THERAPIST_EMOTIONS
from services.therapist_service import (
    analyze_user_emotion,
    compute_mood_adjustments,
    apply_mood_context,
    get_therapist_recommendations,
    get_active_session,
    end_therapist_session,
    generate_therapist_explanation,
    MOOD_TROPE_ADJUSTMENTS,
    INTENSITY_MULTIPLIERS,
    SESSION_DURATION_HOURS,
    MOOD_MMC_PREFERENCES,
)
from services.memory_service import update_user_memory, get_user_trope_preferences
from services.trope_engine_service import get_effective_weight_map
from services.recommendation_service import get_personalized_recommendations


# ────────────────────────── Fixtures ──────────────────────────

@pytest.fixture(autouse=True)
def fresh_database():
    """Reset the test database before each test."""
    conn = get_connection()
    cur = conn.cursor()
    for table in [
        "therapist_sessions",
        "book_interactions", "trope_preferences",
        "user_personality_profiles", "book_tropes",
        "book_mmc_types", "memory_users",
    ]:
        cur.execute(f"DROP TABLE IF EXISTS {table}")
    conn.commit()
    conn.close()
    run_migrations()
    yield


def _seed_book_tropes(book_id: str, tropes: list[str]):
    """Helper: manually insert tropes for a book."""
    conn = get_connection()
    cur = conn.cursor()
    for trope in tropes:
        cur.execute(
            "INSERT OR IGNORE INTO book_tropes (book_id, trope_name) VALUES (?, ?)",
            (book_id, trope),
        )
    conn.commit()
    conn.close()


def _seed_interaction(user_id: int, book_id: str, rating: int = 5,
                      tags: list[str] = None, mmc_type: str = None):
    """Helper: insert a book interaction via the memory service."""
    tags = tags or ["safe"]
    return update_user_memory(
        user_id=user_id,
        book_id=book_id,
        emotional_tags=tags,
        rating=rating,
        liked_mmc_type=mmc_type,
    )


def _build_user_with_history(user_id: int):
    """Build a user with reading history for personalized testing."""
    ensure_memory_user(user_id)
    # Read 3 books: enemies-to-lovers, dark-romance, slow-burn
    _seed_book_tropes("BookA", ["enemies-to-lovers", "dark-romance"])
    _seed_book_tropes("BookB", ["slow-burn", "friends-to-lovers"])
    _seed_book_tropes("BookC", ["enemies-to-lovers", "mafia", "dark-romance"])

    _seed_interaction(user_id, "BookA", rating=5, tags=["obsessed"], mmc_type="morally-grey")
    _seed_interaction(user_id, "BookB", rating=4, tags=["comforted"], mmc_type="cinnamon-roll")
    _seed_interaction(user_id, "BookC", rating=5, tags=["obsessed"], mmc_type="alpha")


# ────────────────────────── 1. DATABASE TESTS ──────────────────────────

class TestTherapistDatabase:
    """Verify the therapist_sessions table exists and has correct columns."""

    def test_table_exists(self):
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='therapist_sessions'"
        )
        assert cur.fetchone() is not None
        conn.close()

    def test_table_columns(self):
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(therapist_sessions)")
        columns = {row["name"] for row in cur.fetchall()}
        conn.close()
        expected = {
            "id", "user_id", "input_text", "detected_emotion",
            "confidence_score", "intensity_level", "mood_adjustments",
            "explanation", "started_at", "expires_at", "is_active",
        }
        assert expected.issubset(columns)

    def test_intensity_level_check_constraint(self):
        ensure_memory_user(1)
        conn = get_connection()
        cur = conn.cursor()
        with pytest.raises(Exception):
            cur.execute(
                "INSERT INTO therapist_sessions "
                "(user_id, input_text, detected_emotion, confidence_score, "
                " intensity_level, mood_adjustments, explanation, expires_at) "
                "VALUES (1, 'test', 'numb', 0.5, 5, '{}', 'test', '2099-01-01')",
            )
        conn.close()


# ────────────────────────── 2. EMOTION ANALYSIS ENGINE ──────────────────────────

class TestEmotionAnalysis:
    """Test keyword + sentiment emotion classification."""

    def test_heartbroken_detected(self):
        result = analyze_user_emotion("I feel so heartbroken and devastated")
        assert result["detected_emotion"] == "heartbroken"
        assert result["confidence_score"] > 0.3

    def test_anxious_detected(self):
        result = analyze_user_emotion("I'm so anxious and my thoughts keep spiraling")
        assert result["detected_emotion"] == "anxious"

    def test_overwhelmed_detected(self):
        result = analyze_user_emotion("Everything is too much, I'm completely overwhelmed and drowning")
        assert result["detected_emotion"] == "overwhelmed"

    def test_lonely_detected(self):
        result = analyze_user_emotion("I feel so lonely and isolated, no one understands me")
        assert result["detected_emotion"] == "lonely"

    def test_numb_detected(self):
        result = analyze_user_emotion("I feel nothing, completely numb and hollow inside")
        assert result["detected_emotion"] == "numb"

    def test_empowered_detected(self):
        result = analyze_user_emotion("I feel empowered and confident, like an unstoppable warrior")
        assert result["detected_emotion"] == "empowered"

    def test_comfort_seeking_detected(self):
        result = analyze_user_emotion("I need something cozy and warm, comfort and soothing reads")
        assert result["detected_emotion"] == "comfort-seeking"

    def test_craving_intensity_detected(self):
        result = analyze_user_emotion("I crave dark obsession, something intense and all-consuming")
        assert result["detected_emotion"] == "craving-intensity"

    def test_empty_input_rejected(self):
        with pytest.raises(ValueError, match="empty"):
            analyze_user_emotion("")

    def test_whitespace_only_rejected(self):
        with pytest.raises(ValueError, match="empty"):
            analyze_user_emotion("   ")

    def test_too_short_input_rejected(self):
        with pytest.raises(ValueError, match="at least"):
            analyze_user_emotion("hi")

    def test_confidence_score_range(self):
        result = analyze_user_emotion("heartbroken")
        assert 0.3 <= result["confidence_score"] <= 1.0

    def test_no_keyword_match_defaults_to_comfort(self):
        result = analyze_user_emotion("the weather is nice today and I went shopping")
        assert result["detected_emotion"] == "comfort-seeking"
        assert result["confidence_score"] == 0.3

    def test_all_valid_emotions_detectable(self):
        """Each emotion from the valid set should be detectable with strong enough input."""
        test_inputs = {
            "numb": "I feel completely numb and empty inside like nothing matters",
            "heartbroken": "My heart is absolutely broken and shattered from the breakup",
            "anxious": "I can't stop overthinking, my anxiety is through the roof, so nervous",
            "overwhelmed": "I'm overwhelmed and drowning, too much to handle, burning out",
            "lonely": "So deeply lonely and isolated, nobody cares, I'm alone",
            "empowered": "I feel empowered and strong, confident and unstoppable",
            "comfort-seeking": "Need something cozy and comforting, warm and gentle",
            "craving-intensity": "I crave dark intensity, something obsessive and consuming",
        }
        for emotion, text in test_inputs.items():
            result = analyze_user_emotion(text)
            assert result["detected_emotion"] == emotion, (
                f"Expected '{emotion}' but got '{result['detected_emotion']}' for input: {text}"
            )

    def test_mixed_signals_picks_strongest(self):
        # "heartbroken" should dominate even with some "lonely" keywords
        result = analyze_user_emotion("I'm heartbroken and devastated, I feel alone and rejected")
        assert result["detected_emotion"] == "heartbroken"


# ────────────────────────── 3. INTENSITY SLIDER SUPPORT ──────────────────────────

class TestIntensitySlider:
    """Test that intensity levels properly scale mood adjustments."""

    def test_all_levels_valid(self):
        for level in [1, 2, 3, 4]:
            adj = compute_mood_adjustments("heartbroken", level)
            assert isinstance(adj, dict)
            assert len(adj) > 0

    def test_higher_intensity_gives_larger_adjustments(self):
        adj1 = compute_mood_adjustments("heartbroken", 1)
        adj4 = compute_mood_adjustments("heartbroken", 4)
        # Same tropes present but level 4 should have larger absolute values
        for trope in adj1:
            if trope in adj4:
                assert abs(adj4[trope]) >= abs(adj1[trope])

    def test_intensity_1_is_soft(self):
        adj = compute_mood_adjustments("craving-intensity", 1)
        # At level 1, dark-romance boost should be moderate
        assert adj.get("dark-romance", 0) == round(3.0 * 0.5, 2)  # 1.5

    def test_intensity_4_is_dark(self):
        adj = compute_mood_adjustments("craving-intensity", 4)
        # At level 4, dark-romance should be maximal
        assert adj.get("dark-romance", 0) == round(3.0 * 2.0, 2)  # 6.0

    def test_default_intensity_is_2(self):
        """Schema default should be 2."""
        req = TherapistStartRequest(user_id=1, input_text="test input here")
        assert req.intensity_level == 2


# ────────────────────────── 4. MOOD-BASED TROPE ADJUSTMENT ──────────────────────────

class TestMoodTropeAdjustment:
    """Test the mood→trope weight adjustment system."""

    def test_heartbroken_boosts_second_chance(self):
        adj = compute_mood_adjustments("heartbroken", 2)
        assert adj.get("second-chance", 0) > 0

    def test_heartbroken_suppresses_betrayal_tropes(self):
        adj = compute_mood_adjustments("heartbroken", 2)
        assert adj.get("love-triangle", 0) < 0

    def test_craving_intensity_boosts_dark_tropes(self):
        adj = compute_mood_adjustments("craving-intensity", 2)
        assert adj.get("dark-romance", 0) > 0
        assert adj.get("mafia", 0) > 0
        assert adj.get("enemies-to-lovers", 0) > 0

    def test_craving_intensity_suppresses_gentle(self):
        adj = compute_mood_adjustments("craving-intensity", 2)
        assert adj.get("friends-to-lovers", 0) < 0
        assert adj.get("grumpy-sunshine", 0) < 0

    def test_comfort_seeking_boosts_warmth(self):
        adj = compute_mood_adjustments("comfort-seeking", 2)
        assert adj.get("grumpy-sunshine", 0) > 0
        assert adj.get("friends-to-lovers", 0) > 0

    def test_comfort_seeking_suppresses_dark(self):
        adj = compute_mood_adjustments("comfort-seeking", 2)
        assert adj.get("dark-romance", 0) < 0
        assert adj.get("mafia", 0) < 0

    def test_all_emotions_have_adjustments(self):
        for emotion in MOOD_TROPE_ADJUSTMENTS:
            adj = compute_mood_adjustments(emotion, 2)
            assert len(adj) > 0, f"No adjustments for emotion: {emotion}"

    def test_mood_context_does_not_modify_db(self):
        """apply_mood_context must NOT change base weights in the database."""
        ensure_memory_user(1)
        # Set a known weight
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO trope_preferences (user_id, trope_name, weight, last_updated) "
            "VALUES (1, 'enemies-to-lovers', 3, ?)",
            (datetime.utcnow().isoformat(),),
        )
        conn.commit()
        conn.close()

        # Apply mood context
        apply_mood_context(1, "heartbroken", 3)

        # Verify DB weight is unchanged
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT weight FROM trope_preferences "
            "WHERE user_id = 1 AND trope_name = 'enemies-to-lovers'",
        )
        row = cur.fetchone()
        conn.close()
        assert row["weight"] == 3  # unchanged

    def test_mood_context_returns_adjusted_weights(self):
        ensure_memory_user(1)
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO trope_preferences (user_id, trope_name, weight, last_updated) "
            "VALUES (1, 'second-chance', 1, ?)",
            (datetime.utcnow().isoformat(),),
        )
        conn.commit()
        conn.close()

        adjusted = apply_mood_context(1, "heartbroken", 2)
        # heartbroken boosts second-chance by 3.0 at intensity 2
        assert adjusted["second-chance"] == 1 + 3.0  # base 1 + boost 3

    def test_adjusted_weights_clamped(self):
        ensure_memory_user(1)
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO trope_preferences (user_id, trope_name, weight, last_updated) "
            "VALUES (1, 'second-chance', 5, ?)",
            (datetime.utcnow().isoformat(),),
        )
        conn.commit()
        conn.close()

        adjusted = apply_mood_context(1, "heartbroken", 4)
        # 5 + (3.0 * 2.0) = 11 → clamped to 5
        assert adjusted["second-chance"] == 5.0


# ────────────────────────── 5. THERAPIST RECOMMENDATION FLOW ──────────────────────────

class TestTherapistRecommendationFlow:
    """Test the full getTherapistRecommendations orchestrator."""

    def test_basic_flow_returns_all_fields(self):
        ensure_memory_user(1)
        result = get_therapist_recommendations(1, "I feel heartbroken and alone", 2)
        assert "session_id" in result
        assert "user_id" in result
        assert "detected_emotion" in result
        assert "confidence_score" in result
        assert "intensity_level" in result
        assert "explanation" in result
        assert "recommended_books" in result
        assert "session_expires_at" in result
        assert "mood_adjustments" in result

    def test_returns_books(self):
        ensure_memory_user(1)
        result = get_therapist_recommendations(1, "I need comfort and warmth", 2)
        assert len(result["recommended_books"]) > 0

    def test_emotion_detected_correctly(self):
        ensure_memory_user(1)
        result = get_therapist_recommendations(1, "I'm so heartbroken", 2)
        assert result["detected_emotion"] == "heartbroken"

    def test_session_created_in_db(self):
        ensure_memory_user(1)
        result = get_therapist_recommendations(1, "I feel anxious and nervous", 2)
        session_id = result["session_id"]
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM therapist_sessions WHERE id = ?", (session_id,))
        row = cur.fetchone()
        conn.close()
        assert row is not None
        assert row["is_active"] == 1
        assert row["detected_emotion"] == "anxious"

    def test_session_has_expiry(self):
        ensure_memory_user(1)
        result = get_therapist_recommendations(1, "I feel overwhelmed", 2)
        expires = datetime.fromisoformat(result["session_expires_at"])
        now = datetime.utcnow()
        # Should expire roughly 24 hours from now
        diff_hours = (expires - now).total_seconds() / 3600
        assert 23 <= diff_hours <= 25

    def test_previous_session_deactivated(self):
        ensure_memory_user(1)
        r1 = get_therapist_recommendations(1, "I feel anxious", 2)
        r2 = get_therapist_recommendations(1, "I feel empowered now", 3)
        # First session should be inactive
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT is_active FROM therapist_sessions WHERE id = ?", (r1["session_id"],))
        row = cur.fetchone()
        conn.close()
        assert row["is_active"] == 0

    def test_invalid_short_input_rejected(self):
        ensure_memory_user(1)
        with pytest.raises(ValueError):
            get_therapist_recommendations(1, "hi", 2)

    def test_invalid_intensity_rejected(self):
        ensure_memory_user(1)
        with pytest.raises(ValueError):
            get_therapist_recommendations(1, "I feel sad and lost", 5)

    def test_works_without_reading_history(self):
        """Must work gracefully even if user has no prior interactions."""
        ensure_memory_user(1)
        result = get_therapist_recommendations(1, "I feel lonely and isolated", 2)
        assert result["detected_emotion"] == "lonely"
        assert len(result["recommended_books"]) > 0
        assert len(result["explanation"]) > 0

    def test_with_reading_history(self):
        """Recommendations should be personalized when user has history."""
        _build_user_with_history(1)
        result = get_therapist_recommendations(1, "I feel heartbroken", 2)
        assert result["detected_emotion"] == "heartbroken"
        assert len(result["recommended_books"]) > 0
        # Explanation should reference user's trope preferences
        assert len(result["explanation"]) > 50  # Non-trivial explanation


# ────────────────────────── 6. PERSONALIZED EXPLANATION ──────────────────────────

class TestPersonalizedExplanation:
    """Test the explanation generator references emotion, tropes, and MMC."""

    def test_explanation_mentions_emotion(self):
        explanation = generate_therapist_explanation(
            "heartbroken", ["enemies-to-lovers", "slow-burn"], "morally-grey",
            {"second-chance": 3.0, "love-triangle": -3.0}, 2,
        )
        assert "heartbroken" in explanation.lower()

    def test_explanation_mentions_trope_preference(self):
        explanation = generate_therapist_explanation(
            "anxious", ["slow-burn", "friends-to-lovers"], "cinnamon-roll",
            {"slow-burn": 2.5, "dark-romance": -2.5}, 2,
        )
        assert "slow burn" in explanation.lower()

    def test_explanation_mentions_mmc_preference(self):
        explanation = generate_therapist_explanation(
            "comfort-seeking", ["grumpy-sunshine"], "protector",
            {"grumpy-sunshine": 3.0, "dark-romance": -3.0}, 2,
        )
        assert "protector" in explanation.lower()

    def test_explanation_mentions_boosted_tropes(self):
        explanation = generate_therapist_explanation(
            "heartbroken", [], None,
            {"second-chance": 3.0, "slow-burn": 2.0}, 2,
        )
        assert "boosted" in explanation.lower() or "second chance" in explanation.lower()

    def test_explanation_mentions_suppressed_tropes(self):
        explanation = generate_therapist_explanation(
            "heartbroken", [], None,
            {"second-chance": 3.0, "love-triangle": -3.0}, 2,
        )
        assert "reduced" in explanation.lower() or "love triangle" in explanation.lower()

    def test_explanation_describes_intensity(self):
        exp_gentle = generate_therapist_explanation(
            "comfort-seeking", [], None,
            {"grumpy-sunshine": 1.5}, 1,
        )
        exp_dark = generate_therapist_explanation(
            "craving-intensity", [], None,
            {"dark-romance": 6.0}, 4,
        )
        # Level 1 should mention gentle/comforting
        assert "gentle" in exp_gentle.lower() or "comforting" in exp_gentle.lower()
        # Level 4 should mention intense/consuming
        assert "intense" in exp_dark.lower() or "consuming" in exp_dark.lower()

    def test_explanation_not_static(self):
        """Two different emotions should produce different explanations."""
        exp1 = generate_therapist_explanation(
            "heartbroken", ["enemies-to-lovers"], "morally-grey",
            {"second-chance": 3.0}, 2,
        )
        exp2 = generate_therapist_explanation(
            "empowered", ["enemies-to-lovers"], "morally-grey",
            {"enemies-to-lovers": 3.0}, 3,
        )
        assert exp1 != exp2

    def test_explanation_no_empty_user(self):
        """Even with no trope/MMC data, explanation should still be meaningful."""
        explanation = generate_therapist_explanation(
            "lonely", [], None,
            {"friends-to-lovers": 3.0}, 2,
        )
        assert len(explanation) > 30
        assert "lonely" in explanation.lower()


# ────────────────────────── 7. SESSION MANAGEMENT ──────────────────────────

class TestSessionManagement:
    """Test session lifecycle: create, get, expire, end."""

    def test_get_active_session(self):
        ensure_memory_user(1)
        get_therapist_recommendations(1, "I feel anxious and nervous", 2)
        session = get_active_session(1)
        assert session is not None
        assert session["detected_emotion"] == "anxious"
        assert session["is_active"] is True

    def test_no_active_session(self):
        ensure_memory_user(1)
        session = get_active_session(1)
        assert session is None

    def test_manual_end_session(self):
        ensure_memory_user(1)
        get_therapist_recommendations(1, "I feel lonely", 2)
        result = end_therapist_session(1)
        assert result["sessions_ended"] >= 1
        # Now no active session
        session = get_active_session(1)
        assert session is None

    def test_end_nonexistent_session(self):
        ensure_memory_user(1)
        result = end_therapist_session(1)
        assert result["sessions_ended"] == 0

    def test_expired_session_auto_cleaned(self):
        ensure_memory_user(1)
        # Create a session manually with expired timestamp
        conn = get_connection()
        cur = conn.cursor()
        past = (datetime.utcnow() - timedelta(hours=25)).isoformat()
        cur.execute(
            "INSERT INTO therapist_sessions "
            "(user_id, input_text, detected_emotion, confidence_score, "
            " intensity_level, mood_adjustments, explanation, "
            " started_at, expires_at, is_active) "
            "VALUES (1, 'test', 'numb', 0.5, 2, '{}', 'test', ?, ?, 1)",
            (past, past),
        )
        conn.commit()
        conn.close()

        # get_active_session should not return the expired one
        session = get_active_session(1)
        assert session is None

    def test_session_data_persists(self):
        ensure_memory_user(1)
        result = get_therapist_recommendations(1, "I feel heartbroken and devastated", 3)
        session = get_active_session(1)
        assert session["detected_emotion"] == "heartbroken"
        assert session["intensity_level"] == 3
        assert len(session["explanation"]) > 0
        assert isinstance(session["mood_adjustments"], dict)


# ────────────────────────── 8. API ENDPOINT TESTS ──────────────────────────

class TestPhase3APIEndpoints:
    """Test the Phase 3 API routes via FastAPI TestClient."""

    @pytest.fixture
    def client(self):
        os.environ["SKIP_ML"] = "1"
        from fastapi.testclient import TestClient
        from app import app
        return TestClient(app)

    def test_post_therapist_start(self, client):
        ensure_memory_user(1)
        resp = client.post("/therapist/start", json={
            "user_id": 1,
            "input_text": "I feel heartbroken and alone",
            "intensity_level": 2,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["detected_emotion"] == "heartbroken"
        assert len(data["recommended_books"]) > 0
        assert len(data["explanation"]) > 30

    def test_post_therapist_start_default_intensity(self, client):
        ensure_memory_user(1)
        resp = client.post("/therapist/start", json={
            "user_id": 1,
            "input_text": "I feel overwhelmed by everything",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["intensity_level"] == 2  # default

    def test_post_therapist_start_invalid_user(self, client):
        resp = client.post("/therapist/start", json={
            "user_id": 0,
            "input_text": "I feel sad",
        })
        assert resp.status_code == 422

    def test_post_therapist_start_too_short_text(self, client):
        resp = client.post("/therapist/start", json={
            "user_id": 1,
            "input_text": "hi",
        })
        assert resp.status_code == 422

    def test_post_therapist_start_missing_text(self, client):
        resp = client.post("/therapist/start", json={
            "user_id": 1,
        })
        assert resp.status_code == 422

    def test_get_active_session_exists(self, client):
        ensure_memory_user(1)
        client.post("/therapist/start", json={
            "user_id": 1,
            "input_text": "I feel anxious and stressed",
        })
        resp = client.get("/therapist/1/active")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["session"] is not None
        assert data["session"]["detected_emotion"] == "anxious"

    def test_get_active_session_none(self, client):
        ensure_memory_user(1)
        resp = client.get("/therapist/1/active")
        assert resp.status_code == 200
        data = resp.json()
        assert data["session"] is None

    def test_get_active_session_invalid_user(self, client):
        resp = client.get("/therapist/0/active")
        assert resp.status_code == 422

    def test_delete_session(self, client):
        ensure_memory_user(1)
        client.post("/therapist/start", json={
            "user_id": 1,
            "input_text": "I feel lonely and disconnected",
        })
        resp = client.delete("/therapist/1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["sessions_ended"] >= 1

    def test_delete_session_invalid_user(self, client):
        resp = client.delete("/therapist/0")
        assert resp.status_code == 422

    def test_intensity_level_4_via_api(self, client):
        ensure_memory_user(1)
        resp = client.post("/therapist/start", json={
            "user_id": 1,
            "input_text": "I crave dark obsession and consuming intensity",
            "intensity_level": 4,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["detected_emotion"] == "craving-intensity"
        assert data["intensity_level"] == 4

    def test_invalid_intensity_level_via_api(self, client):
        resp = client.post("/therapist/start", json={
            "user_id": 1,
            "input_text": "I feel something",
            "intensity_level": 5,
        })
        assert resp.status_code == 422


# ────────────────────────── 9. DIFFERENTIATION TESTS ──────────────────────────

class TestTherapistDifferentiation:
    """Critical tests: therapist recs ≠ normal recs, different moods ≠ same results."""

    def test_therapist_differs_from_normal_recommendations(self):
        """Therapist recommendations must differ from standard Phase 2 recommendations."""
        _build_user_with_history(1)

        # Get normal recommendations
        normal = get_personalized_recommendations(1, limit=10)
        normal_ids = [r["book_id"] for r in normal["recommendations"]]

        # Get therapist recommendations with a mood that shifts things
        therapist = get_therapist_recommendations(1, "I need soft comfort and healing warmth", 1)
        therapist_ids = [r["book_id"] for r in therapist["recommended_books"]]

        # They should NOT be identical (the whole point of Phase 3)
        # At minimum the ORDER should differ; ideally some different books appear
        if normal_ids and therapist_ids:
            assert normal_ids != therapist_ids, (
                "Therapist recommendations are identical to normal recommendations — "
                "Phase 3 implementation is incomplete!"
            )

    def test_two_different_moods_give_different_results(self):
        """Different emotional inputs should produce different recommendation rankings."""
        ensure_memory_user(1)

        r1 = get_therapist_recommendations(1, "I feel heartbroken and devastated", 2)
        books1 = [b["book_id"] for b in r1["recommended_books"][:5]]

        # End the first session to allow a clean second one
        end_therapist_session(1)

        r2 = get_therapist_recommendations(1, "I crave dark obsession and consuming passion", 4)
        books2 = [b["book_id"] for b in r2["recommended_books"][:5]]

        assert r1["detected_emotion"] != r2["detected_emotion"]
        # Different moods should produce different top-5
        assert books1 != books2, "Two different moods gave identical top-5 book lists"

    def test_different_users_get_different_results_same_mood(self):
        """Same emotional input for users with different histories → different results."""
        # Build user 1 who loves dark romance
        ensure_memory_user(1)
        _seed_book_tropes("DarkBook1", ["dark-romance", "mafia"])
        _seed_book_tropes("DarkBook2", ["dark-romance", "enemies-to-lovers"])
        _seed_interaction(1, "DarkBook1", rating=5, tags=["obsessed"], mmc_type="morally-grey")
        _seed_interaction(1, "DarkBook2", rating=5, tags=["obsessed"], mmc_type="alpha")

        # Build user 2 who loves sweet romance
        ensure_memory_user(2)
        _seed_book_tropes("SweetBook1", ["friends-to-lovers", "grumpy-sunshine"])
        _seed_book_tropes("SweetBook2", ["slow-burn", "forced-proximity"])
        _seed_interaction(2, "SweetBook1", rating=5, tags=["comforted"], mmc_type="cinnamon-roll")
        _seed_interaction(2, "SweetBook2", rating=5, tags=["safe"], mmc_type="protector")

        # Same emotional input
        mood_text = "I feel heartbroken and need healing"

        r1 = get_therapist_recommendations(1, mood_text, 2, limit=5)
        r2 = get_therapist_recommendations(2, mood_text, 2, limit=5)

        scores1 = [b["raw_score"] for b in r1["recommended_books"][:5]]
        scores2 = [b["raw_score"] for b in r2["recommended_books"][:5]]

        # Scores should differ because users have different base weights
        assert scores1 != scores2, "Two users with different histories got identical scores"

    def test_intensity_changes_recommendations(self):
        """Different intensity levels for same emotion → different scoring."""
        ensure_memory_user(1)
        r1 = get_therapist_recommendations(1, "I feel heartbroken", 1, limit=5)
        end_therapist_session(1)
        r4 = get_therapist_recommendations(1, "I feel heartbroken", 4, limit=5)

        scores1 = [b["raw_score"] for b in r1["recommended_books"][:5]]
        scores4 = [b["raw_score"] for b in r4["recommended_books"][:5]]

        # At minimum the raw scores should differ since multipliers are different
        assert scores1 != scores4, "Different intensity levels gave identical raw scores"


# ────────────────────────── 10. SESSION EXPIRATION → NORMAL RESTORED ──────────────────────────

class TestSessionExpirationRestoration:
    """Test that expired sessions restore normal recommendation behavior."""

    def test_after_session_ends_normal_recs_restored(self):
        """After manually ending therapist session, standard recs work normally."""
        _build_user_with_history(1)

        # Get normal recs
        normal = get_personalized_recommendations(1, limit=5)

        # Start therapist session
        get_therapist_recommendations(1, "I feel heartbroken", 2)

        # End the session
        end_therapist_session(1)

        # Get normal recs again — should be same as before (base weights unchanged)
        after = get_personalized_recommendations(1, limit=5)

        normal_ids = [r["book_id"] for r in normal["recommendations"]]
        after_ids = [r["book_id"] for r in after["recommendations"]]
        assert normal_ids == after_ids, "Normal recs changed after therapist session ended"

    def test_base_weights_unchanged_after_session(self):
        """Therapist session must NOT modify base trope weights in database."""
        _build_user_with_history(1)

        # Snapshot weights before
        prefs_before = {
            p["trope_name"]: p["weight"]
            for p in get_user_trope_preferences(1)
        }

        # Run therapist session
        get_therapist_recommendations(1, "I crave dark obsession", 4)
        end_therapist_session(1)

        # Snapshot weights after
        prefs_after = {
            p["trope_name"]: p["weight"]
            for p in get_user_trope_preferences(1)
        }

        assert prefs_before == prefs_after, "Base trope weights were modified by therapist session!"

    def test_effective_weights_unchanged_after_session(self):
        """Effective weights (Phase 2) must also be unmodified after therapist session."""
        _build_user_with_history(1)

        eff_before = get_effective_weight_map(1)

        get_therapist_recommendations(1, "I feel numb and hollow inside", 3)
        end_therapist_session(1)

        eff_after = get_effective_weight_map(1)

        assert eff_before == eff_after, "Effective weights changed after therapist session!"


# ────────────────────────── 11. BACKWARD COMPATIBILITY ──────────────────────────

class TestBackwardCompatibility:
    """Ensure Phase 1 and Phase 2 features still work after Phase 3 additions."""

    def test_phase1_interaction_still_works(self):
        ensure_memory_user(1)
        result = update_user_memory(
            user_id=1,
            book_id="The Kiss Thief",
            emotional_tags=["obsessed"],
            rating=5,
        )
        assert result["id"] is not None
        assert result["rating"] == 5

    def test_phase2_trope_weights_still_work(self):
        ensure_memory_user(1)
        eff = get_effective_weight_map(1)
        assert isinstance(eff, dict)  # Empty but functional

    def test_phase2_normal_recs_still_work(self):
        ensure_memory_user(1)
        recs = get_personalized_recommendations(1, limit=5)
        assert "recommendations" in recs

    def test_migrations_include_all_tables(self):
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row["name"] for row in cur.fetchall()}
        conn.close()
        # Phase 1 + 2 + 3 tables
        assert "memory_users" in tables
        assert "book_interactions" in tables
        assert "trope_preferences" in tables
        assert "user_personality_profiles" in tables
        assert "book_tropes" in tables
        assert "book_mmc_types" in tables
        assert "therapist_sessions" in tables


# ────────────────────────── 12. FULL SCENARIO ──────────────────────────

class TestFullPhase3Scenario:
    """End-to-end: user reads books → asks therapist → different recs → session ends → normal restored."""

    def test_complete_therapist_journey(self):
        """Full lifecycle test."""
        # 1. User builds reading history
        _build_user_with_history(50)

        # 2. Get normal recommendations
        normal_recs = get_personalized_recommendations(50, limit=5)
        normal_ids = [r["book_id"] for r in normal_recs["recommendations"]]

        # 3. User feels heartbroken → asks therapist
        therapist_result = get_therapist_recommendations(
            50, "I just had a devastating breakup and I feel heartbroken", 3,
        )
        assert therapist_result["detected_emotion"] == "heartbroken"
        assert len(therapist_result["recommended_books"]) > 0
        assert "heartbroken" in therapist_result["explanation"].lower()
        therapist_ids = [r["book_id"] for r in therapist_result["recommended_books"][:5]]

        # 4. Therapist recs should differ from normal
        assert normal_ids != therapist_ids

        # 5. Session is active
        session = get_active_session(50)
        assert session is not None
        assert session["detected_emotion"] == "heartbroken"

        # 6. End session
        end_result = end_therapist_session(50)
        assert end_result["sessions_ended"] >= 1

        # 7. Normal recommendations restored
        after_recs = get_personalized_recommendations(50, limit=5)
        after_ids = [r["book_id"] for r in after_recs["recommendations"]]
        assert after_ids == normal_ids

        # 8. No active session
        assert get_active_session(50) is None

    def test_mood_switch_mid_session(self):
        """User switches mood — old session deactivated, new one created."""
        ensure_memory_user(60)

        # First mood
        r1 = get_therapist_recommendations(60, "I feel anxious and nervous", 2)
        sid1 = r1["session_id"]

        # Switch mood
        r2 = get_therapist_recommendations(60, "Now I feel empowered and strong", 3)
        sid2 = r2["session_id"]

        assert sid1 != sid2
        assert r1["detected_emotion"] == "anxious"
        assert r2["detected_emotion"] == "empowered"

        # Only the latest session should be active
        session = get_active_session(60)
        assert session["session_id"] == sid2

    def test_therapist_logs_session(self):
        """Session must be logged in the database with full details."""
        ensure_memory_user(70)
        result = get_therapist_recommendations(70, "I feel lonely and isolated", 1)

        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM therapist_sessions WHERE user_id = 70 ORDER BY id DESC LIMIT 1",
        )
        row = cur.fetchone()
        conn.close()

        assert row is not None
        assert row["detected_emotion"] == "lonely"
        assert row["intensity_level"] == 1
        assert row["is_active"] == 1
        assert len(row["input_text"]) > 0
        assert len(row["explanation"]) > 0
        assert json.loads(row["mood_adjustments"])  # parseable JSON with content
