import os
import re
from typing import Any, Dict, Optional

import requests
from flask import Blueprint, jsonify, request


llm_bp = Blueprint("llm", __name__)

RESTRICTED_PATTERN = re.compile(
    r"\b("
    r"order|orders|tracking|track|shipment|delivery issue|cancel|refund|return label|"
    r"payment|card|billing|charge|transaction|invoice|receipt|paypal|stripe|"
    r"account|login|password|email|phone|address|profile|personal|pii"
    r")\b",
    re.IGNORECASE,
)


def _ok(data: Optional[Dict[str, Any]] = None):
    return jsonify({"success": True, "data": data})


def _error(message: str, status: int = 400):
    return jsonify({"success": False, "error": message}), status


def _build_prompt(user_text: str, mode: str) -> str:
    if mode == "compare":
        return (
            "You are a product expert for an electronics e-commerce store. "
            "Compare products based on the user's request. "
            "If specific products aren't in the catalog, say so and give general guidance. "
            "Do not request or use personal data, orders, or payments.\n\n"
            f"User request: {user_text}"
        )
    return (
        "You are a helpful shopping assistant. Answer general product questions only. "
        "Do not handle personal data, accounts, orders, or payments. "
        "If asked about those, refuse and direct the user to log in and contact support.\n\n"
        f"User request: {user_text}"
    )


def _extract_text(payload: Dict[str, Any]) -> str:
    candidates = payload.get("candidates") or []
    for cand in candidates:
        content = cand.get("content") or {}
        parts = content.get("parts") or []
        for part in parts:
            text = part.get("text")
            if text:
                return text.strip()
    return ""


def _call_gemini(prompt: str, allow_search: bool = True) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"error": "GEMINI_API_KEY is not configured."}

    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    payload: Dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "systemInstruction": {
            "parts": [
                {
                    "text": (
                        "Refuse any request involving personal data, account details, orders, or payments."
                    )
                }
            ]
        },
    }

    if allow_search:
        payload["tools"] = [{"google_search_retrieval": {}}]

    try:
        resp = requests.post(url, json=payload, timeout=25)
        if resp.status_code >= 400 and allow_search:
            # Retry without search grounding if not enabled for the API key.
            payload.pop("tools", None)
            resp = requests.post(url, json=payload, timeout=25)
        if resp.status_code >= 400:
            return {"error": f"Gemini API error: {resp.status_code} {resp.text}"}
        data = resp.json()
        text = _extract_text(data)
        return {"text": text or "I couldn't generate a response right now.", "raw": data}
    except Exception as exc:
        return {"error": f"Gemini request failed: {exc}"}


@llm_bp.post("/compare")
def llm_compare():
    body = request.get_json(silent=True) or {}
    message = (body.get("message") or "").strip()
    if not message:
        return _error("Message is required.")
    if RESTRICTED_PATTERN.search(message):
        return _ok(
            {
                "text": "I can’t help with personal, order, or payment matters here. "
                "Please log in and contact support for assistance.",
            }
        )
    prompt = _build_prompt(message, mode="compare")
    result = _call_gemini(prompt, allow_search=True)
    if "error" in result:
        return _error(result["error"], status=502)
    return _ok({"text": result["text"]})


@llm_bp.post("/fallback")
def llm_fallback():
    body = request.get_json(silent=True) or {}
    message = (body.get("message") or "").strip()
    if not message:
        return _error("Message is required.")
    if RESTRICTED_PATTERN.search(message):
        return _ok(
            {
                "text": "I can’t help with personal, order, or payment matters here. "
                "Please log in and contact support for assistance.",
            }
        )
    prompt = _build_prompt(message, mode="fallback")
    result = _call_gemini(prompt, allow_search=True)
    if "error" in result:
        return _error(result["error"], status=502)
    return _ok({"text": result["text"]})
