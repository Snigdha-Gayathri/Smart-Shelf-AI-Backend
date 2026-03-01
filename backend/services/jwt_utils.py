"""JWT token generation and verification utilities."""

import jwt
import os
from datetime import datetime, timedelta
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

# Get JWT secret from environment (should be at least 32 chars for HS256)
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-change-this-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

if JWT_SECRET == "your-secret-key-change-this-in-production":
    logger.warning("⚠️ JWT_SECRET not set! Using default (insecure) value. Set JWT_SECRET env var for production!")


def generate_token(user_id: int, email: str, name: Optional[str] = None) -> str:
    """
    Generate a JWT token for a user.
    
    Args:
        user_id: User ID from database
        email: User email
        name: Optional user name
    
    Returns:
        Signed JWT token string
    """
    payload = {
        "user_id": user_id,
        "email": email,
        "name": name or email,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    logger.info(f"✅ Generated JWT token for user {email}")
    return token


def verify_token(token: str) -> Dict | None:
    """
    Verify and decode a JWT token.
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded token payload if valid, None if invalid/expired
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        logger.info(f"✅ Token verified for user {payload.get('email')}")
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("⚠️ Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"⚠️ Invalid token: {e}")
        return None


def decode_token_unsafe(token: str) -> Dict | None:
    """
    Decode token without verification (for debugging only).
    Use verify_token() for production.
    """
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        return payload
    except Exception as e:
        logger.error(f"Failed to decode token: {e}")
        return None
