from flask import Blueprint, current_app, jsonify, request

try:
    from ..utils.mappers import map_product
    from ..limiter import maybe_limit
except ImportError:
    from utils.mappers import map_product
    from limiter import maybe_limit

products_bp = Blueprint("products", __name__)

@products_bp.get("/")
def get_products():
    """List all products with optional price filtering."""
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

@products_bp.get("/category/<category_name>")
def get_products_by_category(category_name):
    """Fetch products belonging to a specific category."""
    supabase = current_app.config["SUPABASE"]
    try:
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

# --- DYNAMIC ID ROUTE (Handles GET, PUT, DELETE) ---

@products_bp.route("/<product_id>", methods=["GET", "PUT", "DELETE"])
def handle_product_by_id(product_id):
    supabase = current_app.config["SUPABASE"]
    
    try:
        if request.method == "GET":
            # Fetch single product by ID
            res = supabase.table("products").select("*").eq("id", product_id).maybe_single().execute()
            if not res.data: 
                return jsonify({"error": "Product not found"}), 404
            return jsonify(map_product(res.data))

        elif request.method == "PUT":
            # Update product details
            payload = request.get_json(force=True)
            res = supabase.table("products").update(payload).eq("id", product_id).execute()
            if not res.data:
                return jsonify({"error": "Product not found or update failed"}), 404
            return jsonify(map_product(res.data[0])), 200

        elif request.method == "DELETE":
            # Remove product
            supabase.table("products").delete().eq("id", product_id).execute()
            return jsonify({"message": "Deleted"}), 200

    except Exception as err:
        return jsonify({"error": str(err)}), 500