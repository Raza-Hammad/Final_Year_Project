"""
===============================================================================
STUDENT EXPLANATORY GUIDE: gemini_key_manager.py
===============================================================================
WHAT THIS FILE IS FOR:
----------------------
This file manages API Key Rotation and Quota Handling for Google Gemini AI.
To prevent the Sentinel AI Assistant from stopping if a free-tier Gemini API key hits
a rate limit or quota exhaustion, this manager automatically rotates across multiple API keys seamlessly.

KEY FUNCTIONALITIES:
--------------------
1. `GeminiKeyManager.__init__()`: Loads list of comma-separated Gemini API keys from settings (`.env`).
2. `get_current_key()`: Thread-safe method to return the active, non-exhausted API key.
3. `mark_exhausted()`: Temporarily blacklists a key if Gemini returns a 429 Rate Limit/Quota error and switches to the next key.
4. `rotate()`: Rotates key usage sequentially to balance request volume across keys.

LIBRARIES & TOOLS USED:
-----------------------
- `threading.Lock`: Thread synchronization primitive to prevent race conditions during concurrent API requests.
- `logging`: Logs key switches and quota warnings.
===============================================================================
"""

import logging
import threading
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)

class GeminiKeyManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.keys = settings.GEMINI_API_KEYS
        self.current_index = 0
        self.exhausted = set()
        if not self.keys:
            logger.warning(
                "No Gemini API keys found in env variable 'GEMINI_API_KEYS'. "
                "AI Assistant will run in rule-based/offline mode only until backend/.env is configured."
            )
        else:
            logger.info(f"Loaded {len(self.keys)} Gemini API keys")

    def get_current_key(self) -> Optional[str]:
        with self.lock:
            if not self.keys:
                return None
            # If all keys are exhausted, clear and reset
            if len(self.exhausted) >= len(self.keys):
                self.exhausted.clear()
                self.current_index = 0
                logger.warning("All Gemini API keys exhausted. Clearing exhausted set and restarting from Key #1.")
            
            # Find the next available non-exhausted key starting from current_index
            for i in range(len(self.keys)):
                idx = (self.current_index + i) % len(self.keys)
                key = self.keys[idx]
                if key not in self.exhausted:
                    self.current_index = idx
                    return key
            
            # Fallback (should never be reached because of the len check above)
            return self.keys[self.current_index]

    def mark_exhausted(self, key: str):
        with self.lock:
            if key in self.keys and key not in self.exhausted:
                self.exhausted.add(key)
                key_num = self.keys.index(key) + 1
                next_index = (self.current_index + 1) % len(self.keys)
                self.current_index = next_index
                next_key_num = next_index + 1
                logger.warning(f"Key #{key_num} exhausted, switching to Key #{next_key_num}")

    def rotate(self):
        with self.lock:
            self.current_index = (self.current_index + 1) % len(self.keys)
