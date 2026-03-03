from flask import Blueprint, current_app, jsonify, request, g

try:
    from ..services.cart_service import map_cart_items
    from ..schemas.cart import AddCartItemPayload
    from ..schemas.base import validate_body
    from ..limiter import maybe_limit
    from ..utils.auth_middleware import require_session
    from ..utils.cart_token import sign_cart_token, verify_cart_token
except ImportError:
    from services.cart_service import map_cart_items
    from schemas.cart import AddCartItemPayload
    from schemas.base import validate_body
    from limiter import maybe_limit
    from utils.auth_middleware import require_session
    from utils.cart_token import sign_cart_token, verify_cart_token

# Blueprint for cart endpoints; registered under /api/carts
carts_bp = Blueprint("carts", __name__)


def _cart_token_from_request() -> str:
    return (request.headers.get("X-Cart-Token") or "").strip()


def _ensure_cart_token(user_id: str, cart_id: str):
    token = _cart_token_from_request()
    if not verify_cart_token(user_id, cart_id, token):
        return jsonify({"error": "Invalid cart token"}), 403
    return None


@carts_bp.post("/")
@require_session(allowed_roles=["customer"])
@maybe_limit("120 per minute")
def create_cart():
    # Create an empty cart and return its id
    supabase = current_app.config["SUPABASE"]
    user_id = g.current_user["id"]
    try:
        res = supabase.table("carts").insert({}).execute()
        if not res.data:
            return jsonify({"error": "Failed to create cart"}), 500
        cart_id = res.data[0].get("id")
        cart_token = sign_cart_token(str(user_id), str(cart_id))
        return jsonify({"cartId": cart_id, "cartToken": cart_token}), 201
    except Exception as err:
        current_app.logger.error(f"create cart error: {err}")
        return jsonify({"error": "Failed to create cart"}), 500


@carts_bp.get("/<cart_id>")
@require_session(allowed_roles=["customer"])
@maybe_limit("240 per minute")
def get_cart(cart_id):
    # Return cart items for a given cart id (404 if not found)
    supabase = current_app.config["SUPABASE"]
    user_id = g.current_user["id"]
    token_err = _ensure_cart_token(str(user_id), str(cart_id))
    if token_err:
        return token_err
    try:
        res = supabase.table("carts").select("id").eq("id", cart_id).limit(1).execute()
        row = res.data[0] if res.data else None
        if not row:
            return jsonify({"error": "Cart not found"}), 404
        items = map_cart_items(supabase, cart_id)
        return jsonify({"cartId": cart_id, "items": items})
    except Exception as err:
        current_app.logger.error(f"get cart error: {err}")
        return jsonify({"error": "Failed to fetch cart"}), 500


@carts_bp.post("/<cart_id>/items")
@require_session(allowed_roles=["customer"])
@maybe_limit("120 per minute")
def add_cart_item(cart_id):
    # Upsert a cart item (add or bump quantity)
    supabase = current_app.config["SUPABASE"]
    user_id = g.current_user["id"]
    token_err = _ensure_cart_token(str(user_id), str(cart_id))
    if token_err:
        return token_err
    try:
        payload, error = validate_body(AddCartItemPayload)
        if error:
            return error
        product_id = payload.productId
        quantity = payload.quantity
        supabase.table("cart_items").upsert(
            {"cart_id": cart_id, "product_id": product_id, "quantity": quantity},
            on_conflict="cart_id,product_id",
        ).execute()
        items = map_cart_items(supabase, cart_id)
        return jsonify({"cartId": cart_id, "items": items}), 201
    except Exception as err:
        current_app.logger.error(f"add cart item error: {err}")
        return jsonify({"error": "Failed to add item to cart"}), 500


@carts_bp.patch("/<cart_id>/items/<product_id>")
@require_session(allowed_roles=["customer"])
@maybe_limit("120 per minute")
def update_cart_item(cart_id, product_id):
    # Update quantity for a specific product in the cart
    supabase = current_app.config["SUPABASE"]
    user_id = g.current_user["id"]
    token_err = _ensure_cart_token(str(user_id), str(cart_id))
    if token_err:
        return token_err
    try:
        payload = request.get_json(force=True)
        quantity = payload.get("quantity")
        if quantity is None:
            return jsonify({"error": "quantity is required"}), 400
        if quantity < 1:
            return jsonify({"error": "quantity must be >= 1"}), 400
        supabase.table("cart_items").update({"quantity": quantity}).eq("cart_id", cart_id).eq("product_id", product_id).execute()
        items = map_cart_items(supabase, cart_id)
        return jsonify({"cartId": cart_id, "items": items})
    except Exception as err:
        current_app.logger.error(f"update cart item error: {err}")
        return jsonify({"error": "Failed to update cart item"}), 500


@carts_bp.delete("/<cart_id>/items/<product_id>")
@require_session(allowed_roles=["customer"])
@maybe_limit("120 per minute")
def delete_cart_item(cart_id, product_id):
    # Remove a product from the cart
    supabase = current_app.config["SUPABASE"]
    user_id = g.current_user["id"]
    token_err = _ensure_cart_token(str(user_id), str(cart_id))
    if token_err:
        return token_err
    try:
        supabase.table("cart_items").delete().eq("cart_id", cart_id).eq("product_id", product_id).execute()
        items = map_cart_items(supabase, cart_id)
        return jsonify({"cartId": cart_id, "items": items})
    except Exception as err:
        current_app.logger.error(f"delete cart item error: {err}")
        return jsonify({"error": "Failed to remove cart item"}), 500
