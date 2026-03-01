"""Comprehensive tests for Phase 4: Multi-Agent AI Orchestration System.

Tests cover:
  • Individual agent isolation (each testable independently)
  • Orchestrator flow: book interaction → Memory → Tropes → ReadingHabit → Growth
  • Orchestrator flow: therapist → Emotion → Therapist → Recommendation
  • Orchestrator flow: standalone recommendations
  • No direct agent-to-agent calls (dependency injection verified)
  • Reading Habit Agent: frequency, binge, inactivity, trope loops
  • Growth Agent: over-reliance, cluster dominance, MMC diversification
  • Emotion Agent: reusable, structured output
  • Recommendation Agent: standard path + custom-weight path
  • Therapist Agent: session lifecycle via orchestrator
  • API endpoints: all routes go through orchestrator
  • Backward compatibility: Phase 1+2+3 tests still pass
  • Logging: structured agent/orchestrator tags present

Run with:
    cd backend
    $env:SKIP_ML="1"; python -m pytest test_orchestrator.py -v --tb=short
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

# ── Ensure backend directory is on sys.path ──
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# ── Use a temporary database for all tests ──
_test_db_dir = tempfile.mkdtemp()
_test_db_path = os.path.join(_test_db_dir, "test_orchestrator.db")

import database.connection as _conn_mod
_conn_mod.DB_PATH = _test_db_path

# Now import project modules
from database.migrations import run_migrations, ensure_memory_user
from database.connection import get_connection
from services.memory_service import update_user_memory, get_user_trope_preferences
from services.trope_engine_service import get_effective_weight_map, get_trope_analytics
from services.recommendation_service import get_personalized_recommendations
from services.therapist_service import (
    get_active_session as core_get_active_session,
    end_therapist_session as core_end_session,
)
from utils.trope_mapper import derive_tropes, derive_mmc_type

# ── Agent imports (Phase 4) ──
from services.agents.emotion_agent import analyze_emotion, get_supported_emotions
from services.agents.recommendation_agent import get_recommendations as rec_agent_get
from services.agents.reading_habit_agent import analyze_reading_habits
from services.agents.therapist_agent import (
    build_therapist_session,
    get_active_session as therapist_agent_active,
    end_session as therapist_agent_end,
)
from services.agents.growth_agent import analyze_growth, TROPE_CLUSTERS
from services.agents.agent_orchestrator import (
    handle_book_interaction,
    handle_therapist_session,
    get_recommendations as orch_get_recs,
    get_active_therapist_session,
    end_therapist_session as orch_end_session,
    get_reading_habits,
    get_growth_insights,
    get_dashboard,
)


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
                      tags: list[str] = None, mmc_type: str = None,
                      created_at: str = None):
    """Insert a book interaction via memory service."""
    tags = tags or ["safe"]
    result = update_user_memory(
        user_id=user_id,
        book_id=book_id,
        emotional_tags=tags,
        rating=rating,
        liked_mmc_type=mmc_type,
    )
    # Optionally backdate the created_at for habit analysis
    if created_at:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE book_interactions SET created_at = ? WHERE id = ?",
            (created_at, result["id"]),
        )
        conn.commit()
        conn.close()
    return result


def _build_user_with_history(user_id: int):
    """Build a user with diverse reading history."""
    ensure_memory_user(user_id)
    _seed_book_tropes("BookA", ["enemies-to-lovers", "dark-romance"])
    _seed_book_tropes("BookB", ["slow-burn", "friends-to-lovers"])
    _seed_book_tropes("BookC", ["enemies-to-lovers", "mafia", "dark-romance"])
    _seed_interaction(user_id, "BookA", rating=5, tags=["obsessed"], mmc_type="morally-grey")
    _seed_interaction(user_id, "BookB", rating=4, tags=["comforted"], mmc_type="cinnamon-roll")
    _seed_interaction(user_id, "BookC", rating=5, tags=["obsessed"], mmc_type="alpha")


def _build_repetitive_user(user_id: int):
    """Build a user who reads the same trope cluster repeatedly."""
    ensure_memory_user(user_id)
    for i in range(6):
        bid = f"DarkBook{i}"
        _seed_book_tropes(bid, ["dark-romance", "enemies-to-lovers"])
        _seed_interaction(
            user_id, bid, rating=5,
            tags=["obsessed"], mmc_type="morally-grey",
        )


# ════════════════════════════════════════════════════════════════
#  1. EMOTION AGENT — Isolated Tests
# ════════════════════════════════════════════════════════════════

class TestEmotionAgentIsolated:
    """Emotion Agent must be independently testable."""

    def test_returns_structured_result(self):
        result = analyze_emotion("I feel heartbroken and devastated")
        assert "detected_emotion" in result
        assert "confidence_score" in result
        assert result["agent"] == "emotion"

    def test_reusable_across_contexts(self):
        """Should be callable multiple times without state."""
        r1 = analyze_emotion("I feel lonely and isolated")
        r2 = analyze_emotion("I feel empowered and confident")
        assert r1["detected_emotion"] == "lonely"
        assert r2["detected_emotion"] == "empowered"

    def test_supported_emotions_list(self):
        emotions = get_supported_emotions()
        assert len(emotions) == 8
        assert "heartbroken" in emotions
        assert "craving-intensity" in emotions

    def test_invalid_input_raises(self):
        with pytest.raises(ValueError):
            analyze_emotion("")

    def test_agent_tag_in_result(self):
        result = analyze_emotion("I feel anxious and worried")
        assert result["agent"] == "emotion"


# ════════════════════════════════════════════════════════════════
#  2. RECOMMENDATION AGENT — Isolated Tests
# ════════════════════════════════════════════════════════════════

class TestRecommendationAgentIsolated:
    """Recommendation Agent must be independently testable."""

    def test_standard_path_returns_books(self):
        ensure_memory_user(1)
        result = rec_agent_get(1, limit=5)
        assert result["agent"] == "recommendation"
        assert "recommendations" in result

    def test_custom_weight_path(self):
        ensure_memory_user(1)
        weights = {"enemies-to-lovers": 5.0, "dark-romance": 4.0, "slow-burn": -5.0}
        result = rec_agent_get(1, weight_overrides=weights, limit=5)
        assert result["agent"] == "recommendation"
        assert len(result["recommendations"]) > 0

    def test_does_not_know_about_therapist(self):
        """Recommendation agent should not import therapist modules."""
        import services.agents.recommendation_agent as mod
        source = open(mod.__file__, "r", encoding="utf-8").read()
        assert "from services.agents.therapist_agent" not in source
        assert "import therapist" not in source.lower()

    def test_extra_mmc_bonus(self):
        ensure_memory_user(1)
        weights = {"dark-romance": 3.0}
        result = rec_agent_get(
            1, weight_overrides=weights,
            extra_mmc_bonus_types=["morally-grey"], limit=5,
        )
        assert result["agent"] == "recommendation"


# ════════════════════════════════════════════════════════════════
#  3. READING HABIT AGENT — Isolated Tests
# ════════════════════════════════════════════════════════════════

class TestReadingHabitAgentIsolated:
    """Reading Habit Agent must be independently testable."""

    def test_no_history_returns_empty(self):
        ensure_memory_user(1)
        result = analyze_reading_habits(1)
        assert result["agent"] == "reading_habit"
        assert result["reading_frequency"]["total_books"] == 0
        assert result["binge_score"] == 0.0
        assert result["is_inactive"] is False

    def test_basic_reading_stats(self):
        ensure_memory_user(1)
        _seed_interaction(1, "Book1", rating=5, tags=["safe"])
        _seed_interaction(1, "Book2", rating=4, tags=["safe"])
        result = analyze_reading_habits(1)
        assert result["reading_frequency"]["total_books"] == 2
        assert result["reading_frequency"]["books_last_7_days"] >= 0

    def test_binge_detection(self):
        ensure_memory_user(1)
        # Create 5 interactions all within last 7 days
        for i in range(5):
            _seed_interaction(1, f"BingeBook{i}", rating=4, tags=["safe"])
        result = analyze_reading_habits(1)
        assert result["binge_score"] >= 1.0  # 5/4 threshold

    def test_inactivity_detection(self):
        ensure_memory_user(1)
        # Create one old interaction
        past = (datetime.utcnow() - timedelta(days=60)).isoformat()
        _seed_interaction(1, "OldBook", rating=4, tags=["safe"], created_at=past)
        result = analyze_reading_habits(1)
        assert result["is_inactive"] is True
        assert result["inactivity_days"] >= 59

    def test_trope_repetition_detection(self):
        _build_repetitive_user(1)
        result = analyze_reading_habits(1)
        assert result["trope_repetition_score"] >= 0.6
        assert result["dominant_trope_loop"] is not None

    def test_structured_output(self):
        ensure_memory_user(1)
        result = analyze_reading_habits(1)
        assert "reading_frequency" in result
        assert "dominant_reading_time" in result
        assert "binge_score" in result
        assert "inactivity_days" in result
        assert "trope_repetition_score" in result


# ════════════════════════════════════════════════════════════════
#  4. THERAPIST AGENT — Isolated Tests
# ════════════════════════════════════════════════════════════════

class TestTherapistAgentIsolated:
    """Therapist Agent must be independently testable with injected dependencies."""

    def test_build_session_with_callback(self):
        ensure_memory_user(1)

        # Provide a mock recommendation callback
        mock_rec_fn = MagicMock(return_value={
            "recommendations": [{"book_id": "TestBook", "title": "Test"}],
            "agent": "recommendation",
        })

        emotion_result = {"detected_emotion": "heartbroken", "confidence_score": 0.8}

        result = build_therapist_session(
            user_id=1,
            input_text="I feel heartbroken and alone",
            intensity_level=2,
            emotion_result=emotion_result,
            recommendation_fn=mock_rec_fn,
        )

        assert result["agent"] == "therapist"
        assert result["detected_emotion"] == "heartbroken"
        assert len(result["recommended_books"]) > 0
        assert len(result["explanation"]) > 0
        mock_rec_fn.assert_called_once()

    def test_does_not_directly_call_emotion_agent(self):
        """Therapist agent module should not import emotion agent."""
        import services.agents.therapist_agent as mod
        source = open(mod.__file__, "r").read()
        assert "from services.agents.emotion_agent" not in source

    def test_does_not_directly_call_recommendation_agent(self):
        """Therapist agent module should not import recommendation agent."""
        import services.agents.therapist_agent as mod
        source = open(mod.__file__, "r").read()
        assert "from services.agents.recommendation_agent" not in source

    def test_session_lifecycle(self):
        ensure_memory_user(1)
        mock_rec_fn = MagicMock(return_value={"recommendations": [], "agent": "recommendation"})
        emotion_result = {"detected_emotion": "lonely", "confidence_score": 0.7}

        build_therapist_session(1, "lonely text here", 2, emotion_result, mock_rec_fn)

        session = therapist_agent_active(1)
        assert session is not None
        assert session["detected_emotion"] == "lonely"

        end_result = therapist_agent_end(1)
        assert end_result["sessions_ended"] >= 1
        assert therapist_agent_active(1) is None

    def test_invalid_intensity_rejected(self):
        ensure_memory_user(1)
        mock_rec_fn = MagicMock()
        emotion_result = {"detected_emotion": "numb", "confidence_score": 0.5}
        with pytest.raises(ValueError):
            build_therapist_session(1, "numb text", 5, emotion_result, mock_rec_fn)


# ════════════════════════════════════════════════════════════════
#  5. GROWTH AGENT — Isolated Tests
# ════════════════════════════════════════════════════════════════

class TestGrowthAgentIsolated:
    """Growth Agent must be independently testable with injected data."""

    def test_no_data_returns_empty(self):
        result = analyze_growth(
            user_id=1,
            trope_analytics={"top_tropes": []},
            habit_data={"reading_frequency": {"total_books": 0}, "trope_repetition_score": 0},
        )
        assert result["agent"] == "growth"
        assert result["needs_growth"] is False
        assert result["growth_suggestions"] == []

    def test_insufficient_data_no_suggestions(self):
        result = analyze_growth(
            user_id=1,
            trope_analytics={"top_tropes": [{"trope_name": "dark-romance", "weight": 5}]},
            habit_data={"reading_frequency": {"total_books": 2}, "trope_repetition_score": 0},
        )
        assert result["needs_growth"] is False

    def test_over_reliance_detected(self):
        result = analyze_growth(
            user_id=1,
            trope_analytics={
                "top_tropes": [
                    {"trope_name": "dark-romance", "effective_weight": 5},
                    {"trope_name": "enemies-to-lovers", "effective_weight": 4},
                ],
            },
            habit_data={
                "reading_frequency": {"total_books": 10},
                "trope_repetition_score": 0.3,
                "dominant_trope_loop": None,
            },
        )
        assert result["needs_growth"] is True
        assert "dark-romance" in result["over_reliant_tropes"]
        assert len(result["growth_suggestions"]) > 0

    def test_consecutive_pattern_detected(self):
        result = analyze_growth(
            user_id=1,
            trope_analytics={"top_tropes": []},
            habit_data={
                "reading_frequency": {"total_books": 8},
                "trope_repetition_score": 0.8,
                "dominant_trope_loop": "enemies-to-lovers",
            },
        )
        assert result["needs_growth"] is True
        assert result["consecutive_pattern"] == "enemies-to-lovers"

    def test_cluster_dominance_detected(self):
        result = analyze_growth(
            user_id=1,
            trope_analytics={
                "top_tropes": [
                    {"trope_name": "dark-romance", "effective_weight": 5},
                    {"trope_name": "mafia", "effective_weight": 4},
                    {"trope_name": "enemies-to-lovers", "effective_weight": 3},
                ],
            },
            habit_data={
                "reading_frequency": {"total_books": 10},
                "trope_repetition_score": 0.3,
                "dominant_trope_loop": None,
            },
        )
        assert result["dominant_cluster"] == "dark-intensity"
        assert result["cluster_dominance_ratio"] > 0.5

    def test_growth_triggers_only_at_threshold(self):
        """Growth should NOT trigger when weights are moderate and spread across clusters."""
        result = analyze_growth(
            user_id=1,
            trope_analytics={
                "top_tropes": [
                    {"trope_name": "slow-burn", "effective_weight": 2},
                    {"trope_name": "dark-romance", "effective_weight": 2},
                    {"trope_name": "age-gap", "effective_weight": 2},
                ],
            },
            habit_data={
                "reading_frequency": {"total_books": 5},
                "trope_repetition_score": 0.2,
                "dominant_trope_loop": None,
            },
        )
        assert result["needs_growth"] is False

    def test_mmc_suggestion_with_repetitive_user(self):
        _build_repetitive_user(1)
        habits = analyze_reading_habits(1)
        analytics = get_trope_analytics(1)
        result = analyze_growth(1, analytics, habits)
        # User read 6 morally-grey MMC books → should get suggestion
        assert result["mmc_suggestion"] is not None
        assert "morally grey" in result["mmc_suggestion"].lower()


# ════════════════════════════════════════════════════════════════
#  6. ORCHESTRATOR — Book Interaction Flow
# ════════════════════════════════════════════════════════════════

class TestOrchestratorBookInteraction:
    """Test: finishing a book triggers Memory → Tropes → Habit → Growth."""

    def test_full_pipeline_returns_all_sections(self):
        ensure_memory_user(1)
        result = handle_book_interaction(
            user_id=1,
            book_id="The Kiss Thief",
            emotional_tags=["obsessed"],
            rating=5,
            liked_mmc_type="morally-grey",
        )
        assert result["status"] == "ok"
        assert "interaction" in result
        assert "reading_habits" in result
        assert "growth_insights" in result

    def test_memory_updated(self):
        ensure_memory_user(1)
        result = handle_book_interaction(
            user_id=1,
            book_id="The Kiss Thief",
            emotional_tags=["obsessed"],
            rating=5,
        )
        assert result["interaction"]["id"] is not None
        assert result["interaction"]["rating"] == 5

    def test_reading_habits_included(self):
        ensure_memory_user(1)
        result = handle_book_interaction(
            user_id=1,
            book_id="BookX",
            emotional_tags=["safe"],
            rating=4,
        )
        habits = result["reading_habits"]
        assert habits["agent"] == "reading_habit"
        assert habits["reading_frequency"]["total_books"] >= 1

    def test_growth_included(self):
        ensure_memory_user(1)
        result = handle_book_interaction(
            user_id=1,
            book_id="BookY",
            emotional_tags=["safe"],
            rating=4,
        )
        growth = result["growth_insights"]
        assert growth["agent"] == "growth"
        assert "needs_growth" in growth

    def test_tropes_adjusted_after_interaction(self):
        ensure_memory_user(1)
        _seed_book_tropes("DarkBook", ["dark-romance", "enemies-to-lovers"])
        handle_book_interaction(
            user_id=1,
            book_id="DarkBook",
            emotional_tags=["obsessed"],
            rating=5,
        )
        prefs = {p["trope_name"]: p["weight"] for p in get_user_trope_preferences(1)}
        assert prefs.get("dark-romance", 0) > 0
        assert prefs.get("enemies-to-lovers", 0) > 0

    def test_validation_error_propagates(self):
        ensure_memory_user(1)
        with pytest.raises(ValueError):
            handle_book_interaction(
                user_id=1,
                book_id="BookZ",
                emotional_tags=["invalid_tag_xyz"],
                rating=5,
            )


# ════════════════════════════════════════════════════════════════
#  7. ORCHESTRATOR — Therapist Flow
# ════════════════════════════════════════════════════════════════

class TestOrchestratorTherapistFlow:
    """Test: therapist uses Emotion → Therapist → Recommendation agents."""

    def test_full_therapist_flow(self):
        ensure_memory_user(1)
        result = handle_therapist_session(1, "I feel heartbroken and devastated", 2)
        assert result["status"] == "ok"
        assert result["detected_emotion"] == "heartbroken"
        assert len(result["recommended_books"]) > 0
        assert len(result["explanation"]) > 30

    def test_emotion_classified_via_emotion_agent(self):
        ensure_memory_user(1)
        result = handle_therapist_session(1, "I feel anxious and stressed", 2)
        assert result["detected_emotion"] == "anxious"

    def test_session_created_in_db(self):
        ensure_memory_user(1)
        result = handle_therapist_session(1, "I feel lonely", 2)
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM therapist_sessions WHERE id = ?",
            (result["session_id"],),
        )
        row = cur.fetchone()
        conn.close()
        assert row is not None
        assert row["is_active"] == 1

    def test_therapist_applies_temporary_context(self):
        """Therapist session must NOT modify base weights."""
        _build_user_with_history(1)
        prefs_before = {p["trope_name"]: p["weight"] for p in get_user_trope_preferences(1)}
        handle_therapist_session(1, "I feel heartbroken", 3)
        prefs_after = {p["trope_name"]: p["weight"] for p in get_user_trope_preferences(1)}
        assert prefs_before == prefs_after

    def test_session_expires_properly(self):
        ensure_memory_user(1)
        result = handle_therapist_session(1, "I feel overwhelmed", 2)
        expires = datetime.fromisoformat(result["session_expires_at"])
        diff = (expires - datetime.utcnow()).total_seconds() / 3600
        assert 23 <= diff <= 25

    def test_invalid_input_rejected(self):
        ensure_memory_user(1)
        with pytest.raises(ValueError):
            handle_therapist_session(1, "hi", 2)

    def test_active_session_query(self):
        ensure_memory_user(1)
        handle_therapist_session(1, "I feel lonely", 2)
        result = get_active_therapist_session(1)
        assert result["status"] == "ok"
        assert result["session"] is not None

    def test_end_session_flow(self):
        ensure_memory_user(1)
        handle_therapist_session(1, "I feel lonely", 2)
        end = orch_end_session(1)
        assert end["status"] == "ok"
        assert end["sessions_ended"] >= 1
        assert get_active_therapist_session(1)["session"] is None


# ════════════════════════════════════════════════════════════════
#  8. ORCHESTRATOR — Recommendation Flow
# ════════════════════════════════════════════════════════════════

class TestOrchestratorRecommendations:
    """Test: recommendations go through orchestrator."""

    def test_standard_recommendations(self):
        ensure_memory_user(1)
        result = orch_get_recs(1, limit=5)
        assert result["status"] == "ok"
        assert "recommendations" in result

    def test_does_not_break_if_therapist_inactive(self):
        ensure_memory_user(1)
        result = orch_get_recs(1, limit=5)
        assert result["status"] == "ok"

    def test_respects_fatigue_and_suppression(self):
        _build_user_with_history(1)
        result = orch_get_recs(1, limit=10)
        assert len(result["recommendations"]) > 0

    def test_different_moods_give_different_therapist_recs(self):
        ensure_memory_user(1)
        r1 = handle_therapist_session(1, "I feel heartbroken and devastated", 2)
        ids1 = [b["book_id"] for b in r1["recommended_books"][:5]]
        orch_end_session(1)

        r2 = handle_therapist_session(1, "I crave dark obsession and intensity", 4)
        ids2 = [b["book_id"] for b in r2["recommended_books"][:5]]

        assert ids1 != ids2


# ════════════════════════════════════════════════════════════════
#  9. ORCHESTRATOR — Reading Habits + Growth Standalone
# ════════════════════════════════════════════════════════════════

class TestOrchestratorStandaloneFlows:

    def test_get_reading_habits(self):
        ensure_memory_user(1)
        _seed_interaction(1, "HabitBook1", rating=4, tags=["safe"])
        result = get_reading_habits(1)
        assert result["status"] == "ok"
        assert result["reading_frequency"]["total_books"] >= 1

    def test_get_growth_insights(self):
        ensure_memory_user(1)
        result = get_growth_insights(1)
        assert result["status"] == "ok"
        assert "needs_growth" in result

    def test_growth_triggers_for_repetitive_user(self):
        _build_repetitive_user(1)
        result = get_growth_insights(1)
        assert result["status"] == "ok"
        assert result["needs_growth"] is True
        assert len(result["growth_suggestions"]) > 0


# ════════════════════════════════════════════════════════════════
# 10. ORCHESTRATOR — Dashboard
# ════════════════════════════════════════════════════════════════

class TestOrchestratorDashboard:

    def test_dashboard_returns_all_sections(self):
        _build_user_with_history(1)
        result = get_dashboard(1)
        assert result["status"] == "ok"
        assert "personality" in result
        assert "recommendations" in result
        assert "reading_habits" in result
        assert "growth_insights" in result
        assert "active_therapist_session" in result

    def test_dashboard_no_history(self):
        ensure_memory_user(1)
        result = get_dashboard(1)
        assert result["status"] == "ok"
        assert result["personality"] is None or result["personality"] is not None  # either ok

    def test_dashboard_with_therapist_session(self):
        ensure_memory_user(1)
        handle_therapist_session(1, "I feel lonely", 2)
        result = get_dashboard(1)
        assert result["active_therapist_session"] is not None


# ════════════════════════════════════════════════════════════════
# 11. NO DIRECT AGENT-TO-AGENT CALLS
# ════════════════════════════════════════════════════════════════

class TestNoDirectAgentCalls:
    """If agents directly call each other without orchestrator, implementation is invalid."""

    def test_therapist_does_not_import_emotion_agent(self):
        import services.agents.therapist_agent as mod
        source = open(mod.__file__, "r", encoding="utf-8").read()
        assert "from services.agents.emotion_agent" not in source
        assert "import services.agents.emotion_agent" not in source

    def test_therapist_does_not_import_recommendation_agent(self):
        import services.agents.therapist_agent as mod
        source = open(mod.__file__, "r", encoding="utf-8").read()
        assert "from services.agents.recommendation_agent" not in source
        assert "import services.agents.recommendation_agent" not in source

    def test_recommendation_does_not_import_therapist(self):
        """Recommendation agent must not import therapist modules."""
        import services.agents.recommendation_agent as mod
        source = open(mod.__file__, "r", encoding="utf-8").read()
        assert "from services.agents.therapist_agent" not in source
        assert "import therapist" not in source.lower()

    def test_growth_does_not_import_other_agents(self):
        import services.agents.growth_agent as mod
        source = open(mod.__file__, "r", encoding="utf-8").read()
        assert "from services.agents." not in source

    def test_reading_habit_does_not_import_other_agents(self):
        import services.agents.reading_habit_agent as mod
        source = open(mod.__file__, "r", encoding="utf-8").read()
        assert "from services.agents." not in source

    def test_emotion_does_not_import_other_agents(self):
        import services.agents.emotion_agent as mod
        source = open(mod.__file__, "r", encoding="utf-8").read()
        assert "from services.agents." not in source

    def test_only_orchestrator_imports_agents(self):
        """The orchestrator should be the only file importing all agents."""
        import services.agents.agent_orchestrator as mod
        source = open(mod.__file__, "r", encoding="utf-8").read()
        assert "from services.agents.emotion_agent" in source
        assert "from services.agents.recommendation_agent" in source
        assert "from services.agents.reading_habit_agent" in source
        assert "from services.agents.therapist_agent" in source
        assert "from services.agents.growth_agent" in source


# ════════════════════════════════════════════════════════════════
# 12. STRUCTURED LOGGING
# ════════════════════════════════════════════════════════════════

class TestStructuredLogging:
    """Verify that agent and orchestrator log tags are present."""

    def test_agents_have_tags(self):
        from services.agents import emotion_agent
        from services.agents import recommendation_agent
        from services.agents import reading_habit_agent
        from services.agents import therapist_agent
        from services.agents import growth_agent

        assert "[Agent:Emotion]" in open(emotion_agent.__file__, "r").read()
        assert "[Agent:Recommendation]" in open(recommendation_agent.__file__, "r").read()
        assert "[Agent:ReadingHabit]" in open(reading_habit_agent.__file__, "r").read()
        assert "[Agent:Therapist]" in open(therapist_agent.__file__, "r").read()
        assert "[Agent:Growth]" in open(growth_agent.__file__, "r").read()

    def test_orchestrator_has_tag(self):
        from services.agents import agent_orchestrator
        assert "[Orchestrator]" in open(agent_orchestrator.__file__, "r").read()


# ════════════════════════════════════════════════════════════════
# 13. API ENDPOINT INTEGRATION TESTS
# ════════════════════════════════════════════════════════════════

class TestPhase4APIEndpoints:
    """Test that routes go through orchestrator."""

    @pytest.fixture
    def client(self):
        os.environ["SKIP_ML"] = "1"
        from fastapi.testclient import TestClient
        from app import app
        return TestClient(app)

    def test_post_books_interact_via_orchestrator(self, client):
        ensure_memory_user(1)
        resp = client.post("/books/interact", json={
            "user_id": 1,
            "book_id": "The Kiss Thief",
            "emotional_tags": ["obsessed"],
            "rating": 5,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "interaction" in data
        assert "reading_habits" in data
        assert "growth_insights" in data

    def test_get_recommendations_via_orchestrator(self, client):
        ensure_memory_user(1)
        resp = client.get("/users/1/recommendations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

    def test_post_therapist_via_orchestrator(self, client):
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

    def test_get_active_therapist_via_orchestrator(self, client):
        ensure_memory_user(1)
        client.post("/therapist/start", json={
            "user_id": 1,
            "input_text": "I feel anxious",
        })
        resp = client.get("/therapist/1/active")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["session"] is not None

    def test_delete_therapist_via_orchestrator(self, client):
        ensure_memory_user(1)
        client.post("/therapist/start", json={
            "user_id": 1,
            "input_text": "I feel lonely",
        })
        resp = client.delete("/therapist/1")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_get_reading_habits_endpoint(self, client):
        ensure_memory_user(1)
        resp = client.get("/users/1/reading-habits")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "reading_frequency" in data

    def test_get_growth_insights_endpoint(self, client):
        ensure_memory_user(1)
        resp = client.get("/users/1/growth-insights")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "needs_growth" in data

    def test_get_dashboard_endpoint(self, client):
        ensure_memory_user(1)
        resp = client.get("/users/1/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "personality" in data
        assert "recommendations" in data
        assert "reading_habits" in data
        assert "growth_insights" in data

    def test_invalid_user_id_rejected(self, client):
        resp = client.get("/users/0/reading-habits")
        assert resp.status_code == 422
        resp = client.get("/users/0/growth-insights")
        assert resp.status_code == 422
        resp = client.get("/users/0/dashboard")
        assert resp.status_code == 422


# ════════════════════════════════════════════════════════════════
# 14. BACKWARD COMPATIBILITY
# ════════════════════════════════════════════════════════════════

class TestBackwardCompatibility:
    """Phase 1+2+3 features still work through the orchestrator."""

    def test_memory_update_still_works(self):
        ensure_memory_user(1)
        result = update_user_memory(
            user_id=1, book_id="BackCompBook",
            emotional_tags=["safe"], rating=4,
        )
        assert result["id"] is not None

    def test_effective_weights_still_work(self):
        ensure_memory_user(1)
        eff = get_effective_weight_map(1)
        assert isinstance(eff, dict)

    def test_trope_analytics_still_work(self):
        ensure_memory_user(1)
        analytics = get_trope_analytics(1)
        assert "top_tropes" in analytics

    def test_personalized_recs_still_work(self):
        ensure_memory_user(1)
        recs = get_personalized_recommendations(1, limit=5)
        assert "recommendations" in recs

    def test_therapist_core_still_works(self):
        ensure_memory_user(1)
        assert core_get_active_session(1) is None
        result = core_end_session(1)
        assert result["sessions_ended"] == 0

    def test_migrations_include_all_tables(self):
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row["name"] for row in cur.fetchall()}
        conn.close()
        assert "memory_users" in tables
        assert "book_interactions" in tables
        assert "trope_preferences" in tables
        assert "therapist_sessions" in tables


# ════════════════════════════════════════════════════════════════
# 15. FULL END-TO-END SCENARIO
# ════════════════════════════════════════════════════════════════

class TestFullPhase4Scenario:
    """Complete lifecycle test through the orchestrator."""

    def test_full_agent_ecosystem(self):
        """User reads books → checks habits → therapist → growth → dashboard."""
        # 1. Read several books through orchestrated pipeline
        for i in range(5):
            bid = f"ScenarioBook{i}"
            _seed_book_tropes(bid, ["dark-romance", "enemies-to-lovers"])
            handle_book_interaction(
                user_id=100,
                book_id=bid,
                emotional_tags=["obsessed"],
                rating=5,
                liked_mmc_type="morally-grey",
            )

        # 2. Check reading habits
        habits = get_reading_habits(100)
        assert habits["status"] == "ok"
        assert habits["reading_frequency"]["total_books"] == 5

        # 3. Check growth insights (should detect over-reliance)
        growth = get_growth_insights(100)
        assert growth["status"] == "ok"
        assert growth["needs_growth"] is True

        # 4. Start therapist session
        therapist = handle_therapist_session(100, "I feel heartbroken and need healing", 2)
        assert therapist["detected_emotion"] == "heartbroken"
        assert len(therapist["recommended_books"]) > 0

        # 5. Check dashboard (everything combined)
        dashboard = get_dashboard(100)
        assert dashboard["status"] == "ok"
        assert dashboard["active_therapist_session"] is not None
        assert len(dashboard["recommendations"]) > 0
        assert dashboard["growth_insights"]["needs_growth"] is True

        # 6. End therapist session
        end = orch_end_session(100)
        assert end["sessions_ended"] >= 1

        # 7. Dashboard now shows no active session
        dashboard2 = get_dashboard(100)
        assert dashboard2["active_therapist_session"] is None

    def test_book_interaction_returns_growth_warning(self):
        """After repeated same-trope reads, orchestrator returns growth warning."""
        _build_repetitive_user(200)
        # One more interaction
        _seed_book_tropes("OneMoreDark", ["dark-romance", "enemies-to-lovers"])
        result = handle_book_interaction(
            user_id=200,
            book_id="OneMoreDark",
            emotional_tags=["obsessed"],
            rating=5,
            liked_mmc_type="morally-grey",
        )
        assert result["growth_insights"]["needs_growth"] is True
        assert len(result["growth_insights"]["growth_suggestions"]) > 0
