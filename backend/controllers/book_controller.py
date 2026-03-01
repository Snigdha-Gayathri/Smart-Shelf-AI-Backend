"""Book Controller — handles book interaction requests.

Validates input, delegates business logic to services, and
returns structured responses. Contains NO business logic itself.
"""

from __future__ import annotations

import logging
from typing import Dict

from models.schemas import BookInteractionRequest
from services.memory_service import update_user_memory

logger = logging.getLogger(__name__)


def handle_book_interaction(payload: BookInteractionRequest) -> Dict:
    """Process a new book interaction.

    Delegates to memory_service.update_user_memory which handles:
      - Storing the interaction
      - Updating trope weights
      - Recalculating personality profile

    Args:
        payload: Validated BookInteractionRequest.

    Returns:
        Dict with the stored interaction and status info.

    Raises:
        ValueError: If validation fails inside the service.
        Exception: For unexpected errors (logged and re-raised).
    """
    try:
        result = update_user_memory(
            user_id=payload.user_id,
            book_id=payload.book_id,
            emotional_tags=payload.emotional_tags,
            rating=payload.rating,
            liked_mmc_type=payload.liked_mmc_type,
            is_dnf=payload.is_dnf,
            completion_percentage=payload.completion_percentage,
            explicit_feedback=payload.explicit_feedback,
        )
        return {
            "status": "ok",
            "interaction": result,
            "message": "Book interaction stored and memory updated successfully",
        }
    except ValueError as ve:
        logger.warning(f"Validation error in book interaction: {ve}")
        raise
    except Exception as e:
        logger.error(f"Error processing book interaction: {e}", exc_info=True)
        raise
