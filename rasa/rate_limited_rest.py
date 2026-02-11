"""
Custom REST channel with simple in-memory rate limiting and payload validation.

Limitations: per-process counters (good enough for local/dev). For clustered prod,
swap the storage to Redis.
"""
import time
from typing import Any, Dict, List, Optional, Text

from sanic import Blueprint, response
from sanic.request import Request
from rasa.core.channels.rest import RestInput
from rasa.core.channels.channel import InputChannel


class RateLimitedRestInput(RestInput):
    def __init__(
        self,
        per_sender: int = 60,
        window_seconds: int = 60,
        max_body: int = 4096,
    ):
        self.per_sender = per_sender
        self.window_seconds = window_seconds
        self.max_body = max_body
        self._buckets: Dict[str, List[float]] = {}

    @classmethod
    def name(cls) -> Text:
        # Keep the standard REST webhook path: /webhooks/rest/webhook
        return "rest"

    @classmethod
    def from_credentials(cls, credentials: Optional[Dict[Text, Any]]) -> InputChannel:
        if not credentials:
            return cls()
        return cls(
            per_sender=int(credentials.get("per_sender", 60)),
            window_seconds=int(credentials.get("window_seconds", 60)),
            max_body=int(credentials.get("max_body", 4096)),
        )

    # simple sliding window
    def _allow(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self._buckets.setdefault(key, [])
        while bucket and bucket[0] <= now - self.window_seconds:
            bucket.pop(0)
        if len(bucket) >= self.per_sender:
            return False
        bucket.append(now)
        return True

    def blueprint(self, on_new_message):
        from rasa.core.channels.channel import (
            UserMessage,
            CollectingOutputChannel,
            InputChannel,
        )

        bp = Blueprint("ratelimited_rest", __name__)

        def _cors_headers(request: Request) -> Dict[str, str]:
            origin = request.headers.get("origin", "*")
            return {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Credentials": "true",
            }

        @bp.options("/webhook")
        async def preflight(request: Request):
            return response.text("", headers=_cors_headers(request), status=204)

        @bp.post("/webhook")
        async def receive(request: Request):
            if len(request.body or b"") > self.max_body:
                return response.json({"error": "Payload too large"}, status=413, headers=_cors_headers(request))

            payload = request.json or {}
            sender_id = payload.get("sender") or payload.get("sender_id") or "anonymous"
            text = payload.get("message") or payload.get("text")

            key = f"{sender_id}"
            if not self._allow(key):
                return response.json({"error": "Too many requests"}, status=429, headers=_cors_headers(request))

            if not text or not isinstance(text, str):
                return response.json({"error": "Message text is required"}, status=400, headers=_cors_headers(request))
            if len(text) > 1000:
                return response.json({"error": "Message too long"}, status=413, headers=_cors_headers(request))

            metadata = payload.get("metadata") or {}

            # Replicate default REST channel behaviour
            collector = CollectingOutputChannel()
            await on_new_message(
                UserMessage(
                    text,
                    collector,
                    sender_id,
                    input_channel=self.name(),
                    metadata=metadata,
                )
            )
            return response.json(collector.messages, headers=_cors_headers(request))

        return bp
