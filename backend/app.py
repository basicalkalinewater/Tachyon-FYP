"""
Flask REST API that fronts Supabase tables for products and carts.
- CORS is enabled for the Vite frontend.
- Supabase client is initialized once and reused.
"""

import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from supabase_client import get_supabase

app = Flask(__name__)
CORS(app)
supabase = get_supabase()


def map_product(row):
    """Normalize DB product row into the shape the frontend expects."""
    return {
        "id": row.get("id"),
        "title": row.get("title"),
        "description": row.get("description"),
        "price": float(row.get("price", 0)),
        "image": row.get("image_url"),
        "category": row.get("category"),
        "rating": row.get("rating"),
        "rating_count": row.get("rating_count"),
        "specs": row.get("specs") or {},
    }


def map_cart_items(cart_id):
    """
    Fetch cart items with joined product rows and normalize the shape.
    Raises on Supabase errors so the route can return a 500 with the message.
    """
    res = (
        supabase.table("cart_items")
        .select(
            "cart_id, product_id, quantity, products:product_id ( id, title, description, price, image_url, category, rating, rating_count, specs )"
        )
        .eq("cart_id", cart_id)
        .execute()
    )
    items = []
    for row in res.data or []:
        product = row.get("products") or {}
        item = {
          **map_product(product),
          "id": row.get("product_id"),
          "qty": row.get("quantity", 1),
        }
        items.append(item)
    return items


@app.get("/health")
def health():
    """Simple healthcheck."""
    return jsonify({"status": "ok"})


@app.get("/api/products")
def get_products():
    """List products ordered by created_at desc."""
    try:
        res = (
            supabase.table("products")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        return jsonify([map_product(r) for r in res.data or []])
    except Exception as err:
        app.logger.error(f"products error: {err}")
        return jsonify({"error": str(err)}), 500


@app.get("/api/products/<product_id>")
def get_product(product_id):
    """Fetch a single product by id."""
    try:
        res = supabase.table("products").select("*").eq("id", product_id).single().execute()
        if not res.data:
            return jsonify({"error": "Not found"}), 404
        return jsonify(map_product(res.data))
    except Exception as err:
        app.logger.error(f"product error: {err}")
        return jsonify({"error": str(err)}), 500


@app.post("/api/products")
def create_product():
    """Create a new product; requires title and price."""
    try:
        payload = request.get_json(force=True)
        title = payload.get("title")
        price = payload.get("price")
        if not title or price is None:
            return jsonify({"error": "title and price are required"}), 400
        body = {
            "title": title,
            "description": payload.get("description", ""),
            "price": price,
            "image_url": payload.get("image"),
            "category": payload.get("category"),
            "rating": payload.get("rating"),
            "rating_count": payload.get("rating_count"),
            "specs": payload.get("specs") or {},
        }
        res = supabase.table("products").insert(body).execute()
        if not res.data:
             return jsonify({"error": "Failed to create product"}), 500
        return jsonify(map_product(res.data[0])), 201
    except Exception as err:
        app.logger.error(f"create product error: {err}")
        return jsonify({"error": str(err)}), 500


@app.put("/api/products/<product_id>")
def update_product(product_id):
    """Partial update of a product by id."""
    try:
        payload = request.get_json(force=True)
        body = {}
        for key, field in [
            ("title", "title"),
            ("description", "description"),
            ("price", "price"),
            ("image", "image_url"),
            ("category", "category"),
            ("rating", "rating"),
            ("rating_count", "rating_count"),
            ("specs", "specs"),
        ]:
            if key in payload:
                body[field] = payload[key]
        res = (
            supabase.table("products")
            .update(body)
            .eq("id", product_id)
            .execute()
        )
        if not res.data:
            return jsonify({"error": "Failed to update product"}), 500
        return jsonify(map_product(res.data[0]))
    except Exception as err:
        app.logger.error(f"update product error: {err}")
        return jsonify({"error": str(err)}), 500


@app.post("/api/carts")
def create_cart():
    """Create an empty cart and return its id."""
    try:
        res = supabase.table("carts").insert({}).execute()
        if not res.data:
            return jsonify({"error": "Failed to create cart"}), 500
        return jsonify({"cartId": res.data[0].get("id")}), 201
    except Exception as err:
        app.logger.error(f"create cart error: {err}")
        return jsonify({"error": str(err)}), 500


@app.get("/api/carts/<cart_id>")
def get_cart(cart_id):
    """Return cart items for a given cart id (404 if not found)."""
    try:
        res = supabase.table("carts").select("id").eq("id", cart_id).single().execute()
        if not res.data:
            return jsonify({"error": "Cart not found"}), 404
        items = map_cart_items(cart_id)
        return jsonify({"cartId": cart_id, "items": items})
    except Exception as err:
        app.logger.error(f"get cart error: {err}")
        return jsonify({"error": str(err)}), 500


@app.post("/api/carts/<cart_id>/items")
def add_cart_item(cart_id):
    """Upsert a cart item (add or bump quantity)."""
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
        items = map_cart_items(cart_id)
        return jsonify({"cartId": cart_id, "items": items}), 201
    except Exception as err:
        app.logger.error(f"add cart item error: {err}")
        return jsonify({"error": str(err)}), 500


@app.patch("/api/carts/<cart_id>/items/<product_id>")
def update_cart_item(cart_id, product_id):
    """Update quantity for a specific product in the cart."""
    try:
        payload = request.get_json(force=True)
        quantity = payload.get("quantity")
        if quantity is None:
            return jsonify({"error": "quantity is required"}), 400
        if quantity < 1:
            return jsonify({"error": "quantity must be >= 1"}), 400
        supabase.table("cart_items").update({"quantity": quantity}).eq("cart_id", cart_id).eq("product_id", product_id).execute()
        items = map_cart_items(cart_id)
        return jsonify({"cartId": cart_id, "items": items})
    except Exception as err:
        app.logger.error(f"update cart item error: {err}")
        return jsonify({"error": str(err)}), 500


@app.delete("/api/carts/<cart_id>/items/<product_id>")
def delete_cart_item(cart_id, product_id):
    """Remove a product from the cart."""
    try:
        supabase.table("cart_items").delete().eq("cart_id", cart_id).eq("product_id", product_id).execute()
        items = map_cart_items(cart_id)
        return jsonify({"cartId": cart_id, "items": items})
    except Exception as err:
        app.logger.error(f"delete cart item error: {err}")
        return jsonify({"error": str(err)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", "4000"))
    app.run(host="0.0.0.0", port=port)
