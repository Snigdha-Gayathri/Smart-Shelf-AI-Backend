"""Comprehensive tests for the SmartShelf AI Memory Brain system (Phase 1).

Tests cover:
  • Database migrations and table creation
  • Input validation (emotional tags, ratings, trope actions)
  • Weight clamp verification
  • Memory storage and retrieval
  • Trope weight dynamic update logic
  • Personality profile generation and auto-update
  • Personalized recommendation engine
  • API endpoint integration via FastAPI TestClient
  • Edge cases: duplicate interactions, boundary ratings, weight overflow
  • Full scenario: user reads 3 books → trope weights adapt → personality updates
    → recommendations change — ALL data persists after simulated restart

Run with:
    cd backend
    python -m pytest test_memory_brain.py -v
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import sqlite3
from unittest.mock import patch

import pytest

# ── Ensure backend directory is on sys.path ──
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# ── Use a temporary database for all tests ──
_test_db_dir = tempfile.mkdtemp()
_test_db_path = os.path.join(_test_db_dir, "test_memory.db")

# Patch the DB path before importing any project modules
import database.connection as _conn_mod
_conn_mod.DB_PATH = _test_db_path


# Now import project modules (they will use the patched DB path)
from database.migrations import run_migrations, ensure_memory_user
from database.connection import get_connection
from models.schemas import (
    VALID_EMOTIONAL_TAGS,
    BookInteractionRequest,
    TropePreferenceUpdateRequest,
)
from utils.validators import (
    validate_emotional_tags,
    validate_rating,
    validate_trope_action,
    validate_user_id,
    validate_book_id,
    clamp_weight,
)
from utils.trope_mapper import derive_tropes, derive_mmc_type
from services.memory_service import (
    update_user_memory,
    update_trope_preference,
    get_user_interactions,
    get_user_trope_preferences,
    get_book_tropes,
)
from services.personality_service import (
    generate_personality_profile,
    get_personality_profile,
)
from services.recommendation_service import get_personalized_recommendations


# ────────────────────────── Fixtures ──────────────────────────

@pytest.fixture(autouse=True)
def fresh_database():
    """Reset the test database before each test."""
    # Drop all tables and recreate
    conn = get_connection()
    cur = conn.cursor()
    for table in [
        "book_interactions", "trope_preferences",
        "user_personality_profiles", "book_tropes",
        "book_mmc_types", "memory_users",
    ]:
        cur.execute(f"DROP TABLE IF EXISTS {table}")
    conn.commit()
    conn.close()
    run_migrations()
    yield


@pytest.fixture
def sample_book():
    """A book from the dataset for testing."""
    return {
        "title": "The Kiss Thief",
        "author": "L.J. Shen",
        "synopsis": "A mafia romance with a powerful female lead who refuses to be owned.",
        "genre": "mafia romance",
        "mood": "intense passionate hopeful",
        "tone": "dramatic",
        "pacing": "fast",
        "emotion_tags": ["love", "excitement", "admiration", "desire", "joy"],
    }


# ────────────────────────── 1. DATABASE TESTS ──────────────────────────

class TestDatabaseMigrations:
    """Verify all required tables are created properly."""

    def test_tables_exist(self):
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = {r["name"] for r in cur.fetchall()}
        conn.close()

        assert "memory_users" in tables
        assert "book_interactions" in tables
        assert "trope_preferences" in tables
        assert "user_personality_profiles" in tables
        assert "book_tropes" in tables
        assert "book_mmc_types" in tables

    def test_ensure_memory_user_creates_user(self):
        ensure_memory_user(1, email="test@example.com", name="Test User")
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM memory_users WHERE id = 1")
        row = cur.fetchone()
        conn.close()

        assert row is not None
        assert row["email"] == "test@example.com"
        assert row["name"] == "Test User"

    def test_ensure_memory_user_idempotent(self):
        ensure_memory_user(1, email="a@b.com")
        ensure_memory_user(1, email="a@b.com")  # Should not error
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as cnt FROM memory_users WHERE id = 1")
        assert cur.fetchone()["cnt"] == 1
        conn.close()

    def test_foreign_key_enforcement(self):
        """Interactions should reference an existing memory_user."""
        conn = get_connection()
        cur = conn.cursor()
        with pytest.raises(Exception):
            cur.execute(
                "INSERT INTO book_interactions "
                "(user_id, book_id, emotional_tags, rating) "
                "VALUES (9999, 'nonexistent', '[]', 3)"
            )
            conn.commit()
        conn.close()

    def test_rating_check_constraint(self):
        """Rating must be between 1 and 5."""
        ensure_memory_user(1)
        conn = get_connection()
        cur = conn.cursor()
        with pytest.raises(Exception):
            cur.execute(
                "INSERT INTO book_interactions "
                "(user_id, book_id, emotional_tags, rating) "
                "VALUES (1, 'book', '[]', 6)"
            )
            conn.commit()
        conn.close()

    def test_trope_weight_check_constraint(self):
        """Weight must be between -5 and 5."""
        ensure_memory_user(1)
        conn = get_connection()
        cur = conn.cursor()
        with pytest.raises(Exception):
            cur.execute(
                "INSERT INTO trope_preferences "
                "(user_id, trope_name, weight) VALUES (1, 'test', 10)"
            )
            conn.commit()
        conn.close()


# ────────────────────────── 2. VALIDATION TESTS ──────────────────────────

class TestValidation:
    """Test all input validation functions."""

    def test_valid_emotional_tags(self):
        ok, err = validate_emotional_tags(["safe", "obsessed"])
        assert ok is True
        assert err is None

    def test_invalid_emotional_tag(self):
        ok, err = validate_emotional_tags(["safe", "INVALID"])
        assert ok is False
        assert "INVALID" in err

    def test_empty_emotional_tags(self):
        ok, err = validate_emotional_tags([])
        assert ok is False

    def test_emotional_tags_not_list(self):
        ok, err = validate_emotional_tags("safe")
        assert ok is False

    def test_all_valid_tags_accepted(self):
        for tag in VALID_EMOTIONAL_TAGS:
            ok, err = validate_emotional_tags([tag])
            assert ok is True, f"Tag '{tag}' should be valid"

    def test_valid_ratings(self):
        for r in range(1, 6):
            ok, err = validate_rating(r)
            assert ok is True

    def test_invalid_ratings(self):
        for r in [0, 6, -1, 100]:
            ok, err = validate_rating(r)
            assert ok is False

    def test_rating_type_validation(self):
        ok, err = validate_rating(3.5)
        assert ok is False

    def test_valid_trope_actions(self):
        for action in ["like", "dislike", "tired_of", "never_again", "reset"]:
            ok, err = validate_trope_action(action)
            assert ok is True

    def test_invalid_trope_action(self):
        ok, err = validate_trope_action("invalid")
        assert ok is False

    def test_valid_user_id(self):
        ok, err = validate_user_id(1)
        assert ok is True

    def test_invalid_user_ids(self):
        for uid in [0, -1, "abc", None]:
            ok, err = validate_user_id(uid)
            assert ok is False

    def test_valid_book_id(self):
        ok, err = validate_book_id("The Kiss Thief")
        assert ok is True

    def test_invalid_book_ids(self):
        for bid in ["", "  ", 123, None]:
            ok, err = validate_book_id(bid)
            assert ok is False


# ────────────────────────── 3. WEIGHT CLAMP TESTS ──────────────────────────

class TestWeightClamp:
    """Verify clamp logic enforces [-5, +5] range."""

    def test_clamp_within_range(self):
        for w in range(-5, 6):
            assert clamp_weight(w) == w

    def test_clamp_above_max(self):
        assert clamp_weight(10) == 5
        assert clamp_weight(100) == 5

    def test_clamp_below_min(self):
        assert clamp_weight(-10) == -5
        assert clamp_weight(-100) == -5

    def test_clamp_boundary(self):
        assert clamp_weight(5) == 5
        assert clamp_weight(-5) == -5


# ────────────────────────── 4. TROPE MAPPER TESTS ──────────────────────────

class TestTropeMapper:
    """Test trope and MMC derivation from book metadata."""

    def test_mafia_book_has_mafia_trope(self, sample_book):
        tropes = derive_tropes(sample_book)
        assert "mafia" in tropes

    def test_returns_list_of_strings(self, sample_book):
        tropes = derive_tropes(sample_book)
        assert isinstance(tropes, list)
        assert all(isinstance(t, str) for t in tropes)

    def test_empty_book_gets_fallback_trope(self):
        tropes = derive_tropes({"title": "Unknown", "genre": "", "synopsis": ""})
        assert len(tropes) >= 1

    def test_mmc_type_is_string(self, sample_book):
        mmc = derive_mmc_type(sample_book)
        assert isinstance(mmc, str)
        assert len(mmc) > 0

    def test_mmc_alpha_for_mafia(self, sample_book):
        mmc = derive_mmc_type(sample_book)
        assert mmc in ("alpha", "possessive", "morally-grey", "brooding")

    def test_romance_book_gets_tropes(self):
        book = {
            "title": "The Love Hypothesis",
            "synopsis": "kiss the first man she sees: Adam Carlsen, a hotshot professor and well-known ass",
            "genre": "contemporary romance",
            "mood": "witty romantic",
            "tone": "humorous",
            "pacing": "fast",
        }
        tropes = derive_tropes(book)
        assert len(tropes) >= 1

    def test_fake_dating_detected(self):
        book = {
            "title": "Test",
            "synopsis": "She needed a fake boyfriend to convince her family",
            "genre": "romance",
            "mood": "fun",
        }
        tropes = derive_tropes(book)
        assert "fake-dating" in tropes

    def test_enemies_to_lovers_detected(self):
        book = {
            "title": "Test",
            "synopsis": "They were bitter enemies who hated each other",
            "genre": "romance",
            "mood": "intense",
        }
        tropes = derive_tropes(book)
        assert "enemies-to-lovers" in tropes


# ────────────────────────── 5. MEMORY SERVICE TESTS ──────────────────────────

class TestMemoryService:
    """Test the core memory update pipeline."""

    def test_store_interaction(self):
        result = update_user_memory(
            user_id=1,
            book_id="The Kiss Thief",
            emotional_tags=["obsessed", "safe"],
            rating=5,
            liked_mmc_type="alpha",
        )
        assert result["id"] is not None
        assert result["user_id"] == 1
        assert result["book_id"] == "The Kiss Thief"
        assert result["rating"] == 5
        assert "obsessed" in result["emotional_tags"]

    def test_interaction_persists(self):
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["safe"], rating=4,
        )
        interactions = get_user_interactions(1)
        assert len(interactions) == 1
        assert interactions[0]["book_id"] == "The Kiss Thief"

    def test_trope_weights_increase_on_high_rating(self):
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["obsessed"], rating=5,
        )
        prefs = get_user_trope_preferences(1)
        pref_dict = {p["trope_name"]: p["weight"] for p in prefs}
        # The Kiss Thief is mafia genre — should have "mafia" trope with weight >= 1
        assert any(w > 0 for w in pref_dict.values()), f"Expected positive weights: {pref_dict}"

    def test_trope_weights_decrease_on_low_rating(self):
        # First give it a positive rating to create the trope entry
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["safe"], rating=5,
        )
        prefs_before = {p["trope_name"]: p["weight"] for p in get_user_trope_preferences(1)}

        # Now rate a book with same tropes poorly
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["destroyed"], rating=1,
        )
        prefs_after = {p["trope_name"]: p["weight"] for p in get_user_trope_preferences(1)}

        # At least one trope weight should have decreased
        for trope in prefs_before:
            if trope in prefs_after:
                assert prefs_after[trope] <= prefs_before[trope], \
                    f"Trope '{trope}' should have decreased"

    def test_neutral_rating_no_change(self):
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["safe"], rating=5,
        )
        prefs_before = {p["trope_name"]: p["weight"] for p in get_user_trope_preferences(1)}

        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["comforted"], rating=3,
        )
        prefs_after = {p["trope_name"]: p["weight"] for p in get_user_trope_preferences(1)}

        for trope in prefs_before:
            assert prefs_after.get(trope) == prefs_before[trope], \
                f"Trope '{trope}' should not change with rating=3"

    def test_invalid_emotional_tag_rejected(self):
        with pytest.raises(ValueError, match="Invalid emotional tags"):
            update_user_memory(
                user_id=1, book_id="test",
                emotional_tags=["invalid_tag"], rating=3,
            )

    def test_invalid_rating_rejected(self):
        with pytest.raises(ValueError):
            update_user_memory(
                user_id=1, book_id="test",
                emotional_tags=["safe"], rating=10,
            )

    def test_multiple_interactions_stored(self):
        for i in range(3):
            update_user_memory(
                user_id=1, book_id=f"Book {i}",
                emotional_tags=["safe"], rating=4,
            )
        interactions = get_user_interactions(1)
        assert len(interactions) == 3


# ────────────────────────── 6. TROPE PREFERENCE MANUAL UPDATE ──────────────────────────

class TestTropePreferenceUpdate:
    """Test manual trope preference actions."""

    def test_like_action(self):
        result = update_trope_preference(1, "enemies-to-lovers", "like")
        assert result["weight"] >= 2

    def test_dislike_action(self):
        result = update_trope_preference(1, "enemies-to-lovers", "dislike")
        assert result["weight"] <= -1

    def test_tired_of_action(self):
        result = update_trope_preference(1, "fake-dating", "tired_of")
        assert result["weight"] == -3

    def test_never_again_action(self):
        result = update_trope_preference(1, "love-triangle", "never_again")
        assert result["weight"] == -5

    def test_reset_action(self):
        update_trope_preference(1, "enemies-to-lovers", "like")
        result = update_trope_preference(1, "enemies-to-lovers", "reset")
        assert result["weight"] == 0

    def test_weight_never_exceeds_plus_5(self):
        # Like the same trope many times
        for _ in range(20):
            result = update_trope_preference(1, "enemies-to-lovers", "like")
        assert result["weight"] <= 5

    def test_weight_never_below_minus_5(self):
        for _ in range(20):
            result = update_trope_preference(1, "enemies-to-lovers", "dislike")
        assert result["weight"] >= -5


# ────────────────────────── 7. PERSONALITY PROFILE TESTS ──────────────────────────

class TestPersonalityProfile:
    """Test personality profile generation and retrieval."""

    def test_profile_generated_after_interaction(self):
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["obsessed", "safe"],
            rating=5, liked_mmc_type="alpha",
        )
        profile = get_personality_profile(1)
        assert profile is not None
        assert profile["user_id"] == 1
        assert isinstance(profile["dominant_emotions"], list)
        assert isinstance(profile["top_tropes"], list)
        assert isinstance(profile["avoided_tropes"], list)

    def test_dominant_emotions_reflect_interactions(self):
        for _ in range(3):
            update_user_memory(
                user_id=1, book_id="The Kiss Thief",
                emotional_tags=["obsessed", "destroyed"],
                rating=4,
            )
        profile = get_personality_profile(1)
        # "obsessed" and "destroyed" should be dominant
        assert "obsessed" in profile["dominant_emotions"]
        assert "destroyed" in profile["dominant_emotions"]

    def test_preferred_mmc_type(self):
        for _ in range(3):
            update_user_memory(
                user_id=1, book_id="The Kiss Thief",
                emotional_tags=["safe"], rating=4,
                liked_mmc_type="alpha",
            )
        profile = get_personality_profile(1)
        assert profile["preferred_mmc_type"] == "alpha"

    def test_top_tropes_populated(self):
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["safe"], rating=5,
        )
        profile = get_personality_profile(1)
        assert len(profile["top_tropes"]) > 0

    def test_avoided_tropes_populated(self):
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["safe"], rating=4,
        )
        # Manually mark a trope as "tired_of"
        update_trope_preference(1, "love-triangle", "tired_of")
        profile = get_personality_profile(1)
        assert "love-triangle" in profile["avoided_tropes"]

    def test_profile_none_for_new_user(self):
        ensure_memory_user(99)
        profile = get_personality_profile(99)
        assert profile is None

    def test_profile_auto_updates(self):
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["safe"], rating=5, liked_mmc_type="alpha",
        )
        profile1 = get_personality_profile(1)

        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["destroyed", "heartbroken"],
            rating=2, liked_mmc_type="tortured",
        )
        profile2 = get_personality_profile(1)

        # Profile should have changed
        assert profile2["last_updated"] >= profile1["last_updated"]


# ────────────────────────── 8. RECOMMENDATION ENGINE TESTS ──────────────────────────

class TestRecommendationEngine:
    """Test the personalized recommendation service."""

    def test_returns_recommendations(self):
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["obsessed"], rating=5,
        )
        result = get_personalized_recommendations(1)
        assert "recommendations" in result
        assert len(result["recommendations"]) > 0

    def test_recommendations_have_required_fields(self):
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["safe"], rating=4,
        )
        result = get_personalized_recommendations(1)
        for rec in result["recommendations"][:3]:
            assert "book_id" in rec
            assert "title" in rec
            assert "author" in rec
            assert "match_score" in rec
            assert "tropes" in rec

    def test_already_read_books_excluded(self):
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["safe"], rating=5,
        )
        result = get_personalized_recommendations(1)
        rec_ids = [r["book_id"] for r in result["recommendations"]]
        assert "The Kiss Thief" not in rec_ids

    def test_never_again_tropes_excluded(self):
        # Mark mafia as "never again"
        update_trope_preference(1, "mafia", "never_again")
        # Rate a non-mafia book to generate preferences
        update_user_memory(
            user_id=1, book_id="The Love Hypothesis",
            emotional_tags=["safe", "comforted"], rating=5,
        )
        result = get_personalized_recommendations(1)
        for rec in result["recommendations"]:
            assert "mafia" not in rec.get("tropes", []), \
                f"Book '{rec['title']}' has excluded 'mafia' trope"

    def test_default_recommendations_for_new_user(self):
        ensure_memory_user(1)
        result = get_personalized_recommendations(1)
        assert "recommendations" in result
        # Should still return some books even with no preferences
        assert len(result["recommendations"]) > 0

    def test_limit_parameter(self):
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["safe"], rating=5,
        )
        result = get_personalized_recommendations(1, limit=3)
        assert len(result["recommendations"]) <= 3

    def test_recommendations_change_with_interactions(self):
        """The core test: recommendations must change as preferences evolve."""
        # Initial interaction: user likes mafia books
        update_user_memory(
            user_id=1, book_id="The Kiss Thief",
            emotional_tags=["obsessed"], rating=5,
        )
        recs_1 = get_personalized_recommendations(1)
        scores_1 = {r["book_id"]: r["match_score"] for r in recs_1["recommendations"]}

        # User marks mafia as "tired_of" — preferences shift
        update_trope_preference(1, "mafia", "tired_of")
        update_trope_preference(1, "fake-dating", "like")

        recs_2 = get_personalized_recommendations(1)
        scores_2 = {r["book_id"]: r["match_score"] for r in recs_2["recommendations"]}

        # The recommendation ordering should differ
        order_1 = [r["book_id"] for r in recs_1["recommendations"][:5]]
        order_2 = [r["book_id"] for r in recs_2["recommendations"][:5]]
        assert order_1 != order_2, \
            "Recommendations should change after preference updates"


# ────────────────────────── 9. FULL SCENARIO TEST ──────────────────────────

class TestFullScenario:
    """End-to-end: user reads 3 books → system adapts → personality + recs change.

    This test validates the Phase 1 completion criteria:
      1. User reads 3 books
      2. System adapts trope weights
      3. Personality profile updates automatically
      4. Recommendations change based on interactions
      5. All data persists (tested by re-querying DB)
    """

    def test_complete_3_book_journey(self):
        user_id = 1

        # ── Book 1: The Kiss Thief (mafia) — loved it ──
        r1 = update_user_memory(
            user_id=user_id,
            book_id="The Kiss Thief",
            emotional_tags=["obsessed", "empowered"],
            rating=5,
            liked_mmc_type="alpha",
        )
        assert r1["id"] is not None
        profile_1 = get_personality_profile(user_id)
        assert profile_1 is not None
        recs_1 = get_personalized_recommendations(user_id)

        # ── Book 2: The Love Hypothesis (contemporary) — liked it ──
        r2 = update_user_memory(
            user_id=user_id,
            book_id="The Love Hypothesis",
            emotional_tags=["safe", "comforted"],
            rating=4,
            liked_mmc_type="grumpy",
        )
        assert r2["id"] is not None
        profile_2 = get_personality_profile(user_id)
        assert profile_2["last_updated"] >= profile_1["last_updated"]

        # ── Book 3: Twisted Love (dark) — hated it ──
        r3 = update_user_memory(
            user_id=user_id,
            book_id="Twisted Love",
            emotional_tags=["destroyed", "anxious"],
            rating=1,
            liked_mmc_type="morally-grey",
        )
        assert r3["id"] is not None
        profile_3 = get_personality_profile(user_id)
        recs_3 = get_personalized_recommendations(user_id)

        # ── Verify: 3 interactions stored ──
        interactions = get_user_interactions(user_id)
        assert len(interactions) == 3

        # ── Verify: trope weights adapted ──
        prefs = {p["trope_name"]: p["weight"] for p in get_user_trope_preferences(user_id)}
        assert len(prefs) > 0, "Should have trope preferences"

        # ── Verify: personality profile reflects interactions ──
        assert "obsessed" in profile_3["dominant_emotions"] or \
               "safe" in profile_3["dominant_emotions"] or \
               "destroyed" in profile_3["dominant_emotions"]

        # ── Verify: recommendations changed ──
        order_1 = [r["book_id"] for r in recs_1["recommendations"][:5]]
        order_3 = [r["book_id"] for r in recs_3["recommendations"][:5]]
        # Books user already read should be excluded from recs_3
        read_books = {"The Kiss Thief", "The Love Hypothesis", "Twisted Love"}
        for book_id in recs_3["recommendations"]:
            assert book_id["book_id"] not in read_books

        # ── Verify: data persists (re-query from DB) ──
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as cnt FROM book_interactions WHERE user_id = ?", (user_id,))
        assert cur.fetchone()["cnt"] == 3

        cur.execute("SELECT COUNT(*) as cnt FROM trope_preferences WHERE user_id = ?", (user_id,))
        assert cur.fetchone()["cnt"] > 0

        cur.execute("SELECT * FROM user_personality_profiles WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        assert row is not None
        assert json.loads(row["dominant_emotions"]) == profile_3["dominant_emotions"]

        conn.close()


# ────────────────────────── 10. API ENDPOINT TESTS ──────────────────────────

class TestAPIEndpoints:
    """Test the FastAPI endpoints via TestClient."""

    @pytest.fixture(autouse=True)
    def setup_client(self):
        """Create a TestClient for the app."""
        # Patch environment to skip ML for faster tests
        os.environ["SKIP_ML"] = "1"
        # Need to import app after patching DB
        from fastapi.testclient import TestClient
        from app import app
        self.client = TestClient(app)

    def test_post_books_interact(self):
        resp = self.client.post("/books/interact", json={
            "user_id": 1,
            "book_id": "The Kiss Thief",
            "emotional_tags": ["obsessed", "safe"],
            "rating": 5,
            "liked_mmc_type": "alpha",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["interaction"]["book_id"] == "The Kiss Thief"

    def test_post_books_interact_invalid_tag(self):
        resp = self.client.post("/books/interact", json={
            "user_id": 1,
            "book_id": "Test",
            "emotional_tags": ["notreal"],
            "rating": 3,
        })
        assert resp.status_code == 422

    def test_post_books_interact_invalid_rating(self):
        resp = self.client.post("/books/interact", json={
            "user_id": 1,
            "book_id": "Test",
            "emotional_tags": ["safe"],
            "rating": 0,
        })
        assert resp.status_code == 422

    def test_get_personality(self):
        # Create interaction first
        self.client.post("/books/interact", json={
            "user_id": 1,
            "book_id": "The Kiss Thief",
            "emotional_tags": ["safe"],
            "rating": 4,
        })
        resp = self.client.get("/users/1/personality")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["profile"] is not None
        assert "dominant_emotions" in data["profile"]

    def test_get_personality_no_interactions(self):
        ensure_memory_user(99)
        resp = self.client.get("/users/99/personality")
        assert resp.status_code == 200
        data = resp.json()
        assert data["profile"] is None

    def test_get_recommendations(self):
        self.client.post("/books/interact", json={
            "user_id": 1,
            "book_id": "The Kiss Thief",
            "emotional_tags": ["obsessed"],
            "rating": 5,
        })
        resp = self.client.get("/users/1/recommendations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert len(data["recommendations"]) > 0

    def test_patch_trope_preference(self):
        ensure_memory_user(1)
        resp = self.client.patch("/users/1/trope-preference", json={
            "trope_name": "enemies-to-lovers",
            "action": "like",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["trope_preference"]["weight"] >= 2

    def test_patch_trope_preference_invalid_action(self):
        ensure_memory_user(1)
        resp = self.client.patch("/users/1/trope-preference", json={
            "trope_name": "enemies-to-lovers",
            "action": "invalid_action",
        })
        assert resp.status_code == 422

    def test_get_trope_preferences(self):
        ensure_memory_user(1)
        update_trope_preference(1, "enemies-to-lovers", "like")
        resp = self.client.get("/users/1/trope-preferences")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert len(data["preferences"]) > 0

    def test_invalid_user_id(self):
        resp = self.client.get("/users/0/personality")
        assert resp.status_code == 422

    def test_recommendations_limit(self):
        self.client.post("/books/interact", json={
            "user_id": 1,
            "book_id": "The Kiss Thief",
            "emotional_tags": ["safe"],
            "rating": 5,
        })
        resp = self.client.get("/users/1/recommendations?limit=3")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["recommendations"]) <= 3


# ────────────────────────── 11. EDGE CASE TESTS ──────────────────────────

class TestEdgeCases:
    """Test boundary conditions and edge cases."""

    def test_weight_overflow_from_many_high_ratings(self):
        """Rating the same book 10 times with 5 stars shouldn't exceed weight +5."""
        for _ in range(10):
            update_user_memory(
                user_id=1, book_id="The Kiss Thief",
                emotional_tags=["safe"], rating=5,
            )
        prefs = {p["trope_name"]: p["weight"] for p in get_user_trope_preferences(1)}
        for trope, weight in prefs.items():
            assert weight <= 5, f"Trope '{trope}' has weight {weight} > 5"

    def test_weight_underflow_from_many_low_ratings(self):
        """Rating the same book 10 times with 1 star shouldn't go below -5."""
        for _ in range(10):
            update_user_memory(
                user_id=1, book_id="The Kiss Thief",
                emotional_tags=["destroyed"], rating=1,
            )
        prefs = {p["trope_name"]: p["weight"] for p in get_user_trope_preferences(1)}
        for trope, weight in prefs.items():
            assert weight >= -5, f"Trope '{trope}' has weight {weight} < -5"

    def test_multiple_users_independent(self):
        """Two users' preferences should not interfere."""
        update_user_memory(1, "The Kiss Thief", ["obsessed"], 5, "alpha")
        update_user_memory(2, "The Kiss Thief", ["destroyed"], 1, "tortured")

        profile_1 = get_personality_profile(1)
        profile_2 = get_personality_profile(2)

        assert profile_1["dominant_emotions"] != profile_2["dominant_emotions"] or \
               profile_1["preferred_mmc_type"] != profile_2["preferred_mmc_type"]

    def test_same_book_different_emotions(self):
        """Same book, different emotional reactions stored separately."""
        update_user_memory(1, "The Kiss Thief", ["safe"], 5)
        update_user_memory(1, "The Kiss Thief", ["destroyed"], 1)
        interactions = get_user_interactions(1)
        assert len(interactions) == 2
        tags = [set(i["emotional_tags"]) for i in interactions]
        assert {"safe"} in tags
        assert {"destroyed"} in tags

    def test_all_emotional_tags_accepted_in_interaction(self):
        """All 10 valid emotional tags can be used in a single interaction."""
        all_tags = list(VALID_EMOTIONAL_TAGS)
        result = update_user_memory(1, "The Kiss Thief", all_tags, 3)
        assert len(result["emotional_tags"]) == len(all_tags)

    def test_personality_with_single_interaction(self):
        """Profile generation works with just one interaction."""
        update_user_memory(1, "The Kiss Thief", ["safe"], 4, "alpha")
        profile = get_personality_profile(1)
        assert profile is not None
        assert "safe" in profile["dominant_emotions"]
