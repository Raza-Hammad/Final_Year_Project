"""
===============================================================================
STUDENT EXPLANATORY GUIDE: nebius_client.py
===============================================================================
WHAT THIS FILE IS FOR:
----------------------
OpenAI-compatible client for Nebius AI Studio (Token Factory). Powers SENTINEL AI
chat and optional XAI prose explanations when NEBIUS_API_KEY is configured.

KEY FUNCTIONALITIES:
--------------------
1. Lazy OpenAI SDK client pointed at NEBIUS_BASE_URL.
2. `is_available()`: True when an API key is configured.
3. `chat_completion()`: Non-streaming chat with system + history messages.

LIBRARIES & TOOLS USED:
-----------------------
- `openai.OpenAI`: Official OpenAI Python SDK (works with Nebius base URL).
===============================================================================
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)


class NebiusClient:
    """Thin wrapper around the OpenAI-compatible Nebius chat API."""

    def __init__(self) -> None:
        self.api_key: Optional[str] = settings.NEBIUS_API_KEY or None
        self.base_url: str = settings.NEBIUS_BASE_URL.rstrip("/") + "/"
        self.model: str = settings.NEBIUS_MODEL
        self._client: Any = None

        if self.api_key:
            try:
                from openai import OpenAI

                self._client = OpenAI(base_url=self.base_url, api_key=self.api_key)
                logger.info(
                    "Nebius client configured (model=%s, base_url=%s)",
                    self.model,
                    self.base_url,
                )
            except Exception as err:
                logger.error("Failed to initialize Nebius OpenAI client: %s", err)
                self._client = None
        else:
            logger.warning(
                "NEBIUS_API_KEY is not set. AI Assistant will run in "
                "rule-based/offline mode until backend/.env (or legacy backend/env) "
                "is configured."
            )

    def is_available(self) -> bool:
        """Return True when a Nebius API key and client are ready."""
        return bool(self.api_key and self._client)

    def chat_completion(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.4,
        max_tokens: int = 1024,
    ) -> str:
        """Run a chat completion and return the assistant text.

        Args:
            messages: OpenAI-style message list (system/user/assistant).
            temperature: Sampling temperature.
            max_tokens: Maximum completion tokens.

        Returns:
            Stripped assistant message content.

        Raises:
            RuntimeError: If the client is not configured.
            Exception: Propagates API/SDK errors to the caller.
        """
        if not self.is_available():
            raise RuntimeError("Nebius client is not configured")

        completion = self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = completion.choices[0].message.content or ""
        return content.strip()


nebius_client = NebiusClient()
