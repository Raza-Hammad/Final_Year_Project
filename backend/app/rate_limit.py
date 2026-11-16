"""Shared slowapi limiter so routers and ``main.py`` count against one instance."""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
