from flask import Blueprint, current_app, jsonify, request

from services.cart_service import map_cart_items

# Blueprint for cart endpoints; registered under /api/carts
carts_bp = Blueprint("carts", __name__)


@carts_bp.post("/")
def create_cart():
    # Create an empty cart and return its id
    supabase = current_app.config["SUPABASE"]
    try:
        res = supabase.table("carts").insert({}).execute()
        if not res.data:
            return jsonify({"error": "Failed to create cart"}), 500
        return jsonify({"cartId": res.data[0].get("id")}), 201
    except Exception as err:
        current_app.logger.error(f"create cart error: {err}")
        return jsonify({"error": str(err)}), 500


@carts_bp.get("/<cart_id>")
def get_cart(cart_id):
    # Return cart items for a given cart id (404 if not found)
    supabase = current_app.config["SUPABASE"]
    try:
        res = supabase.table("carts").select("id").eq("id", cart_id).limit(1).execute()
        row = res.data[0] if res.data else None
        if not row:
            return jsonify({"error": "Cart not found"}), 404
        items = map_cart_items(supabase, cart_id)
        return jsonify({"cartId": cart_id, "items": items})
    except Exception as err:
        current_app.logger.error(f"get cart error: {err}")
        return jsonify({"error": str(err)}), 500


@carts_bp.post("/<cart_id>/items")
def add_cart_item(cart_id):
    # Upsert a cart item (add or bump quantity)
    supabase = current_app.config["SUPABASE"]
    try:
        payload = request.get_json(force=True)
        product_id = payload.get("product_id")
        quantity = payload.get("quantity", 1)
        if not product_id:
            return jsonify({"error": "product_id is required"}), 400
        if quantity < 1:
            return jsonify({"error": "quantity must be >= 1"}), 400
        supabase.table("cart_items").upsert(
            {"cart_id": cart_id, "product_id": product_id, "quantity": quantity},
            on_conflict="cart_id,product_id",
        ).execute()
        items = map_cart_items(supabase, cart_id)
        return jsonify({"cartId": cart_id, "items": items}), 201
    except Exception as err:
        current_app.logger.error(f"add cart item error: {err}")
        return jsonify({"error": str(err)}), 500


@carts_bp.patch("/<cart_id>/items/<product_id>")
def update_cart_item(cart_id, product_id):
    # Update quantity for a specific product in the cart
    supabase = current_app.config["SUPABASE"]
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
        return jsonify({"error": str(err)}), 500


@carts_bp.delete("/<cart_id>/items/<product_id>")
def delete_cart_item(cart_id, product_id):
    # Remove a product from the cart
    supabase = current_app.config["SUPABASE"]
    try:
        supabase.table("cart_items").delete().eq("cart_id", cart_id).eq("product_id", product_id).execute()
        items = map_cart_items(supabase, cart_id)
        return jsonify({"cartId": cart_id, "items": items})
    except Exception as err:
        current_app.logger.error(f"delete cart item error: {err}")
        return jsonify({"error": str(err)}), 500
