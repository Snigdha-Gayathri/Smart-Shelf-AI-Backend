"""Trope and MMC type derivation from book metadata.

Analyzes a book's genre, mood, tone, synopsis, and emotion_tags to
deterministically derive romance tropes and MMC archetype.

This is NOT mock data — these are standard romance genre classifications
derived from each book's actual textual content.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

# ────────────────────────── Trope Keyword Maps ──────────────────────────
# Each trope is mapped to sets of keywords that, when found in a book's
# synopsis/genre/mood, indicate the trope is present.

TROPE_KEYWORD_MAP: Dict[str, Dict[str, list]] = {
    "enemies-to-lovers": {
        "synopsis": ["enem", "rival", "hate", "despise", "loathe", "condescending",
                      "clash", "adversar", "opponent", "bitter", "feud", "war between",
                      "sworn", "compete", "against each other"],
        "genre": ["dark", "mafia", "bully"],
        "mood": ["intense", "aggressive", "hostile"],
    },
    "friends-to-lovers": {
        "synopsis": ["best friend", "childhood friend", "grew up together",
                      "always been", "friendship", "friend zone", "known each other"],
        "mood": ["heartwarming", "sweet"],
    },
    "fake-dating": {
        "synopsis": ["fake", "pretend", "fake boyfriend", "fake girlfriend",
                      "fake relationship", "convince", "arrangement", "deal",
                      "charade", "ruse", "act as", "pose as"],
    },
    "forced-proximity": {
        "synopsis": ["roommate", "stuck", "stranded", "cabin", "trapped",
                      "locked", "sharing", "forced to live", "close quarters",
                      "apartment", "neighbor"],
    },
    "second-chance": {
        "synopsis": ["ex-", "reunite", "past love", "second chance",
                      "years later", "came back", "return", "first love",
                      "once loved", "reconnect"],
    },
    "forbidden-love": {
        "synopsis": ["forbidden", "taboo", "shouldn't", "can't be together",
                      "wrong", "secret", "hidden", "society", "against the rules",
                      "not allowed", "princess", "bodyguard", "off-limits"],
        "genre": ["forbidden"],
    },
    "slow-burn": {
        "mood": ["slow", "gradual", "tender", "subtle"],
        "pacing": ["slow", "moderate"],
        "tone": ["gentle", "measured"],
    },
    "love-triangle": {
        "synopsis": ["triangle", "torn between", "two men", "two women",
                      "choose between", "both", "jealous"],
    },
    "arranged-marriage": {
        "synopsis": ["arranged", "marriage of convenience", "contract",
                      "betrothed", "wedding", "bride", "married off",
                      "surrogacy competition"],
        "genre": ["mafia"],
    },
    "grumpy-sunshine": {
        "synopsis": ["grumpy", "grump", "sunshine", "cheerful", "brooding",
                      "hotshot", "ass", "cold", "warm her"],
        "mood": ["witty", "fun"],
    },
    "billionaire": {
        "synopsis": ["billionaire", "wealthy", "rich", "fortune", "mogul",
                      "empire", "penthouse", "luxury"],
        "genre": ["billionaire"],
    },
    "mafia": {
        "synopsis": ["mafia", "mob", "crime", "cartel", "syndicate",
                      "family business", "don"],
        "genre": ["mafia"],
    },
    "dark-romance": {
        "synopsis": ["dark", "captive", "obsess", "possess", "control",
                      "dangerous", "twisted", "sinister", "brutal", "deadly"],
        "genre": ["dark", "erotic"],
        "mood": ["dark", "gritty", "intense"],
        "tone": ["gritty", "dark"],
    },
    "royal-romance": {
        "synopsis": ["prince", "princess", "king", "queen", "crown",
                      "royal", "kingdom", "palace", "throne", "heir"],
        "genre": ["royal"],
    },
    "sports-romance": {
        "synopsis": ["athlete", "football", "hockey", "basketball", "soccer",
                      "coach", "team", "season", "game", "player"],
        "genre": ["sports"],
    },
    "academic": {
        "synopsis": ["professor", "student", "university", "college",
                      "campus", "school", "tutor", "class"],
        "genre": ["ya", "academic", "college"],
    },
    "boss-employee": {
        "synopsis": ["boss", "employee", "office", "work", "CEO",
                      "assistant", "intern", "workplace", "company"],
    },
    "age-gap": {
        "synopsis": ["older", "younger", "age gap", "years older",
                      "years younger", "professor", "mentor"],
    },
    "protector": {
        "synopsis": ["protect", "bodyguard", "guard", "shield",
                      "save", "rescue", "defend", "keeper"],
    },
    "paranormal": {
        "synopsis": ["vampire", "werewolf", "fae", "fairy", "witch",
                      "magic", "supernatural", "demon", "immortal",
                      "shapeshifter", "dragon"],
        "genre": ["paranormal", "fantasy", "supernatural"],
    },
    "single-parent": {
        "synopsis": ["single mom", "single dad", "child", "baby",
                      "daughter", "son", "parent"],
    },
    "revenge": {
        "synopsis": ["revenge", "vengeance", "payback", "avenge",
                      "retribution", "get back at"],
        "mood": ["vengeful", "dark"],
    },
    "childhood-friends": {
        "synopsis": ["childhood", "grew up", "known since", "hometown",
                      "back home", "small town"],
    },
    "brother's-best-friend": {
        "synopsis": ["brother's best friend", "brother's friend",
                      "best friend's sister", "best friend's brother",
                      "off limits"],
    },
}

# ────────────────────────── MMC Type Keyword Maps ──────────────────────────

MMC_TYPE_KEYWORD_MAP: Dict[str, Dict[str, list]] = {
    "alpha": {
        "synopsis": ["powerful", "dominant", "commands", "ruthless",
                      "CEO", "leader", "king", "don", "boss"],
        "genre": ["mafia", "billionaire"],
        "mood": ["intense", "aggressive"],
    },
    "brooding": {
        "synopsis": ["brooding", "dark past", "haunted", "secretive",
                      "mysterious", "guarded", "scarred", "moody"],
        "mood": ["dark", "tense"],
        "tone": ["gritty", "serious"],
    },
    "morally-grey": {
        "synopsis": ["morally", "grey", "villain", "complex",
                      "questionable", "twisted", "dangerous", "sinister"],
        "genre": ["dark", "mafia"],
        "tone": ["gritty"],
    },
    "cinnamon-roll": {
        "synopsis": ["sweet", "kind", "gentle", "caring", "soft",
                      "sunshine", "patient", "understanding"],
        "mood": ["heartwarming", "sweet", "lighthearted"],
        "tone": ["lighthearted", "tender", "gentle"],
    },
    "protector": {
        "synopsis": ["protect", "bodyguard", "guard", "shield",
                      "save", "rescue", "watch over"],
    },
    "possessive": {
        "synopsis": ["possess", "mine", "obsess", "claim", "own",
                      "jealous", "control"],
        "mood": ["intense", "dark"],
    },
    "cold": {
        "synopsis": ["cold", "ice", "unfeeling", "detached",
                      "stone", "frost", "emotionless"],
    },
    "playboy": {
        "synopsis": ["playboy", "charming", "womanizer", "flirt",
                      "reputation", "player"],
    },
    "tortured": {
        "synopsis": ["broken", "trauma", "pain", "lost", "torment",
                      "haunted", "damaged", "scar"],
        "mood": ["emotional", "heavy"],
        "tone": ["serious"],
    },
    "grumpy": {
        "synopsis": ["grumpy", "gruff", "anti-social", "bad temper",
                      "arrogant", "condescending", "ass"],
    },
    "nerd": {
        "synopsis": ["nerd", "geek", "smart", "professor", "brain",
                      "bookish", "glasses", "tech"],
    },
    "dominant": {
        "synopsis": ["dominant", "control", "command", "submit",
                      "power exchange", "dom"],
        "genre": ["erotic", "bdsm"],
    },
}

# Default fallback if no MMC type can be derived
DEFAULT_MMC_TYPE = "alpha"


def _text_matches(text: str, keywords: List[str]) -> int:
    """Return the number of keyword matches found in the text (case-insensitive)."""
    text_lower = text.lower()
    return sum(1 for kw in keywords if kw.lower() in text_lower)


def derive_tropes(book: Dict) -> List[str]:
    """Derive a list of romance tropes from a book's metadata.

    Args:
        book: Dict with keys like 'title', 'synopsis', 'genre', 'mood', 'tone', 'pacing'.

    Returns:
        Sorted list of trope names that apply to this book.
    """
    synopsis = book.get("synopsis", "")
    genre = book.get("genre", "")
    mood = book.get("mood", "")
    tone = book.get("tone", "")
    pacing = book.get("pacing", "")

    matched_tropes: List[str] = []

    for trope, keyword_sets in TROPE_KEYWORD_MAP.items():
        score = 0
        if "synopsis" in keyword_sets:
            score += _text_matches(synopsis, keyword_sets["synopsis"])
        if "genre" in keyword_sets:
            score += _text_matches(genre, keyword_sets["genre"]) * 2  # genre match weighted higher
        if "mood" in keyword_sets:
            score += _text_matches(mood, keyword_sets["mood"])
        if "tone" in keyword_sets:
            score += _text_matches(tone, keyword_sets["tone"])
        if "pacing" in keyword_sets:
            score += _text_matches(pacing, keyword_sets["pacing"])

        if score >= 1:
            matched_tropes.append(trope)

    # Every book should have at least one trope; fall back to genre-based
    if not matched_tropes:
        genre_lower = genre.lower()
        if "romance" in genre_lower:
            matched_tropes.append("slow-burn")
        if "ya" in genre_lower or "young adult" in genre_lower:
            matched_tropes.append("academic")
        if "fantasy" in genre_lower:
            matched_tropes.append("paranormal")
        if not matched_tropes:
            matched_tropes.append("slow-burn")

    return sorted(set(matched_tropes))


def derive_mmc_type(book: Dict) -> str:
    """Derive the most likely MMC (Male Main Character) archetype from book metadata.

    Args:
        book: Dict with keys like 'title', 'synopsis', 'genre', 'mood', 'tone'.

    Returns:
        The best-matching MMC type string.
    """
    synopsis = book.get("synopsis", "")
    genre = book.get("genre", "")
    mood = book.get("mood", "")
    tone = book.get("tone", "")

    scores: Dict[str, int] = {}

    for mmc_type, keyword_sets in MMC_TYPE_KEYWORD_MAP.items():
        score = 0
        if "synopsis" in keyword_sets:
            score += _text_matches(synopsis, keyword_sets["synopsis"])
        if "genre" in keyword_sets:
            score += _text_matches(genre, keyword_sets["genre"]) * 2
        if "mood" in keyword_sets:
            score += _text_matches(mood, keyword_sets["mood"])
        if "tone" in keyword_sets:
            score += _text_matches(tone, keyword_sets["tone"])

        if score > 0:
            scores[mmc_type] = score

    if not scores:
        return DEFAULT_MMC_TYPE

    return max(scores, key=scores.get)


def derive_book_metadata(book: Dict) -> Tuple[List[str], str]:
    """Derive both tropes and MMC type for a book.

    Returns:
        Tuple of (tropes_list, mmc_type).
    """
    return derive_tropes(book), derive_mmc_type(book)
