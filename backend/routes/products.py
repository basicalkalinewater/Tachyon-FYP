from flask import Blueprint, current_app, jsonify, request
try:
    from ..utils.mappers import map_product
    from ..limiter import maybe_limit
except ImportError:
    from utils.mappers import map_product
    from limiter import maybe_limit

# Blueprint for product endpoints; registered under /api/products
products_bp = Blueprint("products", __name__)


@products_bp.get("/")
@maybe_limit("300 per minute")
def get_products():
    # List all products sorted by newest first
    supabase = current_app.config["SUPABASE"]
    try:
        res = (
            supabase.table("products")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        return jsonify([map_product(r) for r in res.data or []])
    except Exception as err:
        current_app.logger.error(f"products error: {err}")
        return jsonify({"error": str(err)}), 500


@products_bp.get("/<product_id>")
@maybe_limit("300 per minute")
def get_product(product_id):
    # Fetch a single product by id; 404 if it does not exist
    supabase = current_app.config["SUPABASE"]
    try:
        res = supabase.table("products").select("*").eq("id", product_id).single().execute()
        if not res.data:
            return jsonify({"error": "Not found"}), 404
        return jsonify(map_product(res.data))
    except Exception as err:
        current_app.logger.error(f"product error: {err}")
        return jsonify({"error": str(err)}), 500


@products_bp.post("/")
def create_product():
    # Create a product; requires title and price
    supabase = current_app.config["SUPABASE"]
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
        current_app.logger.error(f"create product error: {err}")
        return jsonify({"error": str(err)}), 500


@products_bp.put("/<product_id>")
def update_product(product_id):
    # Partial update of a product by id
    supabase = current_app.config["SUPABASE"]
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
        current_app.logger.error(f"update product error: {err}")
        return jsonify({"error": str(err)}), 500
