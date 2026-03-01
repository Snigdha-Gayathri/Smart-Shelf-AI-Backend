import os
from typing import Dict, List, Optional

import requests


GROQ_API_BASE = os.getenv("GROQ_API_BASE", "https://api.groq.com/openai/v1")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")


def is_configured() -> bool:
    return bool(os.getenv("GROQ_API_KEY"))


def chat_completion(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    temperature: float = 0.6,
    timeout_seconds: int = 45,
) -> Dict:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured")

    target_model = model or GROQ_MODEL
    url = f"{GROQ_API_BASE.rstrip('/')}/chat/completions"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": target_model,
        "messages": messages,
        "temperature": temperature,
    }

    response = requests.post(url, headers=headers, json=payload, timeout=timeout_seconds)
    if response.status_code >= 400:
        try:
            details = response.json()
        except Exception:
            details = response.text
        raise RuntimeError(f"Groq request failed ({response.status_code}): {details}")

    return response.json()
