import os
import re
import time
from collections import deque
from threading import Lock
from typing import Any, Dict, Optional

import requests
from flask import Blueprint, jsonify, request, current_app

try:
    from ..utils.mappers import map_product
    from ..services import promotion_service
except ImportError:
    from utils.mappers import map_product
    from services import promotion_service


llm_bp = Blueprint("llm", __name__)

RESTRICTED_PATTERN = re.compile(
    r"\b("
    r"order|orders|tracking|track|shipment|delivery issue|cancel|refund|return label|"
    r"payment|card|billing|charge|transaction|invoice|receipt|paypal|stripe|"
    r"account|login|password|email|phone|address|profile|personal|pii"
    r")\b",
    re.IGNORECASE,
)

JAILBREAK_PATTERN = re.compile(
    r"\b("
    r"ignore (all|any|previous) (instructions|rules)|"
    r"system prompt|developer message|"
    r"jailbreak|prompt injection|"
    r"act as|pretend to be|roleplay as|stay in character|"
    r"bypass|override|disregard|"
    r"reveal|expose|leak (the )?(system|developer|hidden) prompt|"
    r"print|show|dump (the )?(system|developer|hidden) prompt|"
    r"follow these instructions instead|"
    r"ignore (the )?above|"
    r"forget (the )?previous|"
    r"you are not bound by|"
    r"you are now|from now on|"
    r"do anything now|dan\b|"
    r"break character|"
    r"confidential|secret|hidden instructions|"
    r"new instructions:|"
    r"do not follow your rules|"
    r"translate and execute|"
    r"system:|developer:|assistant:|user:|"
    r"base64|"
    r"token|"
    r"policy override|"
    r"developer mode"
    r")\b",
    re.IGNORECASE,
)

RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("LLM_RATE_LIMIT_WINDOW", "60"))
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("LLM_RATE_LIMIT_MAX", "10"))
_RATE_LIMIT_BUCKETS = {}
_RATE_LIMIT_LOCK = Lock()


def _ok(data: Optional[Dict[str, Any]] = None):
    return jsonify({"success": True, "data": data})


def _error(message: str, status: int = 400):
    return jsonify({"success": False, "error": message}), status


def _get_client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"

def _rate_limited(key: str) -> bool:
    now = time.monotonic()
    with _RATE_LIMIT_LOCK:
        bucket = _RATE_LIMIT_BUCKETS.get(key)
        if bucket is None:
            bucket = deque()
            _RATE_LIMIT_BUCKETS[key] = bucket
        window_start = now - RATE_LIMIT_WINDOW_SECONDS
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT_MAX_REQUESTS:
            return True
        bucket.append(now)
    return False


def _build_prompt(user_text: str, mode: str, catalog_context: str) -> str:
    # 1. Detect if the user is asking in Chinese
    is_zh = any("\u4e00" <= char <= "\u9fff" for char in user_text)

    # 2. Define instructions based on Language and Mode
    if is_zh:
        role = "产品专家" if mode == "compare" else "购物助手"
        personal_data_rule = (
            "不要请求或使用个人数据、订单或支付信息。" if mode == "compare" else
            "不要处理个人数据、账户、订单或支付。如果被问及，请拒绝并引导用户登录并联系支持人员。"
        )
        
        instruction = (
            f"你仅为本商店担任{role}。请务必使用中文回答。\n"
            "仅使用下方提供的商店目录。不要浏览网页或使用外部知识。\n"
            "如果请求的产品不在目录中，请说明该产品在本店不可用。\n"
            f"{personal_data_rule}\n\n"
            "使用简洁的 markdown 回答。仅在列表时使用项目符号。\n"
            "推荐时，请包含目录中的准确产品名称。\n"
            "在相关时使用库存、评分和促销信息。"
        )
    else:
        role = "product expert" if mode == "compare" else "shopping assistant"
        personal_data_rule = (
            "Do not request or use personal data, orders, or payments." if mode == "compare" else
            "Do not handle personal data, accounts, orders, or payments. If asked about those, refuse and direct the user to log in and contact support."
        )

        instruction = (
            f"You are a {role} for this store only. Respond in English.\n"
            "Use ONLY the provided store catalog below. Do not browse the web or use external knowledge.\n"
            "If a requested product is not in the catalog, say it is not available in this store.\n"
            f"{personal_data_rule}\n\n"
            "Respond in concise markdown. Use bullet points only when listing.\n"
            "When recommending, include exact product names from the catalog.\n"
            "Use stock, ratings, and promotions when relevant."
        )

    # 3. Return the combined prompt
    return (
        f"{instruction}\n\n"
        f"Store catalog:\n{catalog_context}\n\n"
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


def _call_gemini(prompt: str, allow_search: bool = False) -> Dict[str, Any]:
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
            payload.pop("tools", None)
            resp = requests.post(url, json=payload, timeout=25)
        if resp.status_code >= 400:
            return {"error": f"Gemini API error: {resp.status_code} {resp.text}"}
        data = resp.json()
        text = _extract_text(data)
        return {"text": text or "I couldn't generate a response right now.", "raw": data}
    except Exception as exc:
        return {"error": f"Gemini request failed: {exc}"}


def _build_catalog_context() -> str:
    supabase = current_app.config.get("SUPABASE")
    if not supabase:
        return "Catalog unavailable."
    products_res = supabase.table("products").select("*").order("id", desc=False).execute()
    stock_res = supabase.table("product_stock_view").select("id,quantity_available").execute()
    stock_map = {row.get("id"): row.get("quantity_available") for row in (stock_res.data or [])}
    rows = products_res.data or []
    products = []
    for row in rows:
        row["quantity_available"] = stock_map.get(row.get("id"))
        products.append(map_product(row))
    active_promos = promotion_service.list_active_promotions(supabase)
    if active_promos:
        products = [promotion_service.apply_best_promotion(p, active_promos) for p in products]
    lines = []
    for row in products:
        title = row.get("title") or "Unnamed"
        brand = row.get("brand") or ""
        category = row.get("category") or ""
        price = row.get("price")
        original_price = row.get("originalPrice")
        rating = row.get("rating")
        rating_count = row.get("ratingCount")
        is_bestseller = row.get("isBestseller")
        quantity = row.get("quantity_available")
        promo = row.get("promotion") or {}
        promo_type = promo.get("discountType")
        promo_value = promo.get("discountValue")
        promo_label = ""
        if promo_type and promo_value is not None:
            promo_label = f"{promo_type}:{promo_value}"
        specs = row.get("specs") or {}
        spec_str = ", ".join([f"{k}:{v}" for k, v in specs.items()]) if isinstance(specs, dict) else ""
        lines.append(
            f"- {title} | brand:{brand} | category:{category} | price:{price} | "
            f"original_price:{original_price} | promo:{promo_label} | "
            f"rating:{rating} | rating_count:{rating_count} | "
            f"bestseller:{is_bestseller} | stock:{quantity} | specs:{spec_str}"
        )
    return "\n".join(lines) if lines else "Catalog unavailable."


@llm_bp.post("/compare")
def llm_compare():
    body = request.get_json(silent=True) or {}
    user_id = (body.get("user_id") or body.get("sender_id") or "").strip()
    key = f"user:{user_id}" if user_id else f"ip:{_get_client_ip()}"
    if _rate_limited(key):
        return _error("Rate limit exceeded. Please try again shortly.", status=429)
    message = (body.get("message") or "").strip()
    if not message:
        return _error("Message is required.")
    if JAILBREAK_PATTERN.search(message):
        return _ok(
            {
                "text": "I can't help with that request. Please ask about products available in this store.",
            }
        )
    if RESTRICTED_PATTERN.search(message):
        return _ok(
            {
                "text": "I can't help with personal, order, or payment matters here. "
                "Please log in and contact support for assistance.",
            }
        )
    catalog = _build_catalog_context()
    prompt = _build_prompt(message, mode="compare", catalog_context=catalog)
    result = _call_gemini(prompt, allow_search=False)
    if "error" in result:
        return _error(result["error"], status=502)
    return _ok({"text": result["text"]})


@llm_bp.post("/fallback")
def llm_fallback():
    body = request.get_json(silent=True) or {}
    user_id = (body.get("user_id") or body.get("sender_id") or "").strip()
    key = f"user:{user_id}" if user_id else f"ip:{_get_client_ip()}"
    if _rate_limited(key):
        return _error("Rate limit exceeded. Please try again shortly.", status=429)
    message = (body.get("message") or "").strip()
    if not message:
        return _error("Message is required.")
    if JAILBREAK_PATTERN.search(message):
        return _ok(
            {
                "text": "I can't help with that request. Please ask about products available in this store.",
            }
        )
    if RESTRICTED_PATTERN.search(message):
        return _ok(
            {
                "text": "I can't help with personal, order, or payment matters here. "
                "Please log in and contact support for assistance.",
            }
        )
    catalog = _build_catalog_context()
    prompt = _build_prompt(message, mode="fallback", catalog_context=catalog)
    result = _call_gemini(prompt, allow_search=False)
    if "error" in result:
        return _error(result["error"], status=502)
    return _ok({"text": result["text"]})
