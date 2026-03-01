"""OAuth token verification utilities."""

import logging
from typing import Dict, Optional
import requests
import os

logger = logging.getLogger(__name__)

GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo"


def verify_google_token(id_token: str) -> Dict | None:
    """
    Verify a Google ID token from frontend.
    
    Args:
        id_token: Google ID token from frontend OAuth response
    
    Returns:
        Token payload with user info if valid, None if invalid
    """
    try:
        if not GOOGLE_OAUTH_CLIENT_ID:
            logger.error("❌ GOOGLE_OAUTH_CLIENT_ID not set in environment variables!")
            return None
        
        # Verify token with Google
        response = requests.post(
            f"{GOOGLE_TOKEN_ENDPOINT}?id_token={id_token}",
            timeout=5
        )
        
        if response.status_code != 200:
            logger.warning(f"❌ Google token verification failed: {response.text}")
            return None
        
        payload = response.json()
        
        # Verify the token is for our app
        if payload.get("aud") != GOOGLE_OAUTH_CLIENT_ID:
            logger.warning(f"❌ Token audience mismatch. Expected {GOOGLE_OAUTH_CLIENT_ID}, got {payload.get('aud')}")
            return None
        
        logger.info(f"✅ Google token verified for user {payload.get('email')}")
        return {
            "email": payload.get("email"),
            "name": payload.get("name"),
            "picture": payload.get("picture"),
            "provider_id": payload.get("sub"),
            "provider": "google"
        }
    
    except requests.RequestException as e:
        logger.error(f"❌ Failed to verify token with Google: {e}")
        return None
    except Exception as e:
        logger.error(f"❌ Unexpected error during token verification: {e}")
        return None


def verify_github_token(access_token: str) -> Dict | None:
    """
    Verify a GitHub access token and get user info.
    (Stub for future implementation)
    """
    try:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        response = requests.get("https://api.github.com/user", headers=headers, timeout=5)
        
        if response.status_code != 200:
            logger.warning(f"❌ GitHub token verification failed: {response.text}")
            return None
        
        payload = response.json()
        logger.info(f"✅ GitHub token verified for user {payload.get('login')}")
        return {
            "email": payload.get("email"),
            "name": payload.get("name"),
            "picture": payload.get("avatar_url"),
            "provider_id": str(payload.get("id")),
            "provider": "github"
        }
    
    except Exception as e:
        logger.error(f"❌ Failed to verify GitHub token: {e}")
        return None
