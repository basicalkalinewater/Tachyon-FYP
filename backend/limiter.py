"""
Centralized Flask-Limiter setup.

- Uses Redis if REDIS_URL is set; otherwise falls back to in-memory storage for dev.
- Can be disabled with RATE_LIMIT_ENABLED=0.
- Keying prefers a bearer/session token, falling back to remote IP.
"""
import os
from typing import Callable

from flask import Request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# global reference so blueprints can import limiter after init
limiter: Limiter | None = None


def maybe_limit(*limits, **kwargs):
    """
    Decorator wrapper that is a no-op when limiter is disabled.
    Usage: @maybe_limit("5 per minute")
    """
    def decorator(fn):
        if limiter:
            return limiter.limit(*limits, **kwargs)(fn)
        return fn
    return decorator

def _token_from_request(req: Request) -> str:
    header = (req.headers.get("Authorization") or "").strip().lower()
    if header.startswith("bearer "):
        return header.split(" ", 1)[1].strip()
    token = (req.args.get("token") or "").strip()
    return token


def _key_func() -> Callable[[Request], str]:
    def _key(req: Request) -> str:
        token = _token_from_request(req)
        if token:
            return f"token:{token}"
        return f"ip:{get_remote_address()}"

    return _key


def init_limiter(app):
    if os.getenv("RATE_LIMIT_ENABLED", "1") == "0":
        return None

    storage_uri = os.getenv("REDIS_URL")
    # Memory storage is fine for local dev; warn via startup log.
    global limiter
    limiter = Limiter(
        key_func=_key_func(),
        storage_uri=storage_uri or "memory://",
        default_limits=[],
        application_limits=[],
        strategy="moving-window",
        headers_enabled=True,
    )
    limiter.init_app(app)
    return limiter
