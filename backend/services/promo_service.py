from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

try:
    from ..schemas.promo import PromoCreatePayload, PromoUpdatePayload  # package import
except ImportError:
    from schemas.promo import PromoCreatePayload, PromoUpdatePayload  # fallback for module import


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


def _normalize_code(code: str) -> str:
    return (code or "").strip()


def _parse_ts(value) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        # Supabase returns ISO strings, sometimes with trailing Z
        txt = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(txt)
    except Exception:
        return None


def list_promos(supabase, filters: Dict) -> List[Dict]:
    try:
        supabase.table("promo_codes").update({"active": False}).lt("expires_at", _now().isoformat()).eq("active", True).execute()
    except Exception:
        pass
    query = supabase.table("promo_codes").select("*")
    search = filters.get("search")
    if search:
        query = query.ilike("code", f"%{_normalize_code(search)}%")
    active = filters.get("active")
    if active is not None:
        query = query.eq("active", active)
    limit = filters.get("limit")
    offset = filters.get("offset")
    if isinstance(limit, int):
        query = query.limit(limit)
    if isinstance(offset, int):
        query = query.range(offset, offset + (limit or 50) - 1)
    res = query.order("created_at", desc=True).execute()
    return res.data or []


def create_promo(supabase, payload: PromoCreatePayload) -> Dict:
    body = payload.model_dump()
    normalized_code = _normalize_code(body["code"])
    existing = supabase.table("promo_codes").select("id").eq("code", normalized_code).limit(1).execute()
    if existing.data:
        raise ValueError("Promo code already exists")
    starts_at = body.get("startsAt")
    expires_at = body.get("expiresAt")
    if starts_at and expires_at and starts_at > expires_at:
        raise ValueError("startsAt must be before expiresAt")
    _ensure_not_past(starts_at, "startsAt")
    _ensure_not_past(expires_at, "expiresAt")
    if body.get("active", True):
        if not starts_at or not expires_at:
            raise ValueError("Active promo codes require startsAt and expiresAt")

    def _to_iso(val):
        return val.isoformat() if isinstance(val, datetime) else val

    data = {
        "code": normalized_code,
        "description": (body.get("description") or "").strip(),
        "discount_type": body["discountType"],
        "discount_value": body["discountValue"],
        "max_uses": body.get("maxUses"),
        "starts_at": _to_iso(starts_at),
        "expires_at": _to_iso(expires_at),
        "active": bool(body.get("active", True)),
    }
    res = supabase.table("promo_codes").insert(data).execute()
    return (res.data or [{}])[0]


def update_promo(supabase, promo_id: str, payload: PromoUpdatePayload) -> Dict:
    body = payload.model_dump(exclude_none=True)
    updates = {}
    if "code" in body:
        normalized_code = _normalize_code(body["code"])
        existing = (
            supabase.table("promo_codes")
            .select("id")
            .eq("code", normalized_code)
            .neq("id", promo_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            raise ValueError("Promo code already exists")
        updates["code"] = normalized_code
    if "description" in body:
        updates["description"] = (body.get("description") or "").strip()
    if "discountType" in body:
        updates["discount_type"] = body["discountType"]
    if "discountValue" in body:
        updates["discount_value"] = body["discountValue"]
    if "maxUses" in body:
        updates["max_uses"] = body.get("maxUses")
    starts_at = body.get("startsAt") if "startsAt" in body else None
    expires_at = body.get("expiresAt") if "expiresAt" in body else None
    if starts_at and expires_at and starts_at > expires_at:
        raise ValueError("startsAt must be before expiresAt")
    if "startsAt" in body:
        _ensure_not_past(starts_at, "startsAt")
    if "expiresAt" in body:
        _ensure_not_past(expires_at, "expiresAt")
    def _to_iso(val):
        return val.isoformat() if isinstance(val, datetime) else val
    if "startsAt" in body:
        updates["starts_at"] = _to_iso(starts_at)
    if "expiresAt" in body:
        updates["expires_at"] = _to_iso(expires_at)
    if "active" in body:
        updates["active"] = bool(body.get("active"))
        if updates["active"]:
            if not (starts_at and expires_at):
                existing = (
                    supabase.table("promo_codes")
                    .select("starts_at, expires_at")
                    .eq("id", promo_id)
                    .single()
                    .execute()
                    .data
                    or {}
                )
                starts_at = starts_at or _parse_ts(existing.get("starts_at"))
                expires_at = expires_at or _parse_ts(existing.get("expires_at"))
            if not starts_at or not expires_at:
                raise ValueError("Active promo codes require startsAt and expiresAt")
            if starts_at > expires_at:
                raise ValueError("startsAt must be before expiresAt")
            _ensure_not_past(starts_at, "startsAt")
            _ensure_not_past(expires_at, "expiresAt")

    if not updates:
        return {}

    res = supabase.table("promo_codes").update(updates).eq("id", promo_id).execute()
    return (res.data or [{}])[0]


def delete_promo(supabase, promo_id: str) -> Dict:
    res = supabase.table("promo_codes").delete().eq("id", promo_id).execute()
    return {"deleted": bool(res.data), "id": promo_id}


def get_by_code(supabase, code: str) -> Optional[Dict]:
    normalized = _normalize_code(code)
    res = supabase.table("promo_codes").select("*").eq("code", normalized).limit(1).execute()
    return res.data[0] if res.data else None


def validate_code(supabase, code: str, cart_total: float) -> Tuple[Optional[Dict], Optional[str]]:
    if not code:
        return None, "Promo code is required"

    promo = get_by_code(supabase, code)
    if not promo:
        return None, "Promo code not found"

    if not promo.get("active", False):
        return None, "This promo code is not active"

    now = _now()
    starts_at = _parse_ts(promo.get("starts_at"))
    expires_at = _parse_ts(promo.get("expires_at"))

    if starts_at and now < starts_at:
        return None, "This promo code is not active yet"
    if expires_at and now > expires_at:
        try:
            supabase.table("promo_codes").update({"active": False}).eq("id", promo.get("id")).execute()
        except Exception:
            pass
        return None, "This promo code has expired"

    max_uses = promo.get("max_uses")
    times_redeemed = promo.get("times_redeemed") or 0
    if max_uses is not None and times_redeemed >= max_uses:
        return None, "This promo code has reached its limit"

    discount_type = promo.get("discount_type")
    discount_value = float(promo.get("discount_value") or 0)
    base_total = max(float(cart_total or 0), 0)

    if discount_type == "percent":
        amount_off = round(base_total * (discount_value / 100), 2)
    else:
        amount_off = discount_value

    amount_off = min(amount_off, base_total)
    new_total = round(base_total - amount_off, 2)

    result = {
        "code": promo.get("code"),
        "description": promo.get("description") or "",
        "discountType": discount_type,
        "discountValue": discount_value,
        "amountOff": round(amount_off, 2),
        "newSubtotal": new_total,
        "startsAt": promo.get("starts_at"),
        "expiresAt": promo.get("expires_at"),
        "maxUses": max_uses,
        "timesRedeemed": times_redeemed,
        "id": promo.get("id"),
    }
    return result, None
