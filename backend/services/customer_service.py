from datetime import datetime
import secrets
from typing import Any, Dict, Tuple, Optional, List

from ..utils.mappers import map_product, map_address, map_payment, map_order, map_rma  # type: ignore


def ensure_profile_row(supabase, user_id: str) -> None:
    res = (
        supabase.table("customer_profile")
        .select("user_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        supabase.table("customer_profile").insert({"user_id": user_id, "full_name": ""}).execute()


def fetch_customer_profile(supabase, user: Dict[str, Any]) -> Dict[str, Any]:
    ensure_profile_row(supabase, user["id"])
    res = (
        supabase.table("customer_profile")
        .select("full_name, phone_number")
        .eq("user_id", user["id"])
        .single()
        .execute()
    )
    row = res.data or {}
    return {
        "fullName": row.get("full_name") or "",
        "email": user.get("email"),
        "phone": row.get("phone_number") or "",
    }


def fetch_customer_orders(supabase, user_id: str) -> List[Dict[str, Any]]:
    res = (
        supabase.table("customer_order")
        .select("*, customer_order_item(*)")
        .eq("user_id", user_id)
        .order("placed_at", desc=True)
        .execute()
    )
    return [map_order(row) for row in res.data or []]


def fetch_customer_rmas(supabase, user_id: str) -> List[Dict[str, Any]]:
    res = (
        supabase.table("customer_rma")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [map_rma(row) for row in res.data or []]


def fetch_shipping_addresses(supabase, user_id: str) -> List[Dict[str, Any]]:
    res = (
        supabase.table("shipping_address")
        .select("*")
        .eq("user_id", user_id)
        .order("is_default", desc=True)
        .order("created_at", desc=True)
        .execute()
    )
    return [map_address(row) for row in res.data or []]


def fetch_saved_payments(supabase, user_id: str) -> List[Dict[str, Any]]:
    res = (
        supabase.table("saved_payment_method")
        .select("*")
        .eq("user_id", user_id)
        .order("is_default", desc=True)
        .order("created_at", desc=True)
        .execute()
    )
    return [map_payment(row) for row in res.data or []]


def clear_default_for(supabase, table_name: str, user_id: str) -> None:
    supabase.table(table_name).update({"is_default": False}).eq("user_id", user_id).eq("is_default", True).execute()


def normalize_address_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    required_fields = ["label", "recipient", "line1", "city", "postalCode", "country"]
    for field in required_fields:
        if not (payload.get(field) or "").strip():
            raise ValueError(f"{field} is required")
    return {
        "label": payload["label"].strip(),
        "recipient": payload["recipient"].strip(),
        "line1": payload["line1"].strip(),
        "line2": (payload.get("line2") or "").strip(),
        "city": payload["city"].strip(),
        "postal_code": payload["postalCode"].strip(),
        "country": payload["country"].strip(),
        "phone": (payload.get("phone") or "").strip(),
        "is_default": bool(payload.get("isDefault")),
    }


def build_address_update(payload: Dict[str, Any]) -> Dict[str, Any]:
    mapping = {
        "label": "label",
        "recipient": "recipient",
        "line1": "line1",
        "line2": "line2",
        "city": "city",
        "postalCode": "postal_code",
        "country": "country",
        "phone": "phone",
    }
    body = {}
    optional_fields = {"line2", "phone"}
    for key, column in mapping.items():
        if key in payload:
            value = payload[key]
            if isinstance(value, str):
                value = value.strip()
                if not value and key not in optional_fields:
                    raise ValueError(f"{key} cannot be empty")
            body[column] = value
    if "isDefault" in payload:
        body["is_default"] = bool(payload["isDefault"])
    return body


def normalize_payment_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    required_fields = ["brand", "last4", "expiry"]
    for field in required_fields:
        if not (payload.get(field) or "").strip():
            raise ValueError(f"{field} is required")
    last4 = (payload.get("last4") or "").strip()[-4:]
    if len(last4) != 4 or not last4.isdigit():
        raise ValueError("last4 must contain four digits")
    return {
        "brand": payload["brand"].strip(),
        "last4": last4,
        "expiry": payload["expiry"].strip(),
        "nickname": (payload.get("nickname") or "").strip(),
        "is_default": bool(payload.get("isDefault")),
    }


def build_payment_update(payload: Dict[str, Any]) -> Dict[str, Any]:
    mapping = {
        "brand": "brand",
        "last4": "last4",
        "expiry": "expiry",
        "nickname": "nickname",
    }
    body = {}
    for key, column in mapping.items():
        if key in payload:
            value = payload[key]
            if isinstance(value, str):
                value = value.strip()
            body[column] = value
    if "last4" in body:
        last4 = body["last4"][-4:]
        if len(last4) != 4 or not last4.isdigit():
            raise ValueError("last4 must contain four digits")
        body["last4"] = last4
    if "isDefault" in payload:
        body["is_default"] = bool(payload["isDefault"])
    return body


def get_customer_dashboard_payload(supabase, user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "profile": fetch_customer_profile(supabase, user),
        "purchaseHistory": fetch_customer_orders(supabase, user["id"]),
        "rmas": fetch_customer_rmas(supabase, user["id"]),
        "shippingAddresses": fetch_shipping_addresses(supabase, user["id"]),
        "savedPayments": fetch_saved_payments(supabase, user["id"]),
    }


def sanitize_user(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row.get("id"),
        "email": row.get("email"),
        "role": row.get("role"),
    }


def fetch_user_by_id(supabase, user_id: str) -> Optional[Dict[str, Any]]:
    res = (
        supabase.table("app_user")
        .select("id, email, role")
        .eq("id", user_id)
        .single()
        .execute()
    )
    return res.data


def require_customer(supabase, user_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[Tuple[str, int]]]:
    user_row = fetch_user_by_id(supabase, user_id)
    if not user_row:
        return None, ("User not found", 404)
    if user_row.get("role") != "customer":
        return None, ("Forbidden", 403)
    return user_row, None


def fetch_user_with_password(supabase, email: str) -> Optional[Dict[str, Any]]:
    res = (
        supabase.table("app_user")
        .select("id, email, role, password_hash")
        .eq("email", email)
        .single()
        .execute()
    )
    return res.data


def password_matches(password: str, stored_hash: str) -> bool:
    return secrets.compare_digest(password or "", stored_hash or "")


def fetch_user_by_email(supabase, email: str) -> Optional[Dict[str, Any]]:
    res = (
        supabase.table("app_user")
        .select("id, email, role, password_hash")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]
    return None
