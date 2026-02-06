from datetime import datetime, timezone
import secrets

from flask import Blueprint, current_app, jsonify, request, g

try:
    from ..utils.auth_middleware import require_session
    from ..services import cart_service, promo_service
except ImportError:
    from utils.auth_middleware import require_session
    from services import cart_service, promo_service

orders_bp = Blueprint("orders", __name__)


def _generate_order_code(supabase) -> str:
    for _ in range(8):
        code = f"ORD-{secrets.randbelow(90000) + 10000}"
        existing = (
            supabase.table("customer_order")
            .select("id")
            .eq("order_code", code)
            .limit(1)
            .execute()
        )
        if not existing.data:
            return code
    return f"ORD-{secrets.token_hex(4).upper()}"


@orders_bp.post("/orders")
@require_session(allowed_roles=["customer"])
def place_order():
    supabase = current_app.config["SUPABASE"]
    payload = request.get_json(force=True) or {}
    cart_id = payload.get("cartId")
    if not cart_id:
        return jsonify({"error": "cartId is required"}), 400

    items = cart_service.map_cart_items(supabase, cart_id)
    if not items:
        return jsonify({"error": "Cart is empty"}), 400

    subtotal = sum(float(item.get("price") or 0) * int(item.get("qty") or 0) for item in items)
    try:
        shipping = float(payload.get("shipping") or 0)
    except (TypeError, ValueError):
        shipping = 0

    promo_code = (payload.get("promoCode") or "").strip()
    discount = 0.0
    promo_row = None
    if promo_code:
        promo_row, err = promo_service.validate_code(supabase, promo_code, subtotal)
        if err:
            return jsonify({"error": err}), 400
        discount = float(promo_row.get("amountOff") or 0)

    total = max(subtotal - discount, 0) + shipping
    placed_at = datetime.now(timezone.utc).isoformat()

    order_code = _generate_order_code(supabase)
    user_id = (getattr(g, "current_user", None) or {}).get("id") or payload.get("userId")
    if not user_id:
        return jsonify({"error": "userId is required"}), 400
    address_id = payload.get("addressId")
    if not address_id:
        return jsonify({"error": "addressId is required"}), 400

    address_res = (
        supabase.table("customer_shipping_address")
        .select("id")
        .eq("id", address_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not (address_res.data or []):
        return jsonify({"error": "Shipping address not found"}), 404

    order_res = (
        supabase.table("customer_order")
        .insert(
            {
                "order_code": order_code,
                "user_id": user_id,
                "status": "Processing",
                "total": round(total, 2),
                "placed_at": placed_at,
                "shipping_address_id": address_id,
            }
        )
        .execute()
    )
    order_row = (order_res.data or [{}])[0]
    order_id = order_row.get("id")
    if not order_id:
        return jsonify({"error": "Unable to create order"}), 500

    order_items = [
        {
            "order_id": order_id,
            "product_name": item.get("title"),
            "quantity": int(item.get("qty") or 0),
            "unit_price": float(item.get("price") or 0),
        }
        for item in items
    ]
    supabase.table("customer_order_item").insert(order_items).execute()

    supabase.table("cart_items").delete().eq("cart_id", cart_id).execute()

    if promo_row:
        next_redeemed = int(promo_row.get("timesRedeemed") or 0) + 1
        updates = {"times_redeemed": next_redeemed}
        max_uses = promo_row.get("maxUses")
        if max_uses is not None and next_redeemed >= int(max_uses):
            updates["active"] = False
        supabase.table("promo_codes").update(updates).eq("id", promo_row.get("id")).execute()

    return jsonify(
        {
            "orderId": order_code,
            "status": "Processing",
            "total": round(total, 2),
            "placedAt": placed_at,
        }
    )
