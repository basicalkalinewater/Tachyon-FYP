from flask import Blueprint, current_app, jsonify, request
from ..utils.mappers import map_product

products_bp = Blueprint("products", __name__)

# --- 1. ROOT ROUTES ---
@products_bp.route("/", methods=["GET", "POST"])
def handle_products():
    supabase = current_app.config["SUPABASE"]
    if request.method == "GET":
        try:
            res = supabase.table("products").select("*").order("created_at", desc=True).execute()
            return jsonify([map_product(r) for r in res.data or []])
        except Exception as err:
            return jsonify({"error": str(err)}), 500

    if request.method == "POST":
        try:
            payload = request.get_json(force=True)
            body = {
                "title": payload.get("title"),
                "price": payload.get("price"),
                "description": payload.get("description", ""),
                "image_url": payload.get("image"),
                "category": payload.get("category", "General"),
            }
            res = supabase.table("products").insert(body).execute()
            return jsonify(map_product(res.data[0])), 201
        except Exception as err:
            return jsonify({"error": str(err)}), 500

# --- 2. SPECIFIC FILTER ROUTES (MUST BE ABOVE <product_id>) ---

@products_bp.get("/price-range")
def get_products_by_price_range():
    supabase = current_app.config["SUPABASE"]
    try:
        min_price = float(request.args.get("min_price", 0))
        max_price = float(request.args.get("max_price", 1000000))
        res = (
            supabase.table("products")
            .select("*")
            .gte("price", min_price)
            .lte("price", max_price)
            .order("price", desc=False)
            .execute()
        )
        return jsonify([map_product(r) for r in res.data or []])
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@products_bp.route("/title/<title_substring>", methods=["GET", "OPTIONS"])
def get_products_by_title(title_substring):
    if request.method == "OPTIONS": return "", 200
    supabase = current_app.config["SUPABASE"]
    try:
        res = supabase.table("products").select("*").ilike("title", f"%{title_substring}%").execute()
        return jsonify([map_product(r) for r in res.data or []])
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@products_bp.get("/category/<category_name>")
def get_products_by_category(category_name):
    supabase = current_app.config["SUPABASE"]
    try:
        # Use ilike to allow partial text matching in category search
        res = (
            supabase.table("products")
            .select("*")
            .ilike("category", f"%{category_name}%") 
            .order("created_at", desc=True)
            .execute()
        )
        return jsonify([map_product(r) for r in res.data or []])
    except Exception as err:
        current_app.logger.error(f"Category search error: {err}")
        return jsonify({"error": str(err)}), 500

# --- 3. DYNAMIC ID ROUTE (MUST BE AT THE BOTTOM) ---

@products_bp.route("/<product_id>", methods=["GET", "PUT", "DELETE"])
def handle_product_by_id(product_id):
    supabase = current_app.config["SUPABASE"]
    
    if request.method == "DELETE":
        try:
            supabase.table("products").delete().eq("id", product_id).execute()
            return jsonify({"message": "Deleted"}), 200
        except Exception as err:
            return jsonify({"error": str(err)}), 500

    if request.method == "PUT":
        try:
            payload = request.get_json(force=True)
            res = supabase.table("products").update(payload).eq("id", product_id).execute()
            return jsonify(map_product(res.data[0])), 200
        except Exception as err:
            return jsonify({"error": str(err)}), 500

    if request.method == "GET":
        try:
            res = supabase.table("products").select("*").eq("id", product_id).single().execute()
            if not res.data: return jsonify({"error": "Not found"}), 404
            return jsonify(map_product(res.data))
        except Exception as err:
            return jsonify({"error": str(err)}), 500
        
