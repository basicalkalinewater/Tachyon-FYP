from datetime import datetime, timezone
from typing import Dict, List, Optional


def _now() -> datetime:
    return datetime.now(timezone.utc)

def _normalize_dt(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value

def _ensure_not_past(value: Optional[datetime], label: str):
    if not value:
        return
    if _normalize_dt(value) < _now():
        raise ValueError(f"{label} cannot be in the past")


def _parse_ts(value) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        txt = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(txt)
    except Exception:
        return None


def _normalize_category(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value.strip().lower()


def _to_iso(val):
    return val.isoformat() if isinstance(val, datetime) else val


def list_promotions(supabase, filters: Dict) -> List[Dict]:
    try:
        supabase.table("promotions").update({"active": False}).lt("expires_at", _now().isoformat()).eq("active", True).execute()
    except Exception:
        pass
    query = supabase.table("promotions").select("*")
    search = (filters.get("search") or "").strip()
    if search:
        query = query.or_(f"name.ilike.%{search}%,category.ilike.%{search}%")
    active = filters.get("active")
    if active is not None:
        query = query.eq("active", active)
    scope = (filters.get("scope") or "").strip()
    if scope:
        query = query.eq("scope_type", scope)
    limit = filters.get("limit")
    offset = filters.get("offset")
    if isinstance(limit, int):
        query = query.limit(limit)
    if isinstance(offset, int):
        query = query.range(offset, offset + (limit or 50) - 1)
    res = query.order("created_at", desc=True).execute()
    return res.data or []


def _validate_window(starts_at, expires_at):
    if starts_at and expires_at and starts_at > expires_at:
        raise ValueError("startsAt must be before expiresAt")
    _ensure_not_past(starts_at, "startsAt")
    _ensure_not_past(expires_at, "expiresAt")

def _fetch_product_price(supabase, product_id: Optional[str]) -> Optional[float]:
    if not product_id:
        return None
    res = supabase.table("products").select("price").eq("id", product_id).limit(1).execute()
    if not res.data:
        return None
    try:
        return float(res.data[0].get("price") or 0)
    except (TypeError, ValueError):
        return None


def create_promotion(supabase, payload) -> Dict:
    body = payload.model_dump()
    starts_at = body.get("startsAt")
    expires_at = body.get("expiresAt")
    _validate_window(starts_at, expires_at)
    if body.get("active", True):
        if not starts_at or not expires_at:
            raise ValueError("Active promotions require startsAt and expiresAt")

    if body.get("scopeType") == "product" and body.get("productId"):
        existing = (
            supabase.table("promotions")
            .select("id")
            .eq("scope_type", "product")
            .eq("product_id", body.get("productId"))
            .limit(1)
            .execute()
        )
        if existing.data:
            raise ValueError("A promotion already exists for this product")

    if body.get("scopeType") == "product" and body.get("discountType") == "amount":
        price = _fetch_product_price(supabase, body.get("productId"))
        if price is None:
            raise ValueError("Unable to validate product price for this promotion")
        if float(body.get("discountValue") or 0) > price:
            raise ValueError("Discount amount cannot exceed product price")

    data = {
        "name": (body.get("name") or "").strip(),
        "scope_type": body["scopeType"],
        "product_id": body.get("productId"),
        "category": _normalize_category(body.get("category")),
        "discount_type": body["discountType"],
        "discount_value": body["discountValue"],
        "starts_at": _to_iso(starts_at),
        "expires_at": _to_iso(expires_at),
        "active": bool(body.get("active", True)),
    }
    res = supabase.table("promotions").insert(data).execute()
    return (res.data or [{}])[0]


def update_promotion(supabase, promotion_id: str, payload) -> Dict:
    body = payload.model_dump(exclude_none=True)
    updates = {}
    if "name" in body:
        updates["name"] = (body.get("name") or "").strip()
    if "scopeType" in body:
        updates["scope_type"] = body["scopeType"]
    if "productId" in body:
        updates["product_id"] = body.get("productId")
    if "category" in body:
        updates["category"] = _normalize_category(body.get("category"))
    if "discountType" in body:
        updates["discount_type"] = body["discountType"]
    if "discountValue" in body:
        updates["discount_value"] = body["discountValue"]
    starts_at = body.get("startsAt") if "startsAt" in body else None
    expires_at = body.get("expiresAt") if "expiresAt" in body else None
    if starts_at and expires_at:
        _validate_window(starts_at, expires_at)
    if "startsAt" in body:
        _ensure_not_past(starts_at, "startsAt")
    if "expiresAt" in body:
        _ensure_not_past(expires_at, "expiresAt")
    if "startsAt" in body:
        updates["starts_at"] = _to_iso(starts_at)
    if "expiresAt" in body:
        updates["expires_at"] = _to_iso(expires_at)
    if "active" in body:
        updates["active"] = bool(body.get("active"))
        if updates["active"]:
            if not (starts_at and expires_at):
                existing = (
                    supabase.table("promotions")
                    .select("starts_at, expires_at")
                    .eq("id", promotion_id)
                    .single()
                    .execute()
                    .data
                    or {}
                )
                starts_at = starts_at or _parse_ts(existing.get("starts_at"))
                expires_at = expires_at or _parse_ts(existing.get("expires_at"))
            if not starts_at or not expires_at:
                raise ValueError("Active promotions require startsAt and expiresAt")
            if starts_at > expires_at:
                raise ValueError("startsAt must be before expiresAt")
            _ensure_not_past(starts_at, "startsAt")
            _ensure_not_past(expires_at, "expiresAt")

    if updates.get("scope_type") == "product" and "category" not in updates:
        updates["category"] = None
    if updates.get("scope_type") == "category" and "product_id" not in updates:
        updates["product_id"] = None

    if updates.get("scope_type") == "product":
        product_id = updates.get("product_id")
        if not product_id:
            existing = (
                supabase.table("promotions")
                .select("product_id")
                .eq("id", promotion_id)
                .single()
                .execute()
                .data
                or {}
            )
            product_id = existing.get("product_id")
        if product_id:
            dup = (
                supabase.table("promotions")
                .select("id")
                .eq("scope_type", "product")
                .eq("product_id", product_id)
                .neq("id", promotion_id)
                .limit(1)
                .execute()
            )
            if dup.data:
                raise ValueError("A promotion already exists for this product")

    if updates.get("scope_type") == "product" and updates.get("discount_type") == "amount":
        product_id = updates.get("product_id")
        if not product_id:
            existing = (
                supabase.table("promotions")
                .select("product_id")
                .eq("id", promotion_id)
                .single()
                .execute()
                .data
                or {}
            )
            product_id = existing.get("product_id")
        price = _fetch_product_price(supabase, product_id)
        if price is None:
            raise ValueError("Unable to validate product price for this promotion")
        discount_value = updates.get("discount_value")
        if discount_value is None:
            existing = (
                supabase.table("promotions")
                .select("discount_value")
                .eq("id", promotion_id)
                .single()
                .execute()
                .data
                or {}
            )
            discount_value = existing.get("discount_value")
        if discount_value is not None and float(discount_value) > price:
            raise ValueError("Discount amount cannot exceed product price")

    if not updates:
        return {}

    res = supabase.table("promotions").update(updates).eq("id", promotion_id).execute()
    return (res.data or [{}])[0]


def delete_promotion(supabase, promotion_id: str) -> Dict:
    res = supabase.table("promotions").delete().eq("id", promotion_id).execute()
    return {"deleted": bool(res.data), "id": promotion_id}


def list_active_promotions(supabase) -> List[Dict]:
    res = supabase.table("promotions").select("*").eq("active", True).execute()
    now = _now()
    active = []
    for promo in res.data or []:
        starts_at = _parse_ts(promo.get("starts_at"))
        expires_at = _parse_ts(promo.get("expires_at"))
        if starts_at and now < starts_at:
            continue
        if expires_at and now > expires_at:
            continue
        active.append(promo)
    return active


def _discount_amount(price: float, promo: Dict) -> float:
    discount_type = promo.get("discount_type")
    discount_value = float(promo.get("discount_value") or 0)
    if discount_type == "percent":
        amount = price * (discount_value / 100)
    else:
        amount = discount_value
    return min(max(amount, 0), price)


def apply_best_promotion(product: Dict, promotions: List[Dict]) -> Dict:
    price = float(product.get("price") or 0)
    product["originalPrice"] = round(price, 2)
    if not promotions or price <= 0:
        return product

    best = None
    best_amount = 0.0
    product_id = product.get("id")
    category = (product.get("category") or "").strip().lower()

    for promo in promotions:
        scope_type = promo.get("scope_type")
        if scope_type == "product":
            if promo.get("product_id") != product_id:
                continue
        elif scope_type == "category":
            promo_category = (promo.get("category") or "").strip().lower()
            if not category or promo_category != category:
                continue
        else:
            continue
        amount = _discount_amount(price, promo)
        if amount > best_amount:
            best_amount = amount
            best = promo
        elif amount == best_amount and best is not None:
            if promo.get("scope_type") == "product" and best.get("scope_type") == "category":
                best = promo

    if not best or best_amount <= 0:
        return product

    promo_price = round(price - best_amount, 2)
    product["price"] = promo_price
    product["promotion"] = {
        "id": best.get("id"),
        "name": best.get("name") or "",
        "scopeType": best.get("scope_type"),
        "discountType": best.get("discount_type"),
        "discountValue": float(best.get("discount_value") or 0),
        "startsAt": best.get("starts_at"),
        "expiresAt": best.get("expires_at"),
        "productId": best.get("product_id"),
        "category": best.get("category"),
    }
    return product
