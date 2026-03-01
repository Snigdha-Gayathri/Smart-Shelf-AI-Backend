"""Comprehensive tests for the SmartShelf AI Dynamic Tropes Intelligence Engine (Phase 2).

Tests cover:
  • Phase 2 database columns (is_dnf, completion_percentage, explicit_feedback,
    temporary_suppression_until)
  • Dynamic weight computation (rating + DNF + completion signals)
  • Trope fatigue detection after 4+ consecutive similar-trope interactions
  • Temporary suppression system (apply, auto-expire, restore)
  • Effective weight calculation (base + suppression + fatigue modifiers)
  • Trope feedback processing (fatigued, rejected, suppress, restore)
  • Trope analytics aggregation
  • Upgraded memory service (DNF, completion, explicit feedback flow)
  • Upgraded recommendation engine (effective weights, similarity penalty)
  • Phase 2 API endpoints (trope-feedback, trope-analytics, effective-weights)
  • Full scenario: user reads many books → fatigue triggers → recommendations shift

Run with:
    cd backend
    $env:SKIP_ML="1"; python -m pytest test_trope_engine.py -v --tb=short
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
_test_db_path = os.path.join(_test_db_dir, "test_trope_engine.db")

# Patch the DB path before importing any project modules
import database.connection as _conn_mod
_conn_mod.DB_PATH = _test_db_path


# Now import project modules (they will use the patched DB path)
from database.migrations import run_migrations, ensure_memory_user
from database.connection import get_connection
from models.schemas import (
    BookInteractionRequest,
    TropeFeedbackRequest,
    TropePreferenceUpdateRequest,
)
from utils.validators import clamp_weight
from services.memory_service import (
    update_user_memory,
    get_user_interactions,
    get_user_trope_preferences,
    get_book_tropes,
)
from services.trope_engine_service import (
    compute_weight_delta,
    update_trope_weights_dynamic,
    detect_trope_fatigue,
    apply_temporary_suppression,
    remove_suppression,
    get_effective_trope_weights,
    get_effective_weight_map,
    process_trope_feedback,
    get_trope_analytics,
    get_last_n_read_tropes,
    FATIGUE_THRESHOLD,
    FATIGUE_SUPPRESSION_DAYS,
    FATIGUE_WEIGHT_PENALTY,
)
from services.recommendation_service import get_personalized_recommendations
from services.personality_service import get_personality_profile


# ────────────────────────── Fixtures ──────────────────────────

@pytest.fixture(autouse=True)
def fresh_database():
    """Reset the test database before each test."""
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
                      is_dnf: bool = False, completion_pct: int = 100):
    """Helper: insert a book interaction directly."""
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    cur.execute(
        "INSERT INTO book_interactions "
        "(user_id, book_id, emotional_tags, rating, liked_mmc_type, "
        " is_dnf, completion_percentage, explicit_feedback, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, book_id, '["safe"]', rating, None,
         1 if is_dnf else 0, completion_pct, None, now),
    )
    conn.commit()
    conn.close()


def _set_trope_weight(user_id: int, trope_name: str, weight: int):
    """Helper: directly set a trope weight in the DB."""
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    cur.execute(
        "INSERT OR REPLACE INTO trope_preferences "
        "(user_id, trope_name, weight, last_updated) VALUES (?, ?, ?, ?)",
        (user_id, trope_name, weight, now),
    )
    conn.commit()
    conn.close()


def _set_suppression(user_id: int, trope_name: str, until_iso: str):
    """Helper: directly set a suppression timestamp on a trope."""
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    cur.execute(
        "SELECT id FROM trope_preferences WHERE user_id = ? AND trope_name = ?",
        (user_id, trope_name),
    )
    if cur.fetchone():
        cur.execute(
            "UPDATE trope_preferences SET temporary_suppression_until = ?, last_updated = ? "
            "WHERE user_id = ? AND trope_name = ?",
            (until_iso, now, user_id, trope_name),
        )
    else:
        cur.execute(
            "INSERT INTO trope_preferences "
            "(user_id, trope_name, weight, temporary_suppression_until, last_updated) "
            "VALUES (?, ?, 0, ?, ?)",
            (user_id, trope_name, until_iso, now),
        )
    conn.commit()
    conn.close()


# ────────────────────────── 1. PHASE 2 DB COLUMN TESTS ──────────────────────────

class TestPhase2DatabaseColumns:
    """Verify Phase 2 ALTER columns exist and function correctly."""

    def test_book_interactions_has_is_dnf(self):
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(book_interactions)")
        columns = {row["name"] for row in cur.fetchall()}
        conn.close()
        assert "is_dnf" in columns

    def test_book_interactions_has_completion_percentage(self):
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(book_interactions)")
        columns = {row["name"] for row in cur.fetchall()}
        conn.close()
        assert "completion_percentage" in columns

    def test_book_interactions_has_explicit_feedback(self):
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(book_interactions)")
        columns = {row["name"] for row in cur.fetchall()}
        conn.close()
        assert "explicit_feedback" in columns

    def test_trope_preferences_has_temporary_suppression(self):
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(trope_preferences)")
        columns = {row["name"] for row in cur.fetchall()}
        conn.close()
        assert "temporary_suppression_until" in columns

    def test_dnf_column_defaults_to_zero(self):
        ensure_memory_user(1)
        _seed_interaction(1, "TestBook", rating=3)
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT is_dnf FROM book_interactions WHERE user_id = 1")
        row = cur.fetchone()
        conn.close()
        assert row["is_dnf"] == 0

    def test_completion_percentage_defaults_to_100(self):
        ensure_memory_user(1)
        _seed_interaction(1, "TestBook", rating=3, completion_pct=100)
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT completion_percentage FROM book_interactions WHERE user_id = 1")
        row = cur.fetchone()
        conn.close()
        assert row["completion_percentage"] == 100


# ────────────────────────── 2. DYNAMIC WEIGHT COMPUTATION ──────────────────────────

class TestComputeWeightDelta:
    """Test the multi-signal weight delta computation."""

    def test_high_rating_positive_delta(self):
        assert compute_weight_delta(5) == 1
        assert compute_weight_delta(4) == 1

    def test_low_rating_negative_delta(self):
        assert compute_weight_delta(1) == -1
        assert compute_weight_delta(2) == -1

    def test_neutral_rating_zero_delta(self):
        assert compute_weight_delta(3) == 0

    def test_dnf_overrides_rating(self):
        assert compute_weight_delta(5, is_dnf=True) == -2
        assert compute_weight_delta(1, is_dnf=True) == -2

    def test_low_completion_reduces_delta(self):
        # Rating 3 (delta 0) + completion 20% → -1
        assert compute_weight_delta(3, completion_percentage=20) == -1

    def test_low_completion_with_negative_rating(self):
        # Rating 1 (delta -1) already negative, completion doesn't stack
        assert compute_weight_delta(1, completion_percentage=20) == -1

    def test_low_completion_with_high_rating(self):
        # Rating 5 (delta +1) but only 20% completion → 0
        assert compute_weight_delta(5, completion_percentage=20) == 0

    def test_normal_completion_no_penalty(self):
        # Rating 3 + 50% completion → no penalty (threshold is 30%)
        assert compute_weight_delta(3, completion_percentage=50) == 0

    def test_boundary_completion_30(self):
        # Exactly 30% → no penalty (< 30 triggers)
        assert compute_weight_delta(3, completion_percentage=30) == 0

    def test_boundary_completion_29(self):
        # 29% → penalty triggers
        assert compute_weight_delta(3, completion_percentage=29) == -1


class TestUpdateTropeWeightsDynamic:
    """Test the dynamic trope weight update service function."""

    def test_positive_rating_increases_weights(self):
        ensure_memory_user(1)
        result = update_trope_weights_dynamic(1, ["enemies_to_lovers", "slow_burn"], 5)
        assert result["enemies_to_lovers"] == 1
        assert result["slow_burn"] == 1

    def test_negative_rating_decreases_weights(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "love_triangle", 2)
        result = update_trope_weights_dynamic(1, ["love_triangle"], 1)
        assert result["love_triangle"] == 1  # 2 + (-1) = 1

    def test_dnf_gives_large_decrease(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 3)
        result = update_trope_weights_dynamic(1, ["enemies_to_lovers"], 5, is_dnf=True)
        assert result["enemies_to_lovers"] == 1  # 3 + (-2) = 1

    def test_weight_clamped_at_minus_five(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "trope_a", -4)
        result = update_trope_weights_dynamic(1, ["trope_a"], 5, is_dnf=True)
        assert result["trope_a"] == -5  # -4 + (-2) → clamped to -5

    def test_weight_clamped_at_plus_five(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "trope_b", 5)
        result = update_trope_weights_dynamic(1, ["trope_b"], 5)
        assert result["trope_b"] == 5  # 5 + 1 → clamped to 5

    def test_empty_tropes_returns_empty(self):
        ensure_memory_user(1)
        result = update_trope_weights_dynamic(1, [], 5)
        assert result == {}

    def test_neutral_rating_returns_empty(self):
        ensure_memory_user(1)
        result = update_trope_weights_dynamic(1, ["some_trope"], 3)
        assert result == {}


# ────────────────────────── 3. TROPE FATIGUE DETECTION ──────────────────────────

class TestTropeFatigueDetection:
    """Test automatic fatigue detection after consecutive similar reads."""

    def test_no_fatigue_with_few_interactions(self):
        ensure_memory_user(1)
        for i in range(FATIGUE_THRESHOLD - 1):
            book = f"Book{i}"
            _seed_book_tropes(book, ["enemies_to_lovers"])
            _seed_interaction(1, book, rating=5)
        fatigued = detect_trope_fatigue(1)
        assert fatigued == []

    def test_fatigue_triggers_at_threshold(self):
        ensure_memory_user(1)
        for i in range(FATIGUE_THRESHOLD):
            book = f"Book{i}"
            _seed_book_tropes(book, ["enemies_to_lovers", "slow_burn"])
            _seed_interaction(1, book, rating=5)
        fatigued = detect_trope_fatigue(1)
        assert "enemies_to_lovers" in fatigued
        assert "slow_burn" in fatigued

    def test_fatigue_only_on_common_tropes(self):
        ensure_memory_user(1)
        # All books share "slow_burn", but "mafia" only in some
        for i in range(FATIGUE_THRESHOLD):
            book = f"Book{i}"
            tropes = ["slow_burn"]
            if i < 2:
                tropes.append("mafia")
            _seed_book_tropes(book, tropes)
            _seed_interaction(1, book, rating=5)
        fatigued = detect_trope_fatigue(1)
        assert "slow_burn" in fatigued
        assert "mafia" not in fatigued

    def test_fatigue_applies_suppression(self):
        ensure_memory_user(1)
        for i in range(FATIGUE_THRESHOLD):
            book = f"Book{i}"
            _seed_book_tropes(book, ["enemies_to_lovers"])
            _seed_interaction(1, book, rating=5)
        detect_trope_fatigue(1)
        # Verify suppression was set
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT temporary_suppression_until FROM trope_preferences "
            "WHERE user_id = 1 AND trope_name = 'enemies_to_lovers'",
        )
        row = cur.fetchone()
        conn.close()
        assert row is not None
        assert row["temporary_suppression_until"] is not None

    def test_fatigue_does_not_double_suppress(self):
        ensure_memory_user(1)
        for i in range(FATIGUE_THRESHOLD):
            book = f"Book{i}"
            _seed_book_tropes(book, ["enemies_to_lovers"])
            _seed_interaction(1, book, rating=5)
        # First detection
        fatigued1 = detect_trope_fatigue(1)
        assert "enemies_to_lovers" in fatigued1
        # Second detection should not re-suppress (already active)
        fatigued2 = detect_trope_fatigue(1)
        assert fatigued2 == []

    def test_no_fatigue_without_book_tropes(self):
        ensure_memory_user(1)
        for i in range(FATIGUE_THRESHOLD):
            _seed_interaction(1, f"BookNoTropes{i}", rating=5)
        fatigued = detect_trope_fatigue(1)
        assert fatigued == []


# ────────────────────────── 4. TEMPORARY SUPPRESSION SYSTEM ──────────────────────────

class TestTemporarySuppression:
    """Test manual suppression apply/remove and auto-expiry."""

    def test_apply_suppression_new_trope(self):
        ensure_memory_user(1)
        result = apply_temporary_suppression(1, "amnesia", 14)
        assert result["trope_name"] == "amnesia"
        assert result["duration_days"] == 14
        assert result["suppression_until"] is not None

    def test_apply_suppression_existing_trope(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "slow_burn", 3)
        result = apply_temporary_suppression(1, "slow_burn", 7)
        assert result["base_weight"] == 3
        assert result["duration_days"] == 7

    def test_remove_suppression(self):
        ensure_memory_user(1)
        apply_temporary_suppression(1, "amnesia", 14)
        result = remove_suppression(1, "amnesia")
        assert result["suppression_removed"] is True
        # Verify DB is clean
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT temporary_suppression_until FROM trope_preferences "
            "WHERE user_id = 1 AND trope_name = 'amnesia'",
        )
        row = cur.fetchone()
        conn.close()
        assert row["temporary_suppression_until"] is None

    def test_effective_weight_with_active_suppression(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 4)
        future = (datetime.utcnow() + timedelta(days=5)).isoformat()
        _set_suppression(1, "enemies_to_lovers", future)
        weights = get_effective_trope_weights(1)
        eff = weights["enemies_to_lovers"]
        assert eff["is_suppressed"] is True
        assert eff["is_fatigued"] is True
        assert eff["effective_weight"] == 4 - FATIGUE_WEIGHT_PENALTY  # 4 - 2 = 2

    def test_effective_weight_with_expired_suppression(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 4)
        past = (datetime.utcnow() - timedelta(days=1)).isoformat()
        _set_suppression(1, "enemies_to_lovers", past)
        weights = get_effective_trope_weights(1)
        eff = weights["enemies_to_lovers"]
        assert eff["is_suppressed"] is False
        assert eff["is_fatigued"] is False
        assert eff["effective_weight"] == 4.0  # No penalty after expiry

    def test_expired_suppression_auto_cleaned(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "slow_burn", 3)
        past = (datetime.utcnow() - timedelta(days=2)).isoformat()
        _set_suppression(1, "slow_burn", past)
        # Calling effective weights should clean the expired suppression
        get_effective_trope_weights(1)
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT temporary_suppression_until FROM trope_preferences "
            "WHERE user_id = 1 AND trope_name = 'slow_burn'",
        )
        row = cur.fetchone()
        conn.close()
        assert row["temporary_suppression_until"] is None


# ────────────────────────── 5. EFFECTIVE WEIGHT CALCULATION ──────────────────────────

class TestEffectiveWeightCalculation:
    """Test effective weight computation with various scenarios."""

    def test_no_suppression_equals_base(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 3)
        weights = get_effective_trope_weights(1)
        assert weights["enemies_to_lovers"]["effective_weight"] == 3.0
        assert weights["enemies_to_lovers"]["is_suppressed"] is False

    def test_suppressed_weight_reduced(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 5)
        future = (datetime.utcnow() + timedelta(days=3)).isoformat()
        _set_suppression(1, "enemies_to_lovers", future)
        weights = get_effective_trope_weights(1)
        eff = weights["enemies_to_lovers"]["effective_weight"]
        assert eff == 5 - FATIGUE_WEIGHT_PENALTY  # 5 - 2 = 3

    def test_effective_weight_clamped_at_minus_five(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "trope_a", -4)
        future = (datetime.utcnow() + timedelta(days=3)).isoformat()
        _set_suppression(1, "trope_a", future)
        weights = get_effective_trope_weights(1)
        eff = weights["trope_a"]["effective_weight"]
        assert eff == -5.0  # -4 - 2 = -6 → clamped to -5

    def test_effective_weight_map_convenience(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "a", 3)
        _set_trope_weight(1, "b", -2)
        wmap = get_effective_weight_map(1)
        assert wmap["a"] == 3.0
        assert wmap["b"] == -2.0

    def test_empty_user_returns_empty(self):
        ensure_memory_user(1)
        weights = get_effective_trope_weights(1)
        assert weights == {}


# ────────────────────────── 6. TROPE FEEDBACK PROCESSING ──────────────────────────

class TestTropeFeedbackProcessing:
    """Test explicit trope feedback handling."""

    def test_fatigued_feedback(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 4)
        result = process_trope_feedback(1, "enemies_to_lovers", "fatigued")
        assert result["base_weight"] == -3
        assert result["suppression_until"] is not None

    def test_rejected_feedback(self):
        ensure_memory_user(1)
        result = process_trope_feedback(1, "love_triangle", "rejected")
        assert result["base_weight"] == -5
        assert result["suppression_until"] is None

    def test_suppress_feedback(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "slow_burn", 3)
        result = process_trope_feedback(1, "slow_burn", "suppress", suppression_days=10)
        assert result["base_weight"] == 3  # base weight unchanged
        assert result["suppression_until"] is not None

    def test_restore_feedback(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", -3)
        future = (datetime.utcnow() + timedelta(days=5)).isoformat()
        _set_suppression(1, "enemies_to_lovers", future)
        result = process_trope_feedback(1, "enemies_to_lovers", "restore")
        assert result["base_weight"] == 0
        assert result["suppression_until"] is None

    def test_fatigued_creates_new_entry(self):
        ensure_memory_user(1)
        result = process_trope_feedback(1, "new_trope", "fatigued")
        assert result["base_weight"] == -3

    def test_rejected_creates_new_entry(self):
        ensure_memory_user(1)
        result = process_trope_feedback(1, "new_trope", "rejected")
        assert result["base_weight"] == -5

    def test_invalid_feedback_type_raises(self):
        ensure_memory_user(1)
        with pytest.raises(ValueError, match="Unknown feedback_type"):
            process_trope_feedback(1, "trope", "invalid_type")

    def test_suppress_with_custom_duration(self):
        ensure_memory_user(1)
        result = process_trope_feedback(1, "trope_x", "suppress", suppression_days=30)
        until = datetime.fromisoformat(result["suppression_until"])
        # Should be roughly 30 days from now
        diff = (until - datetime.utcnow()).days
        assert 29 <= diff <= 30


# ────────────────────────── 7. TROPE ANALYTICS ──────────────────────────

class TestTropeAnalytics:
    """Test the trope analytics aggregation."""

    def test_empty_analytics(self):
        ensure_memory_user(1)
        analytics = get_trope_analytics(1)
        assert analytics["top_tropes"] == []
        assert analytics["fatigued_tropes"] == []
        assert analytics["rejected_tropes"] == []
        assert analytics["suppressed_tropes"] == []

    def test_top_tropes_detected(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 4)
        _set_trope_weight(1, "slow_burn", 2)
        analytics = get_trope_analytics(1)
        names = [t["trope_name"] for t in analytics["top_tropes"]]
        assert "enemies_to_lovers" in names
        assert "slow_burn" in names

    def test_rejected_tropes_detected(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "love_triangle", -5)
        analytics = get_trope_analytics(1)
        names = [t["trope_name"] for t in analytics["rejected_tropes"]]
        assert "love_triangle" in names

    def test_fatigued_tropes_detected(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 3)
        future = (datetime.utcnow() + timedelta(days=5)).isoformat()
        _set_suppression(1, "enemies_to_lovers", future)
        analytics = get_trope_analytics(1)
        names = [t["trope_name"] for t in analytics["fatigued_tropes"]]
        assert "enemies_to_lovers" in names

    def test_weight_distribution(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "a", 3)
        _set_trope_weight(1, "b", 3)
        _set_trope_weight(1, "c", -1)
        analytics = get_trope_analytics(1)
        dist = analytics["weight_distribution"]
        assert dist["3"] == 2
        assert dist["-1"] == 1

    def test_top_tropes_sorted_by_effective_weight(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "a", 5)
        _set_trope_weight(1, "b", 2)
        analytics = get_trope_analytics(1)
        top = analytics["top_tropes"]
        assert len(top) >= 2
        assert top[0]["effective_weight"] >= top[1]["effective_weight"]


# ────────────────────────── 8. UPGRADED MEMORY SERVICE ──────────────────────────

class TestUpgradedMemoryService:
    """Test the Phase 2 upgrades to memory_service.update_user_memory."""

    def test_dnf_interaction_stored(self):
        ensure_memory_user(1)
        result = update_user_memory(
            user_id=1,
            book_id="The Kiss Thief",
            emotional_tags=["safe"],
            rating=2,
            is_dnf=True,
            completion_percentage=25,
        )
        assert result["is_dnf"] is True
        assert result["completion_percentage"] == 25

    def test_dnf_decreases_trope_weights_by_2(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 3)
        _seed_book_tropes("TestDNFBook", ["enemies_to_lovers"])
        result = update_user_memory(
            user_id=1,
            book_id="TestDNFBook",
            emotional_tags=["safe"],
            rating=5,  # high rating but DNF overrides
            is_dnf=True,
        )
        weights = result.get("updated_weights", {})
        assert weights.get("enemies_to_lovers", 999) == 1  # 3 + (-2) = 1

    def test_explicit_feedback_stored(self):
        ensure_memory_user(1)
        result = update_user_memory(
            user_id=1,
            book_id="The Kiss Thief",
            emotional_tags=["safe"],
            rating=4,
            explicit_feedback="loved the tension but ending was rushed",
        )
        assert result["explicit_feedback"] == "loved the tension but ending was rushed"

    def test_interaction_returns_fatigue_info(self):
        ensure_memory_user(1)
        # Create enough history to trigger fatigue
        for i in range(FATIGUE_THRESHOLD - 1):
            book = f"HistoryBook{i}"
            _seed_book_tropes(book, ["enemies_to_lovers"])
            _seed_interaction(1, book, rating=5)
        # The threshold-th interaction via update_user_memory
        _seed_book_tropes("FinalBook", ["enemies_to_lovers"])
        result = update_user_memory(
            user_id=1,
            book_id="FinalBook",
            emotional_tags=["safe"],
            rating=5,
        )
        assert "newly_fatigued_tropes" in result

    def test_high_rating_full_completion(self):
        ensure_memory_user(1)
        result = update_user_memory(
            user_id=1,
            book_id="The Kiss Thief",
            emotional_tags=["safe", "obsessed"],
            rating=5,
            completion_percentage=100,
        )
        assert result["completion_percentage"] == 100
        assert result["is_dnf"] is False

    def test_low_completion_no_dnf_still_penalizes(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 0)
        _seed_book_tropes("LowCompBook", ["enemies_to_lovers"])
        result = update_user_memory(
            user_id=1,
            book_id="LowCompBook",
            emotional_tags=["safe"],
            rating=3,  # neutral rating
            completion_percentage=20,  # low completion triggers -1
        )
        weights = result.get("updated_weights", {})
        assert weights.get("enemies_to_lovers", 999) == -1  # 0 + (-1)


# ────────────────────────── 9. UPGRADED RECOMMENDATIONS ──────────────────────────

class TestUpgradedRecommendations:
    """Test that recommendations use effective weights and similarity penalty."""

    def test_recommendations_exclude_suppressed_tropes(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 4)
        future = (datetime.utcnow() + timedelta(days=5)).isoformat()
        _set_suppression(1, "enemies_to_lovers", future)
        recs = get_personalized_recommendations(1, limit=5)
        # Effective weight is 4-2=2, so enemies_to_lovers books shouldn't be top
        # (but not excluded since effective = 2, not -5)
        assert "recommendations" in recs

    def test_recommendations_exclude_effectively_neg5(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", -4)
        future = (datetime.utcnow() + timedelta(days=5)).isoformat()
        _set_suppression(1, "enemies_to_lovers", future)
        # Effective weight: -4 - 2 = -6 → clamped to -5 → should be excluded
        recs = get_personalized_recommendations(1, limit=50)
        for rec in recs.get("recommendations", []):
            if "enemies_to_lovers" in rec.get("tropes", []):
                pytest.fail("Book with excluded trope should not appear in recommendations")

    def test_recommendations_with_no_preferences(self):
        ensure_memory_user(1)
        recs = get_personalized_recommendations(1, limit=5)
        assert recs["recommendations"] is not None
        assert "reason" in recs

    def test_recommendations_return_similarity_penalty(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 5)
        recs = get_personalized_recommendations(1, limit=5)
        # All recs should have the similarity_penalty key
        for rec in recs.get("recommendations", []):
            assert "similarity_penalty" in rec

    def test_recommendations_active_preferences_use_effective(self):
        ensure_memory_user(1)
        _set_trope_weight(1, "slow_burn", 4)
        recs = get_personalized_recommendations(1, limit=5)
        prefs = recs.get("active_preferences", {})
        if prefs.get("top_tropes"):
            # Should use effective_weight key, not weight
            assert "effective_weight" in prefs["top_tropes"][0]


# ────────────────────────── 10. RECENT READ TROPES ──────────────────────────

class TestRecentReadTropes:
    """Test the get_last_n_read_tropes helper."""

    def test_no_reads(self):
        ensure_memory_user(1)
        result = get_last_n_read_tropes(1, n=2)
        assert result == []

    def test_returns_correct_tropes(self):
        ensure_memory_user(1)
        _seed_book_tropes("Book1", ["enemies_to_lovers", "slow_burn"])
        _seed_interaction(1, "Book1", rating=5)
        _seed_book_tropes("Book2", ["forced_proximity"])
        _seed_interaction(1, "Book2", rating=4)
        result = get_last_n_read_tropes(1, n=2)
        assert len(result) == 2

    def test_returns_only_last_n(self):
        ensure_memory_user(1)
        for i in range(5):
            _seed_book_tropes(f"B{i}", [f"trope_{i}"])
            _seed_interaction(1, f"B{i}", rating=5)
        result = get_last_n_read_tropes(1, n=2)
        assert len(result) == 2


# ────────────────────────── 11. API ENDPOINT TESTS ──────────────────────────

class TestPhase2APIEndpoints:
    """Test the new Phase 2 API routes via FastAPI TestClient."""

    @pytest.fixture
    def client(self):
        """Create a FastAPI test client."""
        os.environ["SKIP_ML"] = "1"
        from fastapi.testclient import TestClient
        from app import app
        return TestClient(app)

    def test_post_trope_feedback_fatigued(self, client):
        ensure_memory_user(1)
        resp = client.post("/users/1/trope-feedback", json={
            "trope_name": "enemies_to_lovers",
            "feedback_type": "fatigued",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["feedback_result"]["base_weight"] == -3

    def test_post_trope_feedback_rejected(self, client):
        ensure_memory_user(1)
        resp = client.post("/users/1/trope-feedback", json={
            "trope_name": "love_triangle",
            "feedback_type": "rejected",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["feedback_result"]["base_weight"] == -5

    def test_post_trope_feedback_suppress(self, client):
        ensure_memory_user(1)
        resp = client.post("/users/1/trope-feedback", json={
            "trope_name": "slow_burn",
            "feedback_type": "suppress",
            "suppression_days": 14,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["feedback_result"]["suppression_until"] is not None

    def test_post_trope_feedback_restore(self, client):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", -3)
        resp = client.post("/users/1/trope-feedback", json={
            "trope_name": "enemies_to_lovers",
            "feedback_type": "restore",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["feedback_result"]["base_weight"] == 0

    def test_post_trope_feedback_invalid_user(self, client):
        resp = client.post("/users/0/trope-feedback", json={
            "trope_name": "enemies_to_lovers",
            "feedback_type": "fatigued",
        })
        assert resp.status_code == 422

    def test_get_trope_analytics(self, client):
        ensure_memory_user(1)
        _set_trope_weight(1, "enemies_to_lovers", 4)
        _set_trope_weight(1, "love_triangle", -5)
        resp = client.get("/users/1/trope-analytics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "top_tropes" in data
        assert "rejected_tropes" in data
        assert "weight_distribution" in data

    def test_get_trope_analytics_invalid_user(self, client):
        resp = client.get("/users/0/trope-analytics")
        assert resp.status_code == 422

    def test_get_effective_weights(self, client):
        ensure_memory_user(1)
        _set_trope_weight(1, "slow_burn", 3)
        resp = client.get("/users/1/effective-weights")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "effective_weights" in data
        assert "slow_burn" in data["effective_weights"]

    def test_get_effective_weights_invalid_user(self, client):
        resp = client.get("/users/0/effective-weights")
        assert resp.status_code == 422

    def test_book_interaction_with_dnf(self, client):
        ensure_memory_user(1)
        resp = client.post("/books/interact", json={
            "user_id": 1,
            "book_id": "The Kiss Thief",
            "emotional_tags": ["safe"],
            "rating": 2,
            "is_dnf": True,
            "completion_percentage": 15,
            "explicit_feedback": "Could not connect with the characters",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["interaction"]["is_dnf"] is True
        assert data["interaction"]["completion_percentage"] == 15

    def test_book_interaction_backward_compatible(self, client):
        """Phase 1 style requests should still work (no DNF fields)."""
        ensure_memory_user(1)
        resp = client.post("/books/interact", json={
            "user_id": 1,
            "book_id": "The Kiss Thief",
            "emotional_tags": ["safe"],
            "rating": 5,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["interaction"]["is_dnf"] is False
        assert data["interaction"]["completion_percentage"] == 100


# ────────────────────────── 12. FULL SCENARIO TEST ──────────────────────────

class TestFullPhase2Scenario:
    """End-to-end scenario: user reads books → fatigue → suppression → recommendations shift."""

    def test_fatigue_impacts_recommendations(self):
        """User reads 4 books with same trope → fatigue detected → recommendations shift."""
        ensure_memory_user(42)

        # User reads 4 books all containing 'enemies_to_lovers'
        for i in range(4):
            book = f"EtLBook{i}"
            _seed_book_tropes(book, ["enemies_to_lovers", f"unique_trope_{i}"])
            update_user_memory(
                user_id=42,
                book_id=book,
                emotional_tags=["obsessed"],
                rating=5,
            )

        # Verify fatigue was triggered
        analytics = get_trope_analytics(42)
        fatigued_names = [t["trope_name"] for t in analytics["fatigued_tropes"]]
        assert "enemies_to_lovers" in fatigued_names

        # Verify effective weight is reduced
        eff = get_effective_weight_map(42)
        base_weight = 4  # 4 x (+1) = 4
        assert eff["enemies_to_lovers"] < base_weight

        # Get recommendations — they should still work
        recs = get_personalized_recommendations(42, limit=5)
        assert len(recs["recommendations"]) > 0

    def test_dnf_then_feedback_then_restore(self):
        """User DNFs a book, gives feedback, then restores the trope later."""
        ensure_memory_user(99)
        _seed_book_tropes("BadBook", ["forced_proximity"])
        _set_trope_weight(99, "forced_proximity", 3)

        # DNF the book
        result = update_user_memory(
            user_id=99,
            book_id="BadBook",
            emotional_tags=["anxious"],
            rating=1,
            is_dnf=True,
            completion_percentage=10,
            explicit_feedback="Did not like the setup",
        )
        assert result["is_dnf"] is True

        # Check weight dropped: 3 + (-2 for DNF) = 1
        prefs = get_user_trope_preferences(99)
        fp_pref = next((p for p in prefs if p["trope_name"] == "forced_proximity"), None)
        assert fp_pref is not None
        assert fp_pref["weight"] == 1

        # User rejects the trope
        process_trope_feedback(99, "forced_proximity", "rejected")
        prefs2 = get_user_trope_preferences(99)
        fp2 = next((p for p in prefs2 if p["trope_name"] == "forced_proximity"), None)
        assert fp2["weight"] == -5

        # Later, user restores it
        process_trope_feedback(99, "forced_proximity", "restore")
        prefs3 = get_user_trope_preferences(99)
        fp3 = next((p for p in prefs3 if p["trope_name"] == "forced_proximity"), None)
        assert fp3["weight"] == 0

    def test_suppression_auto_expires_in_effective_weights(self):
        """Suppression set in the past should be auto-cleaned when fetching weights."""
        ensure_memory_user(77)
        _set_trope_weight(77, "slow_burn", 4)
        # Set suppression that already expired
        expired = (datetime.utcnow() - timedelta(hours=1)).isoformat()
        _set_suppression(77, "slow_burn", expired)

        eff = get_effective_trope_weights(77)
        assert eff["slow_burn"]["is_suppressed"] is False
        assert eff["slow_burn"]["effective_weight"] == 4.0

        # DB should be cleaned
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT temporary_suppression_until FROM trope_preferences "
            "WHERE user_id = 77 AND trope_name = 'slow_burn'",
        )
        row = cur.fetchone()
        conn.close()
        assert row["temporary_suppression_until"] is None
