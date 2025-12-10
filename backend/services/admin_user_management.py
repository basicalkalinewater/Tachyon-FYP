import secrets
from typing import Dict, Optional, List

from ..services import customer_service


def _safe_fetch_profile(supabase, table, user_id, fields):
    res = supabase.table(table).select(fields).eq("user_id", user_id).limit(1).execute()
    rows = res.data or []
    return rows[0] if rows else {}


def _enrich_user_with_profile(supabase, user: Dict) -> Dict:
    uid = user.get("id")
    role = user.get("role")
    status = user.get("status")
    if not uid or not role:
        return user
    try:
        if role == "customer":
            # ensure profile exists
            customer_service.ensure_profile_row(supabase, uid)
            prof = _safe_fetch_profile(supabase, "customer_profile", uid, "full_name, phone_number")
            user["full_name"] = prof.get("full_name")
            user["phone"] = prof.get("phone_number")
            # include shipping addresses for admin view
            try:
                user["shippingAddresses"] = customer_service.fetch_shipping_addresses(supabase, uid)
            except Exception:
                user["shippingAddresses"] = []
        elif role == "support":
            prof = _safe_fetch_profile(supabase, "live_agent_profile", uid, "full_name, phone")
            if not prof:
                supabase.table("live_agent_profile").upsert({"user_id": uid, "full_name": "", "phone": ""}).execute()
                prof = {"full_name": "", "phone": ""}
            user["full_name"] = prof.get("full_name")
            user["phone"] = prof.get("phone")
        elif role == "admin":
            prof = _safe_fetch_profile(supabase, "admin_profile", uid, "full_name, phone")
            if not prof:
                supabase.table("admin_profile").upsert({"user_id": uid, "full_name": "", "phone": ""}).execute()
                prof = {"full_name": "", "phone": ""}
            user["full_name"] = prof.get("full_name")
            user["phone"] = prof.get("phone")
    except Exception:
        # best-effort enrichment
        pass
    return user


def _hash_password(password: str) -> str:
    # NOTE: replace with proper hash in production; current system stores raw hash in db
    return password or ""


def list_users(supabase, filters: Dict) -> List[Dict]:
    query = supabase.table("app_user").select("id, email, role, status")
    if filters.get("email_substr"):
        query = query.ilike("email", f"%{filters['email_substr']}%")
    if filters.get("role"):
        query = query.eq("role", filters["role"])
    if filters.get("status"):
        query = query.eq("status", filters["status"])
    query = query.order("email").range(filters["offset"], filters["offset"] + filters["limit"] - 1)
    res = query.execute()
    users = res.data or []
    return [_enrich_user_with_profile(supabase, u) for u in users]


def _ensure_profile(supabase, user_id: str, role: str, full_name: str, phone: str):
    if role == "customer":
        customer_service.ensure_profile_row(supabase, user_id)
        supabase.table("customer_profile").update({"full_name": full_name, "phone_number": phone}).eq("user_id", user_id).execute()
    elif role == "support":
        supabase.table("live_agent_profile").upsert({"user_id": user_id, "full_name": full_name, "phone": phone}).execute()
    elif role == "admin":
        supabase.table("admin_profile").upsert({"user_id": user_id, "full_name": full_name, "phone": phone}).execute()


def create_user(supabase, email: str, role: str, password: str, full_name: str, phone: str):
    if not email or not role or not password:
        raise ValueError("email, role, and password are required")
    res = (
        supabase.table("app_user")
        .insert({"email": email, "role": role, "password_hash": _hash_password(password), "status": "active"})
        .execute()
    )
    user = res.data[0]
    _ensure_profile(supabase, user["id"], role, full_name, phone)
    return _enrich_user_with_profile(supabase, user)


def update_user(supabase, user_id: str, role: Optional[str], status: Optional[str], full_name: Optional[str], phone: Optional[str], password: Optional[str]):
    updates = {}
    if role:
        updates["role"] = role
    if status:
        if status not in ("active", "disabled"):
            raise ValueError("status must be 'active' or 'disabled'")
        updates["status"] = status
    if password:
        updates["password_hash"] = _hash_password(password)
    if updates:
        supabase.table("app_user").update(updates).eq("id", user_id).execute()

    # sync profile
    if full_name is not None or phone is not None or role:
        # fetch current role if not provided
        if not role:
            res = supabase.table("app_user").select("role").eq("id", user_id).single().execute()
            role = res.data.get("role")
        supabase_role = role or "customer"
        supabase_full_name = full_name if full_name is not None else ""
        supabase_phone = phone if phone is not None else ""
        _ensure_profile(supabase, user_id, supabase_role, supabase_full_name, supabase_phone)

    res = supabase.table("app_user").select("id, email, role").eq("id", user_id).single().execute()
    user = res.data
    return _enrich_user_with_profile(supabase, user)


def disable_user(supabase, user_id: str):
    # Mark disabled and revoke active sessions
    supabase.table("app_user").update({"status": "disabled"}).eq("id", user_id).execute()
    supabase.table("app_session").delete().eq("user_id", user_id).execute()
